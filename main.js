document.addEventListener('DOMContentLoaded', () => {
    console.log('English Exam Assistant v2.1.0 initialized');
    
    // ==========================================
    // 설정: 오류 발생 시 아래 API 키를 새로 발급받아 교체하세요.
    // 발급처: https://aistudio.google.com/app/apikey
    // ==========================================
    const GEMINI_API_KEY = 'AIzaSyCCdebA15oPSS5zKy49PSybrCvVSfmdZ24';
    const MODEL_NAME = 'gemini-1.5-flash';
    const API_URL = `https://generativelanguage.googleapis.com/v1/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`;

    // Elements
    const themeToggle = document.getElementById('theme-toggle');
    const body = document.body;
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const savedCountBadge = document.getElementById('saved-count');
    const savedQuestionsList = document.getElementById('saved-questions-list');
    const generatedQuestionsContainer = document.getElementById('generated-questions');
    const exportPdfBtn = document.getElementById('export-pdf');
    const clearSavedBtn = document.getElementById('clear-saved');
    const resultArea = document.getElementById('result-container');

    let savedQuestions = [];

    // AI Question Generation Helper (v1 Only)
    async function generateWithGemini(prompt) {
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 2048
                    }
                })
            });

            const data = await response.json();
            
            if (data.error) {
                console.error('API Error Detailed:', data.error);
                let userMsg = data.error.message;
                if (userMsg.includes('not found') || userMsg.includes('API key')) {
                    userMsg = "API 키가 만료되었거나 모델 권한이 없습니다. Google AI Studio에서 새 키를 발급받아 교체해주세요.";
                }
                throw new Error(userMsg);
            }
            
            if (!data.candidates || data.candidates.length === 0) {
                throw new Error("AI가 응답을 생성하지 못했습니다. 다시 시도해주세요.");
            }

            let resultText = data.candidates[0].content.parts[0].text;
            
            // Robust JSON extraction
            const startIdx = resultText.indexOf('[');
            const endIdx = resultText.lastIndexOf(']');
            if (startIdx !== -1 && endIdx !== -1) {
                resultText = resultText.substring(startIdx, endIdx + 1);
            }
            
            return JSON.parse(resultText);
        } catch (err) {
            console.error('Gemini Execution Error:', err);
            throw err;
        }
    }

    // Theme logic
    const currentTheme = localStorage.getItem('theme');
    if (currentTheme === 'dark') body.classList.add('dark-mode');

    themeToggle.addEventListener('click', () => {
        body.classList.toggle('dark-mode');
        localStorage.setItem('theme', body.classList.contains('dark-mode') ? 'dark' : 'light');
    });

    // Tab switching
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });

    // Render Questions
    function renderQuestions(questions) {
        generatedQuestionsContainer.innerHTML = '';
        if (!questions || questions.length === 0) {
            generatedQuestionsContainer.innerHTML = '<p>문제를 불러오지 못했습니다.</p>';
            return;
        }

        questions.forEach((q, index) => {
            const qDiv = document.createElement('div');
            qDiv.className = 'question-item';
            
            const addBtn = document.createElement('button');
            addBtn.className = 'add-save-btn';
            addBtn.textContent = '담기';
            addBtn.onclick = () => {
                if (savedQuestions.some(sq => sq.question === q.question)) {
                    alert('이미 담은 문제입니다.');
                    return;
                }
                savedQuestions.push(q);
                updateSavedListUI();
            };

            const qText = document.createElement('span');
            qText.className = 'question-text';
            qText.textContent = `${index + 1}. ${q.question}`;

            qDiv.appendChild(addBtn);
            qDiv.appendChild(qText);

            if (q.options) {
                const oList = document.createElement('ul');
                oList.className = 'options-list';
                q.options.forEach(opt => {
                    const li = document.createElement('li');
                    li.textContent = opt;
                    oList.appendChild(li);
                });
                qDiv.appendChild(oList);
            }
            generatedQuestionsContainer.appendChild(qDiv);
        });
        resultArea.scrollIntoView({ behavior: 'smooth' });
    }

    function updateSavedListUI() {
        savedCountBadge.textContent = savedQuestions.length;
        savedQuestionsList.innerHTML = '';
        if (savedQuestions.length === 0) {
            savedQuestionsList.innerHTML = '<p class="empty-msg">아직 담은 문제가 없습니다.</p>';
            return;
        }
        savedQuestions.forEach((q, index) => {
            const qDiv = document.createElement('div');
            qDiv.className = 'question-item';
            const delBtn = document.createElement('button');
            delBtn.className = 'add-save-btn';
            delBtn.textContent = '삭제';
            delBtn.style.backgroundColor = '#e74c3c';
            delBtn.onclick = () => {
                savedQuestions.splice(index, 1);
                updateSavedListUI();
            };
            const qText = document.createElement('span');
            qText.className = 'question-text';
            qText.textContent = `${index + 1}. ${q.question}`;
            qDiv.appendChild(delBtn);
            qDiv.appendChild(qText);
            if (q.options) {
                const oList = document.createElement('ul');
                oList.className = 'options-list';
                q.options.forEach(opt => {
                    const li = document.createElement('li');
                    li.textContent = opt;
                    oList.appendChild(li);
                });
                qDiv.appendChild(oList);
            }
            savedQuestionsList.appendChild(qDiv);
        });
    }

    function showLoading(btn, isLoading) {
        if (isLoading) {
            btn.disabled = true;
            btn.dataset.oldText = btn.textContent;
            btn.textContent = 'AI 문제 생성 중...';
        } else {
            btn.disabled = false;
            btn.textContent = btn.dataset.oldText;
        }
    }

    // Prediction Feature
    document.getElementById('generate-prediction').addEventListener('click', async (e) => {
        const text = document.getElementById('reading-material').value;
        const level = document.getElementById('predict-level').value;
        const count = document.getElementById('predict-count').value;

        if (!text.trim()) { alert('지문을 입력하세요.'); return; }

        showLoading(e.target, true);
        try {
            const prompt = `당신은 영어 시험 출제 위원입니다. 다음 지문을 바탕으로 ${level} 난이도의 영어 기출 예상 문제 ${count}개를 JSON 배열로 만드세요. 지문 내용은 영어로, 질문과 해설은 한국어로 작성하세요. [{"question": "...", "options": ["①...", "②...", "③...", "④...", "⑤..."], "answer": "..."}] \n\n지문:\n${text.replace(/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/g, '')}`;
            const questions = await generateWithGemini(prompt);
            renderQuestions(questions);
        } catch (err) {
            alert('오류 발생: ' + err.message);
        } finally {
            showLoading(e.target, false);
        }
    });

    // Simple Bank Feature
    document.getElementById('generate-bank').addEventListener('click', async (e) => {
        const level = document.getElementById('level-select').value;
        const topic = document.getElementById('topic-select').value;
        const count = document.getElementById('question-count').value;

        showLoading(e.target, true);
        try {
            const prompt = `Generate ${count} English exam questions about ${topic} for middle school students (${level} level) in JSON array format. Questions in Korean, options in English.`;
            const questions = await generateWithGemini(prompt);
            renderQuestions(questions);
        } catch (err) {
            alert('오류 발생: ' + err.message);
        } finally {
            showLoading(e.target, false);
        }
    });

    // PDF Export
    exportPdfBtn.addEventListener('click', async () => {
        if (savedQuestions.length === 0) return;
        const element = document.getElementById('pdf-export-area');
        const canvas = await html2canvas(element, { scale: 2 });
        const imgData = canvas.toDataURL('image/png');
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save('english_test.pdf');
    });

    clearSavedBtn.addEventListener('click', () => {
        if (confirm('담은 문제를 모두 비울까요?')) {
            savedQuestions = [];
            updateSavedListUI();
        }
    });
});
