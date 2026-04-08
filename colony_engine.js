document.addEventListener('DOMContentLoaded', async () => {
    console.log('Ant Colony Harness System v2.0 (DNA-Driven) initialized');

    const API_URL = 'https://api.groq.com/openai/v1/chat/completions';
    const MODEL_NAME = 'llama-3.3-70b-versatile'; 
    
    let currentApiKey = localStorage.getItem('groq_api_key') || '';
    let questionDNADatabase = [];

    // ... (DOM element variables remain the same) ...
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
            questionDNADatabase = await resp.json();
            log(`DNA 기반 하네스 시스템 활성화. ${questionDNADatabase.length}개의 문제 유형(DNA) 로드 완료.`, 'success');
        } catch (e) {
            log(`치명적 오류: 문제 유형 DNA 뱅크(questions.json) 로드에 실패했습니다. ${e.message}`, 'error');
        }
    }
    init();

    saveKeyBtn.onclick = () => {
        currentApiKey = apiKeyInput.value.trim();
        localStorage.setItem('groq_api_key', currentApiKey);
        alert('Groq API Key가 저장되었습니다.');
    };

    function log(msg, type = 'info') {
        const div = document.createElement('div');
        const timestamp = new Date().toLocaleTimeString();
        let prefix = '[INFO]';
        if (type === 'exec') { prefix = '<span style="color: #f1c40f;">[ANT ]</span>'; div.style.color = '#f1c40f'; }
        if (type === 'harness') { prefix = '<span style="color: #9b59b6;">[HARNESS]</span>'; div.style.color = '#9b59b6'; } // Renamed from 'link'
        if (type === 'success') { prefix = '<span style="color: #2ecc71;">[OK  ]</span>'; div.style.color = '#2ecc71'; }
        if (type === 'error') { prefix = '<span style="color: #e74c3c;">[ERR ]</span>'; div.style.color = '#e74c3c'; }
        div.innerHTML = `${prefix} ${timestamp} - ${msg}`;
        computeLog.appendChild(div);
        factoryStatus.scrollTop = factoryStatus.scrollHeight;
    }

    const sleep = (ms) => new Promise(res => setTimeout(res, ms));

    async function callGroq(systemInstruction, userPrompt, isJson = false, attempt = 0) {
        // ... (callGroq function remains the same, focusing on reliable API calls) ...
        if (attempt === 0) await sleep(1500);

        try {
            const resp = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${currentApiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: MODEL_NAME,
                    messages: [
                        { role: 'system', content: systemInstruction + "\n오직 요청된 형식의 결과 데이터만 반환하고, 부가적인 설명은 절대 추가하지 마라." },
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
                    log(`API Rate Limit, ${waitTime/1000}초 후 재시도. (${attempt + 1}/5)`, 'error');
                    await sleep(waitTime);
                    return callGroq(systemInstruction, userPrompt, isJson, attempt + 1);
                }
            }

            if (!resp.ok) throw new Error(data.error?.message || 'Groq API 호출 실패');
            return data.choices[0].message.content;
        } catch (e) {
            if (e.message.includes('Rate limit') && attempt < 5) {
                const waitTime = Math.pow(2, attempt) * 2000;
                log(`API 제한 감지, ${waitTime/1000}초 후 재시도.`, 'error');
                await sleep(waitTime);
                return callGroq(systemInstruction, userPrompt, isJson, attempt + 1);
            }
            throw e;
        }
    }


    // --- HARNESS-CONTROLLED ANTS (v2.0) ---

    async function antDNAScout(analysis) {
        log('탐색 개미(Scout): 지문 분석 결과에 가장 부합하는 문제 DNA를 탐색합니다...', 'exec');
        const dnaSummary = questionDNADatabase.map((dna, i) => `ID ${i}: ${dna.exam_name} - ${dna.description}`).join('\n');
        const system = "너는 문제 유형 선정 전문가다. 지문 분석 내용과 각 문제 유형(DNA)의 설명을 비교하여, 가장 적절한 DNA의 ID를 선택해야 한다.";
        const user = `[지문 분석 내용]\n${JSON.stringify(analysis)}\n\n[문제 유형 DNA 목록]\n${dnaSummary}\n\n분석 내용에 가장 적합한 문제 유형의 ID 하나만 선택하여 JSON으로 응답하라.\n{
  "selected_id": <NUMBER>
}`;
        const res = JSON.parse(await callGroq(system, user, true));
        const selectedDNA = questionDNADatabase[res.selected_id];
        log(`DNA [${selectedDNA.exam_name}] 선택 완료.`, 'success');
        return selectedDNA; // Return the entire DNA object
    }

    async function antArchitect(passage, analysis, dna, feedback = null) {
        log('설계 개미(Architect): 선택된 DNA에 맞춰 문제의 핵심 논리를 설계합니다...', 'exec');
        const system = "너는 문제 설계 전문가다. 반드시 주어진 DNA 형식과 지문 내용에만 근거하여, 정답과 오답의 논리를 구체적으로 설계해야 한다.";
        let user = `[지문]\n${passage}\n\n[지문 분석 내용]\n${JSON.stringify(analysis)}\n\n[선택된 문제 DNA] - 이 설계도를 반드시 따라야 한다!\n${JSON.stringify(dna)}\n`;
        if (feedback) {
            user += `\n[이전 시도 실패 피드백]\n${feedback}\n이 피드백을 반영하여 설계를 수정하라.\n`;
        }
        user += `\n위 DNA와 지문 내용에 기반하여, 문제로 만들 핵심 문장('target_sentence')을 지문에서 찾아내고, 정답과 오답의 논리를 구체적으로 설계하여 JSON으로 응답하라.\n{
  "correct_logic": "<정답의 핵심 근거>",
  "trap_logic": "<매력적인 오답의 논리>",
  "target_sentence": "<지문에서 그대로 복사한, 문제를 만들 핵심 문장>"
}`;
        return JSON.parse(await callGroq(system, user, true));
    }
    
    async function antModifier(passage, design, dna, feedback = null) {
        log('가공 개미(Modifier): 설계에 따라 지문을 안전하게 변형합니다...', 'exec');
        const system = "너는 지문 가공 전문가다. 원본 지문의 내용을 절대 바꾸지 말고, 오직 설계도에 명시된 'target_sentence'만 지정된 방식으로 가공해야 한다.";
        let user = `[원본 지문]\n${passage}\n\n[문제 설계도]\n${JSON.stringify(design)}\n\n[문제 DNA 지침]\n${JSON.stringify(dna)}\n`;
        if(feedback) user += `\n[수정 요청 피드백]\n${feedback}\n`;

        user += `\n위 설계도와 DNA 지침에 따라, [원본 지문]에서 'target_sentence'를 찾아 (A)와 같이 밑줄 처리하여, 수정된 [전체 지문]을 반환하라. 다른 부분은 절대 수정하지 마라. 만약 DNA가 'passage_modification_required: true'를 포함하면, 지시대로 (A),(B)... 마커를 삽입해야 한다.
`;
        return await callGroq(system, user);
    }

    async function antCultivator(passage, modifiedPassage, design, dna, feedback = null) {
        log('배양 개미(Cultivator): DNA 형식에 맞춰 정/오답 보기를 정밀하게 배양합니다...', 'exec');
        const system = "너는 시험 보기 제작의 대가다. 반드시 주어진 [문제 DNA]의 'options_format'에 맞춰, [문제 설계도]의 논리에 따라 정답과 오답 보기를 생성해야 한다.";
        let user = `[지문 원본]\n${passage}\n\n[가공된 지문]\n${modifiedPassage}\n\n[문제 설계도]\n${JSON.stringify(design)}\n\n[문제 DNA] - 이 형식과 예시를 반드시 따라야 한다!\n${JSON.stringify(dna)}\n`;
        if (feedback) {
            user += `\n[이전 시도 실패 피드백]\n${feedback}\n이 피드백을 반영하여 보기를 재생성하라.\n`;
        }
        user += `\n위 모든 정보를 종합하여, DNA의 'options_format'("${dna.options_format}")을 엄격히 준수하는 정답과 오답 보기들을 JSON 형식으로 생성하라.\n{
  "answer": "<DNA 형식에 맞는 정답 보기>",
  "distractors": [
    "<DNA 형식에 맞는 오답 보기 1>",
    "<DNA 형식에 맞는 오답 보기 2>",
    "<DNA 형식에 맞는 오답 보기 3>",
    "<DNA 형식에 맞는 오답 보기 4>"
  ],
  "explanation": "<정답에 대한 간단하고 명확한 한글 해설>"
}`;
        return JSON.parse(await callGroq(system, user, true));
    }

    // --- Harness System v2.0: DNA-Based Backtesting --- 
    async function harnessAuditor(assembly, dna) {
        log('하네스 시스템(Auditor): 생성된 문제가 원본 DNA 설계도와 일치하는지 정밀 대조/백테스팅합니다...', 'harness');
        const feedbacks = [];

        // 1. Question Format Check
        if (dna.question_template && !assembly.question.includes(dna.question_template.substring(0, 10))) {
            feedbacks.push(`질문 형식이 DNA와 다릅니다. '${dna.question_template}' 형식을 따라야 합니다.`);
        }

        // 2. Options Format Check
        const format = dna.options_format.toLowerCase();
        const isEnglish = (str) => /[a-zA-Z]/.test(str);
        const isKorean = (str) => /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(str);

        for(const opt of assembly.options) {
            const text = opt.substring(2).trim(); // Remove '① '
            if (format.includes('영어') && !isEnglish(text)) {
                feedbacks.push(`보기(${text})가 DNA 형식('${dna.options_format}')과 일치하지 않습니다. 영어가 포함되어야 합니다.`);
                break;
            }
            if (format.includes('한국어') && !isKorean(text)) {
                feedbacks.push(`보기(${text})가 DNA 형식('${dna.options_format}')과 일치하지 않습니다. 한국어가 포함되어야 합니다.`);
                break;
            }
            if (format.includes('단어') && text.split(' ').length > 3) {
                feedbacks.push(`보기(${text})가 DNA 형식('${dna.options_format}')과 일치하지 않습니다. 단어 수준이어야 합니다.`);
            }
            if (format.includes('서술형') && text.split(' ').length < 2) {
                feedbacks.push(`보기(${text})가 DNA 형식('${dna.options_format}')과 일치하지 않습니다. 서술형(구 또는 절)이어야 합니다.`);
            }
        }

        if (feedbacks.length > 0) {
            const feedbackString = feedbacks.join(' \n');
            log(`하네스 백테스팅 실패: ${feedbackString}`, 'error');
            return `FAIL: ${feedbackString}`;
        }
        
        log('하네스 백테스팅 통과: 모든 결과물이 DNA 설계도와 일치합니다.', 'success');
        return 'PASS';
    }


    // --- MAIN PIPELINE (v2.0) ---
    generateBtn.onclick = async () => {
        const rawInput = readingMaterial.value.trim();
        if (!rawInput || !currentApiKey) {
            return alert('API 키와 지문 내용을 모두 입력해주세요.');
        }

        generateBtn.disabled = true;
        factoryStatus.style.display = 'block';
        computeLog.innerHTML = '';
        resultContainer.innerHTML = '';

        try {
            log('Harness System v2.0 가동 시작.', 'info');
            const analysis = await antAnalyst(rawInput);
            
            const count = parseInt(predictCount.value) || 1;
            const finalQuestions = [];

            for (let i = 0; i < count; i++) {
                log(`[생산 라인 #${i+1}] DNA 기반 문제 생성 시퀀스를 시작합니다.`, 'info');
                let success = false;
                let attempt = 0;
                let lastFeedback = null;

                while (!success && attempt < 3) {
                    attempt++;
                    log(`[시도 #${attempt}/3]-----------------------`, 'info');
                    try {
                        const selectedDNA = await antDNAScout(analysis);
                        
                        const design = await antArchitect(rawInput, analysis, selectedDNA, lastFeedback);
                        const modifiedPassage = await antModifier(rawInput, design, selectedDNA, lastFeedback);
                        const questionText = selectedDNA.question_template; // Use template directly
                        
                        const cData = await antCultivator(rawInput, modifiedPassage, design, selectedDNA, lastFeedback);

                        const options = [cData.answer, ...cData.distractors].sort(() => Math.random() - 0.5);
                        const marks = ['①', '②', '③', '④', '⑤'];
                        const assembly = {
                            question: questionText,
                            options: options.map((opt, idx) => `${marks[idx]} ${opt}`),
                            answer: marks[options.indexOf(cData.answer)],
                            explanation: cData.explanation,
                            passage: modifiedPassage,
                            dna: selectedDNA // For auditing
                        };

                        const auditResult = await harnessAuditor(assembly, selectedDNA);
                        
                        if (auditResult.toUpperCase().includes('PASS')) {
                            finalQuestions.push(assembly);
                            log(`#${i+1}번 문제 생산 성공! 하네스 시스템 최종 승인.`, 'success');
                            success = true;
                        } else {
                            lastFeedback = auditResult.replace('FAIL:', '').trim();
                            log(`[라인 #${i+1}] 감사 실패 피드백 수신: ${lastFeedback}`, 'error');
                        }
                    } catch (e) { 
                        log(`[라인 #${i+1}] 프로세스 중단 (시도 ${attempt}/3): ${e.message}`, 'error');
                        lastFeedback = `이전 프로세스에서 오류 발생: ${e.message}. 처음부터 다시 설계해야 할 수 있습니다.`;
                    }
                }
                 if (!success) {
                    log(`[생산 라인 #${i+1}] 최종 실패: 3번의 시도에도 불구하고 고품질 문제 생성에 실패했습니다. 다른 유형으로 다시 시도하는 것을 권장합니다.`, 'error');
                }
            }
            renderResults(finalQuestions);
        } catch (e) { 
            log('시스템 전체에 치명적 오류 발생: ' + e.message, 'error'); 
        }
        finally { 
            generateBtn.disabled = false; 
        }
    };

    function renderResults(questions) {
        // ... (renderResults function remains the same) ...
        resultContainer.innerHTML = '';
        if (questions.length === 0) {
            resultContainer.innerHTML = '<p class="empty-msg">죄송합니다. 하네스 시스템의 엄격한 품질 기준을 통과한 문제를 생성하지 못했습니다. 입력 지문을 수정하거나, 다른 유형의 문제 생성을 유도해보세요.</p>';
            return;
        }
        questions.forEach((q, i) => {
            const qDiv = document.createElement('div');
            qDiv.className = 'question-item';
            qDiv.style.cssText = "text-align: left; margin-bottom: 50px; border: 1px solid #ddd; padding: 25px; border-radius: 8px; background: #fff;";
            qDiv.innerHTML = `
                <div style="background:#f9f9f9; padding:15px; border-radius: 5px; margin-bottom:10px; font-size: 0.8em; color: #555;"><b>문제 유형(DNA):</b> ${q.dna.exam_name}</div>
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