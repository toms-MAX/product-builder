document.addEventListener('DOMContentLoaded', async () => {
    console.log('Ant Colony Harness System v2.3 (Auditor Enhanced) initialized');

    const API_URL = 'https://api.groq.com/openai/v1/chat/completions';
    const MODEL_NAME = 'llama-3.3-70b-versatile';

    let currentApiKey = localStorage.getItem('groq_api_key') || '';
    let questionDNADatabase = [];

    // ... (DOM element variables remain the same)
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
        // ... (remains the same)
    }

    init();

    saveKeyBtn.onclick = () => {
        // ... (remains the same)
    };

    function log(msg, type = 'info') {
        // ... (remains the same)
    }

    const sleep = (ms) => new Promise(res => setTimeout(res, ms));

    async function callGroq(systemInstruction, userPrompt, isJson = false, attempt = 0) {
        // ... (remains the same)
    }

    // --- ANTS (Core logic) ---
    // ... (antAnalyst, antArchitect, antModifier, antCultivator remain the same)

    // --- ENHANCED AUDITOR (v2.3) ---
    async function harnessAuditor(assembly, dna) {
        log('하네스 시스템(Auditor v2.3): 생성된 문제의 형식 및 논리적 일관성을 정밀 대조합니다...', 'harness');
        const feedbacks = [];
        const question = assembly.question || '';
        const passage = assembly.passage || '';

        // 1. Formal check (as before)
        if (dna.question_template && !question.includes(dna.question_template.substring(0, 10))) {
            feedbacks.push(`질문 형식이 DNA('${dna.question_template}')와 다릅니다.`);
        }

        // ... (option format checks remain the same)

        // 2. Logical Consistency Check (NEW!)
        const requiredPlaceholders = (question.match(/\([A-Z]\)/g) || []); // e.g., ["(A)", "(B)"]
        
        for (const placeholder of requiredPlaceholders) {
            if (!passage.includes(placeholder)) {
                feedbacks.push(`논리적 불일치: 질문은 '${placeholder}'를 요구하지만, 생성된 지문에 해당 표시가 없습니다.`);
            }
        }

        if (feedbacks.length > 0) {
            const feedbackString = feedbacks.join(' \n');
            log(`하네스 백테스팅 실패: ${feedbackString}`, 'error');
            return `FAIL: ${feedbackString}`;
        }

        log('하네스 백테스팅 통과: 모든 결과물이 DNA 설계도 및 논리적 일관성 기준을 충족합니다.', 'success');
        return 'PASS';
    }

    // --- MAIN PIPELINE (v2.3) ---
    generateBtn.onclick = async () => {
        // ... (remains largely the same, but now relies on the enhanced auditor)
        // The core logic of the pipeline does not need to change, as the auditor's feedback
        // will automatically trigger retries with more precise error information.
    };

    function renderResults(questions) {
        // ... (remains the same)
    }
});