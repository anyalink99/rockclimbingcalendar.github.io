(function () {
    const API_URL = 'https://script.google.com/macros/s/AKfycbywsHJJz9FzGV3J3G_02MR1UAyTGdT6ldqVto82zJbSFF4C2snqAZWAH2q_kpaFbp0C/exec';
    const GYMS_API_URL = 'https://script.google.com/macros/s/AKfycbzWKCXDBRmPbi0NZtKKybF_1Wifs657ErpVDRgI2Dm3nrWfFj4CE6vUkgIGuhHUzFyz9g/exec';

    window.CalendarConfig = {
        API_URL,
        GYMS_API_URL,
        EVENTS_CACHE_KEY: 'climbEventsCache',
        THEME_STORAGE_KEY: 'climbTheme',
        SYNC_INTERVAL_MS: 10_000,
        SHADOW_TTL_MS: 5_000,
        UTC_PLUS_3_OFFSET_MINUTES: 3 * 60,
        MODAL_INTERACTION_LOCK_MS: 300,
        UNSURE_MARK: ' (?)',
        defaultGymMeta: {
            'Bigwall Динамо': { image: 'icons/bigwall.png' },
            'Bigwall Гавань': { image: 'icons/bigwall.png' },
            'Bigwall Ривьера': { image: 'icons/bigwall.png' },
            'ClimbLab Бутырская': { image: 'icons/climblab.jpg' },
            'ClimbLab Аминьевская': { image: 'icons/climblab.jpg' },
            "Tengu's Мичуринский": { image: 'icons/tengus.png' },
            "Tengu's Южная": { image: 'icons/tengus.png' },
            'Limestone': { image: 'icons/limestone.png' },
            'Rockzona': { image: 'icons/rockzona.png' },
            'Tokyo': { image: 'icons/tokyo.png' },
            'ЦСКА': { image: 'icons/cska.png' }
        },
        defaultGymOptions: [
            'Bigwall Динамо', 'Bigwall Гавань', 'Bigwall Ривьера', 'ClimbLab Бутырская', 'ClimbLab Аминьевская',
            "Tengu's Мичуринский", "Tengu's Южная", 'Limestone', 'Rockzona', 'Tokyo', 'ЦСКА'
        ],
        gymMeta: {},
        gymOptions: [],
        themes: [
            { value: 'midnight', label: 'Ночная классика' },
            { value: 'grandmaster', label: 'Шахматный гроссмейстер' },
            { value: 'ivory', label: 'Светлый беж' },
            { value: 'forest', label: 'Лесной зал' },
            { value: 'ocean', label: 'Океанский бриз' }
        ]
    };

    window.CalendarDom = {
        overlay: document.getElementById('overlay'),
        modal: document.getElementById('modal'),
        themeButton: document.getElementById('themeCycleButton'),
        calendar: document.getElementById('calendar'),
        monthTitle: document.getElementById('monthTitle'),
        calendarWrap: document.getElementById('calendarWrap'),
        modalDateTitle: document.getElementById('modalDateTitle'),
        visitsList: document.getElementById('visitsList'),
        visitUncertain: document.getElementById('visitUncertain'),
        gymSelect: document.getElementById('gymSelect'),
        visitTime: document.getElementById('visitTime'),
        userName: document.getElementById('userName')
    };

    window.CalendarState = {
        currentMonth: dayjs(),
        events: [],
        deletionShadows: [],
        selectedDate: '',
        previousCalendarGymsByDate: {},
        modalEventKeysByDate: {},
        modalUnlockTimeoutId: null,
        modalInteractionTimeoutId: null,
        modalInteractionToken: 0,
        modalInteractionUnlockedAt: 0
    };

    window.API_URL = API_URL;
    window.GYMS_API_URL = GYMS_API_URL;
})();
