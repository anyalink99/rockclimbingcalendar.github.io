(function () {
    function resolveUrl(overrideKey, fallbackUrl) {
        if (typeof window !== 'undefined' && typeof window[overrideKey] === 'string' && window[overrideKey].trim()) {
            return window[overrideKey].trim();
        }
        return fallbackUrl;
    }

    window.AppEndpoints = {
        calendarApi: resolveUrl('API_URL', 'https://script.google.com/macros/s/AKfycbywsHJJz9FzGV3J3G_02MR1UAyTGdT6ldqVto82zJbSFF4C2snqAZWAH2q_kpaFbp0C/exec'),
        gymsApi: resolveUrl('GYMS_API_URL', 'https://script.google.com/macros/s/AKfycbzWKCXDBRmPbi0NZtKKybF_1Wifs657ErpVDRgI2Dm3nrWfFj4CE6vUkgIGuhHUzFyz9g/exec'),
        chatApi: resolveUrl('CHAT_API_URL', 'https://script.google.com/macros/s/AKfycbzOcgR2msOdbDPhNj05WFbgVWpvN_hwR2nYHouCPoce_r8BR8JmUO-g8LYBOsPx54DF/exec')
    };
})();
