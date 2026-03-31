document.addEventListener('DOMContentLoaded', () => {
    console.log('English Exam Assistant initialized');
    
    // Elements
    const themeToggle = document.getElementById('theme-toggle');
    const body = document.body;
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    // Feature 1: Prediction
    const generatePredictionBtn = document.getElementById('generate-prediction');
    const readingMaterial = document.getElementById('reading-material');
    const prevExamJson = document.getElementById('prev-exam-json');
    
    // Feature 2: Question Bank
    const generateBankBtn = document.getElementById('generate-bank');
    const levelSelect = document.getElementById('level-select');
    const topicSelect = document.getElementById('topic-select');
    const questionCount = document.getElementById('question-count');
    const templateJson = document.getElementById('template-json');
    
    // Output
    const generatedQuestionsContainer = document.getElementById('generated-questions');
    const exportJsonBtn = document.getElementById('export-json');
    let lastGeneratedData = null;

    // Theme logic
    if (themeToggle) {
        const currentTheme = localStorage.getItem('theme');
        if (currentTheme === 'dark') {
            body.classList.add('dark-mode');
            themeToggle.textContent = '라이트 모드';
        }

        themeToggle.addEventListener('click', () => {
            body.classList.toggle('dark-mode');
            let theme = 'light';
            if (body.classList.contains('dark-mode')) {
                theme = 'dark';
                themeToggle.textContent = '라이트 모드';
            } else {
                themeToggle.textContent = '다크 모드';
            }
            localStorage.setItem('theme', theme);
        });
    }

    // Tab switching logic
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });

    // File reading helper
    async function readJsonFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    resolve(JSON.parse(e.target.result));
                } catch (err) {
                    reject('JSON 파싱 오류: ' + err.message);
                }
            };
            reader.onerror = () => reject('파일 읽기 오류');
            reader.readAsText(file);
        });
    }

    // Render questions to UI
    function renderQuestions(questions) {
        generatedQuestionsContainer.innerHTML = '';
        if (!questions || questions.length === 0) {
            generatedQuestionsContainer.innerHTML = '<p>생성된 문제가 없습니다.</p>';
            exportJsonBtn.style.display = 'none';
            return;
        }

        questions.forEach((q, index) => {
            const qDiv = document.createElement('div');
            qDiv.classList.add('question-item');
            
            const qText = document.createElement('span');
            qText.classList.add('question-text');
            qText.textContent = `${index + 1}. ${q.question}`;
            qDiv.appendChild(qText);

            if (q.options) {
                const oList = document.createElement('ul');
                oList.classList.add('options-list');
                q.options.forEach(opt => {
                    const li = document.createElement('li');
                    li.textContent = opt;
                    oList.appendChild(li);
                });
                qDiv.appendChild(oList);
            }

            generatedQuestionsContainer.appendChild(qDiv);
        });

        exportJsonBtn.style.display = 'block';
        lastGeneratedData = questions;
    }

    // Feature 1: Prediction Logic (Mock)
    generatePredictionBtn.addEventListener('click', async () => {
        const text = readingMaterial.value;
        const file = prevExamJson.files[0];

        if (!text) {
            alert('영어 지문을 입력해주세요.');
            return;
        }

        let prevData = null;
        if (file) {
            try {
                prevData = await readJsonFile(file);
            } catch (err) {
                alert(err);
                return;
            }
        }

        // Mock generation logic
        const mockQuestions = [
            {
                question: "위 지문의 주제로 가장 적절한 것은?",
                options: ["① Importance of Study", "② Health Benefits", "③ Future Technology", "④ Environmental Protection"],
                answer: "①"
            },
            {
                question: "지문의 내용과 일치하지 않는 것은?",
                options: ["① The author is a student.", "② Technology is evolving.", "③ Nature is important.", "④ AI will replace teachers."],
                answer: "④"
            }
        ];

        renderQuestions(mockQuestions);
    });

    // Feature 2: Question Bank Logic (Mock)
    generateBankBtn.addEventListener('click', async () => {
        const level = levelSelect.value;
        const topic = topicSelect.value;
        const count = parseInt(questionCount.value);
        const file = templateJson.files[0];

        if (!file) {
            alert('문제 템플릿 JSON 파일을 선택해주세요.');
            return;
        }

        try {
            const template = await readJsonFile(file);
            
            // Mock transformation logic: 
            // In a real app, this would use LLM or template engine to swap content
            const transformedQuestions = [];
            for (let i = 0; i < count; i++) {
                transformedQuestions.push({
                    question: `[${level.toUpperCase()} - ${topic.toUpperCase()}] 새롭게 생성된 문제 ${i + 1}`,
                    options: ["① 보기 A", "② 보기 B", "③ 보기 C", "④ 보기 D"],
                    answer: "①"
                });
            }
            
            renderQuestions(transformedQuestions);
        } catch (err) {
            alert(err);
        }
    });

    // Export to JSON
    exportJsonBtn.addEventListener('click', () => {
        if (!lastGeneratedData) return;
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(lastGeneratedData, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "generated_questions.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    });
});
