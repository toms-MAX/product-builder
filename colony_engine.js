/**
 * Ant Colony - Exam Engine v2.2
 * Architecture: Multi-Ant Pipeline
 *   - Each "ant" is one tiny, focused AI call
 *   - Complex tasks are assembled from simple outputs
 *   - Designed for lightweight/free-tier AI models (Groq free tier: 6000 TPM)
 */
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Ant Colony v2.2] Multi-Ant Pipeline Online');

    // =====================================================
    // CONFIG
    // =====================================================
    const API_URL   = 'https://api.groq.com/openai/v1/chat/completions';
    const MODEL     = 'llama-3.1-8b-instant';
    const DELAY_MS  = 4500;  // safe gap between calls on free tier (6000 TPM)
    const MAX_RETRY = 4;     // max retries on rate limit

    let apiKey = localStorage.getItem('groq_api_key') || '';
    let dnaBank = [];          // all known DNA templates
    let learnedDNAs = [];      // DNAs extracted in current session

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    // =====================================================
    // DOM REFS
    // =====================================================
    const $ = id => document.getElementById(id);

    const apiKeyInput       = $('api-key-input');
    const saveKeyBtn        = $('save-key-btn');
    const keyStatus         = $('key-status');
    const imageUpload       = $('image-upload');
    const imagePreview      = $('image-preview');
    const previewWrap       = $('image-preview-container');
    const learnBtn          = $('full-auto-extract-btn');
    const ocrLog            = $('ocr-log');
    const learnedList       = $('learned-dna-list');
    const loadToBankBtn     = $('load-to-bank-btn');
    const passageArea       = $('reading-material');
    const dnaContainer      = $('dna-selection-container');
    const countInput        = $('predict-count');
    const generateBtn       = $('generate-btn');
    const genLog            = $('compute-log');
    const resultContainer   = $('generated-questions');
    const apiCallCounter    = $('api-call-counter');
    const customInstruction = $('custom-instruction');

    let totalApiCalls = 0;

    // =====================================================
    // LOGGER
    // =====================================================
    const COLORS = {
        info:    '#8babd4',
        error:   '#ff6b6b',
        success: '#63e6be',
        ant:     '#748ffc',
        master:  '#fcc419',
        auditor: '#f783ac',
        warn:    '#ffa94d'
    };

    function log(msg, type = 'info', target = genLog) {
        if (!target) return;
        const el = document.createElement('div');
        el.style.cssText = `color:${COLORS[type] || COLORS.info}; margin:1px 0; word-break:break-word;`;
        el.textContent = `[${type.toUpperCase()}] ${msg}`;
        target.appendChild(el);
        target.scrollTop = target.scrollHeight;
    }

    function clearLog(target) { if (target) target.innerHTML = ''; }

    // =====================================================
    // API CALL COUNTER
    // =====================================================
    function bumpCounter() {
        totalApiCalls++;
        if (apiCallCounter) apiCallCounter.textContent = `API 호출: ${totalApiCalls}회`;
    }

    // =====================================================
    // GROQ API — with auto rate-limit retry
    // =====================================================

    // Parse "Please try again in 1.5s" or "in 550ms" from Groq error messages
    function parseRetryMs(errorMsg) {
        const m = errorMsg.match(/try again in\s+([\d.]+)(ms|s|m)/i);
        if (!m) return 5000;
        const val = parseFloat(m[1]);
        const unit = m[2].toLowerCase();
        if (unit === 'ms') return Math.ceil(val) + 600;
        if (unit === 's')  return Math.ceil(val * 1000) + 1000;
        if (unit === 'm')  return Math.ceil(val * 60000) + 1000;
        return 5000;
    }

    async function callGroq(systemMsg, userMsg, asJson = false) {
        if (!apiKey) throw new Error('API Key가 설정되지 않았습니다. 상단에서 저장해주세요.');

        const messages = [];
        if (systemMsg) messages.push({ role: 'system', content: systemMsg });
        messages.push({ role: 'user', content: userMsg });

        const body = {
            model: MODEL,
            messages,
            temperature: asJson ? 0.2 : 0.5,
            max_tokens: 900,
            stream: false
        };
        if (asJson) body.response_format = { type: 'json_object' };

        for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
            const res = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            bumpCounter();

            if (res.ok) {
                const data = await res.json();
                return data.choices[0].message.content;
            }

            const err = await res.json().catch(() => ({}));
            const msg = err.error?.message || `HTTP ${res.status}`;

            if (res.status === 429) {
                const waitMs = parseRetryMs(msg);
                const activeLog = genLog || ocrLog;
                log(`Rate limit → ${(waitMs / 1000).toFixed(1)}초 대기 후 재시도 (${attempt}/${MAX_RETRY})...`, 'warn', activeLog);
                await sleep(waitMs);
                continue;
            }

            throw new Error(`Groq API 오류: ${msg}`);
        }
        throw new Error(`Rate limit 재시도 ${MAX_RETRY}회 초과. 잠시 후 다시 시도해주세요.`);
    }

    function extractJson(raw) {
        try { return JSON.parse(raw); } catch {}
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) { try { return JSON.parse(match[0]); } catch {} }
        throw new Error('AI가 유효한 JSON을 반환하지 않았습니다.');
    }

    async function callGroqJson(systemMsg, userMsg) {
        // First: strict JSON mode
        try {
            const raw = await callGroq(systemMsg, userMsg, true);
            return extractJson(raw);
        } catch (e) {
            if (!e.message.includes('Failed to generate JSON') && !e.message.includes('json')) throw e;
            // Fallback: plain text + manual parse
            const activeLog = genLog || ocrLog;
            log('JSON mode 실패 → 텍스트 모드로 재시도 중...', 'warn', activeLog);
            await sleep(1000);
            const raw = await callGroq(systemMsg, userMsg + '\n\nOutput ONLY a raw JSON object. No markdown, no explanation.', false);
            return extractJson(raw);
        }
    }

    // =====================================================
    // INIT
    // =====================================================
    async function init() {
        // Restore API key
        if (apiKeyInput) {
            apiKeyInput.value = apiKey;
            setKeyStatus(!!apiKey);
        }

        // Load built-in DNA templates
        try {
            const resp = await fetch('questions.json');
            if (!resp.ok) throw new Error('questions.json 없음');
            dnaBank = await resp.json();
            renderDNACheckboxes();
            log(`DNA 뱅크 로드: ${dnaBank.length}개 기본 유형 준비됨.`, 'success', genLog);
        } catch (e) {
            log(`DNA 뱅크 로드 실패: ${e.message}`, 'error', genLog);
        }

        bindEvents();
    }

    function bindEvents() {
        if (saveKeyBtn)    saveKeyBtn.onclick    = saveKey;
        if (imageUpload)   imageUpload.onchange  = previewImage;
        if (learnBtn)      learnBtn.onclick       = runLearningPipeline;
        if (loadToBankBtn) loadToBankBtn.onclick  = loadLearnedDNAs;
        if (generateBtn)   generateBtn.onclick    = runGenerationPipeline;
    }

    function saveKey() {
        apiKey = (apiKeyInput?.value || '').trim();
        localStorage.setItem('groq_api_key', apiKey);
        setKeyStatus(!!apiKey);
        log('API Key 저장 완료.', 'success', genLog);
    }

    function setKeyStatus(valid) {
        if (!keyStatus) return;
        keyStatus.textContent = valid ? '✓ 저장됨' : '✗ 없음';
        keyStatus.style.color = valid ? '#63e6be' : '#ff6b6b';
    }

    function previewImage(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            if (imagePreview) {
                imagePreview.src = ev.target.result;
                imagePreview.style.display = 'block';
            }
        };
        reader.readAsDataURL(file);
        log(`이미지 선택: ${file.name}`, 'info', ocrLog);
    }

    // =====================================================
    // PIPELINE A: DNA LEARNING  (Image → Patterns)
    // =====================================================
    /**
     * Ant 1: OCR (Tesseract - no API call)
     * Ant 2: Segmenter (split text into question blocks)
     * Ant 3: Pattern Analyzer per block (1 API call each)
     * → produces DNA templates for the generator
     */
    async function runLearningPipeline() {
        clearLog(ocrLog);
        if (learnedList) learnedList.innerHTML = '';
        learnedDNAs = [];
        setBtn(learnBtn, false, '🐜 학습 중...');

        try {
            const file = imageUpload?.files[0];
            if (!file) throw new Error('이미지를 먼저 업로드해주세요.');

            // ── Ant 1: OCR ──────────────────────────────────
            log('[1/3] OCR 개미 투입 중...', 'ant', ocrLog);
            const rawText = await ocrAnt(file);
            if (!rawText.trim()) throw new Error('OCR 결과가 비었습니다. 이미지 품질을 확인해주세요.');
            log(`OCR 완료 (${rawText.length}자 추출).`, 'success', ocrLog);

            // ── Ant 2: Segmentation ──────────────────────────
            log('[2/3] 문제 분리 개미 투입 중...', 'ant', ocrLog);
            const segments = segmentText(rawText);
            log(`${segments.length}개 문제 블록 분리 완료.`, 'success', ocrLog);
            if (segments.length === 0) throw new Error('문제 블록을 찾지 못했습니다. OCR 결과를 확인해주세요.');

            // ── Ant 3: Pattern Analysis per segment ──────────
            log('[3/3] 유형 분석 개미 투입 중...', 'ant', ocrLog);
            const seen = new Set(); // deduplicate by question_type_ko

            for (let i = 0; i < segments.length; i++) {
                log(`  유형 분석 ${i + 1}/${segments.length}...`, 'ant', ocrLog);
                try {
                    const dna = await patternAnalysisAnt(segments[i], i);
                    if (dna) {
                        const key = dna.meta.question_type_ko;
                        if (!seen.has(key)) {
                            seen.add(key);
                            learnedDNAs.push(dna);
                            log(`  ✓ 새 유형 발견: "${key}"`, 'success', ocrLog);
                        } else {
                            log(`  중복 유형 스킵: "${key}"`, 'info', ocrLog);
                        }
                    }
                } catch (e) {
                    log(`  분석 실패 (블록 ${i + 1}): ${e.message}`, 'warn', ocrLog);
                }
                if (i < segments.length - 1) await sleep(DELAY_MS);
            }

            renderLearnedDNAs(learnedDNAs);
            log(`── 학습 완료! ${learnedDNAs.length}개 신규 유형 발견 ──`, 'master', ocrLog);

        } catch (err) {
            log(`파이프라인 중단: ${err.message}`, 'error', ocrLog);
        } finally {
            setBtn(learnBtn, true, '🚀 시험지 분석 & 유형 학습');
        }
    }

    // Ant 1: OCR via Tesseract
    async function ocrAnt(file) {
        const worker = await Tesseract.createWorker('eng+kor', 1, {
            logger: m => {
                if (m.progress > 0 && m.status !== 'initializing api') {
                    log(`OCR: ${m.status} ${(m.progress * 100).toFixed(0)}%`, 'ant', ocrLog);
                }
            }
        });
        const { data: { text } } = await worker.recognize(file);
        await worker.terminate();
        return text;
    }

    // Ant 2: Rule-based segmentation (no API call needed)
    function segmentText(raw) {
        // Match lines starting with a number followed by . or ) or 、
        const parts = raw.split(/(?=\n\s*\d+\s*[.)\、]\s)/).map(s => s.trim()).filter(s => s.length > 30);
        if (parts.length >= 2) return parts.map((text, i) => ({ number: i + 1, text }));

        // Fallback: split by double newline and pick chunks that look like questions
        return raw.split(/\n{2,}/)
            .map(s => s.trim())
            .filter(s => s.length > 40 && /[?？①②③④⑤]/.test(s))
            .map((text, i) => ({ number: i + 1, text }));
    }

    // Ant 3: Analyze ONE question block → DNA template (1 API call)
    async function patternAnalysisAnt(segment, idx) {
        const text = typeof segment === 'string' ? segment : segment.text;

        const result = await callGroqJson(
            'You are an exam question structure expert. Analyze only FORMAT and PATTERN, not content. Return valid JSON only.',
            `Analyze this exam question's structural pattern.

Return a JSON object with these exact keys:
- "format": one of: multiple_choice, short_answer, fill_in_blank, ordering, matching
- "choice_count": number of answer choices (0 if not multiple choice)
- "instruction_text": the Korean instruction line if present, otherwise null
- "question_type_ko": Korean label for this question type, max 12 chars (example: 빈칸 추론, 주제 파악, 어법 오류)
- "cognitive_skill": one of: inference, comprehension, grammar, vocabulary, writing
- "target_element": what the question tests (example: underlined_phrase, blank, main_idea, grammar_error)
- "choice_language": one of: korean, english, english_underlined, none

Question text:
"""
${text.substring(0, 1000)}
"""`
        );

        if (!result?.format || !result?.question_type_ko) return null;

        return {
            meta: {
                problem_id: `learned-${Date.now()}-${idx}`,
                problem_type: result.format,
                skill: result.cognitive_skill || 'comprehension',
                sub_skill: result.target_element || '',
                difficulty: 'auto-learned',
                source: 'image-learned',
                question_type_ko: result.question_type_ko
            },
            pattern: {
                format: result.format,
                choice_count: result.choice_count || 0,
                instruction: result.instruction_text || '다음 글을 읽고 물음에 답하시오.',
                target: result.target_element || 'main_idea',
                cognitive_skill: result.cognitive_skill || 'comprehension',
                choice_language: result.choice_language || 'korean',
                question_type_ko: result.question_type_ko
            }
        };
    }

    function renderLearnedDNAs(dnas) {
        if (!learnedList) return;
        learnedList.innerHTML = '';
        if (dnas.length === 0) {
            learnedList.innerHTML = '<p class="muted">학습된 유형 없음</p>';
            return;
        }
        dnas.forEach((dna, i) => {
            const div = document.createElement('div');
            div.className = 'learned-tag';
            div.innerHTML = `
                <span class="tag-num">${i + 1}</span>
                <div class="tag-info">
                    <strong>${dna.meta.question_type_ko}</strong>
                    <small>${dna.pattern.format} · ${dna.pattern.cognitive_skill}</small>
                </div>`;
            learnedList.appendChild(div);
        });
    }

    function loadLearnedDNAs() {
        if (learnedDNAs.length === 0) {
            log('로드할 학습 데이터가 없습니다. 먼저 시험지를 학습시켜주세요.', 'error', genLog);
            return;
        }
        // Prepend learned DNAs, avoid exact duplicates by question_type_ko
        const existing = new Set(dnaBank.map(d => d.meta.question_type_ko));
        const toAdd = learnedDNAs.filter(d => !existing.has(d.meta.question_type_ko));
        dnaBank.unshift(...toAdd);
        renderDNACheckboxes();
        log(`✓ ${toAdd.length}개 학습된 유형이 문제 생성기에 추가되었습니다.`, 'success', genLog);
    }

    // =====================================================
    // PIPELINE B: QUESTION GENERATION  (Passage + DNA → Questions)
    // =====================================================
    /**
     * Ant 1: Passage Analyzer  — understand the text  (1 call, shared)
     * Ant 2: Question Planner  — decide what to ask   (1 call per question)
     * Ant 3: Question Builder  — write question+answer (1 call per question)
     * Ant 4: Auditor           — structural check      (no API call)
     *
     * Total API calls per question: 3 (planner + builder + shared analyzer)
     */
    async function runGenerationPipeline() {
        clearLog(genLog);
        resultContainer.innerHTML = '';
        setBtn(generateBtn, false, '🐜 생성 중...');

        try {
            const passage = passageArea?.value?.trim();
            if (!passage) throw new Error('영어 지문을 입력해주세요.');

            const checkedInputs = dnaContainer?.querySelectorAll('input:checked') || [];
            const selectedDNAs = Array.from(checkedInputs).map(cb => dnaBank[parseInt(cb.value)]);
            if (selectedDNAs.length === 0) throw new Error('문제 유형을 하나 이상 선택해주세요.');

            const count = Math.min(parseInt(countInput?.value || 1, 10), 5);

            log(`── 마스터 개미: 파이프라인 시작 (${selectedDNAs.length}유형 × ${count}문항) ──`, 'master', genLog);

            // ── Ant 1: Analyze passage ONCE (shared) ────────
            log('[분석] 지문 분석 개미 투입...', 'ant', genLog);
            const analysis = await passageAnalyzerAnt(passage);
            log(`지문 분석 완료 → 주제: ${analysis.topic_ko || '분석됨'}`, 'success', genLog);
            await sleep(DELAY_MS);

            const results = [];

            for (const dna of selectedDNAs) {
                for (let i = 0; i < count; i++) {
                    const label = dna.meta.question_type_ko || dna.meta.problem_type;
                    log(`[생성] "${label}" (${i + 1}/${count}) 생성 중...`, 'ant', genLog);

                    try {
                        // ── Ant 2: Generate (plan+build combined) ────
                        const userOrder = customInstruction?.value?.trim() || '';
                        const built = await questionGeneratorAnt(dna, passage, analysis, userOrder);
                        await sleep(DELAY_MS);

                        // ── Ant 3: Audit ──────────────────────────────
                        const assembled = assembleQuestion(dna, passage, built);
                        if (auditAnt(assembled, genLog)) {
                            results.push(assembled);
                            log(`  └ ✓ 감사 통과`, 'auditor', genLog);
                        } else {
                            log(`  └ ✗ 감사 실패. 스킵.`, 'auditor', genLog);
                        }

                    } catch (e) {
                        log(`  └ 오류: ${e.message}`, 'error', genLog);
                    }
                }
            }

            renderResults(results);
            log(`── 마스터 개미: 완료! ${results.length}개 문제 생성 (총 API ${totalApiCalls}회 호출) ──`, 'master', genLog);

        } catch (err) {
            log(`파이프라인 중단: ${err.message}`, 'error', genLog);
        } finally {
            setBtn(generateBtn, true, '⚙️ 문제 생성');
        }
    }

    // Ant 1: Analyze passage — called ONCE, shared across all questions
    async function passageAnalyzerAnt(passage) {
        return await callGroqJson(
            'You are an English text analyst. Return only a JSON object.',
            `Read this passage and return a JSON object with exactly these 4 keys:
"topic_ko": main topic in Korean (4 words max)
"summary_ko": one Korean sentence summary
"key_phrase_1": one important English phrase copied exactly from the passage
"key_phrase_2": another important English phrase copied exactly from the passage

Passage:
"""
${passage.substring(0, 1400)}
"""`
        );
    }

    // Ant 2: Generate question — plan + build in ONE call (halves API usage)
    // Directly injects question_template from questions.json for quality
    async function questionGeneratorAnt(dna, passage, analysis, userOrder = '') {
        const p = dna.pattern;
        const isMultiChoice = p.format === 'multiple_choice';
        const choiceCount   = p.choice_count || (isMultiChoice ? 5 : 0);
        const choiceLang    = p.choice_language === 'korean'            ? 'Korean'
                            : p.choice_language === 'english'           ? 'English'
                            : p.choice_language === 'english_underlined' ? 'English'
                            : 'Korean';

        const choiceSpec = isMultiChoice
            ? `"choices": array of exactly ${choiceCount} strings in ${choiceLang} — 1 correct answer, ${choiceCount - 1} wrong but plausible distractors
"correct_answer_index": 0-based index (number) of the correct item in choices`
            : `"answer": the correct answer string in Korean`;

        return await callGroqJson(
            'You are a Korean middle school English exam question writer. Follow the template exactly. Return only a JSON object.',
            `Write ONE "${p.question_type_ko}" question for the passage below.

QUESTION TYPE TEMPLATE:
  Instruction: ${p.instruction}
  Question format: ${p.question_template}
  What to test: ${p.target}
  Cognitive skill: ${p.cognitive_skill}
${p.trap_concept ? '  Distractor rule: ' + p.trap_concept : ''}
${userOrder ? `\nSPECIAL INSTRUCTIONS FROM USER (follow strictly):\n  ${userOrder}` : ''}

PASSAGE CONTEXT:
  Topic: ${analysis.topic_ko || ''}
  Key phrase 1: ${analysis.key_phrase_1 || ''}
  Key phrase 2: ${analysis.key_phrase_2 || ''}

FULL PASSAGE:
"""
${passage.substring(0, 1300)}
"""

OUTPUT — return a JSON object with exactly these keys:
"instruction_text": instruction line in Korean
"question_text": the question in Korean (follow the question format template above)
${choiceSpec}
"explanation_ko": 2-3 Korean sentences explaining why the answer is correct`
        );
    }

    // Assemble final question object from ant output — no API call
    function assembleQuestion(dna, passage, built) {
        let answer  = built.answer || '';
        let choices = null;

        if (dna.pattern.format === 'multiple_choice' && Array.isArray(built.choices)) {
            choices = built.choices;
            const idx = typeof built.correct_answer_index === 'number'
                ? Math.max(0, Math.min(built.correct_answer_index, choices.length - 1))
                : 0;
            answer = choices[idx] || choices[0] || '';
        }

        return {
            meta:    { ...dna.meta },
            pattern: { ...dna.pattern },
            content: {
                instruction_text: built.instruction_text || dna.pattern.instruction,
                question_text:    built.question_text    || '',
                passage_text:     passage,
                choices,
                answer,
                explanation:      built.explanation_ko   || ''
            }
        };
    }

    // Structural audit — no API call (saves quota)
    function auditAnt(question, logTarget) {
        const c = question?.content;
        if (!c?.question_text || c.question_text.length < 5) {
            log('  └ [감사] 질문 텍스트 없음', 'auditor', logTarget);
            return false;
        }
        if (!c.answer || String(c.answer).length < 1) {
            log('  └ [감사] 답안 없음', 'auditor', logTarget);
            return false;
        }
        if (question.pattern?.format === 'multiple_choice') {
            if (!Array.isArray(c.choices) || c.choices.length < 2) {
                log('  └ [감사] 선택지 부족', 'auditor', logTarget);
                return false;
            }
        }
        return true;
    }

    // =====================================================
    // RENDER
    // =====================================================
    function renderDNACheckboxes() {
        if (!dnaContainer) return;
        dnaContainer.innerHTML = '';

        if (dnaBank.length === 0) {
            dnaContainer.innerHTML = '<p class="muted">유형 없음</p>';
            return;
        }

        dnaBank.forEach((dna, idx) => {
            const id = `dna-${dna.meta.problem_id || idx}`;
            const label = dna.meta.question_type_ko || dna.meta.problem_type;
            const badge = dna.meta.source === 'image-learned' ? '🎓' : '📚';
            const skill = dna.meta.skill || '';

            const item = document.createElement('label');
            item.className = 'dna-checkbox-item';
            item.innerHTML = `
                <input type="checkbox" id="${id}" value="${idx}" checked>
                <span class="dna-label-text">
                    <span class="dna-source-badge">${badge}</span>
                    <strong>${label}</strong>
                    <small>${skill}</small>
                </span>`;
            dnaContainer.appendChild(item);
        });
    }

    function renderResults(questions) {
        if (!resultContainer) return;
        resultContainer.innerHTML = '';

        if (questions.length === 0) {
            resultContainer.innerHTML = '<div class="question-card warning-card">생성된 문제가 없습니다. 로그를 확인해주세요.</div>';
            return;
        }

        questions.forEach((qObj, i) => {
            if (!qObj?.content || !qObj?.meta) return;
            const q    = qObj.content;
            const meta = qObj.meta;
            const typeLabel = meta.question_type_ko || meta.problem_type;

            const choicesHtml = q.choices && Array.isArray(q.choices)
                ? `<ol class="choices-list">${q.choices.map(opt => `<li>${opt}</li>`).join('')}</ol>`
                : '';

            const card = document.createElement('div');
            card.className = 'question-card';
            card.innerHTML = `
                <div class="question-header">
                    <span class="q-num">문제 ${i + 1}</span>
                    <span class="q-type-badge">${typeLabel}</span>
                    <button class="copy-btn" title="클립보드에 복사">복사</button>
                </div>
                ${q.instruction_text ? `<p class="q-instruction">${q.instruction_text}</p>` : ''}
                <div class="passage-box">${(q.passage_text || '').replace(/\n/g, '<br>')}</div>
                <p class="q-text">${q.question_text}</p>
                ${choicesHtml}
                <details class="answer-wrap">
                    <summary>정답 및 해설 보기</summary>
                    <div class="answer-body">
                        <p><strong>정답:</strong> ${q.answer}</p>
                        <p><strong>해설:</strong> ${q.explanation}</p>
                    </div>
                </details>`;

            // Copy button
            card.querySelector('.copy-btn').onclick = () => {
                const text = buildPlainText(qObj, i + 1);
                navigator.clipboard.writeText(text).then(() => {
                    const btn = card.querySelector('.copy-btn');
                    btn.textContent = '✓ 복사됨';
                    setTimeout(() => { btn.textContent = '복사'; }, 2000);
                });
            };

            resultContainer.appendChild(card);
        });
    }

    function buildPlainText(qObj, num) {
        const q = qObj.content;
        const typeLabel = qObj.meta.question_type_ko || qObj.meta.problem_type;
        let out = `[문제 ${num}] ${typeLabel}\n`;
        if (q.instruction_text) out += `${q.instruction_text}\n\n`;
        if (q.passage_text)     out += `${q.passage_text}\n\n`;
        out += `${q.question_text}\n`;
        if (q.choices) q.choices.forEach((c, i) => { out += `${i + 1}. ${c}\n`; });
        out += `\n정답: ${q.answer}\n해설: ${q.explanation}\n`;
        return out;
    }

    // =====================================================
    // UTIL
    // =====================================================
    function setBtn(btn, enabled, text) {
        if (!btn) return;
        btn.disabled = !enabled;
        btn.textContent = text;
    }

    // ── Start ──
    init();
});
