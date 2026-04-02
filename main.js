document.addEventListener('DOMContentLoaded', () => {
    console.log('English Exam Assistant v2.8.4 initialized (Strict Enforce Mode)');
    
    const DEFAULT_KEY = ''; 
    const MODEL_NAME = 'llama-3.1-8b-instant';
    const VISION_MODELS = [
        'meta-llama/llama-4-scout-17b-16e-instruct',
        'llama-3.2-90b-vision-preview',
        'llama-3.2-11b-vision-preview'
    ];
    const API_URL = 'https://api.groq.com/openai/v1/chat/completions';

    const apiKeyInput = document.getElementById('api-key-input');
    const saveKeyBtn = document.getElementById('save-key-btn');
    const dropZone = document.getElementById('drop-zone');
    const examImageInput = document.getElementById('exam-image-input');
    const previewContainer = document.getElementById('selected-files-preview');
    const analyzeStyleBtn = document.getElementById('analyze-style-btn');
    const styleProfileDisplay = document.getElementById('style-profile-display');
    
    const themeToggle = document.getElementById('theme-toggle');
    const body = document.body;
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const savedCountBadge = document.getElementById('saved-count');
    const savedQuestionsList = document.getElementById('saved-questions-list');
    const generatedQuestionsContainer = document.getElementById('generated-questions');
    const resultArea = document.getElementById('result-container');

    let savedQuestions = [];
    let droppedFiles = []; 
    let currentApiKey = localStorage.getItem('groq_api_key') || DEFAULT_KEY;
    let examStyleProfile = localStorage.getItem('exam_style_profile') || '';

    if (examStyleProfile) {
        styleProfileDisplay.style.display = 'block';
        styleProfileDisplay.innerHTML = `✨ <strong>학습된 출제 템플릿이 활성화되었습니다.</strong>`;
    }
    apiKeyInput.value = currentApiKey === DEFAULT_KEY ? '' : currentApiKey;

    saveKeyBtn.addEventListener('click', () => {
        const newKey = apiKeyInput.value.trim();
        if (newKey) {
            localStorage.setItem('groq_api_key', newKey);
            currentApiKey = newKey;
            alert('API 키가 저장되었습니다.');
        }
    });

    async function optimizeImage(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 1280;
                    let width = img.width;
                    let height = img.height;
                    if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
                    canvas.width = width; canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', 0.8));
                };
            };
        });
    }

    if (dropZone) {
        dropZone.addEventListener('click', () => examImageInput.click());
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
        dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); handleFiles(e.dataTransfer.files); });
    }
    if (examImageInput) examImageInput.addEventListener('change', (e) => handleFiles(e.target.files));

    window.addEventListener('paste', (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (const item of items) { if (item.type.indexOf('image') !== -1) handleFiles([item.getAsFile()]); }
    });

    async function handleFiles(files) {
        if (!files) return;
        for (const file of files) {
            if (file.type.startsWith('image/')) {
                const optimizedDataUrl = await optimizeImage(file);
                droppedFiles.push(optimizedDataUrl);
            }
        }
        updatePreview();
    }

    function updatePreview() {
        if (!previewContainer) return;
        previewContainer.innerHTML = '';
        droppedFiles.forEach((dataUrl, index) => {
            const item = document.createElement('div');
            item.className = 'file-item';
            item.innerHTML = `<img src="${dataUrl}"><button class="remove-btn">×</button>`;
            item.querySelector('.remove-btn').onclick = (ev) => {
                ev.stopPropagation();
                droppedFiles.splice(index, 1);
                updatePreview();
            };
            previewContainer.appendChild(item);
        });
    }

    // 1. 비전 분석 프롬프트 고도화 (구조 추출 중심)
    analyzeStyleBtn.addEventListener('click', async () => {
        if (droppedFiles.length === 0) return alert('참고할 이미지를 추가해주세요.');
        if (!currentApiKey) return alert('API 키를 먼저 설정해주세요.');

        analyzeStyleBtn.disabled = true;
        analyzeStyleBtn.textContent = '구조 분석 및 템플릿화 중...';

        const imageContents = droppedFiles.map(dataUrl => ({ type: "image_url", image_url: { url: dataUrl } }));
        let success = false;
        let lastError = '';

        for (const modelId of VISION_MODELS) {
            try {
                const response = await fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${currentApiKey}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: modelId,
                        messages: [{
                            role: "user",
                            content: [
                                { type: "text", text: "이 이미지에 있는 문제들의 '구조적 특징'을 기술 명세서처럼 분석해줘. 반드시 다음 항목을 포함해: 1. 지문에 삽입된 특수 기호 종류([1], ⓐ 등), 2. 질문의 전형적인 말투, 3. 보기(Options)의 구성 방식(길이, 개수, 언어 비중). 이 명세서는 나중에 동일한 형태의 문제를 생성하는 템플릿으로 사용될 거야." },
                                ...imageContents
                            ]
                        }]
                    })
                });
                const responseData = await response.json();
                if (response.ok) {
                    examStyleProfile = responseData.choices[0].message.content;
                    localStorage.setItem('exam_style_profile', examStyleProfile);
                    styleProfileDisplay.style.display = 'block';
                    styleProfileDisplay.innerHTML = `✨ <strong>템플릿 분석 완료 (적용 중)</strong>`;
                    alert('문제 구조 학습이 완료되었습니다! 이제 모든 생성은 이 템플릿을 따릅니다.');
                    success = true;
                    break;
                } else { lastError = responseData.error?.message || 'Error'; }
            } catch (err) { lastError = err.message; }
        }
        if (!success) alert('분석 실패: ' + lastError);
        analyzeStyleBtn.disabled = false;
        analyzeStyleBtn.textContent = '추가된 모든 패턴 학습하기';
    });

    // 2. 생성 프롬프트 강화 (5지선다 및 난이도 절대 준수)
    async function generateWithAI(passage, level) {
        if (!currentApiKey) throw new Error('API 키 설정 필요');
        
        let languageMandate = "";
        if (level === 'easy') {
            languageMandate = "MANDATE: ALL options MUST be written in KOREAN (한글). DO NOT use English for options.";
        } else if (level === 'medium') {
            languageMandate = "MANDATE: Use a mix of KOREAN and ENGLISH for options to provide moderate difficulty.";
        } else {
            languageMandate = "MANDATE: ALL options MUST be written in ENGLISH (영어). DO NOT use Korean for options. Use advanced academic vocabulary.";
        }

        const systemMessage = `당신은 대한민국 최고 수준의 영어 내신 출제 위원입니다. 
        당신은 아래의 **절대 원칙(MANDATES)**을 1%의 예외 없이 준수해야 합니다.

        ### 절대 원칙 (MANDATES)
        1. **5지선다 (5-Way Options)**: 모든 문제는 반드시 ①, ②, ③, ④, ⑤의 5개 보기를 가져야 합니다. 4개 이하는 절대 허용되지 않습니다.
        2. **언어 및 난이도**: ${languageMandate}
        3. **구조적 복제**: ${examStyleProfile ? `제공된 [학습된 템플릿]의 구조(기호 사용, 질문 스타일)를 100% 동일하게 복제하십시오: \n${examStyleProfile}` : '지문 분석 후 변별력 있는 고퀄리티 문항을 설계하십시오.'}
        4. **무오류성**: 정답은 논리적으로 유일해야 하며, 매력적인 오답을 설계하여 변별력을 확보하십시오.

        ### 출력 형식 (JSON ONLY)
        응답은 반드시 아래 구조의 순수 JSON이어야 합니다.
        {
          "passage_header": "지시문 (예: 다음 글을 읽고 물음에 답하시오.)",
          "passage_body": "변형된 지문 (템플릿에 따른 기호 삽입 필수)",
          "questions": [
            {
              "type": "유형",
              "question": "질문",
              "options": ["①...", "②...", "③...", "④...", "⑤..."],
              "answer": "①",
              "explanation": "해설"
            }
          ]
        }`;

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: MODEL_NAME,
                messages: [
                    { role: "system", content: systemMessage },
                    { role: "user", content: `CONTEXT: ${passage}\n\nLEVEL: ${level}\n\nTASK: Generate a high-quality exam set based on the mandates above.` }
                ],
                temperature: 0.3, // 일관성 극대화를 위해 낮춤
                response_format: { type: "json_object" }
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || '생성 실패');
        
        let content = data.choices[0].message.content;
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) content = jsonMatch[0];
        const parsed = JSON.parse(content);

        // 마지막 보정 (혹시라도 AI가 배열 길이를 어겼을 경우 체크)
        if (parsed.questions) {
            parsed.questions.forEach(q => {
                if (!q.options || q.options.length < 5) throw new Error("AI가 5지선다 규칙을 위반했습니다. 다시 시도해 주세요.");
            });
        }
        return parsed;
    }

    function renderExamSet(set) {
        if (!generatedQuestionsContainer) return;
        generatedQuestionsContainer.innerHTML = '';
        const setDiv = document.createElement('div');
        setDiv.className = 'exam-set-container';
        setDiv.style.cssText = "background: #fff; padding: 25px; border: 1px solid #ccc; border-radius: 8px; color: #000; text-align: left;";
        
        setDiv.innerHTML = `
            <div class="set-header" style="font-weight: bold; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 15px;">
                ${set.passage_header || '다음 글을 읽고 물음에 답하시오.'}
            </div>
            <div class="set-passage" style="line-height: 1.8; font-size: 1.1em; margin-bottom: 30px; white-space: pre-wrap; padding: 15px; background: #f9f9f9; border-radius: 4px;">${set.passage_body || ''}</div>
            <div class="set-questions"></div>
        `;

        const questionsArea = setDiv.querySelector('.set-questions');
        set.questions.forEach((q, i) => {
            const qDiv = document.createElement('div');
            qDiv.className = 'question-item';
            qDiv.style.cssText = "margin-bottom: 35px; position: relative;";
            qDiv.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                    <span style="font-weight: bold; font-size: 1.1em; padding-right: 60px;">${i + 1}. ${q.question}</span>
                    <button class="add-save-btn" style="position: absolute; top: 0; right: 0;">담기</button>
                </div>
                <ul class="options-list" style="list-style: none; padding-left: 0; display: grid; gap: 10px;">
                    ${q.options.map(opt => `<li style="border: 1px solid #eee; padding: 12px; border-radius: 6px; background: #fff;">${opt}</li>`).join('')}
                </ul>
                <details style="margin-top: 15px; font-size: 0.9em; color: #27ae60; background: #f0fff4; padding: 12px; border-radius: 6px;">
                    <summary style="cursor: pointer; font-weight: bold;">정답 및 해설</summary>
                    <p style="margin-top: 10px;"><strong>정답: ${q.answer}</strong></p>
                    <p style="color: #555; line-height: 1.5;">${q.explanation || ''}</p>
                </details>
            `;
            qDiv.querySelector('.add-save-btn').onclick = () => {
                savedQuestions.push({ ...q, passage_context: set.passage_body });
                updateSavedListUI();
                alert('장바구니에 담겼습니다.');
            };
            questionsArea.appendChild(qDiv);
        });
        generatedQuestionsContainer.appendChild(setDiv);
        resultArea.scrollIntoView({ behavior: 'smooth' });
    }

    function updateSavedListUI() {
        if (!savedCountBadge || !savedQuestionsList) return;
        savedCountBadge.textContent = savedQuestions.length;
        savedQuestionsList.innerHTML = savedQuestions.length ? '' : '<p class="empty-msg">아직 담은 문제가 없습니다.</p>';
        savedQuestions.forEach((q, index) => {
            const qDiv = document.createElement('div');
            qDiv.className = 'question-item';
            qDiv.style.textAlign = 'left';
            qDiv.innerHTML = `
                <button class="add-save-btn" style="background:#e74c3c">삭제</button>
                <div style="font-size: 0.8em; color: #666; max-height: 40px; overflow: hidden; margin-bottom: 5px;">${q.passage_context?.substring(0, 60)}...</div>
                <span class="question-text" style="font-size: 0.9em;">${q.question}</span>
            `;
            qDiv.querySelector('button').onclick = () => { savedQuestions.splice(index, 1); updateSavedListUI(); };
            savedQuestionsList.appendChild(qDiv);
        });
    }

    const generatePredBtn = document.getElementById('generate-prediction');
    if (generatePredBtn) {
        generatePredBtn.addEventListener('click', async (e) => {
            const text = document.getElementById('reading-material').value;
            const level = document.getElementById('predict-level').value;
            if (!text.trim()) return alert('지문을 입력하세요.');
            const oldText = e.target.textContent;
            e.target.disabled = true;
            e.target.textContent = '원칙 준수하여 출제 중...';
            try {
                const examSet = await generateWithAI(text, level);
                renderExamSet(examSet);
            } catch (err) { alert('출제 실패: ' + err.message); } finally { e.target.disabled = false; e.target.textContent = oldText; }
        });
    }

    const exportPdfBtn = document.getElementById('export-pdf');
    if (exportPdfBtn) {
        exportPdfBtn.onclick = async () => {
            if (savedQuestions.length === 0) return alert('담은 문제가 없습니다.');
            const canvas = await html2canvas(document.getElementById('pdf-export-area'), { scale: 2 });
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('p', 'mm', 'a4');
            pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, (canvas.height * 210) / canvas.width);
            pdf.save('english_exam.pdf');
        };
    }

    const clearSavedBtn = document.getElementById('clear-saved');
    if (clearSavedBtn) clearSavedBtn.onclick = () => { if (confirm('비울까요?')) { savedQuestions = []; updateSavedListUI(); } };
    if (localStorage.getItem('theme') === 'dark') body.classList.add('dark-mode');
    if (themeToggle) themeToggle.addEventListener('click', () => { body.classList.toggle('dark-mode'); localStorage.setItem('theme', body.classList.contains('dark-mode') ? 'dark' : 'light'); });

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const targetContent = document.getElementById(btn.getAttribute('data-tab'));
            if (targetContent) targetContent.classList.add('active');
        });
    });
});