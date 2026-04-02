document.addEventListener('DOMContentLoaded', () => {
    console.log('English Exam Assistant initialized with Gemini AI');
    
    // API Key (User provided)
    const GEMINI_API_KEY = 'AIzaSyCCdebA15oPSS5zKy49PSybrCvVSfmdZ24';
    // Using v1beta as it often has better compatibility with latest flash models
    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    // Elements
    const themeToggle = document.getElementById('theme-toggle');
    const body = document.body;
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    // Feature 1: Prediction
    const generatePredictionBtn = document.getElementById('generate-prediction');
    const readingMaterial = document.getElementById('reading-material');

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
    
    // Feature 3: Saved List & PDF
    const savedCountBadge = document.getElementById('saved-count');
    const savedQuestionsList = document.getElementById('saved-questions-list');
    const exportPdfBtn = document.getElementById('export-pdf');
    const clearSavedBtn = document.getElementById('clear-saved');
    let lastGeneratedData = null;
    let savedQuestions = [];

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
                        maxOutputTokens: 2048
                        // Removed responseMimeType, topK, topP for maximum compatibility
                    }
                })
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error.message);
            
            let resultText = data.candidates[0].content.parts[0].text;
            // Robust JSON extraction: Find the first '[' and last ']'
            const startIdx = resultText.indexOf('[');
            const endIdx = resultText.lastIndexOf(']');
            
            if (startIdx !== -1 && endIdx !== -1) {
                resultText = resultText.substring(startIdx, endIdx + 1);
            }
            
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
                    // Filter out Korean characters
                    const filteredText = fullText.replace(/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/g, '').replace(/\s+/g, ' ').trim();
                    resolve(filteredText);
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
            
            const addBtn = document.createElement('button');
            addBtn.classList.add('add-save-btn');
            addBtn.textContent = '담기';
            addBtn.onclick = () => saveQuestion(q);
            qDiv.appendChild(addBtn);

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

    // Save/Select Question logic
    function saveQuestion(question) {
        // Prevent duplicates
        const isDuplicate = savedQuestions.some(q => q.question === question.question);
        if (isDuplicate) {
            alert('이미 담은 문제입니다.');
            return;
        }

        savedQuestions.push(question);
        updateSavedListUI();
    }

    function removeQuestion(index) {
        savedQuestions.splice(index, 1);
        updateSavedListUI();
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
            qDiv.classList.add('question-item');
            
            const removeBtn = document.createElement('button');
            removeBtn.classList.add('add-save-btn');
            removeBtn.textContent = '삭제';
            removeBtn.style.backgroundColor = '#e74c3c';
            removeBtn.onclick = () => removeQuestion(index);
            qDiv.appendChild(removeBtn);

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
            savedQuestionsList.appendChild(qDiv);
        });
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

    // Feature 1: Prediction Logic (Simplified & AI Integrated)
    if (generatePredictionBtn) {
        generatePredictionBtn.addEventListener('click', async () => {
            const text = readingMaterial.value;
            const level = document.getElementById('predict-level').value;
            const count = parseInt(document.getElementById('predict-count').value);

            if (!text) {
                alert('지문을 입력해주세요.');
                return;
            }

            showLoading(generatePredictionBtn, true);
            try {
                const res = await fetch('questions.json');
                const questionPatterns = await res.json();
                
                const prompt = `
                당신은 영어 시험 출제 위원입니다. 제공된 [지문]을 바탕으로, [기존 유형]의 형식을 참고하여 새로운 기출 예상 문제를 만드세요.

                [지문]:
                """
                ${text}
                """

                [설정]:
                - 난이도: ${level} (easy: 중1, medium: 중2~3, hard: 고등기초)
                - 문제 수: ${count}개
                - 언어: 질문과 설명은 한국어, 보기와 지문 관련 내용은 영어

                [참고할 기존 문제 유형 및 형식]:
                ${JSON.stringify(questionPatterns.slice(0, 10))} 

                [요구사항]:
                - 위 [참고할 기존 문제 유형]의 질문 스타일(빈칸 추론, 주제 찾기, 어법 등)을 골고루 활용하세요.
                - 지문의 내용을 정확히 반영해야 합니다.
                - 출력은 반드시 다음 구조의 JSON 배열이어야 합니다 (다른 텍스트 없이 JSON만 출력):
                [{"question": "...", "options": ["①...", "②...", "③...", "④...", "⑤..."], "answer": "...", "explanation": "..."}]
                `;

                const questions = await generateWithGemini(prompt);
                renderQuestions(questions);
            } catch (err) {
                console.error(err);
                alert('오류 발생: ' + err.message);
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
                    templateContent = "Template JSON structure: " + JSON.stringify(Array.isArray(jsonData) ? jsonData.slice(0, 3) : jsonData);
                } else {
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
                Output should be a pure JSON array starting with '[' and ending with ']'.
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

    // PDF Export Logic
    if (exportPdfBtn) {
        exportPdfBtn.addEventListener('click', async () => {
            if (savedQuestions.length === 0) {
                alert('다운로드할 문제가 없습니다. 먼저 문제를 담아주세요.');
                return;
            }

            const element = document.getElementById('pdf-export-area');
            const originalStyle = element.style.height;
            element.style.height = 'auto'; // Capture full content

            try {
                const canvas = await html2canvas(element, {
                    scale: 2,
                    useCORS: true,
                    backgroundColor: '#ffffff'
                });
                
                const imgData = canvas.toDataURL('image/png');
                const { jsPDF } = window.jspdf;
                const pdf = new jsPDF('p', 'mm', 'a4');
                
                const imgProps = pdf.getImageProperties(imgData);
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
                
                pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
                pdf.save('english_exam_questions.pdf');
            } catch (err) {
                console.error('PDF Generation Error:', err);
                alert('PDF 생성 중 오류가 발생했습니다.');
            } finally {
                element.style.height = originalStyle;
            }
        });
    }

    if (clearSavedBtn) {
        clearSavedBtn.addEventListener('click', () => {
            if (confirm('담은 모든 문제를 삭제하시겠습니까?')) {
                savedQuestions = [];
                updateSavedListUI();
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
