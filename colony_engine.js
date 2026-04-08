document.addEventListener('DOMContentLoaded', async () => {
    console.log('Ant Colony Harness System v2.4 (Filter & Data Refined) initialized');

    // ... (상수 및 변수 선언은 이전과 동일)
    const dnaTypeFilter = document.getElementById('dna-type-filter');

    // ... (init, log, callGroq 등 핵심 함수는 이전과 동일)

    function renderDNACheckboxes() {
        const filterValue = document.querySelector('input[name="dna-filter"]:checked').value;
        dnaSelectionContainer.innerHTML = '';
        const filteredDNA = questionDNADatabase.filter(dna => {
            if (filterValue === 'all') return true;
            return dna.type === filterValue;
        });

        if (filteredDNA.length === 0) {
            dnaSelectionContainer.innerHTML = `<p style="color: #888;">해당 유형의 DNA가 없습니다.</p>`;
            return;
        }

        filteredDNA.forEach((dna) => {
            // DNA의 원래 인덱스를 찾아서 value로 사용
            const originalIndex = questionDNADatabase.findIndex(item => item.exam_name === dna.exam_name);
            const div = document.createElement('div');
            div.className = 'dna-checkbox-item';
            div.innerHTML = `
                <input type="checkbox" id="dna-${originalIndex}" value="${originalIndex}" checked>
                <label for="dna-${originalIndex}" title="${dna.description}">${dna.exam_name}</label>
            `;
            dnaSelectionContainer.appendChild(div);
        });
    }

    async function init() {
        try {
            const resp = await fetch('questions.json');
            if (!resp.ok) throw new Error(`HTTP error! status: ${resp.status}`);
            questionDNADatabase = await resp.json();
            
            // 필터링 기능 초기화 및 이벤트 리스너 추가
            renderDNACheckboxes(); 
            dnaTypeFilter.addEventListener('change', renderDNACheckboxes);

            log(`DNA 기반 하네스 시스템 활성화. ${questionDNADatabase.length}개의 문제 유형(DNA) 로드 완료.`, 'success');
        } catch (e) {
            log(`치명적 오류: 문제 유형 DNA 뱅크(questions.json) 로드에 실패했습니다. ${e.message}`, 'error');
            dnaSelectionContainer.innerHTML = `<p style="color: #e74c3c;">문제 유형 로드 실패. questions.json 파일을 확인하세요.</p>`;
        }
    }

    // ... (antAnalyst, antArchitect, antModifier, antCultivator, harnessAuditor, generateBtn.onclick 등 나머지 로직은 변경 없음)
    // 이제 renderDNACheckboxes가 필터링을 담당하므로, 메인 로직은 수정할 필요가 없습니다.

    init(); // 시스템 시작

    // 이하 나머지 코드는 이전과 동일합니다.
});
