dayjs.extend(window.dayjs_plugin_isoWeek);
dayjs.locale('ru');

const API_URL = 'https://script.google.com/macros/s/AKfycbywsHJJz9FzGV3J3G_02MR1UAyTGdT6ldqVto82zJbSFF4C2snqAZWAH2q_kpaFbp0C/exec';
const state = {
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
const EVENTS_CACHE_KEY = 'climbEventsCache';
const THEME_STORAGE_KEY = 'climbTheme';
const SYNC_INTERVAL_MS = 10_000;
const SHADOW_TTL_MS = 5_000;
const UTC_PLUS_3_OFFSET_MINUTES = 3 * 60;
const MODAL_INTERACTION_LOCK_MS = 300;
const UNSURE_MARK = ' (?)';

const gymMeta = {
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
};

const gymOptions = [
    'Bigwall Динамо',
    'Bigwall Гавань',
    'Bigwall Ривьера',
    'ClimbLab Бутырская',
    'ClimbLab Аминьевская',
    "Tengu's Мичуринский",
    "Tengu's Южная",
    'Limestone',
    'Rockzona',
    'Tokyo',
    'ЦСКА'
];

const overlayElement = document.getElementById('overlay');
const modalElement = document.getElementById('modal');
const themeCycleButtonElement = document.getElementById('themeCycleButton');

const themes = [
    { value: 'midnight', label: 'Ночная классика' },
    { value: 'grandmaster', label: 'Шахматный гроссмейстер' },
    { value: 'ivory', label: 'Светлый беж' },
    { value: 'forest', label: 'Лесной зал' },
    { value: 'ocean', label: 'Океанский бриз' }
];

document.getElementById('userName').value = localStorage.getItem('climberName') || '';
document.getElementById('userName').addEventListener('input', (e) => {
    localStorage.setItem('climberName', e.target.value.trim());
});
initializeThemeSwitcher();
initializeModalControls();

// ===== Utilities =====
function escapeHtml(str) {
    return str.replace(/[&<>"']/g, m => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
    }[m]));
}

function setEvents(nextEvents) {
    state.events = nextEvents;
}

function applyTheme(themeValue) {
    const isKnownTheme = themes.some(theme => theme.value === themeValue);
    const activeTheme = isKnownTheme ? themeValue : 'midnight';
    if (activeTheme === 'midnight') {
        document.documentElement.removeAttribute('data-theme');
    } else {
        document.documentElement.setAttribute('data-theme', activeTheme);
    }
    localStorage.setItem(THEME_STORAGE_KEY, activeTheme);
    const activeThemeMeta = themes.find(theme => theme.value === activeTheme) || themes[0];
    themeCycleButtonElement.setAttribute('title', `Тема: ${activeThemeMeta.label} (нажми, чтобы переключить)`);
    themeCycleButtonElement.setAttribute('aria-label', `Тема: ${activeThemeMeta.label}. Нажми, чтобы переключить`);
}

function initializeThemeSwitcher() {
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'midnight';
    applyTheme(storedTheme);
}

function cycleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'midnight';
    const currentIndex = themes.findIndex(theme => theme.value === currentTheme);
    const nextIndex = (currentIndex + 1) % themes.length;
    applyTheme(themes[nextIndex].value);
}

function isModalOpen() {
    return modalElement.classList.contains('open');
}

function buildEventsByDateIndex(eventsList) {
    const byDate = new Map();
    eventsList.forEach(event => {
        if (!byDate.has(event.date)) byDate.set(event.date, []);
        byDate.get(event.date).push(event);
    });
    return byDate;
}

// ===== UI controls =====

function initializeModalControls() {
    renderCustomSelect({
        uiId: 'gymSelectUi',
        inputId: 'gymSelect',
        options: gymOptions,
        defaultValue: gymOptions[0],
        placeholder: 'Выбери скалодром'
    });

    const timeOptions = [];
    for (let hour = 0; hour < 24; hour++) {
        for (let minute = 0; minute < 60; minute += 15) {
            timeOptions.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
        }
    }

    renderCustomSelect({
        uiId: 'visitTimeUi',
        inputId: 'visitTime',
        options: timeOptions,
        defaultValue: '19:00',
        placeholder: 'Выбери время'
    });
}

