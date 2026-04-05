document.addEventListener('DOMContentLoaded', async () => {
    console.log('Logical Circuit Exam Engine v4.0 initialized');

    const API_URL = 'https://api.groq.com/openai/v1/chat/completions';
    const MODEL_NAME = 'llama-3.3-70b-versatile';

    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const readingMaterial = document.getElementById('reading-material');
    const dropZone = document.getElementById('drop-zone');
    const examFileInput = document.getElementById('exam-file-input');
    const generateBtn = document.getElementById('generate-btn');
    const resultContainer = document.getElementById('generated-questions');
    const apiKeyInput = document.getElementById('api-key-input');
    const saveKeyBtn = document.getElementById('save-key-btn');
    const computeLog = document.getElementById('compute-log');
    const factoryStatus = document.getElementById('factory-status');

    let logicInstructionSet = null; // ChatGPT에서 받은 그 JSON이 저장될 레지스터
    let currentApiKey = localStorage.getItem('groq_api_key') || '';
    apiKeyInput.value = currentApiKey;

    saveKeyBtn.onclick = () => {
        currentApiKey = apiKeyInput.value.trim();
        localStorage.setItem('groq_api_key', currentApiKey);
        alert('API 키 저장됨');
    };

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

    async function callAI(messages, isJson = false) {
        const resp = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: MODEL_NAME,
                messages: messages,
                temperature: 0.1,
                response_format: isJson ? { type: "json_object" } : undefined
            })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error?.message);
        return data.choices[0].message.content;
    }

    // --- ATOMIC OPERATIONS BASED ON JSON SPEC ---

    // 0. Language Filtration (언어 필터링 연산)
    async function opFilterLanguage(text) {
        log('연산 시작: 언어 필터링 (영어 본문 정밀 추출)...', 'exec');
        const prompt = `다음 텍스트는 한글 설명과 영어 본문이 섞여 있습니다. 
        시험 문제가 출제될 '영어 본문'만 추출하여 반환하세요. 
        한글 번역이나 지시문은 모두 제거하십시오.
        
        입력:
        ${text}`;
        
        const res = await callAI([{ role: 'user', content: prompt }]);
        log('언어 필터링 완료: 영어 본문 데이터 로드됨', 'success');
        return res;
    }

    // 1. Logic Set Loader (설계도 해석기)
    function loadLogicSet(rawInput) {
        try {
            const parsed = JSON.parse(rawInput);
            if (parsed.micro_operations) {
                logicInstructionSet = parsed;
                log(`로직 설계도 로드 완료: ${parsed.micro_operations.length}개의 연산 회로가 대기 중`, 'success');
                return true;
            }
        } catch (e) {
            log('입력된 텍스트가 유효한 JSON 로직 설계도가 아닙니다. 일반 텍스트 분석 모드로 전환합니다.', 'info');
            return false;
        }
    }

    // 2. Hardware Marker Injection (기호 매핑 연산)
    async function opInjectMarkers(passage, spec) {
        log('연산 시작: Physical Marker Layer 주입...', 'exec');
        const prompt = `다음 지문에 하드웨어 명세에 따라 적절한 위치에 기호를 주입하세요.
        규칙: ${spec.marker_placement_rule}
        사용 가능 기호: ${spec.passage_markers.join(', ')}
        
        지문:
        ${passage}`;
        
        const res = await callAI([{ role: 'user', content: prompt }]);
        log('마커 주입 완료 (Passage Instrumented)', 'success');
        return res;
    }

    // 3. Instruction Execution (개별 OP 실행)
    async function opExecuteCircuit(op, passage, count) {
        log(`회로 가동: [${op.op_id}] ${op.type} 연산 중...`, 'exec');
        
        const systemPrompt = `당신은 영어 문제 생성 회로입니다. 다음 명세서(Spec)에 따라 지문에서 문제를 추출하고 오답을 합성하세요.
        반드시 JSON으로 응답하십시오.
        
        [SCANNING LOGIC] ${op.scanning_logic}
        [TRANSFORMATION RULES] ${JSON.stringify(op.transformation_rules)}
        [OPTION ASSEMBLY] ${JSON.stringify(op.option_assembly)}
        
        출력 형식:
        { "questions": [ { "type": "${op.type}", "question": "...", "options": ["①", "②", "③", "④", "⑤"], "answer": "...", "explanation": "..." } ] }`;

        const res = await callAI([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `본문:\n${passage}\n\n위 본문에서 ${count}문항을 연산하여 출력하십시오.` }
        ], true);
        
        log(`[${op.op_id}] 연산 완료`, 'success');
        return JSON.parse(res).questions;
    }

    // --- MAIN PIPELINE ---
    generateBtn.onclick = async () => {
        const rawInput = readingMaterial.value.trim();
        if (!rawInput) return alert('지문을 입력하세요.');
        if (!currentApiKey) return alert('API 키가 필요합니다.');

        generateBtn.disabled = true;
        factoryStatus.style.display = 'block';
        computeLog.innerHTML = '';
        resultContainer.innerHTML = '';

        try {
            log('System Booting... Micro-Computing Engine v4.0', 'info');
            
            // Step 0: 언어 필터링 (한글 제거 및 영어 본문 추출)
            const cleanPassage = await opFilterLanguage(rawInput);

            // 1. 설계도 로드
            const logicRaw = uploadedFiles.find(f => f.type === 'text')?.content || '';
            const hasLogic = loadLogicSet(logicRaw);

            let finalPassage = cleanPassage;
            let finalQuestions = [];

            if (hasLogic) {
                // [설계도 모드] 가공된 지문에 하드웨어 마커 주입
                finalPassage = await opInjectMarkers(cleanPassage, logicInstructionSet.hardware_spec);
                
                const opsToRun = logicInstructionSet.micro_operations.slice(0, 3); 
                log('병렬 연산 유닛 할당 시작...', 'exec');
                
                const results = await Promise.all(opsToRun.map(op => opExecuteCircuit(op, finalPassage, 1)));
                finalQuestions = results.flat();
            } else {
                log('기본 연산 모드로 작동합니다.', 'info');
                // 기본 모드 생략 (설계도 위주 작동)
            }

            renderFinalResults(finalPassage, finalQuestions);
            log('All Operations Completed Successfully.', 'success');

        } catch (e) {
            log('Critical System Failure: ' + e.message, 'error');
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
                <div style="margin-top: 10px; color: #27ae60; font-size: 0.9em; padding: 10px; background: #f0fff4; border-radius: 4px;">
                    <strong>정답: ${q.answer}</strong><br>${q.explanation || ''}
                </div>
            `;
            resultContainer.appendChild(qDiv);
        });
    }

    // File Handling
    const uploadedFiles = [];
    dropZone.onclick = () => examFileInput.click();
    dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('dragover'); };
    dropZone.ondrop = (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); handleFiles(e.dataTransfer.files); };
    examFileInput.onchange = (e) => handleFiles(e.target.files);

    async function handleFiles(files) {
        for (const file of files) {
            const text = file.type === 'application/pdf' ? await extractTextFromPdf(file) : await readFileAsText(file);
            uploadedFiles.push({ name: file.name, content: text, type: 'text' });
            log(`로직 데이터 로드됨: ${file.name}`);
        }
        updatePreview();
    }

    function readFileAsText(file) { return new Promise(resolve => { const r = new FileReader(); r.onload = (e) => resolve(e.target.result); r.readAsText(file); }); }
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
            const span = document.createElement('span');
            span.style.cssText = "background: #333; color: #0f0; padding: 2px 8px; border-radius: 4px; font-size: 11px; margin-right: 5px; font-family: monospace;";
            span.textContent = `[ROM] ${f.name}`;
            previewContainer.appendChild(span);
        });
    }
});