document.addEventListener('DOMContentLoaded', () => {
    console.log('English Exam Assistant v2.5.0 initialized (Vision & Context)');
    
    const DEFAULT_KEY = ''; 
    const MODEL_NAME = 'llama-3.1-8b-instant';
    const VISION_MODEL = 'llama-3.2-11b-vision-preview';
    const API_URL = 'https://api.groq.com/openai/v1/chat/completions';

    const apiKeyInput = document.getElementById('api-key-input');
    const saveKeyBtn = document.getElementById('save-key-btn');
    const examImageInput = document.getElementById('exam-image-input');
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
    let currentApiKey = localStorage.getItem('groq_api_key') || DEFAULT_KEY;
    let examStyleProfile = localStorage.getItem('exam_style_profile') || '';

    if (examStyleProfile) styleProfileDisplay.style.display = 'block';
    apiKeyInput.value = currentApiKey === DEFAULT_KEY ? '' : currentApiKey;

    saveKeyBtn.addEventListener('click', () => {
        const newKey = apiKeyInput.value.trim();
        if (newKey) {
            localStorage.setItem('groq_api_key', newKey);
            currentApiKey = newKey;
            alert('API 키가 저장되었습니다.');
        }
    });

    // 1. 이미지 스타일 분석 기능 (Vision)
    analyzeStyleBtn.addEventListener('click', async () => {
        const file = examImageInput.files[0];
        if (!file) return alert('분석할 시험지 이미지를 선택해주세요.');
        if (!currentApiKey) return alert('API 키를 먼저 설정해주세요.');

        analyzeStyleBtn.disabled = true;
        analyzeStyleBtn.textContent = '이미지 분석 중...';

        try {
            const base64Image = await toBase64(file);
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
                                { type: "text", text: "이 시험지 이미지에서 사용된 문제 유형(어법, 빈칸 등), 보기 형식, 질문의 말투, 난이도 특징을 분석하여 핵심 요약만 한국어로 적어줘. 이 내용은 나중에 비슷한 문제를 출제하는 데 사용될 거야." },
                                { type: "image_url", image_url: { url: base64Image } }
                            ]
                        }
                    ]
                })
            });

            if (!response.ok) throw new Error('Vision API 요청 실패');
            const data = await response.json();
            const analysis = data.choices[0].message.content;
            
            localStorage.setItem('exam_style_profile', analysis);
            examStyleProfile = analysis;
            styleProfileDisplay.style.display = 'block';
            alert('시험지 스타일 학습 완료! 이제 생성되는 문제에 이 스타일이 반영됩니다.');
        } catch (err) {
            alert('분석 실패: ' + err.message);
        } finally {
            analyzeStyleBtn.disabled = false;
            analyzeStyleBtn.textContent = '이미지에서 출제 유형 학습하기';
        }
    });

    async function generateWithAI(prompt) {
        if (!currentApiKey) throw new Error('API 키를 먼저 설정해주세요!');

        const systemMessage = `당신은 대한민국 최고의 영어 내신 시험 출제 전문가입니다.
        ${examStyleProfile ? `\n[학습된 출제 스타일]:\n${examStyleProfile}` : ''}
        
        ### 출제 원칙
        1. **지문 동시 제공 (필수)**: 각 문제마다 해당 문제를 풀기 위해 필요한 지문 영역을 'passage_context' 필드에 반드시 포함하십시오.
        2. **지문 변형**: 문장 삽입이나 어법 문제는 지문 내에 [1]~[5] 또는 ⓐ~ⓔ 표시를 넣은 변형된 지문을 제공하십시오.
        3. **5지선다**: 모든 문제는 반드시 ①~⑤ 보기를 가져야 합니다.
        4. **검토**: 문제에 논리적 오류가 없는지, 정답이 명확한지 자가 검토 후 최종 JSON을 출력하십시오.`;

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
                    temperature: 0.4,
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
                    <span class="badge" style="background: #3498db; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.75em; margin-right: 5px;">${q.type || '내신'}</span>
                    <span class="badge" style="background: #2ecc71; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.75em;">지문 포함</span>
                </div>
                <button class="add-save-btn">담기</button>
                
                <div class="passage-box" style="background: #f8f9fa; padding: 12px; border-radius: 6px; border-left: 4px solid #3498db; margin: 10px 0; font-size: 0.9em; line-height: 1.6;">
                    ${q.passage_context || '지문 정보가 없습니다.'}
                </div>

                <span class="question-text" style="font-weight: bold; display: block; margin: 10px 0;">${index + 1}. ${q.question}</span>
                
                <ul class="options-list">
                    ${q.options.map(opt => `<li>${opt}</li>`).join('')}
                </ul>
                
                <details style="margin-top: 15px; font-size: 0.85em; color: #27ae60; background: #f0fff4; padding: 8px; border-radius: 4px;">
                    <summary style="cursor: pointer; font-weight: bold;">정답 및 해설</summary>
                    <p style="margin-top: 5px;"><strong>정답: ${q.answer}</strong></p>
                    <p style="color: #666; font-size: 0.9em;">${q.explanation || '해당 문제는 학습된 스타일을 바탕으로 정밀하게 출제되었습니다.'}</p>
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

    // 유틸리티: 이미지를 Base64로 변환
    function toBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    }

    // --- 기존 UI 로직 유지 ---
    function updateSavedListUI() {
        savedCountBadge.textContent = savedQuestions.length;
        savedQuestionsList.innerHTML = savedQuestions.length ? '' : '<p class="empty-msg">아직 담은 문제가 없습니다.</p>';
        savedQuestions.forEach((q, index) => {
            const qDiv = document.createElement('div');
            qDiv.className = 'question-item';
            qDiv.innerHTML = `
                <button class="add-save-btn" style="background:#e74c3c">삭제</button>
                <div class="passage-box" style="font-size: 0.8em; color: #666; max-height: 60px; overflow: hidden; margin-bottom: 5px;">${q.passage_context || ''}</div>
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
        btn.textContent = isLoading ? 'AI 분석 및 출제 중...' : btn.dataset.oldText || btn.textContent;
        if (isLoading) btn.dataset.oldText = btn.textContent;
    }

    document.getElementById('generate-prediction').addEventListener('click', async (e) => {
        const text = document.getElementById('reading-material').value;
        const level = document.getElementById('predict-level').value;
        const count = document.getElementById('predict-count').value;
        if (!text.trim()) return alert('지문을 입력하세요.');
        
        showLoading(e.target, true);
        try {
            const prompt = `다음 지문을 분석하여 ${level} 난이도의 내신 문제 ${count}개를 출제하세요. 
            반드시 각 문제마다 'passage_context' 필드에 해당 문제 풀이에 필요한 지문을 포함하고, 5지선다 형식을 유지하세요.
            
            지문:
            ${text}`;
            const questions = await generateWithAI(prompt);
            renderQuestions(questions);
        } catch (err) {
            alert('오류: ' + err.message);
        } finally {
            showLoading(e.target, false);
        }
    });

    document.getElementById('generate-bank').addEventListener('click', async (e) => {
        showLoading(e.target, true);
        try {
            const topic = document.getElementById('topic-select').value;
            const level = document.getElementById('level-select').value;
            const count = document.getElementById('question-count').value;
            const prompt = `Generate ${count} English exam questions about ${topic} for ${level} level. 5 options each.`;
            const questions = await generateWithAI(prompt);
            renderQuestions(questions);
        } catch (err) {
            alert('오류: ' + err.message);
        } finally {
            showLoading(e.target, false);
        }
    });

    document.getElementById('export-pdf').onclick = async () => {
        if (!savedQuestions.length) return;
        const canvas = await html2canvas(document.getElementById('pdf-export-area'), { scale: 2 });
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, (canvas.height * 210) / canvas.width);
        pdf.save('english_test.pdf');
    };

    document.getElementById('clear-saved').onclick = () => {
        if (confirm('비울까요?')) { savedQuestions = []; updateSavedListUI(); }
    };

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