function renderCustomSelect({ uiId, inputId, options, defaultValue, placeholder }) {
    const container = document.getElementById(uiId);
    const input = document.getElementById(inputId);
    input.value = defaultValue;

    container.innerHTML = `
        <button type="button" class="custom-select-trigger" data-role="trigger" aria-expanded="false">
            <span class="custom-select-value">${escapeHtml(defaultValue || placeholder)}</span>
            <span class="custom-select-arrow">▾</span>
        </button>
        <div class="custom-select-menu" data-role="menu"></div>
    `;

    const trigger = container.querySelector('[data-role="trigger"]');
    const valueNode = container.querySelector('.custom-select-value');
    const menu = container.querySelector('[data-role="menu"]');

    menu.innerHTML = options.map(option => `
        <button type="button" class="custom-select-option ${option === defaultValue ? 'active' : ''}" data-value="${escapeHtml(option)}">${escapeHtml(option)}</button>
    `).join('');

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
    options.forEach(option => {
        const isMatch = option.getAttribute('data-value') === value;
        option.classList.toggle('active', isMatch);
        if (isMatch) matchedOption = option;
    });

    if (!matchedOption) return;

    input.value = value;
    if (valueNode) valueNode.textContent = value;
}

function closeAllCustomSelects() {
    document.querySelectorAll('.custom-select.open').forEach(select => {
        select.classList.remove('open');
        const trigger = select.querySelector('[data-role="trigger"]');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
}

function scrollActiveOptionIntoView(container) {
    const menu = container.querySelector('[data-role="menu"]');
    const activeOption = container.querySelector('.custom-select-option.active');
    if (!menu || !activeOption) return;

    const optionTop = activeOption.offsetTop;
    const optionHeight = activeOption.offsetHeight;
    const targetScroll = optionTop - (menu.clientHeight / 2) + (optionHeight / 2);
    menu.scrollTop = Math.max(0, targetScroll);
}

document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('.custom-select')) {
        closeAllCustomSelects();
    }

});

overlayElement.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (isModalInteractionLocked()) return;
    closeModal({ deferUnlock: true });
});

overlayElement.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
});

modalElement.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
});

function isModalInteractionLocked() {
    return Date.now() < state.modalInteractionUnlockedAt;
}

function lockModalInteraction() {
    if (state.modalInteractionTimeoutId) {
        clearTimeout(state.modalInteractionTimeoutId);
        state.modalInteractionTimeoutId = null;
    }

    state.modalInteractionToken += 1;
    const token = state.modalInteractionToken;
    state.modalInteractionUnlockedAt = Date.now() + MODAL_INTERACTION_LOCK_MS;
    modalElement.classList.add('interaction-locked');
    state.modalInteractionTimeoutId = setTimeout(() => {
        if (token !== state.modalInteractionToken) return;
        modalElement.classList.remove('interaction-locked');
        state.modalInteractionTimeoutId = null;
    }, MODAL_INTERACTION_LOCK_MS);
}

// ===== Data normalization and API =====

async function fetchEventsSnapshot() {
    try {
        const res = await fetch(API_URL);
        const rawData = await res.json();
        return normalizeEvents(rawData);
    } catch (e) {
        return null;
    }

}

