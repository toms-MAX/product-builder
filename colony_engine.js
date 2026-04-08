
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Ant Colony v2.0.1 (REBORN-STABLE) Initialized');

    // --- Configuration ---
    const API_URL = 'https://api.groq.com/openai/v1/chat/completions';
    const MODEL_NAME = 'llama-3.1-8b-instant';
    let currentApiKey = localStorage.getItem('groq_api_key') || '';
    let problemDNADatabase = [];

    // --- DOM Elements (v2.0 Mapping) ---
    const apiKeyInput = document.getElementById('api-key-input');
    const saveKeyBtn = document.getElementById('save-key-btn');
    const imageUpload = document.getElementById('image-upload');
    const fullAutoExtractBtn = document.getElementById('full-auto-extract-btn');
    const imagePreview = document.getElementById('image-preview');
    const ocrLog = document.getElementById('ocr-log');
    const finalDnaResult = document.getElementById('final-dna-result');
    const loadToBankBtn = document.getElementById('load-to-bank-btn');
    const readingMaterial = document.getElementById('reading-material');
    const generateBtn = document.getElementById('generate-btn');
    const resultContainer = document.getElementById('generated-questions');
    const computeLog = document.getElementById('compute-log');
    const dnaSelectionContainer = document.getElementById('dna-selection-container');
    const predictCountInput = document.getElementById('predict-count');

    // --- Log Utility ---
    function log(msg, type = 'info', targetLogElement) {
        const colorMap = { 
            info: '#9ab', 
            error: '#ff6b6b', 
            success: '#63e6be', 
            ant: '#5c7cfa', 
            master: '#fcc419',
            auditor: '#f06595' 
        };
        const logHtml = `<div style="color: ${colorMap[type]};">[${type.toUpperCase()}] ${msg}</div>`;
        targetLogElement.innerHTML += logHtml;
        targetLogElement.scrollTop = targetLogElement.scrollHeight;
    }

    // --- Initialization ---
    async function init() {
        if (apiKeyInput) {
            apiKeyInput.value = currentApiKey;
        }
        log('Engine core systems are online.', 'info', ocrLog);
        log('Awaiting your command.', 'info', computeLog);
        
        try {
            const resp = await fetch('questions.json');
            if (!resp.ok) throw new Error(`HTTP error! status: ${resp.status}`);
            problemDNADatabase = await resp.json();
            renderDNACheckboxes();
            log(`DNA Bank loaded: ${problemDNADatabase.length} structures ready.`, 'success', computeLog);
        } catch (e) {
            log(`CRITICAL: Failed to load DNA Bank (questions.json). ${e.message}`, 'error', computeLog);
        }
        setupEventListeners();
    }

    function setupEventListeners() {
        // The API Key section is now dynamically added, so we need to ensure these are not null
        const dynamicApiKeyInput = document.getElementById('api-key-input');
        const dynamicSaveKeyBtn = document.getElementById('save-key-btn');

        if (dynamicSaveKeyBtn) dynamicSaveKeyBtn.onclick = () => {
            currentApiKey = dynamicApiKeyInput.value;
            localStorage.setItem('groq_api_key', currentApiKey);
            log('API Key has been securely stored in your browser.', 'success', computeLog);
            dynamicApiKeyInput.style.borderColor = 'green';
        };
        if (dynamicApiKeyInput) {
             dynamicApiKeyInput.value = currentApiKey;
        }
        
        if (imageUpload) imageUpload.onchange = handleImageUpload;
        if (fullAutoExtractBtn) fullAutoExtractBtn.onclick = runFullAutomation;
        if (loadToBankBtn) loadToBankBtn.onclick = loadExtractedDNA;
        if (generateBtn) generateBtn.onclick = generationPipeline;
    }
    
    // --- Groq API Call ---
    async function callGroq(prompt, isJson = false) {
        if (!currentApiKey) {
            throw new Error('Groq API Key is not set. Please save your key in the "Problem Generation Factory".');
        }
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${currentApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: [{ role: 'user', content: prompt }],
                model: MODEL_NAME,
                temperature: 0.7,
                max_tokens: 2048,
                top_p: 1,
                stop: null,
                stream: false,
                response_format: isJson ? { type: 'json_object' } : null,
            })
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Groq API Error: ${errorData.error.message}`);
        }
        const data = await response.json();
        return data.choices[0].message.content;
    }

    // --- DNA EXTRACTION ENGINE (Section 1) ---
    function handleImageUpload(event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => { 
                imagePreview.src = e.target.result; 
                imagePreview.style.display = 'block';
            };
            reader.readAsDataURL(file);
            log('Image selected for analysis.', 'info', ocrLog);
        }
    }

    async function runFullAutomation() {
        log('--- MASTER ANT: Full Automation Sequence Initiated ---', 'master', ocrLog);
        fullAutoExtractBtn.disabled = true;
        fullAutoExtractBtn.innerText = 'Colony is Active...';
        ocrLog.innerHTML = ''; // Clear previous logs

        try {
            const file = imageUpload.files[0];
            if (!file) throw new Error('No image file uploaded.');
            
            log('[1/4] Ant OCR worker dispatched...', 'ant', ocrLog);
            const worker = await Tesseract.createWorker('eng+kor', 1, { 
                logger: m => log(`${m.status} (${(m.progress * 100).toFixed(1)}%)`, 'ant', ocrLog) 
            });
            const { data: { text } } = await worker.recognize(file);
            await worker.terminate();
            log('OCR extraction successful.', 'success', ocrLog);

            log('[2/4] Ant Layout-Parser analyzing text structure...', 'ant', ocrLog);
            const regex = /(?=\n\d+\. |^\d+\. )/g;
            const problemBlocks = text.split(regex).filter(block => block.trim() !== '');
            if (problemBlocks.length === 0) throw new Error('Layout parser found no problem blocks.');
            log(`Layout analysis successful: ${problemBlocks.length} blocks found.`, 'success', ocrLog);

            log('[3/4] Ant DNA-Assembler creating genetic codes...', 'ant', ocrLog);
            const finalDNAs = [];
            const masterDNA = problemDNADatabase[0]; // Use the first DNA as a structural template
            for (let i = 0; i < problemBlocks.length; i++) {
                log(`Assembling DNA for block ${i + 1}/${problemBlocks.length}...`, 'ant', ocrLog);
                let prompt = `You are a super-intelligent DNA assembler ant. Your task is to analyze a given \"Problem Block Text\" and convert it into a structured JSON object. This JSON must strictly follow the format of the provided \"Master DNA Template\". Do not invent new fields. Fill in the values based on your analysis of the problem block. For fields like 'choices', 'answer', or if some information isn't available in the block, use a null value. Your output must be only the final JSON object.\n\n--- Master DNA Template ---\n${JSON.stringify(masterDNA, null, 2)}\n\n--- Problem Block Text ---\n\"\"\"\n${problemBlocks[i]}\n\"\"\"`;
                prompt += "\n\nYour final output must be a single, valid JSON object.";
                const jsonResponse = await callGroq(prompt, true);
                const generatedDNA = JSON.parse(jsonResponse);
                generatedDNA.meta.problem_id = `extracted-${Date.now()}-${i}`;
                generatedDNA.meta.source = 'auto-extracted';
                generatedDNA.content.passage_text = "(Extracted from image)";
                finalDNAs.push(generatedDNA);
            }
            log('DNA assembly successful.', 'success', ocrLog);

            finalDnaResult.value = JSON.stringify(finalDNAs, null, 2);
            log('[4/4] --- MASTER ANT: Automation Complete. Final DNA is ready. ---', 'master', ocrLog);

        } catch (error) {
            log(`PIPELINE HALTED: ${error.message}`, 'error', ocrLog);
            log('ADVICE: Please check image quality, API key, or text format.', 'master', ocrLog);
        } finally {
            fullAutoExtractBtn.disabled = false;
            fullAutoExtractBtn.innerText = '🚀 DNA 자동 추출 (Full Auto)';
        }
    }

    function loadExtractedDNA() {
        const jsonString = finalDnaResult.value;
        if (!jsonString) {
            log('No extracted DNA to load. Extract DNA from an image first.', 'error', computeLog);
            return;
        }
        try {
            const parsed = JSON.parse(jsonString);
            const newDNAs = Array.isArray(parsed) ? parsed : [parsed];

            if (newDNAs.length === 0) throw new Error('Parsed data is empty.');
            
            problemDNADatabase.unshift(...newDNAs);
            renderDNACheckboxes();
            
            log(`${newDNAs.length} new DNA strand(s) loaded into the Generator!`, 'success', computeLog);
            
            if(newDNAs[0].content && newDNAs[0].content.passage_text && newDNAs[0].content.passage_text !== "(Extracted from image)") {
                readingMaterial.value = newDNAs[0].content.passage_text;
                log('Loaded first passage into the text area.', 'info', computeLog);
            }
        } catch (error) {
            log(`Failed to load DNA: ${error.message}. Make sure it's valid JSON.`, 'error', computeLog);
        }
    }

    // --- PROBLEM GENERATION FACTORY (Section 2) ---
    function renderDNACheckboxes() {
        dnaSelectionContainer.innerHTML = '';
        if (problemDNADatabase.length === 0) {
            dnaSelectionContainer.innerHTML = '<p style="color: #888;">No DNA found. Load from questions.json or extract from an image.</p>';
            return;
        }
        problemDNADatabase.forEach((dna, index) => {
            const div = document.createElement('div');
            const checkboxId = `dna-${dna.meta.problem_id || index}`;
            const title = dna.pedagogy.learning_objective || '(No learning objective)';
            const label = `${dna.meta.problem_type} (${dna.meta.sub_skill || 'N/A'})`;
            
            div.innerHTML = `
                <label for="${checkboxId}" title="${title}" style="display: block; margin-bottom: 5px; background: #f7f7f7; padding: 5px; border-radius: 3px;">
                    <input type="checkbox" id="${checkboxId}" value="${index}" checked>
                    <strong>${label}</strong>
                    <small style="display:block; color: #777;">${dna.pedagogy.test_intent || ''}</small>
                </label>`;
            dnaSelectionContainer.appendChild(div);
        });
    }

    async function generationPipeline() {
        log('--- GENERATOR: Pipeline Initiated ---', 'master', computeLog);
        generateBtn.disabled = true;
        generateBtn.innerText = 'Working...';
        resultContainer.innerHTML = '';

        try {
            const passage = readingMaterial.value;
            const selectedDNAs = Array.from(dnaSelectionContainer.querySelectorAll('input:checked')).map(cb => problemDNADatabase[cb.value]);
            const generationCount = parseInt(predictCountInput.value, 10);
            if (!passage || selectedDNAs.length === 0) throw new Error('Reading passage and at least one DNA type must be provided.');

            let finalProducts = [];
            for (const dna of selectedDNAs) {
                for (let i = 0; i < generationCount; i++) {
                    log(`[${i + 1}/${generationCount}] Generating from DNA: ${dna.meta.problem_type}...`, 'ant', computeLog);
                    const finalProduct = await antArchitect(dna, passage);
                    log('Architect Ant: Problem constructed.', 'ant', computeLog);
                    const auditPassed = await harnessAuditor(finalProduct);
                    if (auditPassed) finalProducts.push(finalProduct);
                }
            }
            renderResults(finalProducts);
            log('--- GENERATOR: Pipeline Complete ---', 'master', computeLog);
        } catch (error) {
            log(`GENERATOR HALTED: ${error.message}`, 'error', computeLog);
        } finally {
            generateBtn.disabled = false;
            generateBtn.innerText = '⚙️ 개미 군집 가동 (문제 생성)';
        }
    }

    async function antArchitect(dna, passage) {
        let prompt = dna.generation_dna.regeneration_prompt.replace("(The user will provide this)", `\"\"\"\n${passage}\n\"\"\"`);
        // Rule Enforcement: Ensure the API knows we expect JSON, preventing the common error.
        prompt += "\n\nYour final output must be a single, valid JSON object, and nothing else.";
        
        const response = await callGroq(prompt, true);
        let generated = JSON.parse(response);
        if (generated.content) {
            generated.content.passage_text = passage;
        }
        return generated;
    }

    async function harnessAuditor(finalProduct) {
        log('Auditor Ant: Reviewing... (Currently set to auto-pass)', 'auditor', computeLog);
        return true;
    }

    function renderResults(questions) {
        if (questions.length === 0) {
            resultContainer.innerHTML = `<div class="question-card" style="border-left-color: var(--warning-color);"><p>No questions were generated successfully. Try different DNA or a clearer passage.</p></div>`;
            return;
        }
        resultContainer.innerHTML = questions.map((q_obj, i) => {
            const q = q_obj.content;
            const meta = q_obj.meta;
            const optionsHtml = q.choices && Array.isArray(q.choices) 
                ? `<ol type="1" style="padding-left: 20px;">${q.choices.map(opt => `<li>${opt}</li>`).join('')}</ol>` 
                : '';

            return `
                <div class="question-card">
                    <h4>[문제 ${i + 1}] (${meta.problem_type})</h4>
                    ${q.instruction_text ? `<p><strong>지시문:</strong> ${q.instruction_text}</p>`: ''}
                    ${q.passage_text && q.passage_text.length > 10 ? `<div style="border: 1px solid #eee; padding: 10px; margin: 10px 0; border-radius: 5px; background: #fafafa;">${q.passage_text.replace(/\n/g, '<br>')}</div>` : ''}
                    <p>${q.question_text}</p>
                    ${optionsHtml}
                    <details style="margin-top: 10px;">
                        <summary style="cursor: pointer; font-weight: 600;">정답 및 해설 보기</summary>
                        <div style="padding: 10px; border: 1px solid #eee; margin-top: 5px; border-radius: 5px;">
                            <p><strong>정답:</strong> ${q.answer}</p>
                            <p><strong>해설:</strong> ${q.explanation}</p>
                        </div>
                    </details>
                </div>
            `;
        }).join('');
    }
    
    // --- Dynamic UI Injection ---
    // Inject the API key input field into the DOM, because it's critical.
    const problemGeneratorSection = document.getElementById('problem-generator');
    if (problemGeneratorSection && !document.getElementById('api-key-input')) {
        const apiKeySection = document.createElement('div');
        apiKeySection.className = 'form-group';
        apiKeySection.innerHTML = `
            <label for="api-key-input" style="display:flex; align-items:center; gap: 5px;">
                Groq API Key 🔑
                <small>(Required for all AI functions)</small>
            </label>
            <div style="display: flex; gap: 10px;">
                <input type="password" id="api-key-input" placeholder="gsk_..." style="flex-grow: 1;">
                <button id="save-key-btn" class="btn btn-secondary" style="background-color: #6c757d; padding: 0.5rem 1rem;">Save</button>
            </div>
        `;
        problemGeneratorSection.prepend(apiKeySection);
    }

    init(); // Start the application
});
