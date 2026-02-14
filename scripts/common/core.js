window.AppCore = {
    escapeHtml(str = '') {
        return String(str).replace(/[&<>"']/g, (m) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[m]));
    },
    getClimberName() {
        return (localStorage.getItem('climberName') || '').trim();
    },
    initializeNameInput(inputElement) {
        if (!inputElement) return;
        inputElement.value = localStorage.getItem('climberName') || '';
        inputElement.addEventListener('input', (event) => {
            localStorage.setItem('climberName', event.target.value.trim());
        });
    }
};

if (window.dayjs && window.dayjs_plugin_isoWeek) {
    dayjs.extend(window.dayjs_plugin_isoWeek);
    dayjs.locale('ru');
}
