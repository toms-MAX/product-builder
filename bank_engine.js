/**
 * Ant Colony – Question Bank Engine v1.0
 * 문법 문제 & 독해 지문 문제은행 기능
 */
(function () {
    'use strict';

    // ── Constants ──────────────────────────────────────────
    const API_URL     = 'https://api.groq.com/openai/v1/chat/completions';
    const MODEL_FAST  = 'llama-3.1-8b-instant';
    const MODEL_SMART = 'llama-3.3-70b-versatile';   // 문제 추출/생성에 사용
    const GRAMMAR_KEY = 'ank_grammar_v1';
    const PASSAGE_KEY = 'ank_passages_v1';
    const DELAY_MS    = 3500;

    // ── State ──────────────────────────────────────────────
    let grammarBank   = [];
    let passageBank   = [];
    let grammarFile   = null;
    let passageFile   = null;
    let bankResults   = [];

    // ── Helpers ───────────────────────────────────────────
    const $ = id => document.getElementById(id);
    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    function loadDB(key)       { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } }
    function saveDB(key, data) { localStorage.setItem(key, JSON.stringify(data)); }

    // ── Groq API ──────────────────────────────────────────
    async function callGroq(messages, model = MODEL_SMART, maxTokens = 4096) {
        const key = localStorage.getItem('groq_api_key') || '';
        if (!key) throw new Error('API 키가 없습니다. 상단에서 키를 설정해주세요.');
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`
            },
            body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.4 })
        });
        if (!res.ok) {
            const txt = await res.text();
            throw new Error(`API ${res.status}: ${txt.slice(0, 200)}`);
        }
        return (await res.json()).choices[0].message.content;
    }

    // ── PDF Text Extraction ───────────────────────────────
    async function extractPDFText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async e => {
                try {
                    const pdf = await pdfjsLib.getDocument({ data: e.target.result }).promise;
                    let text = '';
                    for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) {
                        const page = await pdf.getPage(i);
                        const content = await page.getTextContent();
                        text += content.items.map(s => s.str).join(' ') + '\n\n';
                    }
                    resolve(text.trim());
                } catch (e) { reject(e); }
            };
            reader.onerror = () => reject(new Error('파일 읽기 실패'));
            reader.readAsArrayBuffer(file);
        });
    }

    // ── Grammar Question Parsing ──────────────────────────
    async function parseGrammarFromText(text) {
        const prompt = `아래는 영어 시험지에서 추출한 텍스트입니다. 이 안의 객관식 문법·어휘·독해 문제들을 찾아서 JSON 배열로만 반환하세요 (다른 설명 없이).

형식 예시:
[
  {
    "type": "어법성판단",
    "question": "다음 밑줄 친 부분 중 어법상 틀린 것은?\\n지문 텍스트...",
    "choices": ["① goes", "② were", "③ to finish", "④ having", "⑤ what"],
    "answer": "2",
    "explanation": "주어가 복수이므로 were가 아닌 was를 써야 한다."
  }
]

type은 다음 중 하나: 어법성판단 / 어휘 / 빈칸완성 / 문장순서 / 무관문장 / 요약완성 / 주제추론 / 제목추론 / 내용파악 / 기타

규칙:
- 선택지가 없거나 불완전한 문제는 제외
- 최대 20개
- JSON 배열만 출력 (마크다운, 설명 텍스트 금지)

텍스트:
${text.slice(0, 6000)}`;

        const raw = await callGroq([{ role: 'user', content: prompt }], MODEL_SMART, 4096);
        const m = raw.match(/\[[\s\S]*\]/);
        if (!m) throw new Error('문제 형식 인식 실패. PDF 텍스트 품질을 확인해주세요.');
        return JSON.parse(m[0]);
    }

    // ── Reading Question Generation ───────────────────────
    async function generateReadingQs(passage, count) {
        const prompt = `다음 영어 독해 지문으로 수능/내신 스타일 독해 문제 ${count}개를 만들어주세요.

유형 (다양하게 조합): 주제 추론 / 제목 추론 / 빈칸완성 / 어법성판단 / 문장순서 / 무관문장 제거 / 요약완성

JSON 배열로만 반환 (마크다운 금지):
[
  {
    "type": "주제 추론",
    "question": "다음 글의 주제로 가장 적절한 것은?",
    "choices": ["① ...", "② ...", "③ ...", "④ ...", "⑤ ..."],
    "answer": "3",
    "explanation": "정답 근거"
  }
]

지문:
${passage.slice(0, 2500)}`;

        const raw = await callGroq([{ role: 'user', content: prompt }], MODEL_SMART, 3000);
        const m = raw.match(/\[[\s\S]*\]/);
        if (!m) throw new Error('문제 생성 실패');
        return JSON.parse(m[0]);
    }

    // ── Loggers ───────────────────────────────────────────
    function bkLog(msg, type = 'info') {
        const el = $('bk-log');
        if (!el) return;
        appendLog(el, msg, type);
    }
    function parseLog(msg, type = 'info') {
        const el = $('bk-parse-log');
        if (!el) return;
        appendLog(el, msg, type);
    }
    function appendLog(el, msg, type) {
        const colors = { info: '#8babd4', ok: '#5fad56', warn: '#e8b44d', error: '#e05c5c' };
        const line = document.createElement('div');
        line.style.color = colors[type] || colors.info;
        line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        el.appendChild(line);
        el.scrollTop = el.scrollHeight;
    }

    // ── Grammar Bank Render ───────────────────────────────
    function renderGrammarBank() {
        grammarBank = loadDB(GRAMMAR_KEY);
        const list  = $('bk-grammar-list');
        const badge = $('bk-grammar-count');
        const sel   = $('bk-sel-grammar');
        if (!list) return;

        badge.textContent = `${grammarBank.length}개`;

        if (!grammarBank.length) {
            list.innerHTML = '<p class="muted">저장된 문제가 없습니다.</p>';
            if (sel) sel.innerHTML = '<p class="muted" style="padding:0.5rem; font-size:0.83rem;">문법 문제를 먼저 저장소에 추가해주세요.</p>';
            return;
        }

        list.innerHTML = grammarBank.map((q, i) => `
            <div class="bk-item">
                <div class="bk-item-header">
                    <span class="bk-item-num">${i + 1}</span>
                    <span class="q-type-badge">${q.type || '기타'}</span>
                    <span class="bk-item-source">${q.source || ''}</span>
                    <button class="bk-del-btn" data-id="${q.id}" data-type="grammar" title="삭제">✕</button>
                </div>
                <div class="bk-item-preview">${escHtml(q.question.slice(0, 130))}...</div>
            </div>
        `).join('');

        if (sel) {
            sel.innerHTML = grammarBank.map((q, i) => `
                <label class="bk-check-item">
                    <input type="checkbox" name="sel-grammar" value="${q.id}">
                    <span class="q-type-badge" style="flex-shrink:0;">${q.type || '기타'}</span>
                    <span style="font-size:0.83rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;">${escHtml(q.question.slice(0, 80))}...</span>
                </label>
            `).join('');
        }

        list.querySelectorAll('.bk-del-btn[data-type="grammar"]').forEach(btn => {
            btn.addEventListener('click', () => {
                grammarBank = grammarBank.filter(q => q.id !== btn.dataset.id);
                saveDB(GRAMMAR_KEY, grammarBank);
                renderGrammarBank();
            });
        });
    }

    // ── Passage Bank Render ───────────────────────────────
    function renderPassageBank() {
        passageBank = loadDB(PASSAGE_KEY);
        const list  = $('bk-passage-list');
        const badge = $('bk-passage-count');
        const sel   = $('bk-sel-passage');
        if (!list) return;

        badge.textContent = `${passageBank.length}개`;

        if (!passageBank.length) {
            list.innerHTML = '<p class="muted">저장된 지문이 없습니다.</p>';
            if (sel) sel.innerHTML = '<p class="muted" style="padding:0.5rem; font-size:0.83rem;">독해 지문을 먼저 저장소에 추가해주세요.</p>';
            return;
        }

        list.innerHTML = passageBank.map((p, i) => `
            <div class="bk-item">
                <div class="bk-item-header">
                    <span class="bk-item-num">${i + 1}</span>
                    <strong style="font-size:0.85rem; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escHtml(p.title || '제목 없음')}</strong>
                    <span class="bk-item-source">${p.text.length}자</span>
                    <button class="bk-del-btn" data-id="${p.id}" data-type="passage" title="삭제">✕</button>
                </div>
                <div class="bk-item-preview">${escHtml(p.text.slice(0, 110))}...</div>
            </div>
        `).join('');

        if (sel) {
            sel.innerHTML = passageBank.map((p, i) => `
                <label class="bk-check-item">
                    <input type="checkbox" name="sel-passage" value="${p.id}">
                    <strong style="font-size:0.85rem; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escHtml(p.title || `지문 ${i + 1}`)}</strong>
                    <span style="font-size:0.75rem; color:var(--muted); flex-shrink:0;">${p.text.length}자</span>
                </label>
            `).join('');
        }

        list.querySelectorAll('.bk-del-btn[data-type="passage"]').forEach(btn => {
            btn.addEventListener('click', () => {
                passageBank = passageBank.filter(p => p.id !== btn.dataset.id);
                saveDB(PASSAGE_KEY, passageBank);
                renderPassageBank();
            });
        });
    }

    // ── Drop Zone Helper ──────────────────────────────────
    function setupDropZone(zoneId, inputId, onFile) {
        const zone  = $(zoneId);
        const input = $(inputId);
        if (!zone || !input) return;

        zone.addEventListener('click', () => input.click());
        zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
        zone.addEventListener('drop', e => {
            e.preventDefault();
            zone.classList.remove('drag-over');
            const f = e.dataTransfer.files[0];
            if (f) onFile(f, zone);
        });
        input.addEventListener('change', () => {
            if (input.files[0]) onFile(input.files[0], zone);
            input.value = '';
        });
    }

    // ── Grammar Upload Setup ──────────────────────────────
    function setupGrammarUpload() {
        setupDropZone('bk-grammar-drop', 'bk-grammar-file', (file, zone) => {
            grammarFile = file;
            zone.classList.add('has-file');
            zone.innerHTML = `<span class="drop-zone-icon">📄</span><p class="drop-zone-filename">${escHtml(file.name)}</p><p class="drop-zone-sub">파일 선택 완료</p>`;
            $('bk-grammar-parse-btn').disabled = false;
        });

        $('bk-grammar-parse-btn').addEventListener('click', async () => {
            if (!grammarFile) return;
            const btn = $('bk-grammar-parse-btn');
            btn.disabled = true;
            btn.textContent = '추출 중...';
            $('bk-parse-log').innerHTML = '';

            try {
                parseLog('PDF 텍스트 추출 중...');
                const text = await extractPDFText(grammarFile);
                parseLog(`텍스트 추출 완료 (${text.length}자)`, 'ok');

                if (text.length < 50) {
                    throw new Error('추출된 텍스트가 너무 짧습니다. 스캔 PDF는 OCR이 필요합니다.');
                }

                parseLog('AI가 문제를 분석 중입니다...');
                const questions = await parseGrammarFromText(text);

                if (!Array.isArray(questions) || questions.length === 0) {
                    throw new Error('인식된 문제가 없습니다. 다른 PDF를 시도해주세요.');
                }

                grammarBank = loadDB(GRAMMAR_KEY);
                const added = questions.map(q => ({
                    ...q,
                    id: uid(),
                    source: grammarFile.name,
                    addedAt: Date.now()
                }));
                grammarBank = [...grammarBank, ...added];
                saveDB(GRAMMAR_KEY, grammarBank);
                renderGrammarBank();

                parseLog(`✅ ${added.length}개 문제가 은행에 추가되었습니다!`, 'ok');
            } catch (e) {
                parseLog(`오류: ${e.message}`, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = '🤖 AI로 문제 추출';
            }
        });
    }

    // ── Passage Save Setup ────────────────────────────────
    function setupPassageSave() {
        setupDropZone('bk-passage-drop', 'bk-passage-file', (file, zone) => {
            passageFile = file;
            zone.classList.add('has-file');
            zone.innerHTML = `<span class="drop-zone-icon">📄</span><p class="drop-zone-filename">${escHtml(file.name)}</p><p class="drop-zone-sub">저장 버튼을 누르면 지문으로 저장됩니다</p>`;
        });

        $('bk-passage-save-btn').addEventListener('click', async () => {
            const manualText = $('bk-passage-manual').value.trim();
            const title      = $('bk-passage-title').value.trim();
            const btn        = $('bk-passage-save-btn');

            let text = manualText;

            if (!text && passageFile) {
                btn.disabled = true;
                btn.textContent = '추출 중...';
                try {
                    text = await extractPDFText(passageFile);
                } catch (e) {
                    alert('PDF 텍스트 추출 실패: ' + e.message);
                    btn.disabled = false;
                    btn.textContent = '💾 지문 저장';
                    return;
                }
            }

            if (!text) {
                alert('지문 텍스트를 입력하거나 PDF 파일을 선택해주세요.');
                btn.disabled = false;
                btn.textContent = '💾 지문 저장';
                return;
            }

            passageBank = loadDB(PASSAGE_KEY);
            passageBank.push({
                id: uid(),
                title: title || `지문 ${passageBank.length + 1}`,
                text,
                source: passageFile ? passageFile.name : '직접 입력',
                addedAt: Date.now()
            });
            saveDB(PASSAGE_KEY, passageBank);

            // Reset UI
            $('bk-passage-manual').value = '';
            $('bk-passage-title').value  = '';
            passageFile = null;
            const zone = $('bk-passage-drop');
            zone.classList.remove('has-file');
            zone.innerHTML = `<span class="drop-zone-icon">📂</span><p class="drop-zone-text">독해 지문 PDF 드래그 또는 클릭</p><p class="drop-zone-sub">또는 아래에 직접 붙여넣기</p>`;

            renderPassageBank();
            btn.disabled = false;
            btn.textContent = '💾 지문 저장';
        });
    }

    // ── Test Generation ───────────────────────────────────
    async function generateBankTest() {
        const selGrammarIds = [...document.querySelectorAll('input[name="sel-grammar"]:checked')].map(c => c.value);
        const selPassageIds = [...document.querySelectorAll('input[name="sel-passage"]:checked')].map(c => c.value);
        const qpp = Math.min(5, Math.max(1, parseInt($('bk-q-per-passage').value) || 2));

        if (!selGrammarIds.length && !selPassageIds.length) {
            alert('문법 문제 또는 독해 지문을 하나 이상 선택해주세요.');
            return;
        }

        const btn = $('bk-generate-btn');
        btn.disabled = true;
        $('bk-log').innerHTML = '';
        $('bk-results').innerHTML = '';
        $('bk-pdf-btn').style.display = 'none';
        bankResults = [];

        try {
            // 1. Grammar questions (already stored — include directly)
            if (selGrammarIds.length) {
                bkLog(`✅ 문법 문제 ${selGrammarIds.length}개 선택됨`);
                grammarBank = loadDB(GRAMMAR_KEY);
                selGrammarIds.forEach(id => {
                    const q = grammarBank.find(g => g.id === id);
                    if (q) bankResults.push({ ...q, _src: 'grammar' });
                });
                bkLog(`문법 문제 ${selGrammarIds.length}개 포함 완료`, 'ok');
            }

            // 2. Reading questions (generate with AI)
            if (selPassageIds.length) {
                bkLog(`독해 지문 ${selPassageIds.length}개 처리 시작...`);
                passageBank = loadDB(PASSAGE_KEY);

                for (let idx = 0; idx < selPassageIds.length; idx++) {
                    const id = selPassageIds[idx];
                    const p  = passageBank.find(x => x.id === id);
                    if (!p) continue;

                    bkLog(`→ "${p.title}" 문제 생성 중...`);
                    try {
                        const qs = await generateReadingQs(p.text, qpp);
                        qs.forEach(q => bankResults.push({
                            ...q,
                            id: uid(),
                            passage: p.text,
                            passageTitle: p.title,
                            _src: 'reading'
                        }));
                        bkLog(`  문제 ${qs.length}개 생성 완료`, 'ok');
                    } catch (e) {
                        bkLog(`  오류: ${e.message}`, 'error');
                    }

                    if (idx < selPassageIds.length - 1) {
                        bkLog('잠시 대기 중 (API 안정화)...');
                        await sleep(DELAY_MS);
                    }
                }
            }

            if (!bankResults.length) {
                bkLog('생성된 문제가 없습니다.', 'warn');
                return;
            }

            renderBankResults();
            $('bk-pdf-btn').style.display = 'block';
            bkLog(`🎉 총 ${bankResults.length}개 문제 구성 완료!`, 'ok');

        } catch (e) {
            bkLog(`오류: ${e.message}`, 'error');
        } finally {
            btn.disabled = false;
        }
    }

    // ── Result Card Render ────────────────────────────────
    function renderBankResults() {
        const container = $('bk-results');
        if (!bankResults.length) {
            container.innerHTML = '<p class="muted">생성된 문제가 없습니다.</p>';
            return;
        }

        container.innerHTML = bankResults.map((q, i) => {
            const srcBadge = q._src === 'grammar'
                ? `<span class="q-type-badge" style="background:#fff3cd;color:#856404;">📐 문법</span>`
                : `<span class="q-type-badge" style="background:#d4edda;color:#155724;">📖 독해</span>`;

            const passageHtml = q.passage
                ? `<div class="passage-box" style="max-height:160px;">${escHtml(q.passage.slice(0, 500))}${q.passage.length > 500 ? '...' : ''}</div>`
                : '';

            const choicesHtml = (q.choices || []).map(c =>
                `<li>${escHtml(c)}</li>`
            ).join('');

            return `
            <div class="question-card">
                <div class="question-header">
                    <span class="q-num">${i + 1}번</span>
                    <span class="q-type-badge">${escHtml(q.type || '독해')}</span>
                    ${srcBadge}
                </div>
                ${passageHtml}
                <div class="q-text">${escHtml(q.question)}</div>
                <ol class="choices-list">
                    ${choicesHtml}
                </ol>
                <details class="answer-wrap">
                    <summary>정답 &amp; 해설 보기</summary>
                    <div class="answer-body">
                        <strong>정답: ${escHtml(String(q.answer || ''))}번</strong>
                        <span>${escHtml(q.explanation || '')}</span>
                    </div>
                </details>
            </div>`;
        }).join('');
    }

    // ── PDF Export ─────────────────────────────────────────
    function exportBankPDF() {
        if (!bankResults.length) { alert('먼저 시험지를 구성해주세요.'); return; }

        const questionsHtml = bankResults.map((q, i) => {
            const choicesHtml = (q.choices || []).map(c => `<li>${escHtml(c)}</li>`).join('');
            const passageHtml = q.passage
                ? `<div class="passage">${escHtml(q.passage.slice(0, 600))}${q.passage.length > 600 ? '...' : ''}</div>`
                : '';
            return `
            <div class="qblock">
                <p class="qnum">${i + 1}. [${escHtml(q.type || '독해')}] ${escHtml(q.question)}</p>
                ${passageHtml}
                <ol>${choicesHtml}</ol>
            </div>`;
        }).join('');

        const answerKey = bankResults
            .map((q, i) => `${i + 1}번: ${q.answer || '?'}`)
            .join('&nbsp;&nbsp;&nbsp;');

        const html = `<!DOCTYPE html>
<html lang="ko"><head>
<meta charset="UTF-8">
<title>문제은행 시험지</title>
<style>
  body { font-family: 'Noto Serif KR', Georgia, 'Times New Roman', serif; padding: 48px 56px; font-size: 13.5px; line-height: 1.8; color: #111; max-width: 840px; margin: 0 auto; }
  h2 { text-align: center; font-size: 20px; letter-spacing: 2px; border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 28px; }
  .qblock { margin-bottom: 28px; page-break-inside: avoid; }
  .qnum { font-weight: 700; margin-bottom: 6px; }
  .passage { border: 1px solid #bbb; border-radius: 4px; padding: 12px 16px; background: #fafafa; font-size: 13px; line-height: 1.85; margin-bottom: 10px; }
  ol { padding-left: 20px; margin: 6px 0; }
  li { margin-bottom: 3px; font-size: 13px; }
  .answer-key { border-top: 2px solid #111; margin-top: 36px; padding-top: 14px; font-size: 12px; }
  @media print { body { padding: 20px; } }
</style>
</head><body>
<h2>시험지</h2>
${questionsHtml}
<div class="answer-key">
  <strong>정답표</strong><br><br>
  ${answerKey}
</div>
</body></html>`;

        const w = window.open('', '_blank');
        if (!w) { alert('팝업이 차단되었습니다. 팝업을 허용해주세요.'); return; }
        w.document.write(html);
        w.document.close();
        setTimeout(() => { try { w.print(); } catch (e) {} }, 700);
    }

    // ── XSS Prevention ────────────────────────────────────
    function escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ── Sub-tab Switching ─────────────────────────────────
    function setupSubTabs() {
        document.querySelectorAll('.bk-sub-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.dataset.target;
                document.querySelectorAll('.bk-sub-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                document.querySelectorAll('.bk-subtab-panel').forEach(p => { p.style.display = 'none'; });
                const panel = $(target);
                if (panel) panel.style.display = 'block';
            });
        });
    }

    // ── Top Tab Switching ─────────────────────────────────
    function setupTopTabs() {
        document.querySelectorAll('.top-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.dataset.tab;
                document.querySelectorAll('.top-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                $('tab-exam').style.display = 'none';
                $('tab-bank').style.display = 'none';
                const panel = $(`tab-${target}`);
                if (panel) panel.style.display = 'block';
            });
        });
    }

    // ── Select All / None Buttons ─────────────────────────
    function setupSelectButtons() {
        $('bk-sel-grammar-all').addEventListener('click', () => {
            document.querySelectorAll('input[name="sel-grammar"]').forEach(c => { c.checked = true; });
        });
        $('bk-sel-grammar-none').addEventListener('click', () => {
            document.querySelectorAll('input[name="sel-grammar"]').forEach(c => { c.checked = false; });
        });
        $('bk-sel-passage-all').addEventListener('click', () => {
            document.querySelectorAll('input[name="sel-passage"]').forEach(c => { c.checked = true; });
        });
        $('bk-sel-passage-none').addEventListener('click', () => {
            document.querySelectorAll('input[name="sel-passage"]').forEach(c => { c.checked = false; });
        });
    }

    // ── Init ──────────────────────────────────────────────
    function init() {
        setupTopTabs();
        setupSubTabs();
        setupGrammarUpload();
        setupPassageSave();
        setupSelectButtons();

        $('bk-generate-btn').addEventListener('click', generateBankTest);
        $('bk-pdf-btn').addEventListener('click', exportBankPDF);

        renderGrammarBank();
        renderPassageBank();

        console.log('[Bank Engine v1.0] 문제은행 엔진 초기화 완료');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
