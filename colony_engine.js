/**
 * Ant Colony - Exam Engine v2.1
 * Architecture: Multi-Ant Pipeline
 *   - Each "ant" is one tiny, focused AI call
 *   - Complex tasks are assembled from simple outputs
 *   - Designed for lightweight/free-tier AI models
 */
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Ant Colony v2.1] Multi-Ant Pipeline Online');

    // =====================================================
    // CONFIG
    // =====================================================
    const API_URL   = 'https://api.groq.com/openai/v1/chat/completions';
    const MODEL     = 'llama-3.1-8b-instant';
    const DELAY_MS  = 1300; // pause between API calls (free tier safety)

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
    // GROQ API — system + user message pattern
    // =====================================================
    async function callGroq(systemMsg, userMsg, asJson = false) {
        if (!apiKey) throw new Error('API Key가 설정되지 않았습니다. 상단에서 저장해주세요.');

        const messages = [];
        if (systemMsg) messages.push({ role: 'system', content: systemMsg });
        messages.push({ role: 'user', content: userMsg });

        const body = {
            model: MODEL,
            messages,
            temperature: asJson ? 0.2 : 0.6,
            max_tokens: asJson ? 1024 : 512,
            stream: false
        };
        if (asJson) body.response_format = { type: 'json_object' };

        const res = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        bumpCounter();

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            const msg = err.error?.message || `HTTP ${res.status}`;
            throw new Error(`Groq API 오류: ${msg}`);
        }

        const data = await res.json();
        return data.choices[0].message.content;
    }

    async function callGroqJson(systemMsg, userMsg) {
        const raw = await callGroq(systemMsg, userMsg, true);
        try {
            return JSON.parse(raw);
        } catch {
            // Try to extract JSON from the response if it includes extra text
            const match = raw.match(/\{[\s\S]*\}/);
            if (match) return JSON.parse(match[0]);
            throw new Error('AI가 유효한 JSON을 반환하지 않았습니다.');
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
            'You are an exam question structure expert. Analyze only the FORMAT and PATTERN, not the content meaning. Return valid JSON only.',
            `Analyze this Korean/English exam question's STRUCTURAL PATTERN.

Return JSON with this exact schema (no extra fields):
{
  "format": "multiple_choice" | "short_answer" | "fill_in_blank" | "ordering" | "matching",
  "choice_count": <number, 0 if not multiple choice>,
  "instruction_text": "<the Korean instruction line if present, else null>",
  "question_type_ko": "<Korean label for this question type, max 12 chars, e.g: 빈칸 추론, 주제 파악, 어법 오류>",
  "cognitive_skill": "inference" | "comprehension" | "grammar" | "vocabulary" | "writing",
  "target_element": "<what the question tests, e.g: underlined_phrase, blank, main_idea, grammar_error>",
  "choice_language": "korean" | "english" | "english_underlined" | "none"
}

Question text (first 1200 chars):
"""
${text.substring(0, 1200)}
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

            // ── Ant 1: Analyze passage ONCE ─────────────────
            log('[분석] 지문 분석 개미 투입...', 'ant', genLog);
            const analysis = await passageAnalyzerAnt(passage);
            log(`지문 분석 완료 → 주제: ${analysis.main_topic}`, 'success', genLog);

            const results = [];

            for (const dna of selectedDNAs) {
                for (let i = 0; i < count; i++) {
                    const label = dna.meta.question_type_ko || dna.meta.problem_type;
                    log(`[생성] "${label}" (${i + 1}/${count}) 생성 시작...`, 'ant', genLog);
                    await sleep(DELAY_MS);

                    try {
                        // ── Ant 2: Plan ──────────────────────────────
                        log('  └ 기획 개미: 출제 계획 수립 중...', 'ant', genLog);
                        const plan = await questionPlannerAnt(dna, analysis);
                        await sleep(DELAY_MS);

                        // ── Ant 3: Build ─────────────────────────────
                        log('  └ 제작 개미: 문제 작성 중...', 'ant', genLog);
                        const built = await questionBuilderAnt(dna, passage, plan);

                        // ── Ant 4: Audit ─────────────────────────────
                        const assembled = assembleQuestion(dna, passage, built);
                        if (auditAnt(assembled, genLog)) {
                            results.push(assembled);
                            log(`  └ ✓ 감사 통과`, 'auditor', genLog);
                        } else {
                            log(`  └ ✗ 감사 실패 — 구조 오류. 스킵.`, 'auditor', genLog);
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

    // Ant 1: Analyze passage — shared across all questions
    async function passageAnalyzerAnt(passage) {
        return await callGroqJson(
            'You are a concise English text analyst. Return only valid JSON, no extra text.',
            `Analyze this English passage briefly.
Return JSON:
{
  "main_topic": "<topic in Korean, max 8 words>",
  "main_idea_ko": "<one-sentence Korean summary>",
  "tone": "formal" | "informal" | "descriptive" | "narrative" | "argumentative",
  "key_phrases": ["<notable English phrase 1>", "<phrase 2>", "<phrase 3>"],
  "key_vocab": [{"word": "...", "meaning_ko": "..."}, ...]
}

Passage:
"""
${passage.substring(0, 2000)}
"""`
        );
    }

    // Ant 2: Plan what to ask — small, focused call
    async function questionPlannerAnt(dna, analysis) {
        const p = dna.pattern;
        return await callGroqJson(
            'You are an exam question planner. Be specific and concise. Return valid JSON only.',
            `Plan ONE "${p.question_type_ko}" question.

Pattern info:
- format: ${p.format}
- what to test: ${p.target}
- cognitive skill: ${p.cognitive_skill}
- instruction: "${p.instruction}"

Passage analysis:
- topic: ${analysis.main_topic}
- key phrases: ${JSON.stringify(analysis.key_phrases?.slice(0, 3))}
- key vocab: ${JSON.stringify(analysis.key_vocab?.slice(0, 4))}

Return JSON:
{
  "target_phrase": "<specific phrase or word FROM the passage to focus on, or null>",
  "question_focus": "<one sentence: exactly what this question will test>",
  "hint_for_builder": "<one sentence: how to best construct this question>"
}`
        );
    }

    // Ant 3: Build the question — the main creative call
    async function questionBuilderAnt(dna, passage, plan) {
        const p = dna.pattern;
        const isMultiChoice = p.format === 'multiple_choice';
        const choiceCount = p.choice_count || (isMultiChoice ? 5 : 0);
        const choiceLang = p.choice_language === 'korean' ? 'Korean' : 'English';

        const choiceInstruction = isMultiChoice
            ? `"choices": [<${choiceCount} options in ${choiceLang}: 1 correct + ${choiceCount - 1} plausible distractors>],
  "correct_answer_index": <0-based index of the correct choice>,`
            : `"answer": "<the correct answer text>",`;

        return await callGroqJson(
            'You are an English exam question writer for Korean middle school students. Write clear, accurate questions. Return valid JSON only.',
            `Create a "${p.question_type_ko}" question using the passage below.

Question plan:
- Focus: ${plan.question_focus}
- Target phrase: ${plan.target_phrase ? `"${plan.target_phrase}"` : 'none'}
- Builder hint: ${plan.hint_for_builder}
- Instruction line: "${p.instruction}"
${p.trap_concept ? `- Trap concept to apply: ${p.trap_concept}` : ''}

Passage:
"""
${passage.substring(0, 2000)}
"""

Return JSON:
{
  "instruction_text": "${p.instruction}",
  "question_text": "<question in Korean>",
  ${choiceInstruction}
  "explanation_ko": "<2-3 sentence Korean explanation of the correct answer>"
}`
        );
    }

    // Pure assembly — no API call
    function assembleQuestion(dna, passage, built) {
        let answer = built.answer || '';
        let choices = null;

        if (dna.pattern.format === 'multiple_choice' && Array.isArray(built.choices)) {
            choices = built.choices;
            const idx = typeof built.correct_answer_index === 'number' ? built.correct_answer_index : 0;
            answer = choices[idx] || choices[0] || '';
        }

        return {
            meta: { ...dna.meta },
            pattern: { ...dna.pattern },
            content: {
                instruction_text: built.instruction_text || dna.pattern.instruction,
                question_text:    built.question_text   || '',
                passage_text:     passage,
                choices,
                answer,
                explanation:      built.explanation_ko  || ''
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
