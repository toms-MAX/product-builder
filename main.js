document.addEventListener('DOMContentLoaded', () => {
    console.log('English Exam Assistant v2.8.6 initialized (Precise Language Control)');
    
    const DEFAULT_KEY = ''; 
    const MODEL_NAME = 'llama-3.3-70b-versatile';
    const VISION_MODELS = [
        'llama-3.2-90b-vision-preview'
    ];
    const API_URL = 'https://api.groq.com/openai/v1/chat/completions';

    async function fetchWithRetry(url, options, maxRetries = 2) {
        for (let i = 0; i <= maxRetries; i++) {
            try {
                const response = await fetch(url, options);
                if (response.status === 429) {
                    const wait = Math.pow(2, i) * 3000;
                    console.log(`Rate limit hit, waiting ${wait}ms...`);
                    await new Promise(r => setTimeout(r, wait));
                    continue;
                }
                return response;
            } catch (err) {
                if (i === maxRetries) throw err;
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    }

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

    if (analyzeStyleBtn) {
        analyzeStyleBtn.addEventListener('click', async () => {
            if (droppedFiles.length === 0) return alert('참고할 이미지를 추가해주세요.');
            if (!currentApiKey) return alert('API 키를 먼저 설정해주세요.');

            analyzeStyleBtn.disabled = true;
            analyzeStyleBtn.textContent = '깊은 패턴 학습 중...';

            const imageContents = droppedFiles.map(dataUrl => ({ type: "image_url", image_url: { url: dataUrl } }));
            let success = false;
            let lastError = '';

            const deepAnalysisPrompt = `당신은 영어 문제 구조를 분석하는 전문가입니다. 
            이미지를 보고 다음 단계에 따라 분석을 수행하세요:
            
            1. OCR 분석: 지문과 문제에 사용된 주요 텍스트와 기호를 모두 파악하세요.
            2. 유형 분석: 이 문제가 어떤 유형(예: 문장 삽입, 글의 순서, 어법 오류 등)인지 정의하세요.
            3. 구조 분석: 기호(예: [A], (a), ❶)가 지문의 어느 위치에 어떤 형식으로 쓰였는지 파악하세요.
            4. 스타일 합성: 위 분석을 바탕으로, 앞으로 AI가 이와 100% 동일한 유형의 문제를 생성할 수 있도록 아주 상세한 '출제 알고리즘 가이드라인'을 작성하세요.
            
            이 가이드라인은 생성 AI가 읽고 그대로 따라할 수 있어야 합니다.`;

            for (const modelId of VISION_MODELS) {
                try {
                    const response = await fetchWithRetry(API_URL, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${currentApiKey}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model: modelId,
                            messages: [{
                                role: "user",
                                content: [
                                    { type: "text", text: deepAnalysisPrompt },
                                    ...imageContents
                                ]
                            }],
                            temperature: 0.1
                        })
                    });
                    const responseData = await response.json();
                    if (response.ok) {
                        examStyleProfile = responseData.choices[0].message.content;
                        localStorage.setItem('exam_style_profile', examStyleProfile);
                        styleProfileDisplay.style.display = 'block';
                        styleProfileDisplay.innerHTML = `✨ <strong>[심층 학습 완료] 분석 유형: ${examStyleProfile.substring(0, 30)}...</strong>`;
                        alert('이미지 패턴 심층 학습 완료!');
                        success = true;
                        break;
                    } else { lastError = responseData.error?.message || 'Error'; }
                } catch (err) { lastError = err.message; }
            }
            if (!success) alert('이미지 분석 실패: ' + lastError + '\n(Rate Limit일 수 있으니 잠시 후 다시 시도해주세요)');
            analyzeStyleBtn.disabled = false;
            analyzeStyleBtn.textContent = '추가된 모든 패턴 학습하기';
        });
    }

    // 2. 난이도별 언어 규칙 적용 (시스템 프롬프트 강화)
    async function generateWithAI(passage, level, count) {
        if (!currentApiKey) throw new Error('API 키 설정 필요');
        
        let languageRule = "";
        if (level === 'easy') {
            languageRule = "- Passage: English\n- Question: Korean (한글)\n- Options: Korean (한글)";
        } else if (level === 'medium') {
            languageRule = "- Passage: English\n- Question: Mix of English and Korean\n- Options: Mix of English and Korean";
        } else {
            languageRule = "- Passage: English\n- Question: English (영어)\n- Options: English (영어)";
        }

        const systemMessage = `당신은 대한민국 최고의 영어 내신 출제 위원입니다. 
        당신은 아래의 **언어 규정(LANGUAGE RULES)**과 **MANDATES**를 절대적으로 준수해야 합니다.

        ### 언어 규정 (LANGUAGE RULES - LEVEL: ${level})
        ${languageRule}

        ### 절대 원칙 (MANDATES)
        1. **문항 개수**: 반드시 정확히 ${count}개의 문제를 생성하십시오.
        2. **5지선다**: 모든 문제는 반드시 ①, ②, ③, ④, ⑤의 5개 보기를 가져야 합니다.
        3. **유형 및 스타일 복제 (CRITICAL)**: ${examStyleProfile ? `다음 학습된 [출제 가이드]에 명시된 문제 '유형'과 '스타일'을 그대로 복제하십시오. 가이드에서 특정 유형(예: 순서 배열)이 언급되었다면 반드시 그 유형으로 출제해야 합니다: \n${examStyleProfile}` : '변별력 있는 문항을 설계하십시오.'}
        4. **Passage**: 지문은 항상 영어로 유지하되, 학습된 스타일에서 요구하는 기호(예: [A], (a), ❶ 등)를 지문에 삽입하십시오.

        ### 출력 형식 (JSON ONLY)
        {
          "passage_header": "지시문 (학습된 스타일에 맞게 작성)",
          "passage_body": "변형된 영어 지문 (필요시 기호 포함)",
          "questions": [
            {
              "type": "분석된 문제 유형",
              "question": "질문 내용",
              "options": ["①...", "②...", "③...", "④...", "⑤..."],
              "answer": "①",
              "explanation": "상세한 해설"
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
                    { role: "user", content: `CONTEXT: ${passage}\n\nTASK: 위 지문을 바탕으로 학습된 스타일 가이드를 엄격히 적용하여 ${count}문제를 생성하세요. 가이드에 정의된 문제 유형을 반드시 따르십시오.` }
                ],
                temperature: 0.4,
                response_format: { type: "json_object" }
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || '생성 실패');
        
        let content = data.choices[0].message.content;
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) content = jsonMatch[0];
        const parsed = JSON.parse(content);

        if (parsed.questions) {
            parsed.questions.forEach(q => {
                if (!q.options || q.options.length < 5) throw new Error("AI가 5지선다 규칙을 위반했습니다.");
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
            const count = document.getElementById('predict-count').value;
            if (!text.trim()) return alert('지문을 입력하세요.');
            const oldText = e.target.textContent;
            e.target.disabled = true;
            e.target.textContent = '난이도 맞춤 출제 중...';
            try {
                const examSet = await generateWithAI(text, level, count);
                renderExamSet(examSet);
            } catch (err) { alert('출제 실패: ' + err.message); } finally { e.target.disabled = false; e.target.textContent = oldText; }
        });
    }

    const generateBankBtn = document.getElementById('generate-bank');
    if (generateBankBtn) {
        generateBankBtn.addEventListener('click', async (e) => {
            const level = document.getElementById('level-select').value;
            const topic = document.getElementById('topic-select').value;
            const count = document.getElementById('question-count').value;
            const oldText = e.target.textContent;
            e.target.disabled = true;
            e.target.textContent = '문제 생성 중...';
            try {
                const prompt = `${topic} 주제의 ${level} 난이도 영어 문제를 ${count}개 생성해줘.`;
                const examSet = await generateWithAI(prompt, level, count);
                renderExamSet(examSet);
            } catch (err) { alert('생성 실패: ' + err.message); } finally { e.target.disabled = false; e.target.textContent = oldText; }
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