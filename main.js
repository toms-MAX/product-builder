document.addEventListener('DOMContentLoaded', async () => {
    console.log('Smart English Exam Generator initialized');

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

    let questionTemplates = [];
    let uploadedFiles = []; // { type: 'image'|'text', content: string }
    let currentApiKey = localStorage.getItem('groq_api_key') || '';
    apiKeyInput.value = currentApiKey;

    // Load Template Bank
    try {
        const resp = await fetch('questions.json');
        questionTemplates = await resp.json();
        console.log(`Loaded ${questionTemplates.length} templates.`);
    } catch (e) {
        console.error('Failed to load questions.json', e);
    }

    // API Key Save
    saveKeyBtn.addEventListener('click', () => {
        currentApiKey = apiKeyInput.value.trim();
        localStorage.setItem('groq_api_key', currentApiKey);
        alert('API 키가 저장되었습니다.');
    });

    // Theme Toggle
    if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark-mode');
    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
    });

    // File Handling
    dropZone.addEventListener('click', () => examFileInput.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); handleFiles(e.dataTransfer.files); });
    examFileInput.addEventListener('change', (e) => handleFiles(e.target.files));

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
            item.style.width = '100px';
            item.style.height = '30px';
            item.style.background = '#eee';
            item.style.fontSize = '10px';
            item.style.padding = '5px';
            item.style.borderRadius = '4px';
            item.style.overflow = 'hidden';
            item.innerHTML = `📄 ${file.name.substring(0, 10)}... <button class="remove-btn">×</button>`;
            item.querySelector('.remove-btn').onclick = (e) => {
                e.stopPropagation();
                uploadedFiles.splice(index, 1);
                updatePreview();
            };
            previewContainer.appendChild(item);
        });
    }

    // AI Generation Logic
    generateBtn.addEventListener('click', async () => {
        const text = readingMaterial.value.trim();
        if (!text) return alert('지문을 입력해주세요.');
        if (!currentApiKey) return alert('API 키를 입력해주세요.');

        generateBtn.disabled = true;
        const originalText = generateBtn.textContent;
        generateBtn.textContent = 'AI가 형식을 분석하고 문제를 만드는 중...';

        try {
            // 1. Analyze Style (if any files uploaded)
            let styleInfo = "일반적인 내신 문제 스타일";
            if (uploadedFiles.length > 0) {
                styleInfo = await analyzeUploadedStyles();
            }

            // 2. Select Templates & Generate
            const level = document.getElementById('predict-level').value;
            const count = document.getElementById('predict-count').value;
            
            const result = await generateQuestions(text, styleInfo, level, count);
            renderResults(result);
        } catch (e) {
            alert('오류 발생: ' + e.message);
        } finally {
            generateBtn.disabled = false;
            generateBtn.textContent = originalText;
        }
    });

    async function analyzeUploadedStyles() {
        const textSamples = uploadedFiles.filter(f => f.type === 'text').map(f => f.content).join('\n\n');
        const images = uploadedFiles.filter(f => f.type === 'image').map(f => f.content);

        const prompt = `당신은 영어 시험지 분석 전문가입니다. 제공된 텍스트/이미지를 보고 다음을 파악하세요:
        1. 자주 나오는 문제 유형 (예: 빈칸, 순서, 어법)
        2. 지문에 사용되는 특수 기호 (예: [A], (a), ❶)
        3. 보기(Options)의 스타일
        이 정보를 요약하여 아주 간결한 '출제 가이드라인'을 작성하세요.`;

        const messages = [{ role: 'user', content: [{ type: 'text', text: prompt }] }];
        if (textSamples) messages[0].content.push({ type: 'text', text: `참고 텍스트:\n${textSamples}` });
        images.forEach(img => messages[0].content.push({ type: 'image_url', image_url: { url: img } }));

        const resp = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: images.length > 0 ? VISION_MODEL : MODEL_NAME, messages, temperature: 0.2 })
        });
        const data = await resp.json();
        return data.choices[0].message.content;
    }

    async function generateQuestions(passage, styleInfo, level, count) {
        // Sample some templates from questions.json to give AI ideas
        const templatesSample = questionTemplates.slice(0, 10).map(t => `- ${t.type}: ${t.question}`).join('\n');

        const systemPrompt = `당신은 영어 내신 문제 출제 위원입니다.
        제공된 지문을 바탕으로 예상 문제를 생성하세요.

        ### 지침:
        1. **형식 참고**: 아래 [스타일 가이드]를 최우선으로 따르세요.
        2. **템플릿 활용**: [문제 은행 샘플]의 유형을 참고하여 문제를 구성하세요.
        3. **난이도**: ${level} 수준에 맞게 출제하세요.
        4. **문항수**: 반드시 ${count}문제를 생성하세요.

        [스타일 가이드]
        ${styleInfo}

        [문제 은행 샘플]
        ${templatesSample}

        ### 출력 형식 (JSON):
        {
          "passage": "기호가 포함되어 변형된 지문 (필요시)",
          "questions": [
            {
              "type": "유형",
              "question": "질문",
              "options": ["①...", "②...", "③...", "④...", "⑤..."],
              "answer": "정답 번호",
              "explanation": "해설"
            }
          ]
        }`;

        const resp = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: MODEL_NAME,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `본문:\n${passage}` }
                ],
                response_format: { type: "json_object" },
                temperature: 0.5
            })
        });
        const data = await resp.json();
        return JSON.parse(data.choices[0].message.content);
    }

    function renderResults(data) {
        resultContainer.innerHTML = '';
        if (data.passage) {
            const pBox = document.createElement('div');
            pBox.style.cssText = "padding: 15px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 20px; white-space: pre-wrap; line-height: 1.6;";
            pBox.textContent = data.passage;
            resultContainer.appendChild(pBox);
        }

        data.questions.forEach((q, i) => {
            const qDiv = document.createElement('div');
            qDiv.className = 'question-item';
            qDiv.innerHTML = `
                <div style="font-weight: bold; margin-bottom: 10px;">${i + 1}. [${q.type}] ${q.question}</div>
                <ul class="options-list" style="list-style: none; padding-left: 0;">
                    ${q.options.map(opt => `<li style="margin-bottom: 5px;">${opt}</li>`).join('')}
                </ul>
                <details style="margin-top: 10px; color: #27ae60;">
                    <summary style="cursor: pointer;">정답 및 해설</summary>
                    <div style="padding: 10px; background: #f0fff4; margin-top: 5px; border-radius: 4px;">
                        <strong>정답: ${q.answer}</strong><br>
                        ${q.explanation}
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
        const content = document.getElementById('generated-questions');
        const canvas = await html2canvas(content);
        const imgData = canvas.toDataURL('image/png');
        const imgProps = pdf.getImageProperties(imgData);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save('exam_questions.pdf');
    };
});