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
    const prevExamPdf = document.getElementById('prev-exam-pdf');
    const prevExamJson = document.getElementById('prev-exam-json');

    // Feature 2: Question Bank
    const generateBankBtn = document.getElementById('generate-bank');
    const levelSelect = document.getElementById('level-select');
    const topicSelect = document.getElementById('topic-select');
    const questionCount = document.getElementById('question-count');
    const templatePdf = document.getElementById('template-pdf');
    const templateJson = document.getElementById('template-json');

    const generatedQuestionsContainer = document.getElementById('generated-questions');
    const exportJsonBtn = document.getElementById('export-json');
    let lastGeneratedData = null;

    // Configure PDF.js worker
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    // PDF text extraction helper
    async function extractTextFromPdf(file) {
        if (typeof pdfjsLib === 'undefined') {
            throw new Error('PDF.js 라이브러리가 로드되지 않았습니다.');
        }
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const typedarray = new Uint8Array(e.target.result);
                try {
                    const pdf = await pdfjsLib.getDocument(typedarray).promise;
                    let fullText = '';
                    const maxPages = Math.min(pdf.numPages, 20);

                    for (let i = 1; i <= maxPages; i++) {
                        const page = await pdf.getPage(i);
                        const textContent = await page.getTextContent();
                        const pageText = textContent.items.map(item => item.str).join(' ');
                        fullText += pageText + '\n';
                    }
                    resolve(fullText);
                } catch (err) {
                    reject('PDF 파싱 오류: ' + err.message);
                }
            };
            reader.onerror = () => reject('파일 읽기 오류');
            reader.readAsArrayBuffer(file);
        });
    }

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
    if (tabBtns.length > 0) {
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabId = btn.getAttribute('data-tab');
                const targetContent = document.getElementById(tabId);
                
                if (targetContent) {
                    tabBtns.forEach(b => b.classList.remove('active'));
                    tabContents.forEach(c => c.classList.remove('active'));
                    
                    btn.classList.add('active');
                    targetContent.classList.add('active');
                }
            });
        });
    }

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
        if (!generatedQuestionsContainer) return;

        generatedQuestionsContainer.innerHTML = '';
        if (!questions || questions.length === 0) {
            generatedQuestionsContainer.innerHTML = '<p>생성된 문제가 없습니다.</p>';
            if (exportJsonBtn) exportJsonBtn.style.display = 'none';
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

        if (exportJsonBtn) exportJsonBtn.style.display = 'block';
        lastGeneratedData = questions;
    }

    // Feature 1: Prediction Logic
    if (generatePredictionBtn) {
        generatePredictionBtn.addEventListener('click', async () => {
            const text = readingMaterial.value;
            const pdfFile = prevExamPdf.files[0];
            const jsonFile = prevExamJson.files[0];

            if (!text && !pdfFile) {
                alert('영어 지문을 입력하거나 분석할 PDF 파일을 선택해주세요.');
                return;
            }

            let contextText = text;
            if (pdfFile) {
                try {
                    contextText = (contextText ? contextText + '\n' : '') + await extractTextFromPdf(pdfFile);
                } catch (err) {
                    alert(err);
                    return;
                }
            }

            // Mock result
            renderQuestions([
                {
                    question: "[분석 기반] 위 지문에서 강조하는 핵심 내용은 무엇인가요?",
                    options: ["① 학업의 중요성", "② 건강 관리", "③ 미래 기술", "④ 환경 보호"],
                    answer: "①"
                }
            ]);
        });
    }

    // Feature 2: Question Bank Logic
    if (generateBankBtn) {
        generateBankBtn.addEventListener('click', async () => {
            const level = levelSelect.value;
            const topic = topicSelect.value;
            const count = parseInt(questionCount.value);
            const pdfFile = templatePdf ? templatePdf.files[0] : null;
            const jsonFile = templateJson ? templateJson.files[0] : null;

            // 만약 파일이 없으면 기본 questions.json 로드를 시도
            if (!pdfFile && !jsonFile) {
                try {
                    const response = await fetch('questions.json');
                    const defaultQuestions = await response.json();
                    const filtered = defaultQuestions.filter(q => q.level === level || q.topic === topic).slice(0, count);
                    
                    if (filtered.length > 0) {
                        renderQuestions(filtered);
                        return;
                    }
                } catch (e) {
                    console.log('기본 questions.json 로드 실패', e);
                }
                alert('문제 템플릿 파일을 선택하거나 유효한 데이터를 준비해주세요.');
                return;
            }

            // 템플릿 기반 생성 로직 (Mock)
            const transformed = [];
            for (let i = 0; i < count; i++) {
                transformed.push({
                    question: `[${topic.toUpperCase()}] 변형 문제 ${i + 1} (${level})`,
                    options: ["① 보기 1", "② 보기 2", "③ 보기 3", "④ 보기 4"],
                    answer: "①"
                });
            }
            renderQuestions(transformed);
        });
    }

    // Export to JSON
    if (exportJsonBtn) {
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
    }
});
