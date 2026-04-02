document.addEventListener('DOMContentLoaded', () => {
    console.log('English Exam Assistant v2.3.0 initialized (Groq API)');
    
    // 기본 설정 (Groq API)
    const DEFAULT_KEY = ''; 
    const MODEL_NAME = 'llama-3.1-8b-instant';
    const API_URL = 'https://api.groq.com/openai/v1/chat/completions';

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
    let currentApiKey = localStorage.getItem('groq_api_key') || DEFAULT_KEY;
    apiKeyInput.value = currentApiKey === DEFAULT_KEY ? '' : currentApiKey;

    saveKeyBtn.addEventListener('click', () => {
        const newKey = apiKeyInput.value.trim();
        if (newKey) {
            localStorage.setItem('groq_api_key', newKey);
            currentApiKey = newKey;
            alert('Groq API 키가 저장되었습니다. 이제 문제를 생성해보세요!');
        } else {
            localStorage.removeItem('groq_api_key');
            currentApiKey = DEFAULT_KEY;
            alert('기본 설정으로 재설정되었습니다.');
        }
    });

    // 2. AI 호출 함수 (Groq / OpenAI 호환)
    async function generateWithAI(prompt) {
        if (!currentApiKey) {
            throw new Error('API 키를 먼저 설정해주세요!');
        }

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
                        {
                            role: "system",
                            content: "You are a helpful English teacher. You MUST respond with a valid JSON array of objects. Each object must have 'question' (string), 'options' (array of 5 strings starting with ①, ②, ③, ④, ⑤), and 'answer' (string, e.g., '①')."
                        },
                        {
                            role: "user",
                            content: prompt
                        }
                    ],
                    temperature: 0.7,
                    response_format: { type: "json_object" }
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'API 요청 실패');
            }

            const data = await response.json();
            const content = data.choices[0].message.content;
            
            // Groq may return the array wrapped in an object if response_format is json_object
            const parsed = JSON.parse(content);
            return Array.isArray(parsed) ? parsed : (parsed.questions || Object.values(parsed)[0]);
        } catch (err) {
            console.error('API Error:', err);
            throw err;
        }
    }

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
        if (!Array.isArray(questions)) {
            throw new Error("AI가 유효한 문제 형식을 생성하지 못했습니다.");
        }
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
            const prompt = `영어 시험 출제 위원으로서 다음 지문을 바탕으로 중학교 수준 예상 문제 5개를 만드세요. 반드시 JSON 배열 형식으로만 응답하세요. \n\n지문:\n${text}`;
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
            const prompt = `Generate ${count} English exam questions about ${topic} for ${level} level in JSON array format. Questions in Korean, options in English.`;
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
});