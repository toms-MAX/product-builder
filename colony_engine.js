document.addEventListener('DOMContentLoaded', async () => {
    console.log('Ant Colony Harness System v2.1 (User-Selected DNA) initialized');

    const API_URL = 'https://api.groq.com/openai/v1/chat/completions';
    const MODEL_NAME = 'llama-3.3-70b-versatile';

    let currentApiKey = localStorage.getItem('groq_api_key') || '';
    let questionDNADatabase = [];

    const readingMaterial = document.getElementById('reading-material');
    const generateBtn = document.getElementById('generate-btn');
    const resultContainer = document.getElementById('generated-questions');
    const apiKeyInput = document.getElementById('api-key-input');
    const saveKeyBtn = document.getElementById('save-key-btn');
    const computeLog = document.getElementById('compute-log');
    const factoryStatus = document.getElementById('factory-status');
    const predictCount = document.getElementById('predict-count');
    const dnaSelectionContainer = document.getElementById('dna-selection-container');

    apiKeyInput.value = currentApiKey;

    async function init() {
        try {
            const resp = await fetch('questions.json');
            questionDNADatabase = await resp.json();
            renderDNACheckboxes();
            log(`DNA 기반 하네스 시스템 활성화. ${questionDNADatabase.length}개의 문제 유형(DNA) 로드 완료.`, 'success');
        } catch (e) {
            log(`치명적 오류: 문제 유형 DNA 뱅크(questions.json) 로드에 실패했습니다. ${e.message}`, 'error');
            dnaSelectionContainer.innerHTML = `<p style="color: #e74c3c;">문제 유형 로드 실패. questions.json 파일을 확인하세요.</p>`;
        }
    }
    
    function renderDNACheckboxes() {
        dnaSelectionContainer.innerHTML = ''; // Clear loading message
        questionDNADatabase.forEach((dna, index) => {
            const div = document.createElement('div');
            div.className = 'dna-checkbox-item';
            div.innerHTML = `
                <input type="checkbox" id="dna-${index}" value="${index}" checked>
                <label for="dna-${index}" title="${dna.description}">${dna.exam_name}</label>
            `;
            dnaSelectionContainer.appendChild(div);
        });
    }

    init();

    saveKeyBtn.onclick = () => {
        currentApiKey = apiKeyInput.value.trim();
        localStorage.setItem('groq_api_key', currentApiKey);
        alert('Groq API Key가 저장되었습니다.');
    };

    function log(msg, type = 'info') {
        // ... (logging function remains the same)
    }

    const sleep = (ms) => new Promise(res => setTimeout(res, ms));

    async function callGroq(systemInstruction, userPrompt, isJson = false, attempt = 0) {
        // ... (callGroq function remains the same)
    }

    // --- ANTS --- (Ant functions: antArchitect, antModifier, antCultivator remain the same)
    async function antArchitect(passage, analysis, dna, feedback = null) { /* ... */ }
    async function antModifier(passage, design, dna, feedback = null) { /* ... */ }
    async function antCultivator(passage, modifiedPassage, design, dna, feedback = null) { /* ... */ }
    async function harnessAuditor(assembly, dna) { /* ... */ }
    async function antAnalyst(passage) { /* ... */ }

    // --- MAIN PIPELINE (v2.2 - User-Selected DNA) ---
    generateBtn.onclick = async () => {
        const rawInput = readingMaterial.value.trim();
        const selectedDnaIndexes = Array.from(dnaSelectionContainer.querySelectorAll('input[type="checkbox"]:checked')).map(cb => parseInt(cb.value));

        if (!rawInput || !currentApiKey) {
            return alert('API 키와 지문 내용을 모두 입력해주세요.');
        }
        if (selectedDnaIndexes.length === 0) {
            return alert('하나 이상의 문제 유형(DNA)을 선택해주세요.');
        }

        generateBtn.disabled = true;
        factoryStatus.style.display = 'block';
        computeLog.innerHTML = '';
        resultContainer.innerHTML = '';

        try {
            log('Harness System v2.2 (User-Selected DNA) 가동 시작.', 'info');
            const analysis = await antAnalyst(rawInput);

            const count = parseInt(predictCount.value) || 1;
            const finalQuestions = [];
            const selectedDNAs = selectedDnaIndexes.map(i => questionDNADatabase[i]);

            for (let i = 0; i < count; i++) {
                log(`[생산 라인 #${i + 1}] DNA 기반 문제 생성 시퀀스를 시작합니다.`, 'info');
                let success = false;
                let attempt = 0;
                let lastFeedback = null;
                
                // Select a DNA from the user-checked list for this iteration
                const selectedDNA = selectedDNAs[i % selectedDNAs.length]; // Cycle through selected DNAs
                log(`사용자 선택 DNA [${selectedDNA.exam_name}]를 사용하여 문제 생성을 시작합니다.`, 'harness');

                while (!success && attempt < 3) {
                    attempt++;
                    log(`[시도 #${attempt}/3]-----------------------`, 'info');
                    try {
                        // NOTE: antDNAScout is no longer needed here.
                        const design = await antArchitect(rawInput, analysis, selectedDNA, lastFeedback);
                        const modifiedPassage = await antModifier(rawInput, design, selectedDNA, lastFeedback);
                        const questionText = selectedDNA.question_template;
                        const cData = await antCultivator(rawInput, modifiedPassage, design, selectedDNA, lastFeedback);

                        if (!cData || !cData.distractors || !Array.isArray(cData.distractors) || !cData.answer) {
                            throw new Error(`[데이터 검증 실패] 배양 개미(Cultivator)가 유효하지 않은 데이터를 반환했습니다.`);
                        }

                        const options = [cData.answer, ...cData.distractors].sort(() => Math.random() - 0.5);
                        const marks = ['①', '②', '③', '④', '⑤'];
                        const assembly = {
                            question: questionText,
                            options: options.map((opt, idx) => `${marks[idx]} ${opt}`),
                            answer: marks[options.indexOf(cData.answer)],
                            explanation: cData.explanation,
                            passage: modifiedPassage,
                            dna: selectedDNA
                        };

                        const auditResult = await harnessAuditor(assembly, selectedDNA);

                        if (auditResult.toUpperCase().includes('PASS')) {
                            finalQuestions.push(assembly);
                            log(`#${i + 1}번 문제 생산 성공! 하네스 시스템 최종 승인.`, 'success');
                            success = true;
                        } else {
                            lastFeedback = auditResult.replace('FAIL:', '').trim();
                            log(`[라인 #${i + 1}] 감사 실패 피드백 수신: ${lastFeedback}`, 'error');
                        }
                    } catch (e) {
                        log(`[라인 #${i + 1}] 프로세스 중단 (시도 ${attempt}/3): ${e.message}`, 'error');
                        lastFeedback = `이전 프로세스에서 오류 발생: ${e.message}. 처음부터 다시 설계해야 할 수 있습니다.`;
                    }
                }
                if (!success) {
                    log(`[생산 라인 #${i + 1}] 최종 실패: 3번의 시도에도 불구하고 고품질 문제 생성에 실패했습니다.`, 'error');
                }
            }
            renderResults(finalQuestions);
        } catch (e) {
            log('시스템 전체에 치명적 오류 발생: ' + e.message, 'error');
        } finally {
            generateBtn.disabled = false;
        }
    };

    function renderResults(questions) {
        // ... (renderResults function remains the same)
    }
});