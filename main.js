document.addEventListener('DOMContentLoaded', async () => {
    console.log('Micro-Computing Exam Engine initialized');

    const API_URL = 'https://api.groq.com/openai/v1/chat/completions';
    const MODEL_NAME = 'llama-3.3-70b-versatile';
    const VISION_MODEL = 'llama-3.2-11b-vision-preview';

    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const readingMaterial = document.getElementById('reading-material');
    const dropZone = document.getElementById('drop-zone');
    const examFileInput = document.getElementById('exam-file-input');
    const previewContainer = document.getElementById('selected-files-preview');
    const generateBtn = document.getElementById('generate-btn');
    const resultContainer = document.getElementById('generated-questions');
    const apiKeyInput = document.getElementById('api-key-input');
    const saveKeyBtn = document.getElementById('save-key-btn');
    const computeLog = document.getElementById('compute-log');
    const factoryStatus = document.getElementById('factory-status');

    let uploadedFiles = [];
    let currentApiKey = localStorage.getItem('groq_api_key') || '';
    apiKeyInput.value = currentApiKey;

    saveKeyBtn.onclick = () => {
        currentApiKey = apiKeyInput.value.trim();
        localStorage.setItem('groq_api_key', currentApiKey);
        alert('API 키 저장됨');
    };

    // --- MICRO-LOG SYSTEM ---
    function log(msg, type = 'info') {
        const div = document.createElement('div');
        const timestamp = new Date().toLocaleTimeString();
        let prefix = '[INFO]';
        if (type === 'exec') { prefix = '<span style="color: #f1c40f;">[EXEC]</span>'; div.style.color = '#f1c40f'; }
        if (type === 'success') { prefix = '<span style="color: #2ecc71;">[OK  ]</span>'; div.style.color = '#2ecc71'; }
        if (type === 'error') { prefix = '<span style="color: #e74c3c;">[ERR ]</span>'; div.style.color = '#e74c3c'; }
        
        div.innerHTML = `${prefix} ${timestamp} - ${msg}`;
        computeLog.appendChild(div);
        factoryStatus.scrollTop = factoryStatus.scrollHeight;
    }

    // --- ATOMIC AI OPERATIONS ---
    async function callAI(prompt, isJson = false) {
        const resp = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: MODEL_NAME,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.1,
                response_format: isJson ? { type: "json_object" } : undefined
            })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error?.message);
        return data.choices[0].message.content;
    }

    // 1. 유형 특징 추출 (Atomic)
    async function opExtractStylePatterns() {
        log('연산 시작: 스타일 패턴 추출...', 'exec');
        const samples = uploadedFiles.map(f => f.content).join('\n');
        if (!samples) return "일반적인 5지선다 객관식";
        const res = await callAI(`다음 텍스트에서 사용된 문제 번호 형식, 기호([A], ❶ 등), 보기 형식을 아주 짧게 리스트업 하세요:\n${samples}`);
        log('스타일 패턴 추출 완료', 'success');
        return res;
    }

    // 2. 문장 토큰화 (Micro)
    async function opTokenizeSentences(text) {
        log('연산 시작: 지문 토큰화 및 구조 분석...', 'exec');
        const res = await callAI(`다음 지문을 문장 단위로 나누고 각 문장에 ID를 부여하세요(S1, S2...). 결과는 JSON으로:\n{ "sentences": [{ "id": "S1", "text": "..." }] }\n\n지문:\n${text}`, true);
        log('토큰화 완료', 'success');
        return JSON.parse(res).sentences;
    }

    // 3. 문법 포인트 검색 (Micro)
    async function opIdentifyGrammarPoints(sentences) {
        log('연산 시작: 문법적 포인트(Grammar Node) 검색...', 'exec');
        const res = await callAI(`다음 문장들에서 중학교 내신에 나올만한 문법 요소(관계대명사, 분사, 수동태 등)가 포함된 문장을 3개 골라 JSON으로 반환하세요:\n{ "points": [{ "sentence_id": "S1", "target": "단어/구", "grammar_type": "유형" }] }\n\n대상:\n${JSON.stringify(sentences)}`, true);
        log('문법 포인트 식별 완료', 'success');
        return JSON.parse(res).points;
    }

    // 4. 개별 오답 생성 연산 (Atomic)
    async function opGenerateDistractors(point, originalSentence) {
        log(`연산 시작: [${point.sentence_id}] 오답(Distractors) 생성...`, 'exec');
        const res = await callAI(`다음 문장에서 '${point.target}' 부분을 변형하여 문법적으로 틀린 보기 4개를 만드세요. 원래 부분은 1번으로 하고 총 5개를 만드세요.\n{ "options": ["①...", "②...", "③...", "④...", "⑤..."], "answer": "①" }\n\n문장: ${originalSentence}\n대상: ${point.target}`, true);
        log(`[${point.sentence_id}] 오답 생성 완료`, 'success');
        return JSON.parse(res);
    }

    // --- MAIN PIPELINE (ORCHESTRATOR) ---
    generateBtn.onclick = async () => {
        const text = readingMaterial.value.trim();
        if (!text) return alert('지문을 입력하세요.');
        if (!currentApiKey) return alert('API 키가 필요합니다.');

        generateBtn.disabled = true;
        factoryStatus.style.display = 'block';
        computeLog.innerHTML = '';
        resultContainer.innerHTML = '';
        
        try {
            log('CPU 시스템 부팅 중...', 'info');
            
            // 1. 스타일 패턴 레지스터 로드
            const stylePatterns = await opExtractStylePatterns();
            
            // 2. 본문 메모리 할당 (토큰화)
            const sentences = await opTokenizeSentences(text);
            
            // 3. 연산 대상(Grammar Node) 검색
            const targetPoints = await opIdentifyGrammarPoints(sentences);
            
            // 4. 병렬 연산 (각 포인트별 보기 생성)
            log('병렬 연산 가동: 보기(Options) 동시 생성 시작', 'info');
            const questions = await Promise.all(targetPoints.map(async (point) => {
                const sentenceText = sentences.find(s => s.id === point.sentence_id).text;
                const optData = await opGenerateDistractors(point, sentenceText);
                return {
                    type: point.grammar_type,
                    question: `다음 밑줄 친 '${point.target}' 부분의 쓰임이 어법상 옳은 것을 고르시오. (문맥: ...${sentenceText}...)`,
                    ...optData
                };
            }));

            // 5. 최종 결과 어셈블
            log('연산 종료. 데이터 어셈블 중...', 'info');
            renderFinalResults(text, questions);
            log('모든 프로세스 정상 종료.', 'success');
            
        } catch (e) {
            log('치명적 연산 오류: ' + e.message, 'error');
        } finally {
            generateBtn.disabled = false;
        }
    };

    function renderFinalResults(passage, questions) {
        const pBox = document.createElement('div');
        pBox.style.cssText = "padding: 20px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 25px; white-space: pre-wrap; line-height: 1.8; color: #000; text-align: left;";
        pBox.textContent = passage;
        resultContainer.appendChild(pBox);

        questions.forEach((q, i) => {
            const qDiv = document.createElement('div');
            qDiv.className = 'question-item';
            qDiv.style.textAlign = 'left';
            qDiv.innerHTML = `
                <div style="font-weight: bold; margin-bottom: 12px; font-size: 1.1em; color: #000;">${i + 1}. [${q.type}] ${q.question}</div>
                <ul style="list-style: none; padding-left: 0; display: grid; gap: 8px;">
                    ${q.options.map(opt => `<li style="background: #fff; padding: 10px; border: 1px solid #eee; border-radius: 4px; color: #333;">${opt}</li>`).join('')}
                </ul>
                <div style="margin-top: 10px; color: #27ae60; font-size: 0.9em;">정답: ${q.answer}</div>
            `;
            resultContainer.appendChild(qDiv);
        });
    }

    // File Handling
    dropZone.onclick = () => examFileInput.click();
    dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('dragover'); };
    dropZone.ondragleave = () => dropZone.classList.remove('dragover');
    dropZone.ondrop = (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); handleFiles(e.dataTransfer.files); };
    examFileInput.onchange = (e) => handleFiles(e.target.files);

    async function handleFiles(files) {
        for (const file of files) {
            const content = file.type === 'application/pdf' ? await extractTextFromPdf(file) : await readFileAsText(file);
            uploadedFiles.push({ name: file.name, content });
        }
        updatePreview();
    }

    function readFileAsText(file) {
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsText(file);
        });
    }

    async function extractTextFromPdf(file) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let text = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map(item => item.str).join(' ') + '\n';
        }
        return text;
    }

    function updatePreview() {
        previewContainer.innerHTML = '';
        uploadedFiles.forEach(f => {
            const item = document.createElement('span');
            item.style.cssText = "background: #eee; padding: 2px 8px; border-radius: 4px; font-size: 11px; margin-right: 5px;";
            item.textContent = `📄 ${f.name}`;
            previewContainer.appendChild(item);
        });
    }
});