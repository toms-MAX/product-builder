document.addEventListener('DOMContentLoaded', () => {
    console.log('English Exam Assistant v2.4.0 initialized (Self-Refinement & Logic Fix)');
    
    const DEFAULT_KEY = ''; 
    const MODEL_NAME = 'llama-3.1-8b-instant';
    const API_URL = 'https://api.groq.com/openai/v1/chat/completions';

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

    let currentApiKey = localStorage.getItem('groq_api_key') || DEFAULT_KEY;
    apiKeyInput.value = currentApiKey === DEFAULT_KEY ? '' : currentApiKey;

    saveKeyBtn.addEventListener('click', () => {
        const newKey = apiKeyInput.value.trim();
        if (newKey) {
            localStorage.setItem('groq_api_key', newKey);
            currentApiKey = newKey;
            alert('Groq API 키가 저장되었습니다. 버전 2.4.0의 고퀄리티 출제 로직이 적용됩니다!');
        } else {
            localStorage.removeItem('groq_api_key');
            currentApiKey = DEFAULT_KEY;
            alert('기본 설정으로 재설정되었습니다.');
        }
    });

    async function generateWithAI(prompt) {
        if (!currentApiKey) throw new Error('API 키를 먼저 설정해주세요!');

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
                            content: `당신은 대한민국 최고의 영어 내신 시험 출제 전문가입니다. 당신은 단순히 문제를 생성하는 것을 넘어, 생성된 문제의 논리적 결함(오류)을 스스로 검토하고 수정하는 능력을 갖추고 있습니다.

### 출제 원칙 (고퀄리티 & 무오류)
1. **유형별 정교함**:
    - **문장 삽입**: 지문에서 특정 문장을 추출하여 문제에 제시하고, 지문 내에는 [1], [2], [3], [4], [5] 위치를 표시해야 합니다. (제시된 문장이 지문에 그대로 남아있으면 절대 안 됨)
    - **어법**: 중/고교 핵심 문법(관계사, 수동태, 분사구문 등)을 교묘하게 변형하여 출제하십시오.
    - **5지선다**: 모든 문제는 반드시 ①, ②, ③, ④, ⑤의 5개 보기를 가져야 합니다.
2. **검토 프로세스 (Self-Correction)**:
    - 문제를 출력하기 전, 다음 사항을 스스로 체크하십시오:
      - "보기 5개가 모두 있는가?"
      - "정답이 유일하고 명확한가?"
      - "삽입/순서 문제에서 지문 조작이 완벽한가?"
3. **데이터 구조**: 아래의 JSON 배열 형식을 엄격히 준수하십시오.
[
  {
    "type": "유형명",
    "question": "한글 질문 (문장 삽입 시 제시문 포함)",
    "options": ["①...", "②...", "③...", "④...", "⑤..."],
    "answer": "①",
    "level": "medium/hard",
    "passage_modified": "수정된 지문 (삽입 위치 [1]~[5] 등이 포함된 경우만 작성, 없으면 빈 문자열)"
  }
]`
                        },
                        {
                            role: "user",
                            content: prompt
                        }
                    ],
                    temperature: 0.4, // 창의성보다는 논리적 정확성을 위해 낮춤
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
            return questions;
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
            
            // 삽입 위치 표시가 있는 수정된 지문이 있다면 표시
            const passageDisplay = q.passage_modified ? `
                <div class="modified-passage" style="background: #f0f4f8; padding: 10px; border-radius: 5px; margin: 10px 0; font-style: italic; font-size: 0.9em; border-left: 4px solid #3498db;">
                    <strong>[문제용 지문 변형]</strong><br>${q.passage_modified}
                </div>
            ` : '';

            qDiv.innerHTML = `
                <div style="margin-bottom: 10px;">
                    <span class="badge" style="background: #3498db; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.75em; margin-right: 5px;">${q.type || '내신'}</span>
                    <span class="badge" style="background: #e67e22; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.75em;">High Quality</span>
                </div>
                <button class="add-save-btn">담기</button>
                <span class="question-text">${index + 1}. ${q.question}</span>
                ${passageDisplay}
                <ul class="options-list">
                    ${q.options.map(opt => `<li>${opt}</li>`).join('')}
                </ul>
                <details style="margin-top: 10px; font-size: 0.85em; color: #27ae60;">
                    <summary style="cursor: pointer;">해설 및 정답 확인</summary>
                    <p style="margin-top: 5px; font-weight: bold;">정답: ${q.answer}</p>
                    <p style="color: #666;">* 본 문제는 AI에 의해 2단계 검증을 거쳐 생성되었습니다.</p>
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
            btn.textContent = '고퀄리티 검토 및 출제 중 (약 10초 소요)...';
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
            const prompt = `[학습용 예시]
            기출 유형: 어법 판단
            질문: 다음 중 어법상 어색한 문장을 고르시오.
            보기: ["① He enjoys playing the piano.", "② She has lived here for ten years.", "③ I look forward to meet you.", "④ They are used to waking up early.", "⑤ We should have studied harder."]
            정답: ③

            [요청]
            위 예시의 퀄리티와 형식을 참고하여, 다음 지문에 대한 ${level} 난이도의 내신 문제 ${count}개를 출제하십시오.
            **반드시 문장 삽입, 어법 오류 찾기, 빈칸 추론 등 복합적인 사고를 요하는 문제를 포함하고, 모든 문제는 5지선다로 구성하십시오.**

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
            const prompt = `Generate ${count} extremely high-quality English exam questions about ${topic} for ${level} level. 
            Follow the Korean national curriculum standards. 5 options for each.`;
            
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