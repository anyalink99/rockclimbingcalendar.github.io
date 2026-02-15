(function () {
    const { CalendarConfig, CalendarDom, CalendarState } = window;

    function applyTheme(themeValue) {
        const isKnownTheme = CalendarConfig.themes.some(theme => theme.value === themeValue);
        const activeTheme = isKnownTheme ? themeValue : 'midnight';
        if (activeTheme === 'midnight') {
            document.documentElement.removeAttribute('data-theme');
        } else {
            document.documentElement.setAttribute('data-theme', activeTheme);
        }
        localStorage.setItem(CalendarConfig.THEME_STORAGE_KEY, activeTheme);
        const activeThemeMeta = CalendarConfig.themes.find(theme => theme.value === activeTheme) || CalendarConfig.themes[0];
        CalendarDom.themeButton.setAttribute('title', `Тема: ${activeThemeMeta.label} (нажми, чтобы переключить)`);
        CalendarDom.themeButton.setAttribute('aria-label', `Тема: ${activeThemeMeta.label}. Нажми, чтобы переключить`);
    }

    function initializeThemeSwitcher() {
        applyTheme(localStorage.getItem(CalendarConfig.THEME_STORAGE_KEY) || 'midnight');
    }

    function cycleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'midnight';
        const currentIndex = CalendarConfig.themes.findIndex(theme => theme.value === currentTheme);
        applyTheme(CalendarConfig.themes[(currentIndex + 1) % CalendarConfig.themes.length].value);
    }

    function closeAllCustomSelects() {
        document.querySelectorAll('.custom-select.open').forEach((select) => {
            select.classList.remove('open');
            const trigger = select.querySelector('[data-role="trigger"]');
            if (trigger) trigger.setAttribute('aria-expanded', 'false');
        });
    }

    function scrollActiveOptionIntoView(container) {
        const menu = container.querySelector('[data-role="menu"]');
        const activeOption = container.querySelector('.custom-select-option.active');
        if (!menu || !activeOption) return;
        const targetScroll = activeOption.offsetTop - (menu.clientHeight / 2) + (activeOption.offsetHeight / 2);
        menu.scrollTop = Math.max(0, targetScroll);
    }

    function renderCustomSelect({ uiId, inputId, options, defaultValue, placeholder }) {
        const container = document.getElementById(uiId);
        const input = document.getElementById(inputId);
        input.value = defaultValue;

        container.innerHTML = `
            <button type="button" class="custom-select-trigger" data-role="trigger" aria-expanded="false">
                <span class="custom-select-value">${window.AppCore.escapeHtml(defaultValue || placeholder)}</span>
                <span class="custom-select-arrow">▾</span>
            </button>
            <div class="custom-select-menu" data-role="menu"></div>`;

        const trigger = container.querySelector('[data-role="trigger"]');
        const valueNode = container.querySelector('.custom-select-value');
        const menu = container.querySelector('[data-role="menu"]');
        menu.innerHTML = options.map(option => `<button type="button" class="custom-select-option ${option === defaultValue ? 'active' : ''}" data-value="${window.AppCore.escapeHtml(option)}">${window.AppCore.escapeHtml(option)}</button>`).join('');

        trigger.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            const isOpen = container.classList.contains('open');
            closeAllCustomSelects();
            if (!isOpen) {
                container.classList.add('open');
                trigger.setAttribute('aria-expanded', 'true');
                scrollActiveOptionIntoView(container);
            }
        });

        menu.addEventListener('click', (event) => {
            const optionButton = event.target.closest('.custom-select-option');
            if (!optionButton) return;
            const value = optionButton.getAttribute('data-value');
            input.value = value;
            valueNode.textContent = value;
            menu.querySelectorAll('.custom-select-option').forEach(item => item.classList.toggle('active', item === optionButton));
            closeAllCustomSelects();
        });
    }

    function setCustomSelectValue(uiId, inputId, value) {
        const container = document.getElementById(uiId);
        const input = document.getElementById(inputId);
        if (!container || !input || !value) return;
        const valueNode = container.querySelector('.custom-select-value');
        const options = container.querySelectorAll('.custom-select-option');
        let matchedOption = null;
        options.forEach((option) => {
            const isMatch = option.getAttribute('data-value') === value;
            option.classList.toggle('active', isMatch);
            if (isMatch) matchedOption = option;
        });
        if (!matchedOption) return;
        input.value = value;
        if (valueNode) valueNode.textContent = value;
    }

    function refreshGymOptions(preferredGym) {
        const currentGym = preferredGym || CalendarDom.gymSelect.value;
        const options = Array.isArray(CalendarConfig.gymOptions) && CalendarConfig.gymOptions.length
            ? CalendarConfig.gymOptions
            : CalendarConfig.defaultGymOptions;
        const defaultValue = options.includes(currentGym) ? currentGym : options[0];
        renderCustomSelect({ uiId: 'gymSelectUi', inputId: 'gymSelect', options, defaultValue, placeholder: 'Выбери скалодром' });
    }

    function initializeModalControls() {
        refreshGymOptions();
        const timeOptions = [];
        for (let hour = 0; hour < 24; hour++) {
            for (let minute = 0; minute < 60; minute += 15) {
                timeOptions.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
            }
        }
        renderCustomSelect({ uiId: 'visitTimeUi', inputId: 'visitTime', options: timeOptions, defaultValue: '19:00', placeholder: 'Выбери время' });
    }

    function isModalOpen() {
        return CalendarDom.modal.classList.contains('open');
    }

    function isModalInteractionLocked() {
        return window.AppInteractionLock.isLocked({ state: CalendarState, unlockedAtKey: 'modalInteractionUnlockedAt' });
    }

    function lockModalInteraction() {
        window.AppInteractionLock.lock({
            state: CalendarState,
            durationMs: CalendarConfig.MODAL_INTERACTION_LOCK_MS,
            tokenKey: 'modalInteractionToken',
            timeoutKey: 'modalInteractionTimeoutId',
            unlockedAtKey: 'modalInteractionUnlockedAt',
            onLock: () => CalendarDom.modal.classList.add('interaction-locked'),
            onUnlock: () => CalendarDom.modal.classList.remove('interaction-locked')
        });
    }

    function closeModal({ deferUnlock = false } = {}) {
        window.AppInteractionLock.reset({
            state: CalendarState,
            tokenKey: 'modalInteractionToken',
            timeoutKey: 'modalInteractionTimeoutId',
            unlockedAtKey: 'modalInteractionUnlockedAt',
            onUnlock: () => CalendarDom.modal.classList.remove('interaction-locked')
        });
        CalendarDom.overlay.classList.remove('open');
        CalendarDom.modal.classList.remove('open');

        const unlockScroll = () => {
            document.body.style.overflow = '';
            CalendarState.modalUnlockTimeoutId = null;
        };

        if (CalendarState.modalUnlockTimeoutId) clearTimeout(CalendarState.modalUnlockTimeoutId);
        if (deferUnlock) {
            CalendarState.modalUnlockTimeoutId = setTimeout(unlockScroll, 0);
            return;
        }
        unlockScroll();
    }

    function bindModalEventGuards() {
        document.addEventListener('pointerdown', (event) => {
            if (!event.target.closest('.custom-select')) closeAllCustomSelects();
        });

        CalendarDom.overlay.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (isModalInteractionLocked()) return;
            closeModal({ deferUnlock: true });
        });

        CalendarDom.overlay.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            event.stopPropagation();
        });

        CalendarDom.modal.addEventListener('pointerdown', (event) => {
            event.stopPropagation();
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeModal();
        });
    }

    window.CalendarUI = {
        initializeThemeSwitcher,
        cycleTheme,
        initializeModalControls,
        refreshGymOptions,
        setCustomSelectValue,
        lockModalInteraction,
        closeModal,
        isModalOpen,
        bindModalEventGuards
    };
})();
