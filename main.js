document.addEventListener('DOMContentLoaded', () => {
    console.log('English Exam Assistant v2.8.0 initialized (Professional Architect)');
    
    const DEFAULT_KEY = ''; 
    const MODEL_NAME = 'llama-3.1-8b-instant';
    const VISION_MODELS = [
        'llama-3.2-11b-vision-preview',
        'llama-3.2-90b-vision-preview',
        'meta-llama/llama-4-scout-17b-16e-instruct'
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

    dropZone.addEventListener('click', () => examImageInput.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); handleFiles(e.dataTransfer.files); });
    examImageInput.addEventListener('change', (e) => handleFiles(e.target.files));

    window.addEventListener('paste', (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (const item of items) {
            if (item.type.indexOf('image') !== -1) handleFiles([item.getAsFile()]);
        }
    });

    async function handleFiles(files) {
        for (const file of files) {
            if (file.type.startsWith('image/')) {
                const optimizedDataUrl = await optimizeImage(file);
                droppedFiles.push(optimizedDataUrl);
            }
        }
        updatePreview();
    }

    function updatePreview() {
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

    analyzeStyleBtn.addEventListener('click', async () => {
        if (droppedFiles.length === 0) return alert('이미지를 추가해주세요.');
        analyzeStyleBtn.disabled = true;
        analyzeStyleBtn.textContent = '패턴 학습 중...';

        const imageContents = droppedFiles.map(dataUrl => ({ type: "image_url", image_url: { url: dataUrl } }));
        let success = false;
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
                                { type: "text", text: "이 이미지의 영어 문제 형태를 분석해줘. 질문의 의도, 보기를 구성하는 방식(매력적인 오답 설계법), 지문 내의 기호 활용법 등을 파악해서 나중에 똑같이 낼 수 있게 가이드를 작성해줘." },
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
                }
            } catch (err) {}
        }
        if (!success) alert('분석 실패');
        analyzeStyleBtn.disabled = false;
        analyzeStyleBtn.textContent = '추가된 모든 패턴 학습하기';
    });

    async function generateWithAI(passage) {
        if (!currentApiKey) throw new Error('API 키 설정 필요');
        
        const systemMessage = `당신은 대한민국 최고의 영어 교육 전문가이자 내신 출제 위원입니다.
        사용자가 제공하는 지문을 바탕으로 다음 원칙에 따라 "전문적인 시험지 세트"를 만드십시오.

        ### 출제 가이드라인
        1. **구조**: 하나의 지문에 대해 1~3개의 연관 문제를 묶어서 생성하십시오.
        2. **지문 조작**: 문제 유형에 따라 지문에 [A], (a), ⓐ~ⓔ, [1]~[5] 등의 기호를 적절히 삽입하십시오.
        3. **문항 퀄리티**:
           - **내용 일치/불일치**: 단순 언급 여부가 아니라, 본문의 내용을 한글이나 영어로 교묘하게 재진술(Paraphrase)하여 사고력을 요구하십시오.
           - **빈칸 추론**: 글의 핵심 주제나 핵심 연결어를 논리적 근거가 명확한 곳에 뚫으십시오.
           - **어법/어휘**: 문맥상 쓰임이 틀린 것을 고르거나, 어법상 어색한 것을 고르는 내신 단골 유형을 포함하십시오.
        4. **오답 설계**: 보기는 반드시 5개여야 하며, 정답과 혼동될 만한 매력적인 오답을 포함하십시오.
        5. **형식**: 반드시 아래 JSON 구조로만 출력하십시오.
        {
          "passage_header": "다음 글을 읽고 물음에 답하시오.",
          "passage_body": "기호가 포함된 지문 내용",
          "questions": [
            {
              "type": "유형(예: 어법 판단)",
              "question": "질문 내용",
              "options": ["①...", "②...", "③...", "④...", "⑤..."],
              "answer": "①",
              "explanation": "이 문제가 측정하고자 하는 개념과 정답인 이유"
            }
          ]
        }
        
        ${examStyleProfile ? `\n[참고할 이미지 패턴]:\n${examStyleProfile}` : ''}`;

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
        if (!response.ok) throw new Error(data.error?.message || '실패');
        return JSON.parse(data.choices[0].message.content);
    }

    function renderExamSet(set) {
        generatedQuestionsContainer.innerHTML = '';
        
        const setDiv = document.createElement('div');
        setDiv.className = 'exam-set-container';
        setDiv.style.cssText = "background: #fff; padding: 25px; border: 1px solid #ccc; border-radius: 8px; color: #000;";
        
        setDiv.innerHTML = `
            <div class="set-header" style="font-weight: bold; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 15px;">
                ${set.passage_header || '다음 글을 읽고 물음에 답하시오.'}
            </div>
            <div class="set-passage" style="line-height: 1.8; font-size: 1.1em; margin-bottom: 30px; white-space: pre-wrap; padding: 15px; background: #f9f9f9; border-radius: 4px;">${set.passage_body}</div>
            <div class="set-questions"></div>
        `;

        const questionsArea = setDiv.querySelector('.set-questions');
        set.questions.forEach((q, i) => {
            const qDiv = document.createElement('div');
            qDiv.className = 'question-item';
            qDiv.style.marginBottom = "30px";
            qDiv.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                    <span style="font-weight: bold; font-size: 1.1em;">${i + 1}. ${q.question}</span>
                    <button class="add-save-btn" style="position: static;">담기</button>
                </div>
                <ul class="options-list" style="display: grid; grid-template-columns: 1fr; gap: 8px;">
                    ${q.options.map(opt => `<li style="border: 1px solid #eee; padding: 10px; border-radius: 4px;">${opt}</li>`).join('')}
                </ul>
                <details style="margin-top: 15px; font-size: 0.9em; color: #27ae60; background: #f0fff4; padding: 10px; border-radius: 4px;">
                    <summary style="cursor: pointer; font-weight: bold;">정답 및 해설 (클릭)</summary>
                    <p style="margin-top: 10px;"><strong>정답: ${q.answer}</strong></p>
                    <p style="color: #555;">${q.explanation}</p>
                </details>
            `;
            
            qDiv.querySelector('.add-save-btn').onclick = () => {
                const saveItem = { ...q, passage_context: set.passage_body };
                savedQuestions.push(saveItem);
                updateSavedListUI();
                alert('장바구니에 담겼습니다.');
            };
            questionsArea.appendChild(qDiv);
        });

        generatedQuestionsContainer.appendChild(setDiv);
        resultArea.scrollIntoView({ behavior: 'smooth' });
    }

    function updateSavedListUI() {
        savedCountBadge.textContent = savedQuestions.length;
        savedQuestionsList.innerHTML = savedQuestions.length ? '' : '<p class="empty-msg">아직 담은 문제가 없습니다.</p>';
        savedQuestions.forEach((q, index) => {
            const qDiv = document.createElement('div');
            qDiv.className = 'question-item';
            qDiv.innerHTML = `
                <button class="add-save-btn" style="background:#e74c3c">삭제</button>
                <div style="font-size: 0.8em; color: #666; max-height: 40px; overflow: hidden;">${q.passage_context?.substring(0, 50)}...</div>
                <span class="question-text">${q.question}</span>
            `;
            qDiv.querySelector('button').onclick = () => { savedQuestions.splice(index, 1); updateSavedListUI(); };
            savedQuestionsList.appendChild(qDiv);
        });
    }

    document.getElementById('generate-prediction').addEventListener('click', async (e) => {
        const text = document.getElementById('reading-material').value;
        if (!text.trim()) return alert('지문을 입력하세요.');
        
        const oldText = e.target.textContent;
        e.target.disabled = true;
        e.target.textContent = '일타 강사 모드로 출제 중...';
        
        try {
            const examSet = await generateWithAI(text);
            renderExamSet(examSet);
        } catch (err) {
            alert('오류: ' + err.message);
        } finally {
            e.target.disabled = false;
            e.target.textContent = oldText;
        }
    });

    // 기본 로직 유지
    document.getElementById('export-pdf').onclick = async () => {
        const canvas = await html2canvas(document.getElementById('pdf-export-area'), { scale: 2 });
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, (canvas.height * 210) / canvas.width);
        pdf.save('english_exam.pdf');
    };
    document.getElementById('clear-saved').onclick = () => { if (confirm('비울까요?')) { savedQuestions = []; updateSavedListUI(); } };
    if (localStorage.getItem('theme') === 'dark') body.classList.add('dark-mode');
    themeToggle.addEventListener('click', () => {
        body.classList.toggle('dark-mode');
        localStorage.setItem('theme', body.classList.contains('dark-mode') ? 'dark' : 'light');
    });
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.getAttribute('data-tab')).classList.add('active');
        });
    });
});