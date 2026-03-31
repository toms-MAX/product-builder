document.addEventListener('DOMContentLoaded', () => {
    console.log('Lotto app initialized');
    
    const generateButton = document.getElementById('generate-button');
    const lottoNumbersContainer = document.getElementById('lotto-numbers');
    const themeToggle = document.getElementById('theme-toggle');
    const body = document.body;

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

    function generateLottoNumbers() {
        if (!lottoNumbersContainer) return;
        lottoNumbersContainer.innerHTML = '';
        const numbers = new Set();
        while (numbers.size < 6) {
            const randomNumber = Math.floor(Math.random() * 45) + 1;
            numbers.add(randomNumber);
        }

        const sortedNumbers = Array.from(numbers).sort((a, b) => a - b);

        sortedNumbers.forEach(number => {
            const numberElement = document.createElement('div');
            numberElement.classList.add('lotto-number');
            numberElement.textContent = number;
            lottoNumbersContainer.appendChild(numberElement);
        });
    }

    if (generateButton) {
        generateButton.addEventListener('click', generateLottoNumbers);
    }
});
