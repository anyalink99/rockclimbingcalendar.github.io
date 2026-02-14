(function () {
    const cardsContainer = document.getElementById('gymsCards');
    const calendarPage = document.getElementById('calendarPage');
    const gymsPage = document.getElementById('gymsPage');
    const gymOverlay = document.getElementById('gymOverlay');
    const gymModal = document.getElementById('gymModal');
    const gymModalTitle = document.getElementById('gymModalTitle');
    const gymModalBody = document.getElementById('gymModalBody');
    const gymEditToggle = document.getElementById('gymEditToggle');

    const SOCIAL_FILTER_KEY = 'gymsSocialPricingEnabled';
    const DEFAULT_PRICING_TIME = '19:00';

    const state = {
        gyms: [],
        selectedGymId: null,
        editMode: false,
        socialMode: false,
        gymShadows: [],
        lastRenderedEditMode: false
    };

    const sections = [
        { key: 'contacts', label: 'Контакты', fields: [['workHours', 'Время работы', 'text'], ['address', 'Адрес', 'text'], ['mapUrl', 'Ссылка на Yandex Maps', 'url'], ['clickableRefs', 'Кликабельные референсы', 'text']] },
        { key: 'gymInfo', label: 'Инфа по скалодрому', fields: [['routesCount', 'Кол-во трасс', 'number'], ['rerouteCycleDays', 'Full перекрутка (дней)', 'number'], ['popularity', 'Популярность (1-10)', 'number'], ['ventilation', 'Вентиляция (1-10)', 'number'], ['boards', 'Доски', 'text']] },
        { key: 'ofpInventory', label: 'ОФП инвентарь', fields: [['benchPress', 'Жим лежа', 'checkbox'], ['platesRack', 'Стойка блинов', 'checkbox'], ['weightedVest', 'Жилет с весом', 'checkbox'], ['dipBelt', 'Пояс с цепью', 'checkbox'], ['campusBoard', 'Кампусборд', 'checkbox']] },
        { key: 'infrastructure', label: 'Инфраструктура', fields: [['showers', 'Душевые', 'checkbox'], ['cafeInside', 'Кафе в зале', 'checkbox'], ['foodNearby', 'Еда рядом', 'text'], ['extraFeatures', 'Доп. фишки', 'text']] }
    ];

    const pricingTimeOptions = Array.from({ length: 24 * 4 }, (_, index) => {
        const hours = String(Math.floor(index / 4)).padStart(2, '0');
        const minutes = String((index % 4) * 15).padStart(2, '0');
        return `${hours}:${minutes}`;
    });

    const {
        withFingerprint,
        persistGyms,
        loadCachedGyms,
        mergeServerWithOptimisticGyms,
        fetchGymsSnapshot,
        fallbackGymsFromConfig
    } = window.GymsData;

    const {
        getPricingSlots,
        getVisiblePricingSlots,
        resolveTariffType,
        resolveSlotSocialFlag,
        chooseTopPrice,
        pickBestSlot,
        sortPricingSlotsForReadMode,
        renderSlotCustomSelect,
        renderPricingFields,
        renderSlotTimeSelect,
        collectPricingSlotsFromForm
    } = window.GymsPricing;

    function formatVisitDate(value) {
        if (!value) return '—';
        const parsed = dayjs(value);
        return parsed.isValid() ? parsed.format('DD.MM.YYYY') : value;
    }

    function buildGymSummary(gymName) {
        const events = (window.CalendarState && window.CalendarState.events) || [];
        const targetGym = String(gymName || '').trim().toLowerCase();
        const related = events.filter((event) => String(event.gym || '').trim().toLowerCase() === targetGym && !event.unsure);
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
        // UI переключателя рендерится динамически в модалке.
    }

    function renderSocialModeToggle(source = 'modal') {
        return `<button type="button" class="social-mode-toggle social-mode-toggle-${source} ${state.socialMode ? 'is-social' : 'is-regular'}" data-social-pricing-toggle="1" aria-pressed="${state.socialMode ? 'true' : 'false'}" title="Переключить режим цен"><span class="social-mode-pill social-mode-pill-regular">Обычный</span><span class="social-mode-pill social-mode-pill-social">Социальный</span></button>`;
    }

    function renderPricingSlots(gym) {
        const slots = getPricingSlots(gym);
        if (!state.editMode) {
            const lines = sortPricingSlotsForReadMode(getVisiblePricingSlots(gym, state.socialMode)).map((slot) => {
                const dayType = slot.dayType === 'weekend' ? 'Выходной' : slot.dayType === 'weekday' ? 'Будний' : '';
                const range = [slot.start, slot.end].filter(Boolean).join('–');
                const prices = slot.prices || {};
                const tariffType = resolveTariffType(slot);
                const chunks = [
                    tariffType === 'single' && prices.singlePrice ? `Разовое: ${prices.singlePrice}` : '',
                    tariffType === 'membership' && prices.membershipPrice ? `Абон: ${prices.membershipPrice}/посещение` : '',
                    tariffType === 'membership' && prices.membershipVisits ? `Посещений: ${prices.membershipVisits}` : '',
                    tariffType === 'unlimited' && prices.unlimitedPrice ? `Безлим: ${prices.unlimitedPrice}` : '',
                    tariffType === 'unlimited' && prices.unlimitedDuration ? `Длительность: ${prices.unlimitedDuration}` : ''
                ].filter(Boolean).join(' · ');
                if (!chunks) return '';
                return `<li>${window.AppCore.escapeHtml([slot.label || 'Тариф', dayType, range].filter(Boolean).join(' / '))}<br><strong>${window.AppCore.escapeHtml(chunks)}</strong></li>`;
            }).filter(Boolean);
            if (!lines.length) return '';
            return `<section class="gym-modal-section"><div class="gym-modal-pricing-header"><h4>Тарифы</h4>${renderSocialModeToggle('modal')}</div><ul class="gym-pricing-readonly">${lines.join('')}</ul></section>`;
        }

        return `<section class="gym-modal-section"><h4>Тарифы</h4><div id="pricingSlotsEditor" class="pricing-slots-editor">${slots.map((slot, index) => `
            <div class="pricing-slot-item" data-slot-index="${index}">
                <label><span>Название тарифа</span><input data-slot-field="label" type="text" value="${window.AppCore.escapeHtml(slot.label || '')}"></label>
                <label><span>День</span>${renderSlotCustomSelect({ field: 'dayType', value: slot.dayType || '', placeholder: 'Любой', options: [{ value: '', label: 'Любой' }, { value: 'weekday', label: 'Будний' }, { value: 'weekend', label: 'Выходной' }] })}</label>
                <label><span>С</span>${renderSlotTimeSelect('start', slot.start || '', pricingTimeOptions)}</label>
                <label><span>До</span>${renderSlotTimeSelect('end', slot.end || '', pricingTimeOptions)}</label>
                <label><span>Социальный тариф</span>${renderSlotCustomSelect({ field: 'isSocial', value: resolveSlotSocialFlag(slot) || 'no', placeholder: 'Нет', options: [{ value: 'no', label: 'Нет' }, { value: 'yes', label: 'Да' }] })}</label>
                <label><span>Тип тарифа</span>${renderSlotCustomSelect({ field: 'tariffType', value: resolveTariffType(slot), placeholder: 'Разовое', options: [{ value: 'single', label: 'Разовое' }, { value: 'membership', label: 'Абонемент' }, { value: 'unlimited', label: 'Безлимит' }] })}</label>
                ${renderPricingFields(slot)}
                <button type="button" class="slot-remove" data-remove-slot="${index}" aria-label="Удалить тариф" title="Удалить тариф">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M3 6h18"></path>
                        <path d="M8 6V4h8v2"></path>
                        <path d="M6.8 6l.7 13h9l.7-13"></path>
                        <path d="M10 10.5v6"></path>
                        <path d="M14 10.5v6"></path>
                    </svg>
                </button>
            </div>
        `).join('')}</div><button type="button" id="addPricingSlot" class="add-slot-button">+ Добавить тариф</button></section>`;
    }

    function renderGymModal() {
        const gym = state.gyms.find(item => item.id === state.selectedGymId);
        if (!gym) return;
        const modeChanged = state.lastRenderedEditMode !== state.editMode;
        gymModalTitle.textContent = gym.name;
        const sectionMarkup = sections.map((section) => {
            const block = section.fields.map(field => createFieldMarkup(gym, section, field)).filter(Boolean).join('');
            return block ? `<section class="gym-modal-section"><h4>${section.label}</h4><div class="gym-modal-grid">${block}</div></section>` : '';
        }).join('');
        gymModalBody.innerHTML = `${renderPricingSlots(gym)}${sectionMarkup}`;
        if (modeChanged) animateModeSwitch();
        state.lastRenderedEditMode = state.editMode;
    }

    function renderPricingPreview(gym) {
        const slots = getVisiblePricingSlots(gym, state.socialMode);
        const slotsWithSingle = slots.filter((slot) => String(slot?.prices?.singlePrice || '').trim());
        const preferred = pickBestSlot(slotsWithSingle.length ? slotsWithSingle : slots, DEFAULT_PRICING_TIME);
        if (!preferred) return '<span class="gym-card-meta">Тарифы не заполнены</span>';

        const dayType = preferred.dayType === 'weekend' ? 'выходной' : preferred.dayType === 'weekday' ? 'будний' : '';
        const range = [preferred.start, preferred.end].filter(Boolean).join('–');
        const topPrice = chooseTopPrice(preferred);
        const title = [preferred.label || 'Тариф', dayType, range].filter(Boolean).join(', ');
        if (!topPrice) return `<span class="gym-card-meta">${window.AppCore.escapeHtml(title || 'Тариф')}</span>`;
        return `<span class="gym-card-price"><span class="gym-card-price-label">${window.AppCore.escapeHtml(title || 'Тариф')}</span><strong class="gym-card-price-value">${window.AppCore.escapeHtml(topPrice)}</strong></span>`;
    }

    function renderCards() {
        if (!cardsContainer) return;
        cardsContainer.innerHTML = state.gyms.map((gym) => {
            const summary = buildGymSummary(gym.name);
            return `<button type="button" class="gym-card" data-gym-id="${window.AppCore.escapeHtml(gym.id)}">
                <span class="gym-card-title"><img src="${encodeURI(gym.icon || '')}" alt="">${window.AppCore.escapeHtml(gym.name)}</span>
                <span class="gym-card-meta">Ближайший поход: ${window.AppCore.escapeHtml(summary.upcoming)}</span>
                <span class="gym-card-meta">Последний поход: ${window.AppCore.escapeHtml(summary.last)}</span>
                <span class="gym-card-pricing">${renderPricingPreview(gym)}</span>
            </button>`;
        }).join('');
        updateCardsLayoutClass();
    }

    function updateCardsLayoutClass() {
        const cards = cardsContainer.querySelectorAll('.gym-card');
        if (!cards.length) {
            cardsContainer.classList.remove('is-list-layout');
            return;
        }
        const containerWidth = cardsContainer.clientWidth;
        const isListLayout = Array.from(cards).every(card => card.offsetWidth >= containerWidth * 0.9);
        cardsContainer.classList.toggle('is-list-layout', isListLayout);
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
            if (name === 'mapUrl' || name === 'clickableRefs') return '';
            if (name === 'address') {
                const mapUrl = (((gym.details || {})[section.key] || {}).mapUrl || '').trim();
                if (!String(value || '').trim()) return '';
                return `<div class="gym-modal-static"><span>${label}</span><strong ${mapUrl ? 'class="gym-address-link" data-address-link="1"' : ''}>${window.AppCore.escapeHtml(String(value))}</strong></div>`;
            }
            if (!String(value || '').trim()) return '';
            if (type === 'checkbox') return `<div class="gym-modal-static gym-modal-static-chip"><strong>${window.AppCore.escapeHtml(label)}</strong></div>`;
            if (type === 'number' && ['popularity', 'ventilation'].includes(name)) {
                const numericValue = Number(value);
                if (Number.isFinite(numericValue)) {
                    const clamped = Math.max(1, Math.min(10, numericValue));
                    return `<div class="gym-modal-static"><span>${label}</span><strong class="gym-score" style="--score:${clamped}">${window.AppCore.escapeHtml(String(value))}</strong></div>`;
                }
            }
            return `<div class="gym-modal-static"><span>${label}</span><strong>${window.AppCore.escapeHtml(String(value))}</strong></div>`;
        }

        if (type === 'checkbox') return `<label class="gym-modal-field gym-modal-check"><span>${label}</span><input data-section="${section.key}" data-name="${name}" type="checkbox" class="uncertain-checkbox" ${value ? 'checked' : ''}></label>`;
        if (type === 'textarea') return `<label class="gym-modal-field"><span>${label}</span><textarea data-section="${section.key}" data-name="${name}">${window.AppCore.escapeHtml(value || '')}</textarea></label>`;
        return `<label class="gym-modal-field"><span>${label}</span><input data-section="${section.key}" data-name="${name}" type="${type}" value="${window.AppCore.escapeHtml(value || '')}"></label>`;
    }

    function animateModeSwitch() {
        gymModalBody.classList.remove('gym-modal-mode-switch');
        void gymModalBody.offsetWidth;
        gymModalBody.classList.add('gym-modal-mode-switch');
    }

    function syncPricingSlotsDraftFromForm() {
        if (!state.editMode) return;
        const gym = state.gyms.find(item => item.id === state.selectedGymId);
        if (!gym) return;
        gym.details = { ...(gym.details || {}), pricingSlots: collectPricingSlotsFromForm(gymModalBody, { includeEmpty: true }) };
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
        details.pricingSlots = collectPricingSlotsFromForm(gymModalBody);

        const optimisticGym = withFingerprint({ ...gym, details, pending: true, optimisticCreatedAt: Date.now() });
        state.gyms[gymIndex] = optimisticGym;
        state.gymShadows.push({ id: optimisticGym.id, fingerprint: optimisticGym.fingerprint, createdAt: Date.now() });
        persistGyms(state.gyms);
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
        const mergeResult = mergeServerWithOptimisticGyms(serverGyms, state.gyms, state.gymShadows);
        state.gymShadows = mergeResult.gymShadows;
        if (JSON.stringify(state.gyms) === JSON.stringify(mergeResult.gyms)) return;
        state.gyms = mergeResult.gyms.map(item => withFingerprint({ ...item, pending: false, optimisticCreatedAt: 0 }));
        persistGyms(state.gyms);
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
        const calendarModalOpen = document.getElementById('modal')?.classList.contains('open');
        const chatPanelOpen = document.getElementById('chatPanel')?.classList.contains('open');
        if (!calendarModalOpen && !chatPanelOpen) {
            document.body.style.overflow = '';
        }
    }

    function openGymModalByName(gymName) {
        const targetName = String(gymName || '').trim().toLowerCase();
        if (!targetName) return false;
        const gym = state.gyms.find(item => item.name.trim().toLowerCase() === targetName);
        if (!gym) return false;
        openGymModal(gym.id);
        return true;
    }

    function openGymModalByReference(reference) {
        const matched = window.AppCore.resolveGymByReference(reference);
        if (!matched) return false;
        const gym = state.gyms.find(item => item.id === matched.id) || state.gyms.find(item => item.name === matched.name);
        if (!gym) return false;
        openGymModal(gym.id);
        return true;
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

    function initializeGymsData() {
        const cachedGyms = loadCachedGyms();
        if (cachedGyms) {
            state.gyms = cachedGyms;
        } else {
            state.gyms = fallbackGymsFromConfig();
            persistGyms(state.gyms);
        }
        renderCards();
        syncGyms();
    }

    async function initializeGymsPage() {
        loadSocialMode();
        updateSocialModeUi();

        initializeGymsData();

        cardsContainer.addEventListener('click', (event) => {
            const card = event.target.closest('.gym-card');
            if (!card) return;
            openGymModal(card.getAttribute('data-gym-id'));
        });

        gymEditToggle.addEventListener('click', async () => {
            if (state.editMode) {
                const savePromise = saveGym();
                state.editMode = false;
                renderGymModal();
                await savePromise;
                return;
            }
            state.editMode = true;
            renderGymModal();
        });

        gymModal.addEventListener('keydown', async (event) => {
            if (event.key !== 'Enter' || !state.editMode) return;
            if (event.target && event.target.tagName === 'TEXTAREA') return;
            event.preventDefault();
            const savePromise = saveGym();
            state.editMode = false;
            renderGymModal();
            await savePromise;
        });

        gymModalBody.addEventListener('click', (event) => {
            if (!state.editMode) return;
            if (event.target.id === 'addPricingSlot') {
                syncPricingSlotsDraftFromForm();
                const gym = state.gyms.find(item => item.id === state.selectedGymId);
                if (!gym) return;
                const next = [...getPricingSlots(gym), { label: '', dayType: '', start: '', end: '', isSocial: 'no', tariffType: 'single', prices: {} }];
                gym.details = { ...(gym.details || {}), pricingSlots: next };
                renderGymModal();
                return;
            }
            const trigger = event.target.closest('[data-slot-select-trigger]');
            if (trigger) {
                const container = trigger.closest('.custom-select');
                if (!container) return;
                const isOpen = container.classList.contains('open');
                gymModalBody.querySelectorAll('.custom-select.open').forEach(node => {
                    node.classList.remove('open');
                    const nodeTrigger = node.querySelector('[data-slot-select-trigger]');
                    if (nodeTrigger) nodeTrigger.setAttribute('aria-expanded', 'false');
                });
                if (!isOpen) {
                    container.classList.add('open');
                    trigger.setAttribute('aria-expanded', 'true');
                }
                return;
            }
            const option = event.target.closest('[data-slot-select-option]');
            if (option) {
                const container = option.closest('.custom-select');
                if (!container) return;
                const nextValue = option.getAttribute('data-slot-select-option') || '';
                const input = container.querySelector('input[data-slot-field]');
                const valueNode = container.querySelector('.custom-select-value');
                if (input) input.value = nextValue;
                if (valueNode) valueNode.textContent = option.textContent || '';
                container.querySelectorAll('[data-slot-select-option]').forEach(node => node.classList.toggle('active', node === option));
                container.classList.remove('open');
                const localTrigger = container.querySelector('[data-slot-select-trigger]');
                if (localTrigger) localTrigger.setAttribute('aria-expanded', 'false');
                if (input && input.getAttribute('data-slot-field') === 'tariffType') {
                    syncPricingSlotsDraftFromForm();
                    renderGymModal();
                }
                return;
            }
            const removeButton = event.target.closest('[data-remove-slot]');
            if (!removeButton) {
                gymModalBody.querySelectorAll('.custom-select.open').forEach(node => {
                    node.classList.remove('open');
                    const nodeTrigger = node.querySelector('[data-slot-select-trigger]');
                    if (nodeTrigger) nodeTrigger.setAttribute('aria-expanded', 'false');
                });
                return;
            }
            syncPricingSlotsDraftFromForm();
            const gym = state.gyms.find(item => item.id === state.selectedGymId);
            if (!gym) return;
            const idx = Number(removeButton.getAttribute('data-remove-slot'));
            gym.details = { ...(gym.details || {}), pricingSlots: getPricingSlots(gym).filter((_, i) => i !== idx) };
            renderGymModal();
        });

        gymModalBody.addEventListener('click', (event) => {
            if (state.editMode) return;
            const socialModeToggle = event.target.closest('[data-social-pricing-toggle]');
            if (socialModeToggle) {
                event.preventDefault();
                state.socialMode = !state.socialMode;
                persistSocialMode();
                updateSocialModeUi();
                renderCards();
                renderGymModal();
                return;
            }
            const addressNode = event.target.closest('[data-address-link]');
            if (!addressNode) return;
            const gym = state.gyms.find(item => item.id === state.selectedGymId);
            const url = gym?.details?.contacts?.mapUrl;
            if (url) window.open(url, '_blank', 'noopener');
        });
        gymOverlay.addEventListener('click', closeGymModal);
        window.addEventListener('resize', updateCardsLayoutClass);
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
    window.GymsPage = { initializeGymsPage, refreshFromCalendarEvents, syncGyms, openGymModalByName, openGymModalByReference };
})();

if (window.GymsPage && typeof window.GymsPage.initializeGymsPage === 'function') {
    window.GymsPage.initializeGymsPage();
}