function normalizeEvents(rawData) {
    if (!Array.isArray(rawData)) return [];

    if (rawData.length > 0 && !Array.isArray(rawData[0])) {
        return rawData
            .filter(item => item && item.date && item.name)
            .map(item => {
                const parsed = parseUnsureFromName(item.name);
                return {
                    ...item,
                    date: normalizeDate(item.date),
                    name: parsed.name,
                    time: normalizeTime(item.time),
                    unsure: normalizeUnsure(item.unsure) || parsed.unsure,
                    row: item.row || item.id || null,
                    id: String(item.id || item.row || crypto.randomUUID())
                };
            })
            .map(withFingerprint)
            .filter(item => item.date);
    }

    return rawData
        .map((row, index) => ({ row, sourceRow: index + 1 }))
        .filter(({ row }) => Array.isArray(row) && row.length >= 4)
        .map(({ row, sourceRow }) => {
            const [date, name, gym, time, unsure] = row;
            const parsed = parseUnsureFromName(name);
            return {
                row: sourceRow,
                date: normalizeDate(date),
                name: parsed.name,
                gym: String(gym || ''),
                time: normalizeTime(time),
                unsure: normalizeUnsure(unsure) || parsed.unsure,
                id: String(sourceRow)
            };
        })
        .map(withFingerprint)
        .filter(item => item.date && item.name);
}

function parseUnsureFromName(nameValue) {
    const rawName = String(nameValue || '').trim();
    if (!rawName) return { name: '', unsure: false };
    if (!rawName.endsWith(UNSURE_MARK)) return { name: rawName, unsure: false };
    return {
        name: rawName.slice(0, -UNSURE_MARK.length).trim(),
        unsure: true
    };
}

function withFingerprint(item) {
    return {
        ...item,
        fingerprint: eventFingerprint(item)
    };
}

function eventFingerprint(item) {
    return [item.date || '', item.name || '', item.gym || '', item.time || '', item.unsure ? '1' : '0'].join('|');
}

function normalizeUnsure(value) {
    if (typeof value === 'boolean') return value;
    const raw = String(value || '').trim().toLowerCase();
    return raw === 'true' || raw === '1' || raw === 'да' || raw === 'yes';
}

function normalizeDate(input) {
    if (!input) return '';
    const raw = String(input).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

    if (looksLikeDateTime(raw)) {
        const parsed = new Date(raw);
        if (!Number.isNaN(parsed.getTime())) {
            return formatDateForUtcPlus3(parsed);
        }
    }

    const parsed = dayjs(raw);
    return parsed.isValid() ? parsed.format('YYYY-MM-DD') : '';
}

function normalizeTime(input) {
    if (input == null || input === '') return '';
    const raw = String(input).trim();
    if (/^\d{2}:\d{2}:\d{2}$/.test(raw)) return raw.slice(0, 5);
    if (/^\d{2}:\d{2}$/.test(raw)) return raw;
    if (looksLikeDateTime(raw)) {
        const parsed = new Date(raw);
        if (!Number.isNaN(parsed.getTime())) {
            return formatTimeForUtcPlus3(parsed);
        }
    }

    const isoTime = raw.match(/T(\d{2}:\d{2})/);
    if (isoTime) return isoTime[1];
    const plainTime = raw.match(/\b(\d{2}:\d{2})(?::\d{2})?\b/);
    if (plainTime) return plainTime[1];
    return raw;
}

function looksLikeDateTime(value) {
    return /T/.test(value) || /[zZ]|[+-]\d{2}:?\d{2}/.test(value);
}

function toUtcPlus3(dateObj) {
    return new Date(dateObj.getTime() + UTC_PLUS_3_OFFSET_MINUTES * 60_000);
}

