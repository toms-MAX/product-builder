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
    const logicJsonInput = document.getElementById('logic-json-input');

    let logicInstructionSet = null; 
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

    // --- ATOMIC OPERATIONS ---

    async function opFilterLanguage(text) {
        log('연산 시작: 언어 필터링 (영어 본문 정밀 추출)...', 'exec');
        const prompt = `다음 텍스트에서 시험 문제가 출제될 '영어 본문'만 추출하여 반환하세요. 한글은 모두 제거하십시오:\n\n${text}`;
        const res = await callAI([{ role: 'user', content: prompt }]);
        log('언어 필터링 완료', 'success');
        return res;
    }

    function loadLogicSet(rawInput) {
        try {
            if (!rawInput.trim()) return false;
            const parsed = JSON.parse(rawInput);
            if (parsed.micro_operations) {
                logicInstructionSet = parsed;
                log(`로직 설계도 로드 완료: ${parsed.micro_operations.length}개의 연산 회로 대기 중`, 'success');
                return true;
            }
        } catch (e) { return false; }
        return false;
    }

    async function opInjectMarkers(passage, spec) {
        log('연산 시작: Physical Marker Layer 주입...', 'exec');
        const prompt = `다음 지문에 규칙(${spec.marker_placement_rule})에 따라 기호(${spec.passage_markers.join(',')})를 주입하세요:\n\n${passage}`;
        const res = await callAI([{ role: 'user', content: prompt }]);
        log('마커 주입 완료', 'success');
        return res;
    }

    async function opExecuteCircuit(op, passage, count) {
        log(`회로 가동: [${op.op_id}] ${op.type} 연산 중...`, 'exec');
        const systemPrompt = `당신은 영어 문제 생성 회로입니다. 다음 명세에 따라 문제를 생성하고 반드시 아래의 JSON 형식으로만 응답하세요.
        
        형식: { "questions": [ { "type": "...", "question": "...", "options": ["①", "②", "③", "④", "⑤"], "answer": "...", "explanation": "..." } ] }
        
        [SCANNING] ${op.scanning_logic}
        [TRANSFORM] ${JSON.stringify(op.transformation_rules)}
        [ASSEMBLY] ${JSON.stringify(op.option_assembly)}`;

        try {
            const res = await callAI([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `본문:\n${passage}\n\n위 본문에서 ${count}문항을 생성하세요.` }
            ], true);
            
            const data = JSON.parse(res);
            // 데이터가 유효한지 확인 (questions 리스트가 없으면 빈 배열 반환)
            if (data && Array.isArray(data.questions)) {
                log(`[${op.op_id}] 연산 완료`, 'success');
                return data.questions;
            } else {
                log(`[${op.op_id}] 연산 결과 데이터 규격 불일치`, 'error');
                return [];
            }
        } catch (e) {
            log(`[${op.op_id}] 연산 실패: ${e.message}`, 'error');
            return [];
        }
    }

    // --- MAIN PIPELINE ---
    generateBtn.onclick = async () => {
        const rawInput = readingMaterial.value.trim();
        const logicPasteInput = logicJsonInput.value.trim();
        
        if (!rawInput) return alert('지문을 입력하세요.');
        if (!currentApiKey) return alert('API 키가 필요합니다.');

        generateBtn.disabled = true;
        factoryStatus.style.display = 'block';
        computeLog.innerHTML = '';
        resultContainer.innerHTML = '';

        try {
            log('System Booting... Engine v4.0', 'info');
            
            let logicRaw = logicPasteInput || uploadedFiles.find(f => f.name.endsWith('.json'))?.content || '';
            const hasLogic = loadLogicSet(logicRaw);

            const cleanPassage = await opFilterLanguage(rawInput);
            let finalPassage = cleanPassage;
            let finalQuestions = [];

            if (hasLogic) {
                finalPassage = await opInjectMarkers(cleanPassage, logicInstructionSet.hardware_spec);
                const count = parseInt(document.getElementById('predict-count').value) || 3;
                
                // 로직에서 연산 리스트를 가져와서 개수만큼 실행
                const opsToRun = logicInstructionSet.micro_operations.slice(0, count); 
                log(`${opsToRun.length}개 유닛 병렬 할당 시작...`, 'exec');
                
                const results = await Promise.all(opsToRun.map(op => opExecuteCircuit(op, finalPassage, 1)));
                // null이나 undefined 필터링 후 합치기
                finalQuestions = results.filter(r => r !== null).flat();
            } else {
                log('기본 연산 모드로 작동합니다.', 'info');
                const basicOp = { op_id: "BASIC", type: "기본", scanning_logic: "All", transformation_rules: [], option_assembly: { format: "①~⑤" } };
                finalQuestions = await opExecuteCircuit(basicOp, cleanPassage, 3);
            }

            if (finalQuestions.length === 0) {
                throw new Error('생성된 문제가 없습니다. 지문이나 로직을 확인해 주세요.');
            }

            renderFinalResults(finalPassage, finalQuestions);
            log('All Operations Completed.', 'success');
        } catch (e) {
            log('Failure: ' + e.message, 'error');
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
            // q가 존재하지 않으면 건너뜀 (방어적 코드)
            if (!q) return;

            const qDiv = document.createElement('div');
            qDiv.className = 'question-item';
            qDiv.style.textAlign = 'left';
            
            const opts = Array.isArray(q.options) ? q.options : [];
            
            qDiv.innerHTML = `
                <div style="font-weight: bold; margin-bottom: 12px; font-size: 1.1em; color: #000;">${i + 1}. [${q.type || '유형미정'}] ${q.question || '질문 데이터 없음'}</div>
                <ul style="list-style: none; padding-left: 0; display: grid; gap: 8px;">
                    ${opts.map(opt => `<li style="background: #fff; padding: 10px; border: 1px solid #eee; border-radius: 4px; color: #333;">${opt}</li>`).join('')}
                </ul>
                <div style="margin-top: 10px; color: #27ae60; font-size: 0.9em; padding: 10px; background: #f0fff4; border-radius: 4px;">
                    <strong>정답: ${q.answer || '미지정'}</strong><br>${q.explanation || ''}
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
            try {
                const text = file.type === 'application/pdf' ? await extractTextFromPdf(file) : await readFileAsText(file);
                uploadedFiles.push({ name: file.name, content: text });
                log(`데이터 로드됨: ${file.name}`);
                if (file.name.endsWith('.json')) {
                    logicJsonInput.value = text;
                    log('JSON 설계도가 입력창에 자동 로드되었습니다.', 'success');
                }
            } catch (e) { log(`파일 로드 실패: ${file.name}`, 'error'); }
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