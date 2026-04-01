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

    // Configure PDF.js worker
    if (window.pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    // PDF text extraction helper
    async function extractTextFromPdf(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const typedarray = new Uint8Array(e.target.result);
                try {
                    const pdf = await pdfjsLib.getDocument(typedarray).promise;
                    let fullText = '';
                    const maxPages = Math.min(pdf.numPages, 20); // Limit to 20 pages for performance

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
        const pdfFile = prevExamPdf.files[0];
        const jsonFile = prevExamJson.files[0];

        if (!text && !pdfFile) {
            alert('영어 지문을 입력하거나 분석할 PDF 파일을 선택해주세요.');
            return;
        }

        let contextText = text;
        if (pdfFile) {
            try {
                const pdfText = await extractTextFromPdf(pdfFile);
                contextText = (contextText ? contextText + '\n' : '') + pdfText;
                console.log('PDF에서 추출된 텍스트:', pdfText.substring(0, 100) + '...');
            } catch (err) {
                alert(err);
                return;
            }
        }

        let prevData = null;
        if (jsonFile) {
            try {
                prevData = await readJsonFile(jsonFile);
            } catch (err) {
                alert(err);
                return;
            }
        }

        // Mock generation logic based on extracted context
        const mockQuestions = [
            {
                question: "[PDF/지문 분석 기반] 위 지문의 주제로 가장 적절한 것은?",
                options: ["① Importance of Study", "② Health Benefits", "③ Future Technology", "④ Environmental Protection"],
                answer: "①"
            },
            {
                question: "[PDF/지문 분석 기반] 지문의 내용과 일치하지 않는 것은?",
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
        const pdfFile = templatePdf.files[0];
        const jsonFile = templateJson.files[0];

        if (!pdfFile && !jsonFile) {
            alert('문제 템플릿 PDF 또는 JSON 파일을 선택해주세요.');
            return;
        }

        try {
            let templateContext = "";
            if (pdfFile) {
                templateContext = await extractTextFromPdf(pdfFile);
                console.log('PDF 템플릿에서 추출된 텍스트:', templateContext.substring(0, 100) + '...');
            } else if (jsonFile) {
                const jsonContent = await readJsonFile(jsonFile);
                templateContext = JSON.stringify(jsonContent);
            }
            
            // Mock transformation logic
            const transformedQuestions = [];
            for (let i = 0; i < count; i++) {
                transformedQuestions.push({
                    question: `[PDF/JSON 템플릿 기반 - ${level.toUpperCase()}] 새롭게 변형된 문제 ${i + 1}`,
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
