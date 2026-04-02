document.addEventListener('DOMContentLoaded', () => {
    console.log('English Exam Assistant v2.3.2 initialized (Groq API)');
    
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
                            content: `당신은 한국 중학교와 고등학교의 영어 내신 시험 출제 위원입니다. 
                            사용자가 제공한 지문을 바탕으로 다음의 규칙에 따라 엄격하게 문제를 생성하십시오:
                            
                            1. **형식**: 반드시 JSON 배열 형식으로만 응답하십시오.
                            2. **구조**: 각 객체는 'type', 'question', 'options', 'answer', 'level' 키를 가져야 합니다.
                            3. **유형**: 주제 찾기, 빈칸 추론, 어법 판단, 어휘 쓰임, 내용 일치, 문장 삽입, 글의 순서 등 내신 빈출 유형을 고르게 섞으십시오.
                            4. **언어**: 질문(question)은 한글로 작성하십시오. 보기(options)는 유형에 따라 영어 또는 한글로 작성하되, 번호는 ①, ②, ③, ④, ⑤ 기호를 사용하십시오.
                            5. **퀄리티**: 단순 사실 확인이 아니라, 지문의 문법적 특징이나 단어의 문맥상 의미를 묻는 고난도 문제를 포함하십시오.`
                        },
                        {
                            role: "user",
                            content: prompt
                        }
                    ],
                    temperature: 0.6,
                    response_format: { type: "json_object" }
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'API 요청 실패');
            }

            const data = await response.json();
            const content = data.choices[0].message.content;
            const parsed = JSON.parse(content);
            
            let questions = Array.isArray(parsed) ? parsed : (parsed.questions || parsed.data || Object.values(parsed)[0]);
            if (!Array.isArray(questions)) throw new Error("유효한 문제 배열을 찾을 수 없습니다.");
            return questions;
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
        questions.forEach((q, index) => {
            const qDiv = document.createElement('div');
            qDiv.className = 'question-item';
            qDiv.innerHTML = `
                <div style="margin-bottom: 10px;">
                    <span class="badge" style="background: #3498db; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.75em; margin-right: 5px;">${q.type || '일반'}</span>
                    <span class="badge" style="background: #95a5a6; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.75em;">난이도: ${q.level || 'medium'}</span>
                </div>
                <button class="add-save-btn">담기</button>
                <span class="question-text">${index + 1}. ${q.question}</span>
                <ul class="options-list">
                    ${q.options.map(opt => `<li>${opt}</li>`).join('')}
                </ul>
                <details style="margin-top: 10px; font-size: 0.85em; color: #27ae60;">
                    <summary style="cursor: pointer;">정답 확인</summary>
                    <p style="margin-top: 5px; font-weight: bold;">정답: ${q.answer}</p>
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
            btn.textContent = 'AI 분석 및 출제 중...';
        } else {
            btn.disabled = false;
            btn.textContent = btn.dataset.oldText;
        }
    }

    document.getElementById('generate-prediction').addEventListener('click', async (e) => {
        const text = document.getElementById('reading-material').value;
        const level = document.getElementById('predict-level').value;
        const count = document.getElementById('predict-count').value;
        
        if (!text.trim()) return alert('지문을 입력하세요.');
        
        showLoading(e.target, true);
        try {
            const prompt = `다음 영어 지문을 바탕으로 ${level} 난이도의 중/고등학교 내신 시험 문제 ${count}개를 출제하십시오. 
            단순 내용 확인보다는 어법, 어휘, 빈칸, 논리적 흐름(순서/삽입) 위주로 다양하게 구성하십시오. 
            반드시 JSON 배열 형식으로 출력하십시오.
            
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
            const prompt = `Generate ${count} typical school exam questions about ${topic} for ${level} level. 
            Include grammar, vocabulary, and logic patterns common in Korean English tests.
            Return as a JSON array.`;
            
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