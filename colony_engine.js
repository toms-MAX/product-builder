document.addEventListener('DOMContentLoaded', async () => {
    console.log('Ant Colony Exam Engine v8.5 (Connected Intelligence) initialized');

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
        if (type === 'link') { prefix = '<span style="color: #9b59b6;">[LINK]</span>'; div.style.color = '#9b59b6'; }
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
                    { role: 'system', content: systemInstruction + "\n오직 결과 데이터만 반환할 것." },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.1, 
                response_format: isJson ? { type: "json_object" } : undefined
            })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error?.message || 'Groq API 호출 실패');
        return data.choices[0].message.content;
    }

    // --- AGENTS & LINK INSPECTOR ---

    async function antAnalyst(passage) {
        log('분석 개미(Analyst) 가동...', 'exec');
        const system = "너는 지문 분석 전문가야.";
        const user = `지문 분석 요청: ${passage}\n\nJSON 응답: { "theme": "...", "logic_flow": "...", "keywords": [], "grammar_points": [] }`;
        return JSON.parse(await callGroq(system, user, true));
    }

    // [LINK] Analyst -> Scout 연결 검증
    async function inspectLinkAnalysisToScout(analysis) {
        log('감시 개미(Linker): 분석 데이터 정합성 체크 중...', 'link');
        if (!analysis.theme || analysis.keywords.length === 0) throw new Error('분석 데이터가 부실합니다.');
        return true;
    }

    async function antDNAScout(analysis) {
        log('탐색 개미(Scout) 가동...', 'exec');
        const dnaSample = JSON.stringify(questionDatabase[0]);
        const system = "너는 문제 유형 선정 전문가야.";
        const user = `분석내용: ${JSON.stringify(analysis)}\n템플릿: ${dnaSample}\n\nJSON 응답: { "type": "...", "logic_reason": "..." }`;
        return JSON.parse(await callGroq(system, user, true));
    }

    async function antArchitect(passage, analysis, dnaMatch) {
        log('설계 개미(Architect) 가동...', 'exec');
        const system = "너는 문제 설계 전문가야.";
        const user = `유형: ${dnaMatch.type}\n분석: ${JSON.stringify(analysis)}\n\nJSON 응답: { "correct_logic": "...", "trap_logic": "...", "target_sentence": "..." }`;
        return JSON.parse(await callGroq(system, user, true));
    }

    // [LINK] Architect -> Modifier 연결 검증
    async function inspectLinkDesignToModifier(passage, design) {
        log('감시 개미(Linker): 설계도가 지문에 적용 가능한지 체크 중...', 'link');
        if (!passage.includes(design.target_sentence.substring(0, 10))) {
            log('경고: 설계된 문장이 지문에 존재하지 않습니다. 재보정 요청.', 'error');
            return false;
        }
        return true;
    }

    async function antModifier(passage, design) {
        log('가공 개미(Modifier) 가동...', 'exec');
        const system = "너는 지문 변형 전문가야. 오직 영어만 사용해.";
        const user = `본문: ${passage}\n설계: ${design.target_sentence}를 변형\n\n변형된 지문만 반환해. 기호는 ⓐ~ⓔ 또는 [ (A) ] 사용.`;
        return await callGroq(system, user);
    }

    async function antCultivator(passage, modifiedPassage, design, question) {
        log('배양 개미(Cultivator) 가동...', 'exec');
        const system = "너는 보기 생성 전문가야.";
        const user = `지문: ${passage}\n변형: ${modifiedPassage}\n의도: ${design.correct_logic}\n질문: ${question}\n\nJSON 응답: { "answer": "...", "distractors": ["...","...","...","..."], "explanation": "..." }`;
        return JSON.parse(await callGroq(system, user, true));
    }

    // [LINK] Cultivator -> Assembler 연결 검증
    async function inspectLinkOptionsToFinal(options) {
        log('감시 개미(Linker): 보기와 정답의 논리적 일관성 체크 중...', 'link');
        if (options.distractors.includes(options.answer)) throw new Error('정답과 오답이 중복됩니다.');
        return true;
    }

    async function antAuditor(passage, analysis, problem) {
        log('최종 검수 개미(Auditor) 심사 중...', 'exec');
        const user = `지문분석: ${JSON.stringify(analysis)}\n문제: ${JSON.stringify(problem)}\n\n완벽하면 'PASS', 아니면 'FAIL:이유'`;
        const res = await callGroq("너는 깐깐한 검수위원이야.", user);
        return res.toUpperCase().includes('PASS');
    }

    // --- PIPELINE WITH LINKERS ---
    generateBtn.onclick = async () => {
        const rawInput = readingMaterial.value.trim();
        if (!rawInput || !currentApiKey) return alert('입력 확인 요망.');

        generateBtn.disabled = true;
        factoryStatus.style.display = 'block';
        computeLog.innerHTML = '';
        resultContainer.innerHTML = '';

        try {
            log('Ant Colony v8.5: Connected Intelligence 가동.', 'info');
            const analysis = await antAnalyst(rawInput);
            await inspectLinkAnalysisToScout(analysis);
            
            const count = parseInt(predictCount.value) || 1;
            const finalQuestions = [];

            for (let i = 0; i < count; i++) {
                log(`[생산 라인 #${i+1}] 순차 협업 시작`, 'info');
                let success = false;
                let attempt = 0;

                while (!success && attempt < 3) {
                    attempt++;
                    try {
                        const dnaMatch = await antDNAScout(analysis);
                        const design = await antArchitect(rawInput, analysis, dnaMatch);
                        
                        // Link Check
                        if (!(await inspectLinkDesignToModifier(rawInput, design))) continue;

                        const modifiedPassage = await antModifier(rawInput, design);
                        const questionText = await callGroq("시험 발문 작성자", `${dnaMatch.type} 유형 질문 작성.`);
                        
                        const cData = await antCultivator(rawInput, modifiedPassage, design, questionText);
                        await inspectLinkOptionsToFinal(cData);

                        const options = [cData.answer, ...cData.distractors].sort(() => Math.random() - 0.5);
                        const marks = ['①', '②', '③', '④', '⑤'];
                        const assembly = {
                            question: questionText,
                            options: options.map((opt, idx) => `${marks[idx]} ${opt}`),
                            answer: marks[options.indexOf(cData.answer)],
                            explanation: cData.explanation,
                            passage: modifiedPassage
                        };

                        if (await antAuditor(rawInput, analysis, assembly)) {
                            finalQuestions.push(assembly);
                            log(`#${i+1}번 문제 생산 완료!`, 'success');
                            success = true;
                        }
                    } catch (e) { log(`라인 중단 및 복구 시도: ${e.message}`, 'error'); }
                }
            }
            renderResults(finalQuestions);
        } catch (e) { log('시스템 치명적 오류: ' + e.message, 'error'); }
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