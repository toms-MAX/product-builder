document.addEventListener('DOMContentLoaded', () => {
    console.log('English Exam Assistant v2.2.1 initialized');
    
    // 기본 키 (사용자 제공)
    const DEFAULT_KEY = 'AIzaSyBTGGx3JaeGbgVMiOhb3PpjXXXTZMiulTQ';
    const MODEL_NAME = 'gemini-1.5-flash';

    // Elements
    const apiKeyInput = document.getElementById('api-key-input');
    const saveKeyBtn = document.getElementById('save-key-btn');
    const themeToggle = document.getElementById('theme-toggle');
    const body = document.body;
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const savedCountBadge = document.getElementById('saved-count');
    const savedQuestionsList = document.getElementById('saved-questions-list');
    const generatedQuestionsContainer = document.getElementById('generated-questions');
    const resultArea = document.getElementById('result-container');

    let savedQuestions = [];

    // 1. API 키 로드 로직
    let currentApiKey = localStorage.getItem('gemini_api_key') || DEFAULT_KEY;
    apiKeyInput.value = currentApiKey === DEFAULT_KEY ? '' : currentApiKey;

    saveKeyBtn.addEventListener('click', () => {
        const newKey = apiKeyInput.value.trim();
        if (newKey) {
            localStorage.setItem('gemini_api_key', newKey);
            currentApiKey = newKey;
            alert('API 키가 저장되었습니다. 이제 문제를 생성해보세요!');
        } else {
            localStorage.removeItem('gemini_api_key');
            currentApiKey = DEFAULT_KEY;
            alert('기본 API 키로 재설정되었습니다.');
        }
    });

    // 2. AI 호출 함수 (최신 v1 엔드포인트)
    async function generateWithGemini(prompt) {
        const API_URL = `https://generativelanguage.googleapis.com/v1/models/${MODEL_NAME}:generateContent?key=${currentApiKey}`;
        
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
                })
            });

            const data = await response.json();
            
            if (data.error) {
                console.error('API Error:', data.error);
                let errorMsg = data.error.message;
                if (errorMsg.includes('not found')) {
                    errorMsg = "모델을 찾을 수 없습니다. API 키가 최신 Gemini 모델(1.5 Flash)을 지원하지 않는 프로젝트의 키일 수 있습니다. Google AI Studio에서 새 키를 발급받으세요.";
                } else if (errorMsg.includes('API key')) {
                    errorMsg = "API 키가 올바르지 않거나 권한이 없습니다.";
                }
                throw new Error(errorMsg);
            }
            
            const resultText = data.candidates[0].content.parts[0].text;
            const startIdx = resultText.indexOf('[');
            const endIdx = resultText.lastIndexOf(']');
            if (startIdx === -1 || endIdx === -1) throw new Error("AI가 올바른 형식을 생성하지 못했습니다. 다시 시도해주세요.");
            
            return JSON.parse(resultText.substring(startIdx, endIdx + 1));
        } catch (err) {
            throw err;
        }
    }

    // --- 이하 기존 UI 로직 (유지) ---

    // Theme
    if (localStorage.getItem('theme') === 'dark') body.classList.add('dark-mode');
    themeToggle.addEventListener('click', () => {
        body.classList.toggle('dark-mode');
        localStorage.setItem('theme', body.classList.contains('dark-mode') ? 'dark' : 'light');
    });

    // Tabs
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });

    function renderQuestions(questions) {
        generatedQuestionsContainer.innerHTML = '';
        questions.forEach((q, index) => {
            const qDiv = document.createElement('div');
            qDiv.className = 'question-item';
            qDiv.innerHTML = `
                <button class="add-save-btn">담기</button>
                <span class="question-text">${index + 1}. ${q.question}</span>
                <ul class="options-list">
                    ${q.options.map(opt => `<li>${opt}</li>`).join('')}
                </ul>
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
                <ul class="options-list">
                    ${q.options.map(opt => `<li>${opt}</li>`).join('')}
                </ul>
            `;
            qDiv.querySelector('button').onclick = () => {
                savedQuestions.splice(index, 1);
                updateSavedListUI();
            };
            savedQuestionsList.appendChild(qDiv);
        });
    }

    function showLoading(btn, isLoading) {
        if (isLoading) {
            btn.disabled = true;
            btn.dataset.oldText = btn.textContent;
            btn.textContent = 'AI 생성 중...';
        } else {
            btn.disabled = false;
            btn.textContent = btn.dataset.oldText;
        }
    }

    document.getElementById('generate-prediction').addEventListener('click', async (e) => {
        const text = document.getElementById('reading-material').value;
        if (!text.trim()) return alert('지문을 입력하세요.');
        showLoading(e.target, true);
        try {
            const prompt = `영어 시험 출제 위원으로서 다음 지문을 바탕으로 중학교 수준 예상 문제 5개를 JSON 배열로 만드세요. [{"question":"문항","options":["①..","②..","③..","④..","⑤.."],"answer":"①"}] \n\n지문:\n${text}`;
            const questions = await generateWithGemini(prompt);
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
            const prompt = `Generate ${count} English exam questions about ${topic} for ${level} level in JSON array format. Questions in Korean, options in English.`;
            const questions = await generateWithGemini(prompt);
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
});
