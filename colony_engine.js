document.addEventListener('DOMContentLoaded', async () => {
    console.log('Gemma 4 Ant Colony Exam Engine v7.1 (Advanced Prompting) initialized');

    const API_URL = 'https://api.groq.com/openai/v1/chat/completions';
    const MODEL_NAME = 'llama-3.3-70b-versatile'; 
    
    let currentApiKey = localStorage.getItem('groq_api_key') || '';
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
            log(`DNA 데이터베이스 로드 완료: ${questionDatabase.length}개의 정교한 템플릿 보유`, 'success');
        } catch (e) {
            log('데이터베이스 로드 실패.', 'error');
        }
    }
    init();

    saveKeyBtn.onclick = () => {
        currentApiKey = apiKeyInput.value.trim();
        localStorage.setItem('groq_api_key', currentApiKey);
        alert('Groq API Key Saved');
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

    async function callGroq(systemInstruction, userPrompt, isJson = false) {
        const resp = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: MODEL_NAME,
                messages: [
                    { role: 'system', content: systemInstruction },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.1, // 창의성보다는 정확성에 올인
                response_format: isJson ? { type: "json_object" } : undefined
            })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error?.message || 'Groq API 호출 실패');
        return data.choices[0].message.content;
    }

    // --- THE ANT COLONY (Enhanced Agents) ---

    async function antPurifier(text) {
        log('정제 개미(Purifier)가 순수 영어 본문만 채취 중...', 'exec');
        const system = "너는 텍스트에서 한글, 기호, 잡음을 모두 제거하고 '순수 영어 본문'만 남기는 정제 개미야. 영어 문장이 아닌 것은 절대 포함하지 마.";
        return await callGroq(system, text);
    }

    async function antDNAScout(passage) {
        log('탐색 개미(Scout)가 정교한 문제 유형을 선정 중...', 'exec');
        // DNA 데이터베이스에서 가능한 유형들을 명시적으로 전달
        const dnaSample = JSON.stringify(questionDatabase[0].pages[0].sections);
        const system = `너는 제공된 시험지 템플릿(DNA)을 분석하여 가장 적합한 문제 유형을 결정하는 탐색 개미야. 반드시 JSON으로만 응답해. 템플릿 참고: ${dnaSample}`;
        const user = `다음 영어 지문에 가장 잘 어울리는 문제 유형(예: 내용 일치, 어법, 빈칸 등)을 선정해줘.\n\n[지문]\n${passage}\n\n응답 형식: { "type": "유형명", "reason": "이유" }`;
        const res = await callGroq(system, user, true);
        return JSON.parse(res);
    }

    async function antArchitect(passage, dnaType) {
        log('설계 개미(Architect)가 출제 포인트를 정밀 설계 중...', 'exec');
        const system = "너는 영어 시험 문제의 핵심 출제 포인트를 설계하는 개미야. JSON으로 응답해.";
        const user = `지문: ${passage}\n선정 유형: ${dnaType.type}\n\n이 유형에 맞춰 지문의 어느 부분을 고치거나 밑줄을 그을지 결정해줘. 응답 형식: { "point": "설명" }`;
        const res = await callGroq(system, user, true);
        return JSON.parse(res);
    }

    async function antModifier(passage, design) {
        log('가공 개미(Modifier)가 지문에 실험(변형) 중...', 'exec');
        const system = "너는 지문을 변형하는 개미야. 한글은 절대 섞지 마. 오직 영어 지문 안에서 변형(빈칸 [ (A) ] 또는 밑줄 (a)~(e))만 수행해.";
        const user = `본문: ${passage}\n설계 포인트: ${design.point}\n\n위 지침에 따라 변형된 영어 지문 전체를 반환해.`;
        return await callGroq(system, user);
    }

    async function antVoice(dnaType) {
        log('발성 개미(Voice)가 공식 질문을 작성 중...', 'exec');
        const system = "너는 한국 영어 시험의 공식 질문(발문)을 작성하는 개미야.";
        const user = `유형: ${dnaType.type}\n\n이 유형에 어울리는 한국어 질문 문장을 하나 만들어줘. (예: 윗글의 내용과 일치하는 것은?)`;
        return await callGroq(system, user);
    }

    async function antCultivator(passage, modifiedPassage, question) {
        log('배양 개미(Cultivator)가 매력적인 보기를 생성 중...', 'exec');
        const system = "너는 5지선다 보기를 만드는 개미야. 정답 1개와 아주 헷갈리는 오답 4개를 만들어. JSON으로 응답해.";
        const user = `본문: ${passage}\n가공지문: ${modifiedPassage}\n질문: ${question}\n\n응답 형식: { "answer": "정답 내용", "distractors": ["오답1","오답2","오답3","오답4"], "explanation": "해설" }`;
        const res = await callGroq(system, user, true);
        return JSON.parse(res);
    }

    async function antAssembler(question, cultivatorData) {
        log('조립 개미(Assembler)가 문제를 최종 패키징 중...', 'exec');
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
        log('검수 개미(Auditor)가 무자비하게 검수 중...', 'exec');
        const system = "너는 검수 개미야. 문제가 논리적으로 완벽하면 'PASS', 아니면 'FAIL'을 말해.";
        const user = `지문: ${passage}\n문제: ${JSON.stringify(problem)}`;
        const res = await callGroq(system, user);
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
            log('Ant Colony Operation Started (Quality Focus)...', 'info');
            
            // 1. 영어 본문 정제 (한글 제거)
            const cleanPassage = await antPurifier(rawInput);
            const count = parseInt(predictCount.value) || 1;
            const finalQuestions = [];

            for (let i = 0; i < count; i++) {
                log(`[${i+1}번 라인] 생산 개시`, 'info');
                
                // 2. DNA 유형 탐색 및 설계
                const dnaType = await antDNAScout(cleanPassage);
                const design = await antArchitect(cleanPassage, dnaType);
                
                // 3. 지문 가공 및 질문 생성
                const modifiedPassage = await antModifier(cleanPassage, design);
                const questionText = await antVoice(dnaType);
                
                // 4. 보기 배양 및 조립
                const cData = await antCultivator(cleanPassage, modifiedPassage, questionText);
                const assembly = await antAssembler(questionText, cData);
                
                // 5. 무자비한 검수
                if (await antAuditor(cleanPassage, assembly)) {
                    finalQuestions.push({ ...assembly, passage: modifiedPassage });
                    log(`${i+1}번 문제 생산 성공!`, 'success');
                } else {
                    log(`${i+1}번 문제 품질 미달로 폐기 및 재공정 시도...`, 'error');
                    i--; // 재시도
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
        questions.forEach((q, i) => {
            const qDiv = document.createElement('div');
            qDiv.className = 'question-item';
            qDiv.style.cssText = "text-align: left; margin-bottom: 40px; border-bottom: 2px dashed #ccc; padding-bottom: 20px;";
            qDiv.innerHTML = `
                <div style="background:#fff; padding:20px; border:2px solid #333; border-radius:4px; margin-bottom:20px; white-space:pre-wrap; font-family: 'Times New Roman', serif; line-height: 1.6;">${q.passage}</div>
                <div style="font-weight:bold; font-size: 1.1em; margin-bottom:15px;">${i + 1}. ${q.question}</div>
                <div style="display: grid; grid-template-columns: 1fr; gap: 10px; margin-bottom:20px;">
                    ${q.options.map(opt => `<div style="padding:5px;">${opt}</div>`).join('')}
                </div>
                <div style="color:#2c3e50; background:#ecf0f1; padding:15px; border-radius:4px; font-size: 0.9em;">
                    <strong>[정답] ${q.answer}</strong><br>
                    <strong>[해설]</strong> ${q.explanation}
                </div>
            `;
            resultContainer.appendChild(qDiv);
        });
    }
});