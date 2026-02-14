(function () {
    const cardsContainer = document.getElementById('gymsCards');
    const calendarPage = document.getElementById('calendarPage');
    const gymsPage = document.getElementById('gymsPage');
    const gymOverlay = document.getElementById('gymOverlay');
    const gymModal = document.getElementById('gymModal');
    const gymModalTitle = document.getElementById('gymModalTitle');
    const gymModalBody = document.getElementById('gymModalBody');
    const gymEditToggle = document.getElementById('gymEditToggle');
    const saveGymButton = document.getElementById('saveGymButton');

    const state = {
        gyms: [],
        selectedGymId: null,
        editMode: false
    };

    const sections = [
        { key: 'pricing', label: 'Цены', fields: [
            ['singlePrice', 'Разовое', 'number'],
            ['studentPrice', 'Студенческое', 'number'],
            ['membershipPrice', 'Абонемент', 'number'],
            ['unlimitedPrice', 'Безлимит', 'number'],
            ['unlimitedPayoff', 'Окуп безлимита (посещений/мес)', 'number'],
            ['shoeRent', 'Аренда скальников', 'number']
        ]},
        { key: 'gymInfo', label: 'Инфа по скалодрому', fields: [
            ['routesCount', 'Кол-во трасс', 'number'],
            ['rerouteCycleDays', 'Full перекрутка (дней)', 'number'],
            ['popularity', 'Популярность (1-10)', 'number'],
            ['ventilation', 'Вентиляция (1-10)', 'number'],
            ['boards', 'Наличие досок (каких)', 'text']
        ]},
        { key: 'ofpInventory', label: 'ОФП инвентарь', fields: [
            ['benchPress', 'Жим лежа', 'checkbox'],
            ['platesRack', 'Стойка блинов', 'checkbox'],
            ['weightedVest', 'Жилет с весом', 'checkbox'],
            ['dipBelt', 'Пояс с цепью', 'checkbox'],
            ['campusBoard', 'Кампусборд', 'checkbox']
        ]},
        { key: 'infrastructure', label: 'Инфраструктура', fields: [
            ['showers', 'Душевые', 'checkbox'],
            ['cafeInside', 'Кафе в зале', 'checkbox'],
            ['foodNearby', 'Еда рядом', 'text'],
            ['extraFeatures', 'Доп. фишки', 'textarea']
        ]},
        { key: 'contacts', label: 'Контакты', fields: [
            ['workHours', 'Время работы', 'text'],
            ['address', 'Адрес', 'text'],
            ['mapUrl', 'Ссылка на Yandex Maps', 'url']
        ]}
    ];

    function formatVisitDate(value) {
        if (!value) return '—';
        const parsed = dayjs(value);
        return parsed.isValid() ? parsed.format('DD.MM.YYYY') : value;
    }

    function buildGymSummary(gymName) {
        const events = (window.CalendarState && window.CalendarState.events) || [];
        const related = events.filter(event => event.gym === gymName && !event.unsure);
        if (!related.length) return { upcoming: '—', last: '—' };
        const now = dayjs();
        const sorted = [...related].sort((a, b) => dayjs(`${a.date}T${a.time || '00:00'}`).valueOf() - dayjs(`${b.date}T${b.time || '00:00'}`).valueOf());
        const upcoming = sorted.find(item => dayjs(`${item.date}T${item.time || '23:59'}`).isAfter(now));
        const last = [...sorted].reverse().find(item => dayjs(`${item.date}T${item.time || '00:00'}`).isBefore(now));
        return {
            upcoming: upcoming ? `${formatVisitDate(upcoming.date)} ${upcoming.time || ''}`.trim() : '—',
            last: last ? `${formatVisitDate(last.date)} ${last.time || ''}`.trim() : '—'
        };
    }

    async function fetchGyms() {
        try {
            const res = await fetch(`${window.CalendarConfig.GYMS_API_URL}?action=list`);
            if (!res.ok) return [];
            const data = await res.json();
            return Array.isArray(data.items) ? data.items : [];
        } catch {
            return [];
        }
    }

    function fallbackGymsFromConfig() {
        return window.CalendarConfig.defaultGymOptions.map(name => ({
            id: name,
            name,
            icon: (window.CalendarConfig.defaultGymMeta[name] || {}).image || '',
            details: {}
        }));
    }

    function renderCards() {
        if (!cardsContainer) return;
        cardsContainer.innerHTML = state.gyms.map((gym) => {
            const summary = buildGymSummary(gym.name);
            return `<button type="button" class="gym-card" data-gym-id="${window.AppCore.escapeHtml(gym.id || gym.name)}">
                <span class="gym-card-title"><img src="${encodeURI(gym.icon || '')}" alt="">${window.AppCore.escapeHtml(gym.name)}</span>
                <span class="gym-card-meta">Ближайший поход: ${window.AppCore.escapeHtml(summary.upcoming)}</span>
                <span class="gym-card-meta">Последний поход: ${window.AppCore.escapeHtml(summary.last)}</span>
            </button>`;
        }).join('');
    }

    function setPage(isGymsPage) {
        calendarPage.classList.toggle('active', !isGymsPage);
        gymsPage.classList.toggle('active', isGymsPage);
        gymsPage.setAttribute('aria-hidden', String(!isGymsPage));
    }

    function createFieldMarkup(gym, section, field, disabled) {
        const [name, label, type] = field;
        const value = (((gym.details || {})[section.key] || {})[name]);
        if (type === 'checkbox') {
            return `<label class="gym-modal-field gym-modal-check"><input data-section="${section.key}" data-name="${name}" type="checkbox" ${value ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span>${label}</span></label>`;
        }
        if (type === 'textarea') {
            return `<label class="gym-modal-field"><span>${label}</span><textarea data-section="${section.key}" data-name="${name}" ${disabled ? 'disabled' : ''}>${window.AppCore.escapeHtml(value || '')}</textarea></label>`;
        }
        return `<label class="gym-modal-field"><span>${label}</span><input data-section="${section.key}" data-name="${name}" type="${type}" value="${window.AppCore.escapeHtml(value || '')}" ${disabled ? 'disabled' : ''}></label>`;
    }

    function renderGymModal() {
        const gym = state.gyms.find(item => (item.id || item.name) === state.selectedGymId);
        if (!gym) return;
        gymModalTitle.textContent = gym.name;
        gymModalBody.innerHTML = sections.map(section => `
            <section class="gym-modal-section">
                <h4>${section.label}</h4>
                <div class="gym-modal-grid">
                    ${section.fields.map(field => createFieldMarkup(gym, section, field, !state.editMode)).join('')}
                </div>
            </section>
        `).join('');
        saveGymButton.style.display = state.editMode ? 'block' : 'none';
    }

    async function saveGym() {
        const gym = state.gyms.find(item => (item.id || item.name) === state.selectedGymId);
        if (!gym) return;
        const details = {};
        sections.forEach((section) => {
            details[section.key] = {};
            section.fields.forEach((field) => {
                const [name, , type] = field;
                const node = gymModalBody.querySelector(`[data-section="${section.key}"][data-name="${name}"]`);
                if (!node) return;
                details[section.key][name] = type === 'checkbox' ? node.checked : node.value;
            });
        });
        gym.details = details;
        try {
            await fetch(window.CalendarConfig.GYMS_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'saveGym', gym })
            });
        } catch {
            // локально обновили
        }
        state.editMode = false;
        renderGymModal();
    }

    function openGymModal(gymId) {
        state.selectedGymId = gymId;
        state.editMode = false;
        renderGymModal();
        gymOverlay.classList.add('open');
        gymModal.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closeGymModal() {
        gymOverlay.classList.remove('open');
        gymModal.classList.remove('open');
        document.body.style.overflow = '';
    }

    function bindSwipe(element, direction, callback) {
        let startY = null;
        element.addEventListener('touchstart', (event) => {
            startY = event.touches[0].clientY;
        }, { passive: true });
        element.addEventListener('touchend', (event) => {
            if (startY == null) return;
            const endY = event.changedTouches[0].clientY;
            const delta = endY - startY;
            if (direction === 'up' && delta < -40) callback();
            if (direction === 'down' && delta > 40) callback();
            startY = null;
        }, { passive: true });
    }


    async function seedGymCatalogFromCalendar() {
        const gyms = window.CalendarConfig.defaultGymOptions.map((name) => ({
            id: name,
            name,
            icon: (window.CalendarConfig.defaultGymMeta[name] || {}).image || '',
            details: {}
        }));
        return fetch(window.CalendarConfig.GYMS_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'seedFromCalendar', gyms })
        });
    }

    async function initializeGymsPage() {
        const gymsFromApi = await fetchGyms();
        state.gyms = gymsFromApi.length ? gymsFromApi : fallbackGymsFromConfig();
        renderCards();
        bindSwipe(document.getElementById('calendarToGymsSwipe'), 'up', () => setPage(true));
        bindSwipe(document.getElementById('gymsToCalendarSwipe'), 'down', () => setPage(false));

        cardsContainer.addEventListener('click', (event) => {
            const card = event.target.closest('.gym-card');
            if (!card) return;
            openGymModal(card.getAttribute('data-gym-id'));
        });

        gymEditToggle.addEventListener('click', () => {
            state.editMode = !state.editMode;
            renderGymModal();
        });

        saveGymButton.addEventListener('click', saveGym);
        gymOverlay.addEventListener('click', closeGymModal);
    }

    function refreshFromCalendarEvents() {
        if (!state.gyms.length) return;
        renderCards();
    }

    window.openGymsPage = () => setPage(true);
    window.openCalendarPage = () => setPage(false);
    window.GymsPage = { initializeGymsPage, refreshFromCalendarEvents, seedGymCatalogFromCalendar };
})();

if (window.GymsPage && typeof window.GymsPage.initializeGymsPage === 'function') {
    window.GymsPage.initializeGymsPage();
}