function formatDateForUtcPlus3(dateObj) {
    const shifted = toUtcPlus3(dateObj);
    const year = shifted.getUTCFullYear();
    const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    const day = String(shifted.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatTimeForUtcPlus3(dateObj) {
    const shifted = toUtcPlus3(dateObj);
    const hours = String(shifted.getUTCHours()).padStart(2, '0');
    const minutes = String(shifted.getUTCMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

function getEventsByDate(dateStr, eventsByDateIndex = buildEventsByDateIndex(state.events)) {
    const dayEvents = eventsByDateIndex.get(dateStr) || [];
    return {
        all: dayEvents,
        sure: dayEvents.filter(event => !event.unsure),
        unsure: dayEvents.filter(event => event.unsure)
    };
}

// ===== Rendering =====

function renderGymIcons(dayEvents, dateStr) {
    const uniqueGyms = [...new Set(dayEvents.map(item => item.gym))].slice(0, 4);
    const previousGyms = state.previousCalendarGymsByDate[dateStr] || new Set();
    return `<div class="gym-icons">${uniqueGyms.map(gym => {
        const meta = gymMeta[gym];
        if (!meta || !meta.image) {
            const isNew = !previousGyms.has(gym) ? " is-new" : "";
            return `<span class="gym-icon${isNew}" title="${escapeHtml(gym)}"></span>`;
        }

        const isNew = !previousGyms.has(gym) ? " is-new" : "";
        return `<span class="gym-icon${isNew}" title="${escapeHtml(gym)}"><img src="${encodeURI(meta.image)}" alt="${escapeHtml(gym)}"></span>`;
    }).join('')}</div>`;
}

function renderCalendar() {
    const calendar = document.getElementById('calendar');
    const nextCalendarGymsByDate = {};
    const eventsByDateIndex = buildEventsByDateIndex(state.events);
    calendar.innerHTML = '';

    document.getElementById('monthTitle').innerText =
        state.currentMonth.format('MMMM YYYY').replace(/^./, m => m.toUpperCase());

    const weekdays = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
    weekdays.forEach(d => {
        calendar.innerHTML += `<div class="weekday">${d}</div>`;
    });

    const startOffset = state.currentMonth.startOf('month').isoWeekday() - 1;
    const daysInMonth = state.currentMonth.daysInMonth();

    for (let i=0;i<startOffset;i++) {
        calendar.innerHTML += `<div></div>`;
    }

    for (let d=1; d<=daysInMonth; d++) {
        const dateStr = state.currentMonth.date(d).format('YYYY-MM-DD');
        const { sure: sureEvents, unsure: unsureEvents } = getEventsByDate(dateStr, eventsByDateIndex);
        const hasUnsureOnly = sureEvents.length === 0 && unsureEvents.length > 0;
        nextCalendarGymsByDate[dateStr] = new Set([...new Set(sureEvents.map(item => item.gym))].slice(0, 4));

        const isToday = dayjs().format('YYYY-MM-DD') === dateStr;

        calendar.innerHTML += `
        <div class="day ${isToday?'today':''} ${sureEvents.length?'has-events':''} ${hasUnsureOnly ? 'has-unsure-only' : ''}"
            onpointerdown="openModal('${dateStr}')">
            <div>${d}</div>
            ${sureEvents.length ? renderGymIcons(sureEvents, dateStr) : '<div></div>'}
            <div class="count">${sureEvents.length ? `${sureEvents.length} <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8.5" cy="8" r="2.5"></circle><path d="M3.8 16.6c.3-2.2 2-3.6 4.7-3.6s4.4 1.4 4.7 3.6"></path><circle cx="16" cy="8.8" r="2"></circle><path d="M13.3 16.6c.23-1.75 1.46-2.86 3.4-2.86 1.84 0 3.03 1.04 3.3 2.86"></path></svg>` : ''}</div>
        </div>`;
    }

    state.previousCalendarGymsByDate = nextCalendarGymsByDate;

}

function openModal(date) {
    state.selectedDate = date;
    document.getElementById('modalDateTitle').innerText =
        dayjs(date).format('DD MMMM YYYY');

    const eventsByDateIndex = buildEventsByDateIndex(state.events);
    const { sure: sureEvents, unsure: unsureEvents } = getEventsByDate(date, eventsByDateIndex);
    const orderedEvents = [...sureEvents, ...unsureEvents];

    const previousModalKeys = state.modalEventKeysByDate[date] || new Set();
    const nextModalKeys = new Set();

    const fingerprintCounts = {};
    document.getElementById('visitsList').innerHTML =
        orderedEvents.length
        ? orderedEvents.map(e => {
            const sameFingerprintCount = (fingerprintCounts[e.fingerprint] || 0) + 1;
            fingerprintCounts[e.fingerprint] = sameFingerprintCount;
            const eventKey = `${e.fingerprint}|${sameFingerprintCount}`;
            nextModalKeys.add(eventKey);
            const isNew = previousModalKeys.has(eventKey) ? '' : ' is-new';
            return `<div class="visit-item${isNew} ${e.unsure ? 'uncertain' : ''}"><div class="visit-text"><b class="visit-name${e.unsure ? ' uncertain' : ''}">${escapeHtml(e.name)}${e.unsure ? ' (?)' : ''}</b> – ${escapeHtml(e.gym)}${e.time ? ` (${escapeHtml(e.time)})` : ''}</div>
                <button class="delete-btn" onclick="deleteVisit('${escapeHtml(e.id)}')">Удалить</button></div>`;
          }).join('')
        : 'Пока никто не записался';

    state.modalEventKeysByDate[date] = nextModalKeys;

    const baseEvent = sureEvents[0] || unsureEvents[0] || null;
    if (baseEvent) {
        setCustomSelectValue('gymSelectUi', 'gymSelect', baseEvent.gym);
        if (baseEvent.time) {
            setCustomSelectValue('visitTimeUi', 'visitTime', baseEvent.time);
        }
    }

    if (state.modalUnlockTimeoutId) {
        clearTimeout(state.modalUnlockTimeoutId);
        state.modalUnlockTimeoutId = null;
    }
    document.body.style.overflow = 'hidden';
    overlayElement.classList.add('open');
    modalElement.classList.add('open');
    lockModalInteraction();
    document.getElementById('visitUncertain').checked = false;
}

function closeModal({ deferUnlock = false } = {}) {
    state.modalInteractionToken += 1;
    state.modalInteractionUnlockedAt = 0;
    modalElement.classList.remove('interaction-locked');
    if (state.modalInteractionTimeoutId) {
        clearTimeout(state.modalInteractionTimeoutId);
        state.modalInteractionTimeoutId = null;
    }

    overlayElement.classList.remove('open');
    modalElement.classList.remove('open');

    const unlockScroll = () => {
        document.body.style.overflow = '';
        state.modalUnlockTimeoutId = null;
    };

    if (state.modalUnlockTimeoutId) {
        clearTimeout(state.modalUnlockTimeoutId);
    }

    if (deferUnlock) {
        state.modalUnlockTimeoutId = setTimeout(unlockScroll, 0);
        return;
    }

    unlockScroll();
}

document.addEventListener('keydown', e=>{
    if(e.key==='Escape') closeModal();
});

// ===== User actions and sync =====


function rerenderCalendarAndModal() {
    renderCalendar();
    if (state.selectedDate) {
        openModal(state.selectedDate);
    }
}

async function submitVisit() {
    const name = (localStorage.getItem('climberName') || '').trim();
    if (!name) return alert('Сначала введи имя');

    const newEvent = withFingerprint({
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        date: state.selectedDate,
        name,
        gym: document.getElementById('gymSelect').value,
        time: document.getElementById('visitTime').value,
        unsure: document.getElementById('visitUncertain').checked,
        pending: true,
        optimisticCreatedAt: Date.now(),
        row: null
    });

    state.events.push(newEvent);
    persistEvents();
    rerenderCalendarAndModal();

    const created = await createVisitOnServer(newEvent);
    if (!created) {
        setEvents(state.events.filter(event => event.id !== newEvent.id));
        persistEvents();
        rerenderCalendarAndModal();
        alert('Не удалось сохранить запись. Попробуй еще раз.');
        return;
    }

    await syncChanges();
}

async function createVisitOnServer(newEvent) {
    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: {'Content-Type': 'text/plain;charset=utf-8'},
            body: JSON.stringify({
                date: newEvent.date,
                name: newEvent.unsure ? `${newEvent.name}${UNSURE_MARK}` : newEvent.name,
                gym: newEvent.gym,
                time: newEvent.time,
                unsure: newEvent.unsure
            })
        });
        return res.ok;
    } catch {
        return false;
    }

}

async function deleteVisit(eventId) {
    const target = state.events.find(event => event.id === eventId);
    if (!target) return;

    setEvents(state.events.filter(event => event.id !== eventId));
    state.deletionShadows.push({
        fingerprint: target.fingerprint,
        createdAt: Date.now()
    });
    pruneDeletionShadows();
    persistEvents();
    rerenderCalendarAndModal();

    if (!target.row) return;

    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: {'Content-Type': 'text/plain;charset=utf-8'},
            body: JSON.stringify({ action: 'delete', row: target.row })
        });

        if (res.ok) await syncChanges();
    } catch {
        // локальная запись уже удалена, восстановление не требуется
    }

}

function persistEvents() {
    localStorage.setItem(EVENTS_CACHE_KEY, JSON.stringify(state.events));
}

function pruneDeletionShadows(now = Date.now()) {
    state.deletionShadows = state.deletionShadows.filter(item => now - item.createdAt < SHADOW_TTL_MS);
}

function loadCachedEvents() {
    try {
        const raw = localStorage.getItem(EVENTS_CACHE_KEY);
        if (!raw) return false;
        setEvents(normalizeEvents(JSON.parse(raw)));
        renderCalendar();
        return true;
    } catch {
        return false;
    }

}

async function initializeCalendar() {
    const hasCache = loadCachedEvents();
    const serverEvents = await fetchEventsSnapshot();

    if (!serverEvents) {
        if (!hasCache) renderCalendar();
        return;
    }

    reconcileWithServerSnapshot(serverEvents);
}

function reconcileWithServerSnapshot(serverEvents) {
    const mergedEvents = mergeServerWithOptimisticEvents(serverEvents, state.events);
    const serializedCurrent = JSON.stringify(state.events);
    const serializedMerged = JSON.stringify(mergedEvents);
    if (serializedCurrent === serializedMerged) {
        return;
    }

    setEvents(mergedEvents);
    persistEvents();
    renderCalendar();
    if (isModalOpen()) {
        openModal(state.selectedDate);
    }

}

function mergeServerWithOptimisticEvents(serverEvents, currentEvents) {
    const now = Date.now();
    pruneDeletionShadows(now);

    const blockedFingerprints = new Set(state.deletionShadows.map(item => item.fingerprint));
    const filteredServerEvents = serverEvents.filter(event => !blockedFingerprints.has(event.fingerprint));
    const serverFingerprints = new Set(serverEvents.map(event => event.fingerprint));
    const optimisticEvents = currentEvents.filter(event => {
        if (!event.pending || !event.optimisticCreatedAt) return false;
        if (serverFingerprints.has(event.fingerprint)) return false;
        return now - event.optimisticCreatedAt < SHADOW_TTL_MS;
    });

    return [...filteredServerEvents, ...optimisticEvents];
}

async function syncChanges() {
    const serverEvents = await fetchEventsSnapshot();
    if (!serverEvents) return;
    reconcileWithServerSnapshot(serverEvents);
}

function shiftMonthBy(step) {
    const wrap = document.getElementById('calendarWrap');
    const title = document.getElementById('monthTitle');
    wrap.classList.remove('slide-left', 'slide-right');
    title.classList.remove('slide-left', 'slide-right');
    wrap.classList.add(step > 0 ? 'slide-left' : 'slide-right', 'animating');
    title.classList.add(step > 0 ? 'slide-left' : 'slide-right', 'animating');

    state.currentMonth = state.currentMonth.add(step, 'month');
    setTimeout(() => {
        renderCalendar();
        wrap.classList.remove('animating');
        title.classList.remove('animating');
    }, 80);
}

initializeCalendar();
setInterval(syncChanges, SYNC_INTERVAL_MS);
