document.addEventListener('DOMContentLoaded', async () => {
    console.log('Ant Colony Exam Engine v10.0 (Organic Harness Mode) initialized');

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
            log(`전문가 DNA 로드 완료`, 'success');
        } catch {
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
        if (type === 'link') { prefix = '<span style="color: #9b59b6;">[LINK]</span>'; div.style.color = '#9b59b6'; }
        if (type === 'success') { prefix = '<span style="color: #2ecc71;">[OK  ]</span>'; div.style.color = '#2ecc71'; }
        if (type === 'error') { prefix = '<span style="color: #e74c3c;">[ERR ]</span>'; div.style.color = '#e74c3c'; }
        div.innerHTML = `${prefix} ${timestamp} - ${msg}`;
        computeLog.appendChild(div);
        factoryStatus.scrollTop = factoryStatus.scrollHeight;
    }

    const sleep = (ms) => new Promise(res => setTimeout(res, ms));

    async function callGroq(systemInstruction, userPrompt, isJson = false, attempt = 0) {
        if (attempt === 0) await sleep(1500);

        try {
            const resp = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${currentApiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: MODEL_NAME,
                    messages: [
                        { role: 'system', content: systemInstruction + "\n오직 요청된 형식의 결과 데이터만 반환할 것." },
                        { role: 'user', content: userPrompt }
                    ],
                    temperature: 0.1, 
                    response_format: isJson ? { type: "json_object" } : undefined
                })
            });
            
            const data = await resp.json();
            
            if (resp.status === 429) {
                if (attempt < 5) {
                    const waitTime = Math.pow(2, attempt) * 2000;
                    log(`Rate Limit 도달. ${waitTime/1000}초 후 재시도...`, 'error');
                    await sleep(waitTime);
                    return callGroq(systemInstruction, userPrompt, isJson, attempt + 1);
                }
            }

            if (!resp.ok) throw new Error(data.error?.message || 'Groq API 호출 실패');
            return data.choices[0].message.content;
        } catch (e) {
            if (e.message.includes('Rate limit') && attempt < 5) {
                const waitTime = Math.pow(2, attempt) * 2000;
                await sleep(waitTime);
                return callGroq(systemInstruction, userPrompt, isJson, attempt + 1);
            }
            throw e;
        }
    }

    // --- AGENTS WITH ORGANIC FEEDBACK ---

    async function antAnalyst(passage) {
        log('분석 개미(Analyst): 지문 해체 및 구조화 중...', 'exec');
        const system = "너는 지문 분석 전문가야. 지문의 논리적 뼈대와 핵심 키워드를 추출해.";
        const user = `[지문]\n${passage}\n\nJSON 응답: { "theme": "주제", "logic_flow": "논리구조", "keywords": ["핵심단어"], "grammar_points": ["문법포인트"] }`;
        return JSON.parse(await callGroq(system, user, true));
    }

    async function antDNAScout(analysis) {
        log('탐색 개미(Scout): 최적 출제 DNA 탐색 중...', 'exec');
        const dnaSummary = questionDatabase.slice(0, 5).map((q, i) => `ID ${i}: ${q.exam_name}`).join('\n');
        const system = "너는 문제 유형 선정 전문가야. 분석 내용을 바탕으로 가장 적절한 DNA를 골라.";
        const user = `[분석]\n${JSON.stringify(analysis)}\n\n[DNA 목록]\n${dnaSummary}\n\nJSON 응답: { "selected_id": 0, "type": "유형명" }`;
        const res = JSON.parse(await callGroq(system, user, true));
        return { ...questionDatabase[res.selected_id || 0], selected_type: res.type };
    }

    async function antArchitect(passage, analysis, dnaMatch, feedback = null) {
        log('설계 개미(Architect): 문제 메커니즘 설계 중...', 'exec');
        const system = "너는 문제 설계 전문가야. 원본 지문의 단어와 문장을 유지하면서 문제를 설계해.";
        let user = `[원본]\n${passage}\n[분석]\n${JSON.stringify(analysis)}\n[유형]\n${dnaMatch.selected_type}\n`;
        if (feedback) user += `\n[수정요청]\n${feedback}\n`;
        user += `\nJSON 응답: { "correct_logic": "정답근거", "trap_logic": "오답원리", "target_sentence": "지문에서 복사한 문장" }`;
        return JSON.parse(await callGroq(system, user, true));
    }

    async function antModifier(passage, design, feedback = null) {
        log('가공 개미(Modifier): 지문 변형 및 하네스 연결 중...', 'exec');
        const system = "너는 지문 변형 전문가야. 설계된 문장을 지문 내에서 가공해.";
        let user = `[원본]\n${passage}\n[설계]\n${design.target_sentence}를 기반으로 변형\n`;
        if (feedback) user += `\n[수정요청]\n${feedback}\n`;
        user += `\n변형된 지문 내용만 반환.`;
        return await callGroq(system, user);
    }

    async function antCultivator(passage, modified, design, question, feedback = null) {
        log('배양 개미(Cultivator): 보기 데이터 정밀 생성 중...', 'exec');
        const system = "너는 보기 생성 전문가야. 지문의 논리와 보기가 완벽히 일치해야 해.";
        let user = `[원본]\n${passage}\n[변형]\n${modified}\n[질문]\n${question}\n[의도]\n${design.correct_logic}\n`;
        if (feedback) user += `\n[수정요청]\n${feedback}\n`;
        user += `\nJSON 응답: { "answer": "정답", "distractors": ["오답1","오답2","오답3","오답4"], "explanation": "해설" }`;
        return JSON.parse(await callGroq(system, user, true));
    }

    async function antAuditor(passage, analysis, problem) {
        log('최종 검수 개미(Auditor): 공정 무결성 최종 판정 중...', 'exec');
        const system = "너는 무자비한 검수관이야. 지문과 문제가 따로 놀면 FAIL을 줘.";
        const user = `[지문]\n${passage}\n[분석]\n${JSON.stringify(analysis)}\n[문제]\n${JSON.stringify(problem)}\n\n성공 시 'PASS', 실패 시 'FAIL:이유 및 수정 방향'`;
        return await callGroq(system, user);
    }

    // --- ORGANIC PIPELINE ---

    generateBtn.onclick = async () => {
        const rawInput = readingMaterial.value.trim();
        if (!rawInput || !currentApiKey) return alert('입력 확인 요망.');

        generateBtn.disabled = true;
        factoryStatus.style.display = 'block';
        computeLog.innerHTML = '';
        resultContainer.innerHTML = '';

        try {
            log('Ant Colony v10.0: Organic Harness 가동.', 'info');
            const analysis = await antAnalyst(rawInput);
            const count = parseInt(predictCount.value) || 1;
            const finalQuestions = [];

            for (let i = 0; i < count; i++) {
                log(`[생산 라인 #${i+1}] 유기적 시퀀스 시작`, 'info');
                let success = false;
                let attempt = 0;
                let lastFeedback = null;

                while (!success && attempt < 3) {
                    attempt++;
                    try {
                        const dnaMatch = await antDNAScout(analysis);
                        const design = await antArchitect(rawInput, analysis, dnaMatch, lastFeedback);
                        
                        // Link Check 1
                        if (!rawInput.includes(design.target_sentence.substring(0, 5))) {
                            lastFeedback = "Architect 오류: target_sentence가 원본에 존재하지 않음.";
                            continue;
                        }

                        const modified = await antModifier(rawInput, design, lastFeedback);
                        const question = await callGroq("시험 발문 작성 전문가", `${dnaMatch.selected_type} 유형의 한국어 질문을 작성해.`);
                        const cData = await antCultivator(rawInput, modified, design, question, lastFeedback);

                        const options = [cData.answer, ...cData.distractors].sort(() => Math.random() - 0.5);
                        const marks = ['①', '②', '③', '④', '⑤'];
                        const assembly = {
                            question: question,
                            options: options.map((opt, idx) => `${marks[idx]} ${opt}`),
                            answer: marks[options.indexOf(cData.answer)],
                            explanation: cData.explanation,
                            passage: modified
                        };

                        const auditResult = await antAuditor(rawInput, analysis, assembly);
                        if (auditResult.toUpperCase().includes('PASS')) {
                            finalQuestions.push(assembly);
                            log(`#${i+1}번 문제 하네스 체결 성공!`, 'success');
                            success = true;
                        } else {
                            lastFeedback = auditResult.replace('FAIL:', '');
                            log(`AUDITOR 피드백: ${lastFeedback}`, 'error');
                            log(`[라인 #${i+1}] 피드백 기반 재시도 (${attempt}/3)`, 'info');
                        }
                    } catch (e) { log(`오류 발생: ${e.message}`, 'error'); }
                }
            }
            renderResults(finalQuestions);
        } catch (e) { log('치명적 오류: ' + e.message, 'error'); }
        finally { generateBtn.disabled = false; }
    };

    function renderResults(questions) {
        questions.forEach((q, i) => {
            const qDiv = document.createElement('div');
            qDiv.className = 'question-item';
            qDiv.style.cssText = "text-align: left; margin-bottom: 50px; border: 1px solid #ddd; padding: 25px; border-radius: 8px; background: #fff;";
            qDiv.innerHTML = `
                <div style="background:#fcfcfc; padding:20px; border:1px solid #000; margin-bottom:20px; white-space:pre-wrap; font-family: 'Times New Roman', serif; line-height: 1.7;">${q.passage}</div>
                <div style="font-weight:bold; margin-bottom:15px;">${i + 1}. ${q.question}</div>
                <div style="display: grid; gap: 8px; margin-bottom:20px;">
                    ${q.options.map(opt => `<div>${opt}</div>`).join('')}
                </div>
                <div style="background:#f8f9fa; padding:15px; border-radius:6px; border-left: 4px solid #2ecc71; font-size: 0.9em;">
                    <strong>정답: ${q.answer}</strong> | ${q.explanation}
                </div>
            `;
            resultContainer.appendChild(qDiv);
        });
    }
});