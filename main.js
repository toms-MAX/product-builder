document.addEventListener('DOMContentLoaded', () => {
    console.log('English Exam Assistant v2.8.2 initialized (Logic & UI Stability)');
    
    const DEFAULT_KEY = ''; 
    const MODEL_NAME = 'llama-3.1-8b-instant';
    // API에서 확인된 최신 및 가용 모델 위주로 구성
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
        styleProfileDisplay.innerHTML = `✨ <strong>학습된 출제 가이드 적용 중</strong>`;
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
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                    canvas.width = width;
                    canvas.height = height;
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
    
    if (examImageInput) {
        examImageInput.addEventListener('change', (e) => handleFiles(e.target.files));
    }

    window.addEventListener('paste', (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (const item of items) {
            if (item.type.indexOf('image') !== -1) handleFiles([item.getAsFile()]);
        }
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

    if (analyzeStyleBtn) {
        analyzeStyleBtn.addEventListener('click', async () => {
            if (droppedFiles.length === 0) return alert('참고할 이미지를 추가해주세요.');
            if (!currentApiKey) return alert('API 키를 먼저 설정해주세요.');

            analyzeStyleBtn.disabled = true;
            analyzeStyleBtn.textContent = '패턴 분석 중...';

            const imageContents = droppedFiles.map(dataUrl => ({ type: "image_url", image_url: { url: dataUrl } }));
            let success = false;
            let lastError = '';

            for (const modelId of VISION_MODELS) {
                try {
                    console.log(`Trying Vision Model: ${modelId}`);
                    const response = await fetch(API_URL, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${currentApiKey}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model: modelId,
                            messages: [{
                                role: "user",
                                content: [
                                    { type: "text", text: "이 이미지의 영어 문제 형태를 분석해줘. 질문의 의도, 보기를 구성하는 방식, 지문 내의 기호 활용법 등을 파악해서 가이드를 작성해줘." },
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
                        alert('문제 형태 학습 완료!');
                        success = true;
                        break;
                    } else {
                        lastError = responseData.error?.message || '알 수 없는 오류';
                        console.warn(`Model ${modelId} failed: ${lastError}`);
                    }
                } catch (err) {
                    lastError = err.message;
                    console.error(`Error with model ${modelId}:`, err);
                }
            }
            if (!success) alert('이미지 분석 실패: ' + lastError);
            analyzeStyleBtn.disabled = false;
            analyzeStyleBtn.textContent = '추가된 모든 패턴 학습하기';
        });
    }

    async function generateWithAI(passage) {
        if (!currentApiKey) throw new Error('API 키 설정 필요');
        
        const systemMessage = `당신은 대한민국 최고의 영어 교육 전문가이자 내신 출제 위원입니다.
        반드시 JSON 형식으로만 응답하십시오. 응답은 반드시 유효한 JSON 객체여야 하며, 다른 설명 텍스트는 포함하지 마십시오.
        {
          "passage_header": "다음 글을 읽고 물음에 답하시오.",
          "passage_body": "...",
          "questions": [
            {
              "type": "...",
              "question": "...",
              "options": ["①...", "②...", "③...", "④...", "⑤..."],
              "answer": "①",
              "explanation": "..."
            }
          ]
        }
        ${examStyleProfile ? `\n[참고할 스타일]:\n${examStyleProfile}` : ''}`;

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: MODEL_NAME,
                messages: [
                    { role: "system", content: systemMessage },
                    { role: "user", content: `지문:\n${passage}\n\n위 지문을 바탕으로 고퀄리티 문제 세트를 만드십시오.` }
                ],
                temperature: 0.4,
                response_format: { type: "json_object" }
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || '생성 실패');
        
        let content = data.choices[0].message.content;
        console.log("Raw AI Content:", content);

        try {
            // Robust JSON Parsing: 텍스트가 섞여 들어올 경우 대비
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) content = jsonMatch[0];
            return JSON.parse(content);
        } catch (err) {
            console.error("AI JSON Parsing Error:", err);
            throw new Error("AI 응답을 해석할 수 없습니다. 형식이 올바르지 않습니다.");
        }
    }

    function renderExamSet(set) {
        if (!generatedQuestionsContainer) return;
        generatedQuestionsContainer.innerHTML = '';
        if (!set || !set.questions || !Array.isArray(set.questions)) {
            generatedQuestionsContainer.innerHTML = '<p style="color:red">데이터 형식이 올바르지 않습니다.</p>';
            return;
        }

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
                    ${(q.options || []).map(opt => `<li style="border: 1px solid #eee; padding: 12px; border-radius: 6px; background: #fff;">${opt}</li>`).join('')}
                </ul>
                <details style="margin-top: 15px; font-size: 0.9em; color: #27ae60; background: #f0fff4; padding: 12px; border-radius: 6px; border: 1px solid #c3e6cb;">
                    <summary style="cursor: pointer; font-weight: bold;">정답 및 해설</summary>
                    <p style="margin-top: 10px;"><strong>정답: ${q.answer}</strong></p>
                    <p style="color: #555; line-height: 1.5;">${q.explanation || '해당 지문의 논리적 구조를 바탕으로 출제되었습니다.'}</p>
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
            if (!text.trim()) return alert('지문을 입력하세요.');
            
            const oldText = e.target.textContent;
            e.target.disabled = true;
            e.target.textContent = '문제 세트 구성 중...';
            
            try {
                const examSet = await generateWithAI(text);
                renderExamSet(examSet);
            } catch (err) {
                alert('출제 실패: ' + err.message);
            } finally {
                e.target.disabled = false;
                e.target.textContent = oldText;
            }
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
    if (clearSavedBtn) {
        clearSavedBtn.onclick = () => { if (confirm('비울까요?')) { savedQuestions = []; updateSavedListUI(); } };
    }
    
    if (localStorage.getItem('theme') === 'dark') body.classList.add('dark-mode');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            body.classList.toggle('dark-mode');
            localStorage.setItem('theme', body.classList.contains('dark-mode') ? 'dark' : 'light');
        });
    }

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