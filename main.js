document.addEventListener('DOMContentLoaded', () => {
    console.log('English Exam Assistant v2.7.6 initialized (Robust Data Parsing)');
    
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
        styleProfileDisplay.innerHTML = `✨ <strong>학습된 멀티 패턴 가이드:</strong><br>${examStyleProfile.substring(0, 150)}...`;
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
        if (droppedFiles.length === 0) return alert('참고할 이미지를 추가해주세요.');
        if (!currentApiKey) return alert('API 키를 설정해주세요.');

        analyzeStyleBtn.disabled = true;
        analyzeStyleBtn.textContent = '패턴 분석 중...';

        const imageContents = droppedFiles.map(dataUrl => ({
            type: "image_url",
            image_url: { url: dataUrl }
        }));

        let success = false;
        for (const modelId of VISION_MODELS) {
            try {
                const response = await fetch(API_URL, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${currentApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: modelId,
                        messages: [{
                            role: "user",
                            content: [
                                { type: "text", text: "이 이미지의 영어 문제 형태와 출제 기법을 분석해서 종합 가이드를 작성해줘." },
                                ...imageContents
                            ]
                        }]
                    })
                });

                const responseData = await response.json();
                if (response.ok) {
                    const analysis = responseData.choices[0].message.content;
                    localStorage.setItem('exam_style_profile', analysis);
                    examStyleProfile = analysis;
                    styleProfileDisplay.style.display = 'block';
                    styleProfileDisplay.innerHTML = `✨ <strong>학습 완료:</strong><br>${analysis.substring(0, 300)}...`;
                    alert('패턴 학습이 완료되었습니다!');
                    success = true;
                    break; 
                }
            } catch (err) { console.error(err); }
        }

        if (!success) alert('이미지 분석에 실패했습니다. 모델 가용성이나 API 키를 확인해주세요.');
        analyzeStyleBtn.disabled = false;
        analyzeStyleBtn.textContent = '추가된 모든 패턴 학습하기';
    });

    async function generateWithAI(prompt) {
        if (!currentApiKey) throw new Error('API 키를 먼저 설정해주세요!');
        const systemMessage = `당신은 영어 내신 시험 출제 전문가입니다.
        ${examStyleProfile ? `\n[학습된 가이드]:\n${examStyleProfile}` : ''}
        ### 원칙: 
        1. 반드시 JSON 배열 형식을 출력하십시오. 예: [{"type": "...", "question": "...", "options": ["①...", "②...", "③...", "④...", "⑤..."], "answer": "①", "passage_context": "..."}]
        2. 다른 텍스트 설명 없이 순수 JSON 배열만 응답하십시오.`;

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${currentApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: MODEL_NAME,
                messages: [
                    { role: "system", content: systemMessage },
                    { role: "user", content: prompt }
                ],
                temperature: 0.3,
                response_format: { type: "json_object" }
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || '생성 실패');
        
        let content = data.choices[0].message.content;
        console.log("Raw AI Content:", content);

        try {
            const parsed = JSON.parse(content);
            // 배열 추출 로직 강화
            let questions = [];
            if (Array.isArray(parsed)) {
                questions = parsed;
            } else if (parsed.questions && Array.isArray(parsed.questions)) {
                questions = parsed.questions;
            } else if (parsed.data && Array.isArray(parsed.data)) {
                questions = parsed.data;
            } else {
                // 객체 내부의 첫 번째 배열을 찾음
                const firstArray = Object.values(parsed).find(val => Array.isArray(val));
                if (firstArray) questions = firstArray;
            }

            if (questions.length === 0) throw new Error("문제 배열을 찾을 수 없습니다.");
            return questions;
        } catch (e) {
            console.error("Parsing Error:", e);
            throw new Error("AI 응답 형식이 올바르지 않습니다. 다시 시도해주세요.");
        }
    }

    function renderQuestions(questions) {
        generatedQuestionsContainer.innerHTML = '';
        
        if (!Array.isArray(questions)) {
            console.error("Expected array but got:", questions);
            generatedQuestionsContainer.innerHTML = '<p style="color:red">데이터 형식 오류: 생성된 결과가 배열이 아닙니다.</p>';
            return;
        }

        questions.forEach((q, index) => {
            const qDiv = document.createElement('div');
            qDiv.className = 'question-item';
            qDiv.innerHTML = `
                <div style="margin-bottom: 10px;">
                    <span class="badge" style="background: #3498db; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.75em; margin-right: 5px;">${q.type || '내신'}</span>
                </div>
                <button class="add-save-btn">담기</button>
                <div class="passage-box" style="background: #fdfefe; padding: 15px; border-radius: 6px; border: 1px dashed #3498db; margin: 10px 0; font-size: 0.95em; line-height: 1.7;">
                    ${q.passage_context || '지문 없음'}
                </div>
                <span class="question-text" style="font-weight: bold; display: block; margin: 15px 0;">${index + 1}. ${q.question}</span>
                <ul class="options-list" style="list-style: none; padding-left: 0;">
                    ${(q.options || []).map(opt => `<li style="margin-bottom: 8px; padding: 8px; border: 1px solid #eee; border-radius: 4px;">${opt}</li>`).join('')}
                </ul>
                <details style="margin-top: 20px; font-size: 0.85em; color: #27ae60; background: #f0fff4; padding: 12px; border-radius: 6px;">
                    <summary style="cursor: pointer; font-weight: bold;">정답 확인</summary>
                    <p style="margin-top: 10px;"><strong>정답: ${q.answer}</strong></p>
                </details>
            `;
            qDiv.querySelector('button').onclick = () => {
                if (savedQuestions.some(sq => sq.question === q.question)) return alert('이미 담은 문제입니다.');
                savedQuestions.push(q);
                updateSavedListUI();
            };
            generatedQuestionsContainer.appendChild(qDiv);
        });
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
                <span class="question-text">${index + 1}. ${q.question}</span>
            `;
            qDiv.querySelector('button').onclick = () => {
                savedQuestions.splice(index, 1);
                updateSavedListUI();
            };
            savedQuestionsList.appendChild(qDiv);
        });
    }

    function showLoading(btn, isLoading) {
        btn.disabled = isLoading;
        btn.textContent = isLoading ? '처리 중...' : btn.dataset.oldText || btn.textContent;
        if (isLoading) btn.dataset.oldText = btn.textContent;
    }

    document.getElementById('generate-prediction').addEventListener('click', async (e) => {
        const text = document.getElementById('reading-material').value;
        if (!text.trim()) return alert('지문을 입력하세요.');
        showLoading(e.target, true);
        try {
            const level = document.getElementById('predict-level').value;
            const count = document.getElementById('predict-count').value;
            const questions = await generateWithAI(`다음 지문을 바탕으로 ${level} 난이도 문제 ${count}개를 출제하십시오.\n지문:\n${text}`);
            renderQuestions(questions);
        } catch (err) { alert('오류: ' + err.message); } finally { showLoading(e.target, false); }
    });

    document.getElementById('generate-bank').addEventListener('click', async (e) => {
        showLoading(e.target, true);
        try {
            const topic = document.getElementById('topic-select').value;
            const level = document.getElementById('level-select').value;
            const count = document.getElementById('question-count').value;
            const questions = await generateWithAI(`Generate ${count} English exam questions about ${topic} for ${level} level.`);
            renderQuestions(questions);
        } catch (err) { alert('오류: ' + err.message); } finally { showLoading(e.target, false); }
    });

    document.getElementById('export-pdf').onclick = async () => {
        if (!savedQuestions.length) return;
        const canvas = await html2canvas(document.getElementById('pdf-export-area'), { scale: 2 });
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, (canvas.height * 210) / canvas.width);
        pdf.save('english_test.pdf');
    };

    document.getElementById('clear-saved').onclick = () => { if (confirm('비울까요?')) { savedQuestions = []; updateSavedListUI(); } };

    if (localStorage.getItem('theme') === 'dark') body.classList.add('dark-mode');
    themeToggle.addEventListener('click', () => {
        body.classList.toggle('dark-mode');
        localStorage.setItem('theme', body.classList.contains('dark-mode') ? 'dark' : 'light');
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.getAttribute('data-tab')).classList.add('active');
        });
    });
});