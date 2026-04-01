document.addEventListener('DOMContentLoaded', () => {
    console.log('English Exam Assistant initialized with Gemini AI');
    
    // API Key (User provided)
    const GEMINI_API_KEY = 'AIzaSyCCdebA15oPSS5zKy49PSybrCvVSfmdZ24';
    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

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
    const resultArea = document.getElementById('result-container');
    let lastGeneratedData = null;

    // Configure PDF.js worker
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    // AI Question Generation Helper
    async function generateWithGemini(prompt) {
        try {
            const response = await fetch(GEMINI_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.7,
                        topK: 40,
                        topP: 0.95,
                        maxOutputTokens: 2048,
                        responseMimeType: "application/json",
                    }
                })
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error.message);
            
            const resultText = data.candidates[0].content.parts[0].text;
            return JSON.parse(resultText);
        } catch (err) {
            console.error('Gemini API Error:', err);
            throw new Error('AI 문제 생성 중 오류가 발생했습니다: ' + err.message);
        }
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
                    const maxPages = Math.min(pdf.numPages, 10); // Limit for speed

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

    // Tab switching
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
            generatedQuestionsContainer.innerHTML = '<p>문제를 생성할 수 없습니다. 다시 시도해주세요.</p>';
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
        resultArea.scrollIntoView({ behavior: 'smooth' });
    }

    function showLoading(btn, isLoading) {
        if (isLoading) {
            btn.disabled = true;
            btn.dataset.originalText = btn.textContent;
            btn.textContent = 'AI 분석 및 생성 중...';
        } else {
            btn.disabled = false;
            btn.textContent = btn.dataset.originalText;
        }
    }

    // Feature 1: Prediction Logic (AI Integrated)
    if (generatePredictionBtn) {
        generatePredictionBtn.addEventListener('click', async () => {
            const text = readingMaterial.value;
            const pdfFile = prevExamPdf.files[0];
            const jsonFile = prevExamJson.files[0];

            if (!text && !pdfFile) {
                alert('영어 지문을 입력하거나 분석할 PDF 파일을 선택해주세요.');
                return;
            }

            showLoading(generatePredictionBtn, true);
            try {
                let contextText = text;
                if (pdfFile) {
                    const pdfText = await extractTextFromPdf(pdfFile);
                    contextText = (contextText ? contextText + '\n' : '') + pdfText;
                }

                let formatHint = "";
                if (jsonFile) {
                    const jsonData = await readJsonFile(jsonFile);
                    formatHint = `Use this JSON structure/style as a template for the questions: ${JSON.stringify(jsonData.slice(0,2))}`;
                }

                const prompt = `
                Based on the following English reading material:
                """
                ${contextText}
                """
                ${formatHint}
                
                Generate 3 prediction questions for a middle school English exam. 
                Output the result ONLY as a JSON array of objects, each having:
                - "question": string
                - "options": array of 4 strings
                - "answer": string (e.g., "①")
                Respond in Korean for the question description if appropriate, but keep the reading material's context.
                `;

                const questions = await generateWithGemini(prompt);
                renderQuestions(questions);
            } catch (err) {
                alert(err.message);
            } finally {
                showLoading(generatePredictionBtn, false);
            }
        });
    }

    // Feature 2: Question Bank Logic (AI Integrated)
    if (generateBankBtn) {
        generateBankBtn.addEventListener('click', async () => {
            const level = levelSelect.value;
            const topic = topicSelect.value;
            const count = parseInt(questionCount.value);
            const pdfFile = templatePdf ? templatePdf.files[0] : null;
            const jsonFile = templateJson ? templateJson.files[0] : null;

            showLoading(generateBankBtn, true);
            try {
                let templateContent = "";
                if (pdfFile) {
                    templateContent = "Template context from PDF: " + await extractTextFromPdf(pdfFile);
                } else if (jsonFile) {
                    const jsonData = await readJsonFile(jsonFile);
                    templateContent = "Template JSON structure: " + JSON.stringify(jsonData.slice(0, 3));
                } else {
                    // Default to questions.json if no file
                    const res = await fetch('questions.json');
                    const defaultData = await res.json();
                    templateContent = "Default template: " + JSON.stringify(defaultData);
                }

                const prompt = `
                Using this template for style and structure:
                """
                ${templateContent}
                """
                
                Generate ${count} new English exam questions.
                - Topic: ${topic}
                - Difficulty Level: ${level}
                - Output format: JSON array of objects (question, options, answer).
                Ensure the questions are fresh and different from the template but follow its format.
                `;

                const questions = await generateWithGemini(prompt);
                renderQuestions(questions);
            } catch (err) {
                alert(err.message);
            } finally {
                showLoading(generateBankBtn, false);
            }
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
