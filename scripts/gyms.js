(function () {
    const cardsContainer = document.getElementById('gymsCards');
    const calendarPage = document.getElementById('calendarPage');
    const gymsPage = document.getElementById('gymsPage');
    const gymOverlay = document.getElementById('gymOverlay');
    const gymModal = document.getElementById('gymModal');
    const gymModalTitle = document.getElementById('gymModalTitle');
    const gymModalBody = document.getElementById('gymModalBody');
    const gymEditToggle = document.getElementById('gymEditToggle');
    const socialPricingToggle = document.getElementById('socialPricingToggle');

    const SOCIAL_FILTER_KEY = 'gymsSocialPricingEnabled';
    const DEFAULT_PRICING_TIME = '19:00';

    const state = {
        gyms: [],
        selectedGymId: null,
        editMode: false,
        socialMode: false,
        gymShadows: []
    };

    const sections = [
        { key: 'contacts', label: 'Контакты', fields: [['workHours', 'Время работы', 'text'], ['address', 'Адрес', 'text'], ['mapUrl', 'Ссылка на Yandex Maps', 'url']] },
        { key: 'gymInfo', label: 'Инфа по скалодрому', fields: [['routesCount', 'Кол-во трасс', 'number'], ['rerouteCycleDays', 'Full перекрутка (дней)', 'number'], ['popularity', 'Популярность (1-10)', 'number'], ['ventilation', 'Вентиляция (1-10)', 'number'], ['boards', 'Наличие досок (каких)', 'text']] },
        { key: 'ofpInventory', label: 'ОФП инвентарь', fields: [['benchPress', 'Жим лежа', 'checkbox'], ['platesRack', 'Стойка блинов', 'checkbox'], ['weightedVest', 'Жилет с весом', 'checkbox'], ['dipBelt', 'Пояс с цепью', 'checkbox'], ['campusBoard', 'Кампусборд', 'checkbox']] },
        { key: 'infrastructure', label: 'Инфраструктура', fields: [['showers', 'Душевые', 'checkbox'], ['cafeInside', 'Кафе в зале', 'checkbox'], ['foodNearby', 'Еда рядом', 'text'], ['extraFeatures', 'Доп. фишки', 'textarea']] }
    ];

    function gymFingerprint(gym) {
        return [gym.id || gym.name || '', gym.name || '', gym.icon || '', JSON.stringify(gym.details || {})].join('|');
    }

    function withFingerprint(gym) {
        return { ...gym, fingerprint: gymFingerprint(gym) };
    }

    function normalizeGyms(rawItems) {
        if (!Array.isArray(rawItems)) return [];
        return rawItems.map((item) => {
            const id = String(item.id || item.name || '').trim();
            const name = String(item.name || id).trim();
            return withFingerprint({
                id: id || name,
                name,
                icon: String(item.icon || '').trim(),
                details: item.details && typeof item.details === 'object' ? item.details : {},
                pending: Boolean(item.pending),
                optimisticCreatedAt: Number(item.optimisticCreatedAt || 0)
            });
        }).filter(item => item.id && item.name);
    }

    function persistGyms() {
        localStorage.setItem(window.CalendarConfig.GYMS_CACHE_KEY, JSON.stringify(state.gyms));
    }

    function loadCachedGyms() {
        try {
            const raw = localStorage.getItem(window.CalendarConfig.GYMS_CACHE_KEY);
            if (!raw) return false;
            state.gyms = normalizeGyms(JSON.parse(raw));
            return state.gyms.length > 0;
        } catch {
            return false;
        }
    }

    function pruneGymShadows(now = Date.now()) {
        state.gymShadows = state.gymShadows.filter(item => now - item.createdAt < window.CalendarConfig.SHADOW_TTL_MS);
    }

    function mergeServerWithOptimisticGyms(serverGyms, currentGyms) {
        const now = Date.now();
        pruneGymShadows(now);
        const shadowById = new Map(state.gymShadows.map(item => [item.id, item]));

        const filteredServer = serverGyms.filter((gym) => {
            const shadow = shadowById.get(gym.id);
            if (!shadow) return true;
            return shadow.fingerprint === gym.fingerprint;
        });

        const byId = new Map(filteredServer.map(item => [item.id, item]));
        currentGyms.forEach((gym) => {
            if (!gym.pending || !gym.optimisticCreatedAt) return;
            if (now - gym.optimisticCreatedAt > window.CalendarConfig.SHADOW_TTL_MS) return;
            const serverVersion = byId.get(gym.id);
            if (!serverVersion || serverVersion.fingerprint !== gym.fingerprint) {
                byId.set(gym.id, withFingerprint({ ...gym }));
            }
        });

        return Array.from(byId.values());
    }

    async function fetchGymsSnapshot() {
        try {
            const res = await fetch(`${window.CalendarConfig.GYMS_API_URL}?action=list`);
            if (!res.ok) return null;
            const data = await res.json();
            return normalizeGyms(data.items || []);
        } catch {
            return null;
        }
    }

    function fallbackGymsFromConfig() {
        return normalizeGyms(window.CalendarConfig.defaultGymOptions.map(name => ({
            id: name,
            name,
            icon: (window.CalendarConfig.defaultGymMeta[name] || {}).image || '',
            details: {}
        })));
    }

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

    function getPricingSlots(gym) {
        const slots = Array.isArray(gym?.details?.pricingSlots) ? gym.details.pricingSlots : [];
        return slots.filter((slot) => slot && (slot.label || slot.dayType || slot.start || slot.end || slot.prices));
    }

    function loadSocialMode() {
        try {
            state.socialMode = localStorage.getItem(SOCIAL_FILTER_KEY) === '1';
        } catch {
            state.socialMode = false;
        }
    }

    function persistSocialMode() {
        try {
            localStorage.setItem(SOCIAL_FILTER_KEY, state.socialMode ? '1' : '0');
        } catch {
            // noop
        }
    }

    function updateSocialModeUi() {
        if (!socialPricingToggle) return;
        socialPricingToggle.setAttribute('aria-pressed', String(state.socialMode));
        socialPricingToggle.classList.toggle('is-active', state.socialMode);
        socialPricingToggle.textContent = state.socialMode ? 'Социальный режим' : 'Обычный режим';
    }


    function resolveSlotSocialFlag(slot) {
        if (slot.isSocial === 'yes' || slot.isSocial === 'no') return slot.isSocial;
        if (slot.audience === 'social') return 'yes';
        if (slot.audience === 'regular') return 'no';
        return '';
    }

    function isSlotVisibleInMode(slot) {
        const socialFlag = resolveSlotSocialFlag(slot);
        if (!socialFlag) return true;
        return state.socialMode ? socialFlag === 'yes' : socialFlag === 'no';
    }

    function chooseTopPrice(slot) {
        const prices = slot.prices || {};
        return prices.singlePrice || prices.membershipPrice || prices.unlimitedPrice || prices.studentPrice || '';
    }

    function pickBestSlot(slots) {
        if (!slots.length) return null;
        const defaultMinutes = Number(DEFAULT_PRICING_TIME.split(':')[0]) * 60 + Number(DEFAULT_PRICING_TIME.split(':')[1]);
        const withScore = slots.map((slot) => {
            const dayScore = slot.dayType === 'weekday' ? 0 : slot.dayType ? 3 : 1;
            const start = String(slot.start || '').trim();
            const end = String(slot.end || '').trim();
            let timeScore = 1;
            if (start && end) {
                const startMinutes = Number(start.split(':')[0]) * 60 + Number(start.split(':')[1]);
                const endMinutes = Number(end.split(':')[0]) * 60 + Number(end.split(':')[1]);
                if (defaultMinutes >= startMinutes && defaultMinutes <= endMinutes) {
                    timeScore = 0;
                } else {
                    timeScore = Math.min(Math.abs(defaultMinutes - startMinutes), Math.abs(defaultMinutes - endMinutes)) / 60;
                }
            }
            return { slot, score: dayScore * 10 + timeScore };
        });
        withScore.sort((a, b) => a.score - b.score);
        return withScore[0].slot;
    }

    function renderPricingPreview(gym) {
        const slots = getPricingSlots(gym).filter(isSlotVisibleInMode);
        const preferred = pickBestSlot(slots);
        if (!preferred) return '<span class="gym-card-meta">Тарифы не заполнены</span>';

        const dayType = preferred.dayType === 'weekend' ? 'выходной' : preferred.dayType === 'weekday' ? 'будний' : '';
        const range = [preferred.start, preferred.end].filter(Boolean).join('–');
        const topPrice = chooseTopPrice(preferred);
        const title = [preferred.label || 'Тариф', dayType, range].filter(Boolean).join(', ');
        if (!topPrice) return `<span class="gym-card-meta">${window.AppCore.escapeHtml(title || 'Тариф')}</span>`;
        return `<span class="gym-card-meta">${window.AppCore.escapeHtml(title || 'Тариф')}: ${window.AppCore.escapeHtml(topPrice)}</span>`;
    }

    function renderCards() {
        if (!cardsContainer) return;
        cardsContainer.innerHTML = state.gyms.map((gym) => {
            const summary = buildGymSummary(gym.name);
            return `<button type="button" class="gym-card" data-gym-id="${window.AppCore.escapeHtml(gym.id)}">
                <span class="gym-card-title"><img src="${encodeURI(gym.icon || '')}" alt="">${window.AppCore.escapeHtml(gym.name)}</span>
                <span class="gym-card-meta">Ближайший поход: ${window.AppCore.escapeHtml(summary.upcoming)}</span>
                <span class="gym-card-meta">Последний поход: ${window.AppCore.escapeHtml(summary.last)}</span>
                ${renderPricingPreview(gym)}
            </button>`;
        }).join('');
    }

    function setPage(isGymsPage) {
        const next = isGymsPage ? gymsPage : calendarPage;
        const prev = isGymsPage ? calendarPage : gymsPage;
        if (next.classList.contains('active')) return;
        prev.classList.add('page-leave');
        next.classList.add('active', 'page-enter');
        gymsPage.setAttribute('aria-hidden', String(!isGymsPage));
        setTimeout(() => {
            prev.classList.remove('active', 'page-leave');
            next.classList.remove('page-enter');
        }, 190);
    }

    function createFieldMarkup(gym, section, field) {
        const [name, label, type] = field;
        const value = (((gym.details || {})[section.key] || {})[name]);

        if (!state.editMode) {
            if (type === 'checkbox' && !value) return '';
            if (name === 'mapUrl') return '';
            if (name === 'address') {
                const mapUrl = (((gym.details || {})[section.key] || {}).mapUrl || '').trim();
                if (!String(value || '').trim()) return '';
                return `<div class="gym-modal-static"><span>${label}</span><strong ${mapUrl ? 'class="gym-address-link" data-address-link="1"' : ''}>${window.AppCore.escapeHtml(String(value))}</strong></div>`;
            }
            if (!String(value || '').trim()) return '';
            return `<div class="gym-modal-static"><span>${label}</span><strong>${window.AppCore.escapeHtml(type === 'checkbox' ? 'Да' : String(value))}</strong></div>`;
        }

        if (type === 'checkbox') return `<label class="gym-modal-field gym-modal-check"><span>${label}</span><input data-section="${section.key}" data-name="${name}" type="checkbox" class="uncertain-checkbox" ${value ? 'checked' : ''}></label>`;
        if (type === 'textarea') return `<label class="gym-modal-field"><span>${label}</span><textarea data-section="${section.key}" data-name="${name}">${window.AppCore.escapeHtml(value || '')}</textarea></label>`;
        return `<label class="gym-modal-field"><span>${label}</span><input data-section="${section.key}" data-name="${name}" type="${type}" value="${window.AppCore.escapeHtml(value || '')}"></label>`;
    }

    function renderPricingSlots(gym) {
        const slots = getPricingSlots(gym);
        if (!state.editMode) {
            const lines = slots.filter(isSlotVisibleInMode).map((slot) => {
                const dayType = slot.dayType === 'weekend' ? 'Выходной' : slot.dayType === 'weekday' ? 'Будний' : '';
                const socialFlag = resolveSlotSocialFlag(slot) === 'yes' ? 'Социальный: да' : resolveSlotSocialFlag(slot) === 'no' ? 'Социальный: нет' : '';
                const range = [slot.start, slot.end].filter(Boolean).join('–');
                const prices = slot.prices || {};
                const chunks = [prices.singlePrice ? `Разовое: ${prices.singlePrice}` : '', prices.studentPrice ? `Соц: ${prices.studentPrice}` : '', prices.membershipPrice ? `Абон: ${prices.membershipPrice}` : '', prices.unlimitedPrice ? `Безлим: ${prices.unlimitedPrice}` : ''].filter(Boolean).join(' · ');
                if (!chunks) return '';
                return `<li>${window.AppCore.escapeHtml([slot.label || 'Тариф', dayType, range, socialFlag].filter(Boolean).join(' / '))}<br><strong>${window.AppCore.escapeHtml(chunks)}</strong></li>`;
            }).filter(Boolean);
            return lines.length ? `<section class="gym-modal-section"><h4>Тарифы по времени</h4><ul class="gym-pricing-readonly">${lines.join('')}</ul></section>` : '';
        }

        return `<section class="gym-modal-section"><h4>Тарифы по времени</h4><div id="pricingSlotsEditor" class="pricing-slots-editor">${slots.map((slot, index) => `
            <div class="pricing-slot-item" data-slot-index="${index}">
                <label><span>Название</span><input data-slot-field="label" type="text" value="${window.AppCore.escapeHtml(slot.label || '')}"></label>
                <label><span>День</span><select data-slot-field="dayType"><option value="" ${!slot.dayType ? 'selected' : ''}>Любой</option><option value="weekday" ${slot.dayType === 'weekday' ? 'selected' : ''}>Будний</option><option value="weekend" ${slot.dayType === 'weekend' ? 'selected' : ''}>Выходной</option></select></label>
                <label><span>С</span><input data-slot-field="start" type="time" value="${window.AppCore.escapeHtml(slot.start || '')}"></label>
                <label><span>До</span><input data-slot-field="end" type="time" value="${window.AppCore.escapeHtml(slot.end || '')}"></label>
                <label><span>Социальный тариф</span><select data-slot-field="isSocial"><option value="" ${!slot.isSocial && !slot.audience ? 'selected' : ''}>Не указано</option><option value="yes" ${slot.isSocial === 'yes' || slot.audience === 'social' ? 'selected' : ''}>Да</option><option value="no" ${slot.isSocial === 'no' || slot.audience === 'regular' ? 'selected' : ''}>Нет</option></select></label>
                <label><span>Разовое</span><input data-slot-field="singlePrice" type="text" value="${window.AppCore.escapeHtml((slot.prices || {}).singlePrice || '')}"></label>
                <label><span>Соц.</span><input data-slot-field="studentPrice" type="text" value="${window.AppCore.escapeHtml((slot.prices || {}).studentPrice || '')}"></label>
                <label><span>Абон.</span><input data-slot-field="membershipPrice" type="text" value="${window.AppCore.escapeHtml((slot.prices || {}).membershipPrice || '')}"></label>
                <label><span>Безлим.</span><input data-slot-field="unlimitedPrice" type="text" value="${window.AppCore.escapeHtml((slot.prices || {}).unlimitedPrice || '')}"></label>
                <button type="button" class="slot-remove" data-remove-slot="${index}">Удалить</button>
            </div>
        `).join('')}</div><button type="button" id="addPricingSlot" class="add-slot-button">+ Добавить тариф</button></section>`;
    }

    function renderGymModal() {
        const gym = state.gyms.find(item => item.id === state.selectedGymId);
        if (!gym) return;
        gymModalTitle.textContent = gym.name;
        const sectionMarkup = sections.map((section) => {
            const block = section.fields.map(field => createFieldMarkup(gym, section, field)).filter(Boolean).join('');
            return block ? `<section class="gym-modal-section"><h4>${section.label}</h4><div class="gym-modal-grid">${block}</div></section>` : '';
        }).join('');
        gymModalBody.innerHTML = state.editMode ? `${renderPricingSlots(gym)}${sectionMarkup}` : `${sectionMarkup}${renderPricingSlots(gym)}`;
    }

    function collectPricingSlotsFromForm() {
        const editor = gymModalBody.querySelector('#pricingSlotsEditor');
        if (!editor) return [];
        return Array.from(editor.querySelectorAll('.pricing-slot-item')).map((node) => {
            const get = (field) => String((node.querySelector(`[data-slot-field="${field}"]`) || {}).value || '').trim();
            const slot = {
                label: get('label'), dayType: get('dayType'), start: get('start'), end: get('end'), isSocial: get('isSocial'),
                prices: { singlePrice: get('singlePrice'), studentPrice: get('studentPrice'), membershipPrice: get('membershipPrice'), unlimitedPrice: get('unlimitedPrice') }
            };
            return slot;
        }).filter(slot => slot.label || slot.dayType || slot.start || slot.end || Object.values(slot.prices).some(Boolean));
    }

    async function saveGym() {
        const gymIndex = state.gyms.findIndex(item => item.id === state.selectedGymId);
        if (gymIndex < 0) return;
        const gym = state.gyms[gymIndex];
        const details = {};
        sections.forEach((section) => {
            details[section.key] = {};
            section.fields.forEach(([name, , type]) => {
                const node = gymModalBody.querySelector(`[data-section="${section.key}"][data-name="${name}"]`);
                if (!node) return;
                details[section.key][name] = type === 'checkbox' ? node.checked : node.value;
            });
        });
        details.pricingSlots = collectPricingSlotsFromForm();

        const optimisticGym = withFingerprint({ ...gym, details, pending: true, optimisticCreatedAt: Date.now() });
        state.gyms[gymIndex] = optimisticGym;
        state.gymShadows.push({ id: optimisticGym.id, fingerprint: optimisticGym.fingerprint, createdAt: Date.now() });
        persistGyms();
        renderCards();

        try {
            const res = await fetch(window.CalendarConfig.GYMS_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'saveGym', gym: { ...optimisticGym, pending: undefined, optimisticCreatedAt: undefined, fingerprint: undefined } })
            });
            if (!res.ok) return;
            await syncGyms();
        } catch {
            // локальный optimistic остаётся до следующей синхронизации
        }
    }

    async function syncGyms() {
        if (state.editMode) return;
        const serverGyms = await fetchGymsSnapshot();
        if (!serverGyms) return;
        const merged = mergeServerWithOptimisticGyms(serverGyms, state.gyms);
        if (JSON.stringify(state.gyms) === JSON.stringify(merged)) return;
        state.gyms = merged.map(item => withFingerprint({ ...item, pending: false, optimisticCreatedAt: 0 }));
        persistGyms();
        renderCards();
        if (gymModal.classList.contains('open')) renderGymModal();
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
        if (!element) return;
        let startY = null;
        element.addEventListener('touchstart', (event) => { startY = event.touches[0].clientY; }, { passive: true });
        element.addEventListener('touchend', (event) => {
            if (startY == null) return;
            const endY = event.changedTouches[0].clientY;
            const delta = endY - startY;
            if (direction === 'up' && delta < -40) callback();
            if (direction === 'down' && delta > 40) callback();
            startY = null;
        }, { passive: true });
    }

    async function initializeGymsData() {
        const hasCache = loadCachedGyms();
        if (!hasCache) {
            state.gyms = fallbackGymsFromConfig();
            persistGyms();
        }
        renderCards();
        await syncGyms();
    }

    async function initializeGymsPage() {
        loadSocialMode();
        updateSocialModeUi();

        await initializeGymsData();

        cardsContainer.addEventListener('click', (event) => {
            const card = event.target.closest('.gym-card');
            if (!card) return;
            openGymModal(card.getAttribute('data-gym-id'));
        });

        gymEditToggle.addEventListener('click', async () => {
            if (state.editMode) await saveGym();
            state.editMode = !state.editMode;
            renderGymModal();
        });

        gymModal.addEventListener('keydown', async (event) => {
            if (event.key !== 'Enter' || !state.editMode) return;
            if (event.target && event.target.tagName === 'TEXTAREA') return;
            event.preventDefault();
            await saveGym();
            state.editMode = false;
            renderGymModal();
        });

        gymModalBody.addEventListener('click', (event) => {
            if (!state.editMode) return;
            if (event.target.id === 'addPricingSlot') {
                const gym = state.gyms.find(item => item.id === state.selectedGymId);
                if (!gym) return;
                const next = [...getPricingSlots(gym), { label: '', dayType: '', start: '', end: '', isSocial: '', prices: {} }];
                gym.details = { ...(gym.details || {}), pricingSlots: next };
                renderGymModal();
                return;
            }
            const removeButton = event.target.closest('[data-remove-slot]');
            if (!removeButton) return;
            const gym = state.gyms.find(item => item.id === state.selectedGymId);
            if (!gym) return;
            const idx = Number(removeButton.getAttribute('data-remove-slot'));
            gym.details = { ...(gym.details || {}), pricingSlots: getPricingSlots(gym).filter((_, i) => i !== idx) };
            renderGymModal();
        });

        gymModalBody.addEventListener('click', (event) => {
            if (state.editMode) return;
            const addressNode = event.target.closest('[data-address-link]');
            if (!addressNode) return;
            const gym = state.gyms.find(item => item.id === state.selectedGymId);
            const url = gym?.details?.contacts?.mapUrl;
            if (url) window.open(url, '_blank', 'noopener');
        });

        if (socialPricingToggle) {
            socialPricingToggle.addEventListener('click', () => {
                state.socialMode = !state.socialMode;
                persistSocialMode();
                updateSocialModeUi();
                renderCards();
                if (gymModal.classList.contains('open')) renderGymModal();
            });
        }

        gymOverlay.addEventListener('click', closeGymModal);
        setInterval(() => {
            if (state.editMode) return;
            syncGyms();
        }, window.CalendarConfig.SYNC_INTERVAL_MS);
    }

    function refreshFromCalendarEvents() {
        if (!state.gyms.length) return;
        renderCards();
    }

    window.openGymsPage = () => setPage(true);
    window.openCalendarPage = () => setPage(false);
    window.GymsPage = { initializeGymsPage, refreshFromCalendarEvents, syncGyms };
})();

if (window.GymsPage && typeof window.GymsPage.initializeGymsPage === 'function') {
    window.GymsPage.initializeGymsPage();
}
