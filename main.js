document.addEventListener('DOMContentLoaded', () => {
    console.log('English Exam Assistant v2.7.1 initialized (Auto-Optimization)');
    
    const DEFAULT_KEY = ''; 
    const MODEL_NAME = 'llama-3.1-8b-instant';
    const VISION_MODEL = 'llama-3.2-11b-vision-preview';
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

    // 1. 이미지 최적화 (Resize & Compress)
    async function optimizeImage(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 1280; // 고화질 유지하면서 용량 최적화
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

                    // JPEG로 압축 (품질 0.8)
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                    resolve(dataUrl);
                };
            };
        });
    }

    // 드래그 앤 드롭 & 붙여넣기 로직
    dropZone.addEventListener('click', () => examImageInput.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); handleFiles(e.dataTransfer.files); });
    examImageInput.addEventListener('change', (e) => handleFiles(e.target.files));

    window.addEventListener('paste', (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        const files = [];
        for (const item of items) {
            if (item.type.indexOf('image') !== -1) files.push(item.getAsFile());
        }
        if (files.length > 0) handleFiles(files);
    });

    async function handleFiles(files) {
        for (const file of files) {
            if (file.type.startsWith('image/')) {
                const optimizedDataUrl = await optimizeImage(file);
                droppedFiles.push(optimizedDataUrl); // 최적화된 DataURL 바로 저장
            }
        }
        updatePreview();
    }

    function updatePreview() {
        previewContainer.innerHTML = '';
        droppedFiles.forEach((dataUrl, index) => {
            const item = document.createElement('div');
            item.className = 'file-item';
            item.innerHTML = `
                <img src="${dataUrl}">
                <button class="remove-btn">×</button>
            `;
            item.querySelector('.remove-btn').onclick = (ev) => {
                ev.stopPropagation();
                droppedFiles.splice(index, 1);
                updatePreview();
            };
            previewContainer.appendChild(item);
        });
    }

    // 2. 다중 이미지 패턴 학습 기능 (최적화 반영)
    analyzeStyleBtn.addEventListener('click', async () => {
        if (droppedFiles.length === 0) return alert('참고할 문제 이미지를 추가해주세요.');
        if (!currentApiKey) return alert('API 키를 먼저 설정해주세요.');

        analyzeStyleBtn.disabled = true;
        analyzeStyleBtn.textContent = `${droppedFiles.length}개의 이미지 분석 중...`;

        try {
            const imageContents = droppedFiles.map(dataUrl => ({
                type: "image_url",
                image_url: { url: dataUrl }
            }));

            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${currentApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: VISION_MODEL,
                    messages: [
                        {
                            role: "user",
                            content: [
                                { type: "text", text: "제공된 모든 이미지에 있는 영어 문제들을 분석해줘. 각 이미지의 문제 형태와 출제 기법을 모두 추출해서 나중에 다른 지문을 주었을 때 똑같이 낼 수 있게 종합 가이드를 작성해줘." },
                                ...imageContents
                            ]
                        }
                    ]
                })
            });

            const responseData = await response.json();

            if (!response.ok) {
                const errorMsg = responseData.error?.message || 'API 오류';
                throw new Error(errorMsg);
            }

            const analysis = responseData.choices[0].message.content;
            localStorage.setItem('exam_style_profile', analysis);
            examStyleProfile = analysis;
            styleProfileDisplay.style.display = 'block';
            styleProfileDisplay.innerHTML = `✨ <strong>학습된 멀티 패턴 가이드:</strong><br>${analysis}`;
            alert(`${droppedFiles.length}개의 이미지 패턴 학습 완료!`);
        } catch (err) {
            console.error('Vision Error Detail:', err);
            alert('분석 실패: ' + err.message);
        } finally {
            analyzeStyleBtn.disabled = false;
            analyzeStyleBtn.textContent = '추가된 모든 패턴 학습하기';
        }
    });

    async function generateWithAI(prompt) {
        if (!currentApiKey) throw new Error('API 키를 먼저 설정해주세요!');

        const systemMessage = `당신은 대한민국 최고의 영어 내신 시험 출제 전문가입니다.
        ${examStyleProfile ? `\n### 중요: 다음 [학습된 멀티 패턴 가이드]에 포함된 유형들을 적극 활용하여 출제하십시오:\n${examStyleProfile}` : ''}
        
        ### 출제 원칙
        1. **다양한 패턴 복제**: 학습된 가이드에 있는 여러 문제 형태(기호 사용법, 질문 방식 등)를 골고루 섞어 새로운 지문에 적용하십시오.
        2. **지문 동시 제공**: 각 문제마다 풀이에 필요한 변형 지문(passage_context)을 반드시 포함하십시오.
        3. **무오류 검증**: 5지선다 여부, 정답의 유일성, 지문 내 기호 표시 누락 등을 최종 검토하십시오.`;

        try {
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
                    temperature: 0.35,
                    response_format: { type: "json_object" }
                })
            });

            const data = await response.json();
            const content = data.choices[0].message.content;
            const parsed = JSON.parse(content);
            return Array.isArray(parsed) ? parsed : (parsed.questions || parsed.data || Object.values(parsed)[0]);
        } catch (err) {
            console.error('API Error:', err);
            throw err;
        }
    }

    function renderQuestions(questions) {
        generatedQuestionsContainer.innerHTML = '';
        questions.forEach((q, index) => {
            const qDiv = document.createElement('div');
            qDiv.className = 'question-item';
            qDiv.innerHTML = `
                <div style="margin-bottom: 10px;">
                    <span class="badge" style="background: #3498db; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.75em; margin-right: 5px;">${q.type || '커스텀 유형'}</span>
                    <span class="badge" style="background: #e67e22; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.75em;">패턴 복제 적용</span>
                </div>
                <button class="add-save-btn">담기</button>
                <div class="passage-box" style="background: #fdfefe; padding: 15px; border-radius: 6px; border: 1px dashed #3498db; margin: 10px 0; font-size: 0.95em; line-height: 1.7; color: #2c3e50;">
                    ${q.passage_context || '지문 정보가 없습니다.'}
                </div>
                <span class="question-text" style="font-weight: bold; display: block; margin: 15px 0; font-size: 1.05em;">${index + 1}. ${q.question}</span>
                <ul class="options-list" style="list-style: none; padding-left: 0;">
                    ${q.options.map(opt => `<li style="margin-bottom: 8px; padding: 8px; background: #fff; border: 1px solid #eee; border-radius: 4px;">${opt}</li>`).join('')}
                </ul>
                <details style="margin-top: 20px; font-size: 0.85em; color: #27ae60; background: #f0fff4; padding: 12px; border-radius: 6px;">
                    <summary style="cursor: pointer; font-weight: bold;">정답 및 해설</summary>
                    <p style="margin-top: 10px;"><strong>정답: ${q.answer}</strong></p>
                    <p style="color: #666;">${q.explanation || '이미지의 문제 형태를 바탕으로 출제되었습니다.'}</p>
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
        const level = document.getElementById('predict-level').value;
        const count = document.getElementById('predict-count').value;
        if (!text.trim()) return alert('지문을 입력하세요.');
        showLoading(e.target, true);
        try {
            const prompt = `다음 지문을 바탕으로 ${level} 난이도의 문제를 ${count}개 출제하세요. 반드시 학습된 형태를 복제하십시오.\n지문:\n${text}`;
            const questions = await generateWithAI(prompt);
            renderQuestions(questions);
        } catch (err) { alert('오류: ' + err.message); } finally { showLoading(e.target, false); }
    });

    document.getElementById('generate-bank').addEventListener('click', async (e) => {
        showLoading(e.target, true);
        try {
            const topic = document.getElementById('topic-select').value;
            const level = document.getElementById('level-select').value;
            const count = document.getElementById('question-count').value;
            const prompt = `Generate ${count} exam questions about ${topic} for ${level} level. 5 options each.`;
            const questions = await generateWithAI(prompt);
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

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.getAttribute('data-tab')).classList.add('active');
        });
    });
});