document.addEventListener('DOMContentLoaded', async () => {
    console.log('AI Exam Factory v3.0 initialized');

    const API_URL = 'https://api.groq.com/openai/v1/chat/completions';
    const MODEL_NAME = 'llama-3.3-70b-versatile';
    const VISION_MODEL = 'llama-3.2-11b-vision-preview';

    // PDF.js Worker setup
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    // UI Elements
    const readingMaterial = document.getElementById('reading-material');
    const dropZone = document.getElementById('drop-zone');
    const examFileInput = document.getElementById('exam-file-input');
    const previewContainer = document.getElementById('selected-files-preview');
    const generateBtn = document.getElementById('generate-btn');
    const resultContainer = document.getElementById('generated-questions');
    const apiKeyInput = document.getElementById('api-key-input');
    const saveKeyBtn = document.getElementById('save-key-btn');
    const themeToggle = document.getElementById('theme-toggle');
    const factoryStatus = document.getElementById('factory-status');

    let questionTemplates = [];
    let uploadedFiles = [];
    let currentApiKey = localStorage.getItem('groq_api_key') || '';
    apiKeyInput.value = currentApiKey;

    // Load Template Bank
    try {
        const resp = await fetch('questions.json');
        questionTemplates = await resp.json();
    } catch (e) { console.error('Failed to load templates', e); }

    saveKeyBtn.onclick = () => {
        currentApiKey = apiKeyInput.value.trim();
        localStorage.setItem('groq_api_key', currentApiKey);
        alert('API 키가 저장되었습니다.');
    };

    if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark-mode');
    themeToggle.onclick = () => {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
    };

    // File Handling
    dropZone.onclick = () => examFileInput.click();
    dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('dragover'); };
    dropZone.ondragleave = () => dropZone.classList.remove('dragover');
    dropZone.ondrop = (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); handleFiles(e.dataTransfer.files); };
    examFileInput.onchange = (e) => handleFiles(e.target.files);

    async function handleFiles(files) {
        for (const file of files) {
            if (file.type.startsWith('image/')) {
                const dataUrl = await readFileAsDataURL(file);
                uploadedFiles.push({ type: 'image', content: dataUrl, name: file.name });
            } else if (file.type === 'application/pdf') {
                const text = await extractTextFromPdf(file);
                uploadedFiles.push({ type: 'text', content: text, name: file.name });
            }
        }
        updatePreview();
    }

    function readFileAsDataURL(file) {
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
        });
    }

    async function extractTextFromPdf(file) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            fullText += content.items.map(item => item.str).join(' ') + '\n';
        }
        return fullText;
    }

    function updatePreview() {
        previewContainer.innerHTML = '';
        uploadedFiles.forEach((file, index) => {
            const item = document.createElement('div');
            item.className = 'file-item';
            item.style.cssText = "width: 100px; height: 30px; background: #eee; font-size: 10px; padding: 5px; border-radius: 4px; overflow: hidden; position: relative;";
            item.innerHTML = `📄 ${file.name.substring(0, 10)}... <button class="remove-btn" style="position:absolute; right:2px; top:2px;">×</button>`;
            item.querySelector('.remove-btn').onclick = (e) => {
                e.stopPropagation();
                uploadedFiles.splice(index, 1);
                updatePreview();
            };
            previewContainer.appendChild(item);
        });
    }

    // --- AI FACTORY AGENTS ---

    function updateStepUI(step, status, detail = null) {
        const item = document.getElementById(`step-${step}`);
        const icon = item.querySelector('.step-icon');
        const detailDiv = document.getElementById(`detail-${step}`);
        
        item.className = 'step-item ' + status;
        if (status === 'active') icon.textContent = '🔵';
        else if (status === 'complete') icon.textContent = '✅';
        else icon.textContent = '⚪';

        if (detail) detailDiv.textContent = detail;
    }

    async function callAI(messages, responseFormat = null, isVision = false) {
        const resp = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: isVision ? VISION_MODEL : MODEL_NAME,
                messages: messages,
                temperature: 0.3,
                response_format: responseFormat ? { type: responseFormat } : undefined
            })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error?.message || 'AI 호출 실패');
        return data.choices[0].message.content;
    }

    // [공정 1] 유형 분석가
    async function agentAnalyzeStyle() {
        updateStepUI(1, 'active', '기출문제를 분석하여 출제 경향을 파악 중...');
        
        const samples = uploadedFiles.map(f => f.type === 'text' ? f.content : f.content).join('\n\n');
        const images = uploadedFiles.filter(f => f.type === 'image').map(f => f.content);
        
        const prompt = `당신은 영어 시험 분석 전문가입니다. 제공된 기출자료를 보고 다음을 리스트로 뽑으세요:
        1. 주요 문제 유형 (예: 빈칸 추론, 순서 배열)
        2. 지문 내 특수 기호 스타일 (예: [A], (a), ❶)
        간결하게 핵심만 나열하세요.`;

        const content = [{ type: 'text', text: prompt }];
        if (samples) content.push({ type: 'text', text: `기출 텍스트:\n${samples}` });
        images.forEach(img => content.push({ type: 'image_url', image_url: { url: img } }));

        const result = await callAI([{ role: 'user', content }], null, images.length > 0);
        updateStepUI(1, 'complete', '분석 완료: ' + result.substring(0, 50) + '...');
        return result;
    }

    // [공정 2] 지문 설계자
    async function agentAnnotatePassage(passage, styleGuide) {
        updateStepUI(2, 'active', '본문에 기호 및 장치를 배치 중...');
        
        const prompt = `본문을 분석된 스타일에 맞춰 변형하세요. 
        내용은 유지하되, 문제 출제를 위해 [A], (a), ❶ 같은 기호를 문맥에 맞는 위치에 삽입하세요.
        
        [스타일 가이드]
        ${styleGuide}
        
        본문:
        ${passage}`;

        const result = await callAI([{ role: 'user', content: prompt }]);
        updateStepUI(2, 'complete', '지문 설계 완료 (기호 삽입됨)');
        return result;
    }

    // [공정 3] 문제 집필가
    async function agentCreateQuestions(annotatedPassage, styleGuide, level, count) {
        updateStepUI(3, 'active', '템플릿을 기반으로 문제를 출제 중...');
        
        const templateInfo = questionTemplates.slice(0, 5).map(t => `- ${t.type}: ${t.question}`).join('\n');
        
        const systemPrompt = `당신은 전문 출제 위원입니다. JSON 형식으로만 응답하세요.
        난이도: ${level}, 문항수: ${count}
        
        [가이드] ${styleGuide}
        [참고 템플릿]
        ${templateInfo}
        
        출력 JSON 구조:
        { "questions": [ { "type": "유형", "question": "질문", "options": ["①", "②", "③", "④", "⑤"], "answer": "정답", "explanation": "해설" } ] }`;

        const result = await callAI([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `설계된 지문:\n${annotatedPassage}` }
        ], 'json_object');

        updateStepUI(3, 'complete', `${count}문항 집필 완료`);
        return JSON.parse(result);
    }

    // [공정 4] 품질 검수자
    async function agentInspectQuestions(passage, rawData) {
        updateStepUI(4, 'active', '문제의 논리적 오류를 검수 중...');
        
        const prompt = `다음 영어 문제들의 정답이 지문에서 명확히 도출되는지 검수하고, 필요시 더 정교하게 수정하세요.
        JSON 형식으로 최종 결과만 반환하세요.
        
        지문: ${passage}
        문제데이터: ${JSON.stringify(rawData)}`;

        const result = await callAI([
            { role: 'user', content: prompt }
        ], 'json_object');

        updateStepUI(4, 'complete', '최종 검수 및 품질 보증 완료');
        return JSON.parse(result);
    }

    // --- 메인 공정 가동 ---
    generateBtn.onclick = async () => {
        const text = readingMaterial.value.trim();
        if (!text) return alert('지문을 입력하세요.');
        if (!currentApiKey) return alert('API 키를 설정하세요.');

        generateBtn.disabled = true;
        factoryStatus.style.display = 'block';
        [1,2,3,4].forEach(i => updateStepUI(i, 'idle', '대기 중...'));

        try {
            // Step 1: Analyze
            const styleGuide = uploadedFiles.length > 0 
                ? await agentAnalyzeStyle() 
                : "일반적인 수능/내신 유형 (빈칸, 주제, 어법)";

            // Step 2: Annotate
            const annotatedPassage = await agentAnnotatePassage(text, styleGuide);

            // Step 3: Create
            const level = document.getElementById('predict-level').value;
            const count = document.getElementById('predict-count').value;
            const rawQuestions = await agentCreateQuestions(annotatedPassage, styleGuide, level, count);

            // Step 4: Inspect
            const finalData = await agentInspectQuestions(annotatedPassage, rawQuestions);

            renderResults({ passage: annotatedPassage, questions: finalData.questions });
        } catch (e) {
            alert('공정 오류: ' + e.message);
        } finally {
            generateBtn.disabled = false;
        }
    };

    function renderResults(data) {
        resultContainer.innerHTML = '';
        const pBox = document.createElement('div');
        pBox.style.cssText = "padding: 20px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 25px; white-space: pre-wrap; line-height: 1.8; font-size: 1.1em; color: #000; text-align: left;";
        pBox.textContent = data.passage;
        resultContainer.appendChild(pBox);

        data.questions.forEach((q, i) => {
            const qDiv = document.createElement('div');
            qDiv.className = 'question-item';
            qDiv.style.textAlign = 'left';
            qDiv.innerHTML = `
                <div style="font-weight: bold; margin-bottom: 12px; font-size: 1.1em; color: #000;">${i + 1}. [${q.type}] ${q.question}</div>
                <ul class="options-list" style="list-style: none; padding-left: 0; display: grid; gap: 8px;">
                    ${q.options.map(opt => `<li style="background: #fff; padding: 10px; border: 1px solid #eee; border-radius: 4px; color: #333;">${opt}</li>`).join('')}
                </ul>
                <details style="margin-top: 15px; color: #27ae60; background: #f0fff4; padding: 10px; border-radius: 6px;">
                    <summary style="cursor: pointer; font-weight: bold;">정답 및 해설 보기</summary>
                    <div style="margin-top: 10px;">
                        <p><strong>정답: ${q.answer}</strong></p>
                        <p style="font-size: 0.9em; line-height: 1.5;">${q.explanation}</p>
                    </div>
                </details>
            `;
            resultContainer.appendChild(qDiv);
        });
        resultContainer.scrollIntoView({ behavior: 'smooth' });
    }

    // PDF Export
    document.getElementById('export-pdf').onclick = async () => {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF();
        const content = document.getElementById('result-container');
        const canvas = await html2canvas(content, { scale: 2 });
        const imgData = canvas.toDataURL('image/png');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save('exam_pro.pdf');
    };
});