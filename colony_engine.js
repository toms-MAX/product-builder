document.addEventListener('DOMContentLoaded', async () => {
    console.log('Gemma 4 Ant Colony Exam Engine v6.2 (Stabilized) initialized');

    // --- CONFIGURATION ---
    // 구글 API의 모델 경로 형식을 더욱 명확히 합니다.
    const API_BASE = 'https://generativelanguage.googleapis.com/v1'; 
    // 가장 가용성이 높은 모델명을 사용합니다.
    const MODEL_NAME = 'models/gemini-1.5-flash'; 
    
    let currentApiKey = localStorage.getItem('gemma_api_key') || '';
    let questionDatabase = [];

    const readingMaterial = document.getElementById('reading-material');
    const generateBtn = document.getElementById('generate-btn');
    const resultContainer = document.getElementById('generated-questions');
    const apiKeyInput = document.getElementById('api-key-input');
    const saveKeyBtn = document.getElementById('save-key-btn');
    const computeLog = document.getElementById('compute-log');
    const factoryStatus = document.getElementById('factory-status');
    const predictCount = document.getElementById('predict-count');

    apiKeyInput.value = currentApiKey;

    async function init() {
        try {
            const resp = await fetch('questions.json');
            questionDatabase = await resp.json();
            log(`유전형질 데이터베이스 로드 완료: ${questionDatabase.length}개의 예시 보유`, 'success');
        } catch (e) {
            log('데이터베이스 로드 실패.', 'error');
        }
    }
    init();

    saveKeyBtn.onclick = () => {
        currentApiKey = apiKeyInput.value.trim();
        localStorage.setItem('gemma_api_key', currentApiKey);
        alert('API Key Saved');
    };

    function log(msg, type = 'info') {
        const div = document.createElement('div');
        const timestamp = new Date().toLocaleTimeString();
        let prefix = '[INFO]';
        if (type === 'exec') { prefix = '<span style="color: #f1c40f;">[ANT ]</span>'; div.style.color = '#f1c40f'; }
        if (type === 'success') { prefix = '<span style="color: #2ecc71;">[OK  ]</span>'; div.style.color = '#2ecc71'; }
        if (type === 'error') { prefix = '<span style="color: #e74c3c;">[ERR ]</span>'; div.style.color = '#e74c3c'; }
        div.innerHTML = `${prefix} ${timestamp} - ${msg}`;
        computeLog.appendChild(div);
        factoryStatus.scrollTop = factoryStatus.scrollHeight;
    }

    async function callGemma(systemInstruction, userPrompt, isJson = false) {
        // v1 정식 규격: {BASE_URL}/{MODEL_NAME}:generateContent?key={KEY}
        const fullUrl = `${API_BASE}/${MODEL_NAME}:generateContent?key=${currentApiKey}`;
        
        const requestBody = {
            contents: [
                {
                    role: "user",
                    parts: [{ text: `[System Instruction]\n${systemInstruction}\n\n[User Input]\n${userPrompt}` }]
                }
            ],
            generationConfig: {
                temperature: 0.3,
                ...(isJson ? { responseMimeType: "application/json" } : {})
            }
        };

        const resp = await fetch(fullUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        
        const data = await resp.json();
        if (!resp.ok) {
            console.error('API Error Details:', data);
            throw new Error(data.error?.message || 'API 호출 실패');
        }
        
        return data.candidates[0].content.parts[0].text;
    }

    // --- THE ANT COLONY (AGENTS) ---

    async function antDNAScout(passage) {
        log('탐색 개미(Scout)가 DNA 데이터베이스를 뒤지는 중...', 'exec');
        const system = "너는 지문을 분석하여 가장 적절한 문제 유형을 선정하는 탐색 개미야. 반드시 JSON으로만 응답해.";
        const user = `지문에 어울리는 유형 ID를 골라줘. ID 0번을 우선해.\n\n[지문]\n${passage}\n\n응답 형식: { "selected_id": 0, "reason": "이유" }`;
        const res = await callGemma(system, user, true);
        const choice = JSON.parse(res);
        return questionDatabase[choice.selected_id] || questionDatabase[0];
    }

    async function antPurifier(text) {
        log('정제 개미(Purifier)가 불순물을 제거하는 중...', 'exec');
        const system = "텍스트에서 순수 영어 본문만 추출해.";
        return await callGemma(system, text);
    }

    async function antArchitect(passage, dna) {
        log('설계 개미(Architect)가 출제 포인트를 설계 중...', 'exec');
        const system = "문제 설계 개미야. 출제 포인트를 JSON으로 응답해.";
        const user = `지문: ${passage}\n응답 형식: { "point": "설명" }`;
        const res = await callGemma(system, user, true);
        return JSON.parse(res);
    }

    async function antModifier(passage, design, dna) {
        log('가공 개미(Modifier)가 지문에 빈칸/밑줄을 긋는 중...', 'exec');
        const system = "지문을 변형하는 개미야. 변형된 본문만 반환해.";
        const user = `본문: ${passage}\n포인트: ${design.point}`;
        return await callGemma(system, user);
    }

    async function antVoice(dna) {
        log('발성 개미(Voice)가 질문을 작성 중...', 'exec');
        const system = "질문을 작성하는 개미야.";
        const user = `영어 시험용 질문 문장을 하나 만들어줘.`;
        return await callGemma(system, user);
    }

    async function antCultivator(passage, modifiedPassage, question, dna) {
        log('배양 개미(Cultivator)가 보기 데이터를 생성 중...', 'exec');
        const system = "보기(1정답, 4오답)를 만드는 개미야. JSON으로 응답해.";
        const user = `지문: ${passage}\n질문: ${question}\n응답 형식: { "answer": "정답", "distractors": ["오답1","오답2","오답3","오답4"], "explanation": "해설" }`;
        const res = await callGemma(system, user, true);
        return JSON.parse(res);
    }

    async function antAssembler(question, cultivatorData) {
        log('조립 개미(Assembler)가 문제를 패키징 중...', 'exec');
        const options = [cultivatorData.answer, ...cultivatorData.distractors];
        for (let i = options.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [options[i], options[j]] = [options[j], options[i]];
        }
        const marks = ['①', '②', '③', '④', '⑤'];
        return {
            question: question,
            options: options.map((opt, i) => `${marks[i]} ${opt}`),
            answer: marks[options.indexOf(cultivatorData.answer)],
            explanation: cultivatorData.explanation
        };
    }

    async function antAuditor(passage, problem) {
        log('검수 개미(Auditor)가 최종 점검 중...', 'exec');
        const system = "무자비한 검수 개미야. 완벽하면 'PASS' 아니면 'FAIL'만 말해.";
        const user = `문제: ${JSON.stringify(problem)}`;
        const res = await callGemma(system, user);
        return res.toUpperCase().includes('PASS');
    }

    generateBtn.onclick = async () => {
        const rawInput = readingMaterial.value.trim();
        if (!rawInput || !currentApiKey) return alert('지문과 API 키가 필요합니다.');

        generateBtn.disabled = true;
        factoryStatus.style.display = 'block';
        computeLog.innerHTML = '';
        resultContainer.innerHTML = '';

        try {
            log('Ant Colony Operation Started...', 'info');
            const cleanPassage = await antPurifier(rawInput);
            const count = parseInt(predictCount.value) || 1;
            const finalQuestions = [];

            for (let i = 0; i < count; i++) {
                log(`[${i+1}번 생산라인] 가동 중...`, 'info');
                const dna = await antDNAScout(cleanPassage);
                const design = await antArchitect(cleanPassage, dna);
                const modifiedPassage = await antModifier(cleanPassage, design, dna);
                const qText = await antVoice(dna);
                const cData = await antCultivator(cleanPassage, modifiedPassage, qText, dna);
                const assembly = await antAssembler(qText, cData);
                
                if (await antAuditor(cleanPassage, assembly)) {
                    finalQuestions.push({ ...assembly, passage: modifiedPassage });
                    log(`${i+1}번 문제 생산 성공!`, 'success');
                } else {
                    log(`${i+1}번 문제 검수 실패.`, 'error');
                }
            }
            renderResults(finalQuestions);
        } catch (e) {
            log('Colony Error: ' + e.message, 'error');
        } finally {
            generateBtn.disabled = false;
        }
    };

    function renderResults(questions) {
        if (questions.length === 0) {
            resultContainer.innerHTML = '<p class="empty-msg">개미들이 문제를 완성하지 못했습니다.</p>';
            return;
        }
        questions.forEach((q, i) => {
            const qDiv = document.createElement('div');
            qDiv.className = 'question-item';
            qDiv.style.textAlign = 'left';
            qDiv.innerHTML = `
                <div style="background:#f9f9f9; padding:20px; border:1px solid #ddd; border-radius:8px; margin-bottom:15px; white-space:pre-wrap;">${q.passage}</div>
                <div style="font-weight:bold; margin-bottom:12px;">${i + 1}. ${q.question}</div>
                <ul style="list-style:none; padding:0; margin-bottom:15px;">
                    ${q.options.map(opt => `<li style="padding:8px; background:#fff; border:1px solid #eee; margin-bottom:5px; border-radius:4px;">${opt}</li>`).join('')}
                </ul>
                <div style="color:#27ae60; font-weight:bold; background:#f0fff4; padding:10px; border-radius:4px;">
                    정답: ${q.answer} <br>
                    <span style="font-weight:normal; font-size:0.9em; color:#666;">해설: ${q.explanation}</span>
                </div>
            `;
            resultContainer.appendChild(qDiv);
        });
    }
});