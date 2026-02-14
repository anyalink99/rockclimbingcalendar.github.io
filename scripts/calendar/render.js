(function () {
    const { CalendarState, CalendarConfig, CalendarDom, CalendarData, CalendarUI } = window;

    function renderGymIcons(dayEvents, dateStr) {
        const uniqueGyms = [...new Set(dayEvents.map(item => String(item.gym || '').trim()).filter(Boolean))].slice(0, 4);
        const previousGyms = CalendarState.previousCalendarGymsByDate[dateStr] || new Set();
        return `<div class="gym-icons">${uniqueGyms.map((gym) => {
            const isNew = !previousGyms.has(gym) ? ' is-new' : '';
            const meta = CalendarConfig.gymMeta[gym] || CalendarConfig.defaultGymMeta[gym];
            if (!meta || !meta.image) {
                return `<span class="gym-icon${isNew}" title="${window.AppCore.escapeHtml(gym)}"></span>`;
            }
            return `<span class="gym-icon${isNew}" title="${window.AppCore.escapeHtml(gym)}"><img src="${encodeURI(meta.image)}" alt="${window.AppCore.escapeHtml(gym)}"></span>`;
        }).join('')}</div>`;
    }

    function renderCalendar() {
        const nextCalendarGymsByDate = {};
        const eventsByDateIndex = CalendarData.buildEventsByDateIndex(CalendarState.events);
        CalendarDom.calendar.innerHTML = '';
        CalendarDom.monthTitle.innerText = CalendarState.currentMonth.format('MMMM YYYY').replace(/^./, m => m.toUpperCase());

        ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].forEach((d) => {
            CalendarDom.calendar.innerHTML += `<div class="weekday">${d}</div>`;
        });

        const startOffset = CalendarState.currentMonth.startOf('month').isoWeekday() - 1;
        const daysInMonth = CalendarState.currentMonth.daysInMonth();
        for (let i = 0; i < startOffset; i++) CalendarDom.calendar.innerHTML += '<div></div>';

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = CalendarState.currentMonth.date(d).format('YYYY-MM-DD');
            const { sure: sureEvents, unsure: unsureEvents } = CalendarData.getEventsByDate(dateStr, eventsByDateIndex);
            const hasUnsureOnly = sureEvents.length === 0 && unsureEvents.length > 0;
            nextCalendarGymsByDate[dateStr] = new Set([...new Set(sureEvents.map(item => item.gym))].slice(0, 4));
            const isToday = dayjs().format('YYYY-MM-DD') === dateStr;

            CalendarDom.calendar.innerHTML += `
                <div class="day ${isToday ? 'today' : ''} ${sureEvents.length ? 'has-events' : ''} ${hasUnsureOnly ? 'has-unsure-only' : ''}" onpointerdown="openModal('${dateStr}')">
                    <div>${d}</div>
                    ${sureEvents.length ? renderGymIcons(sureEvents, dateStr) : '<div></div>'}
                    <div class="count">${sureEvents.length ? `${sureEvents.length} <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8.5" cy="8" r="2.5"></circle><path d="M3.8 16.6c.3-2.2 2-3.6 4.7-3.6s4.4 1.4 4.7 3.6"></path><circle cx="16" cy="8.8" r="2"></circle><path d="M13.3 16.6c.23-1.75 1.46-2.86 3.4-2.86 1.84 0 3.03 1.04 3.3 2.86"></path></svg>` : ''}</div>
                </div>`;
        }

        CalendarState.previousCalendarGymsByDate = nextCalendarGymsByDate;
    }

    function openModal(date) {
        CalendarState.selectedDate = date;
        CalendarDom.modalDateTitle.innerText = dayjs(date).format('DD MMMM YYYY');

        const eventsByDateIndex = CalendarData.buildEventsByDateIndex(CalendarState.events);
        const { sure: sureEvents, unsure: unsureEvents } = CalendarData.getEventsByDate(date, eventsByDateIndex);
        const orderedEvents = [...sureEvents, ...unsureEvents];
        const previousModalKeys = CalendarState.modalEventKeysByDate[date] || new Set();
        const nextModalKeys = new Set();
        const fingerprintCounts = {};

        CalendarDom.visitsList.innerHTML = orderedEvents.length ? orderedEvents.map((event) => {
            const sameFingerprintCount = (fingerprintCounts[event.fingerprint] || 0) + 1;
            fingerprintCounts[event.fingerprint] = sameFingerprintCount;
            const eventKey = `${event.fingerprint}|${sameFingerprintCount}`;
            nextModalKeys.add(eventKey);
            const isNew = previousModalKeys.has(eventKey) ? '' : ' is-new';
            return `<div class="visit-item${isNew} ${event.unsure ? 'uncertain' : ''}"><div class="visit-text"><b class="visit-name${event.unsure ? ' uncertain' : ''}">${window.AppCore.escapeHtml(event.name)}${event.unsure ? ' (?)' : ''}</b> – ${window.AppCore.escapeHtml(event.gym)}${event.time ? ` (${window.AppCore.escapeHtml(event.time)})` : ''}</div><button class="delete-btn" onclick="deleteVisit('${window.AppCore.escapeHtml(event.id)}')">Удалить</button></div>`;
        }).join('') : 'Пока никто не записался';

        CalendarState.modalEventKeysByDate[date] = nextModalKeys;
        const baseEvent = sureEvents[0] || unsureEvents[0] || null;
        if (baseEvent) {
            CalendarUI.setCustomSelectValue('gymSelectUi', 'gymSelect', baseEvent.gym);
            if (baseEvent.time) CalendarUI.setCustomSelectValue('visitTimeUi', 'visitTime', baseEvent.time);
        }

        if (CalendarState.modalUnlockTimeoutId) clearTimeout(CalendarState.modalUnlockTimeoutId);
        document.body.style.overflow = 'hidden';
        CalendarDom.overlay.classList.add('open');
        CalendarDom.modal.classList.add('open');
        CalendarUI.lockModalInteraction();
        CalendarDom.visitUncertain.checked = false;
    }

    window.CalendarRender = { renderCalendar, openModal };
})();
