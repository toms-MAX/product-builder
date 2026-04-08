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
        // 기본 딜레이 (RPM 30 제한을 위해 약 2초 간격 유지 권장)
        if (attempt === 0) await sleep(1500);

        try {
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
            
            if (resp.status === 429) {
                if (attempt < 5) {
                    const waitTime = Math.pow(2, attempt) * 2000;
                    log(`Rate Limit 도달. ${waitTime/1000}초 후 재시도... (${attempt + 1}/5)`, 'error');
                    await sleep(waitTime);
                    return callGroq(systemInstruction, userPrompt, isJson, attempt + 1);
                }
            }

            if (!resp.ok) throw new Error(data.error?.message || 'Groq API 호출 실패');
            return data.choices[0].message.content;
        } catch (e) {
            if (e.message.includes('Rate limit') && attempt < 5) {
                const waitTime = Math.pow(2, attempt) * 2000;
                log(`API 제한 감지. ${waitTime/1000}초 후 재시도...`, 'error');
                await sleep(waitTime);
                return callGroq(systemInstruction, userPrompt, isJson, attempt + 1);
            }
            throw e;
        }
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
        // 상위 5개의 예시 유형을 요약해서 전달
        const dnaSummary = questionDatabase.slice(0, 5).map((q, i) => `ID ${i}: ${q.exam_name} 유형`).join('\n');
        const system = "너는 문제 유형 선정 전문가야. 분석 내용을 바탕으로 가장 적절한 DNA ID를 선택해.";
        const user = `분석내용: ${JSON.stringify(analysis)}\n\n[DNA 목록]\n${dnaSummary}\n\n반드시 JSON으로 응답: { "selected_id": 0, "type": "유형 이름", "logic_reason": "선택 이유" }`;
        const res = JSON.parse(await callGroq(system, user, true));
        return { ...questionDatabase[res.selected_id || 0], selected_type: res.type };
    }

    async function antArchitect(passage, analysis, dnaMatch) {
        log('설계 개미(Architect) 가동...', 'exec');
        const system = "너는 문제 설계 전문가야. 반드시 제공된 [지문]의 내용에만 기반하여 문제를 설계해. 외부 지식(기후 변화 등)을 절대 섞지 마.";
        const user = `지문: ${passage}\n유형: ${dnaMatch.selected_type || '일반'}\n분석: ${JSON.stringify(analysis)}\n\nJSON 응답: { "correct_logic": "정답의 근거", "trap_logic": "오답 구성 원리", "target_sentence": "지문에서 변형할 대상 문장을 '그대로' 복사" }`;
        return JSON.parse(await callGroq(system, user, true));
    }

    // [LINK] Architect -> Modifier 연결 검증
    async function inspectLinkDesignToModifier(passage, design) {
        log('감시 개미(Linker): 설계도가 지문에 적용 가능한지 체크 중...', 'link');
        const target = (design.target_sentence || "").trim();
        if (!target || !passage.includes(target.substring(0, 10))) {
            log('경고: 설계된 문장이 지문에 존재하지 않습니다. 재보정 요청.', 'error');
            return false;
        }
        return true;
    }

    async function antModifier(passage, design) {
        log('가공 개미(Modifier) 가동...', 'exec');
        const system = "너는 지문 변형 전문가야. [본문]의 내용을 유지하면서 지정된 문장만 변형해. 다른 주제의 내용을 추가하지 마.";
        const user = `본문: ${passage}\n설계: ${design.target_sentence}를 변형\n\n변형된 지문만 반환해.`;
        return await callGroq(system, user);
    }

    async function antCultivator(passage, modifiedPassage, design, question) {
        log('배양 개미(Cultivator) 가동...', 'exec');
        const system = "너는 보기 생성 전문가야. 오직 제공된 [지문]과 [변형지문]의 내용에만 근거하여 보기를 만들어.";
        const user = `지문: ${passage}\n변형: ${modifiedPassage}\n의도: ${design.correct_logic}\n질문: ${question}\n\nJSON 응답: { "answer": "정답", "distractors": ["오답1","오답2","오답3","오답4"], "explanation": "해설" }`;
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
        return res;
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

                        const auditResult = await antAuditor(rawInput, analysis, assembly);
                        if (auditResult.toUpperCase().includes('PASS')) {
                            finalQuestions.push(assembly);
                            log(`#${i+1}번 문제 생산 완료!`, 'success');
                            success = true;
                        } else {
                            log(`[라인 #${i+1}] 검수 실패(${attempt}/3): ${auditResult}. 재시도.`, 'error');
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