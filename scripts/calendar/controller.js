(function () {
    const { CalendarConfig, CalendarDom, CalendarState, CalendarData, CalendarRender, CalendarUI, CalendarCatalog } = window;

    function rerenderCalendarAndModal() {
        CalendarRender.renderCalendar();
        if (window.GymsPage && typeof window.GymsPage.refreshFromCalendarEvents === 'function') window.GymsPage.refreshFromCalendarEvents();
        if (CalendarState.selectedDate) CalendarRender.openModal(CalendarState.selectedDate);
    }

    async function createVisitOnServer(newEvent) {
        try {
            const res = await fetch(CalendarConfig.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    date: newEvent.date,
                    name: newEvent.unsure ? `${newEvent.name}${CalendarConfig.UNSURE_MARK}` : newEvent.name,
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

    async function syncChanges() {
        const serverEvents = await CalendarData.fetchEventsSnapshot();
        if (!serverEvents) return;
        reconcileWithServerSnapshot(serverEvents);
    }

    function reconcileWithServerSnapshot(serverEvents) {
        const mergedEvents = CalendarData.mergeServerWithOptimisticEvents(serverEvents, CalendarState.events);
        if (JSON.stringify(CalendarState.events) === JSON.stringify(mergedEvents)) return;
        CalendarData.setEvents(mergedEvents);
        CalendarData.persistEvents();
        CalendarRender.renderCalendar();
        if (window.GymsPage && typeof window.GymsPage.refreshFromCalendarEvents === 'function') window.GymsPage.refreshFromCalendarEvents();
        if (CalendarUI.isModalOpen()) CalendarRender.openModal(CalendarState.selectedDate);
    }

    async function submitVisit() {
        const name = window.AppCore.getClimberName();
        if (!name) return alert('Сначала введи имя');

        const newEvent = CalendarData.withFingerprint({
            id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            date: CalendarState.selectedDate,
            name,
            gym: CalendarDom.gymSelect.value,
            time: CalendarDom.visitTime.value,
            unsure: CalendarDom.visitUncertain.checked,
            pending: true,
            optimisticCreatedAt: Date.now(),
            row: null
        });

        CalendarState.events.push(newEvent);
        CalendarData.persistEvents();
        rerenderCalendarAndModal();

        const created = await createVisitOnServer(newEvent);
        if (!created) {
            CalendarData.setEvents(CalendarState.events.filter(event => event.id !== newEvent.id));
            CalendarData.persistEvents();
            rerenderCalendarAndModal();
            alert('Не удалось сохранить запись. Попробуй еще раз.');
            return;
        }

        await syncChanges();
    }

    async function deleteVisit(eventId) {
        const target = CalendarState.events.find(event => event.id === eventId);
        if (!target) return;

        CalendarData.setEvents(CalendarState.events.filter(event => event.id !== eventId));
        CalendarState.deletionShadows.push({ fingerprint: target.fingerprint, createdAt: Date.now() });
        CalendarData.pruneDeletionShadows();
        CalendarData.persistEvents();
        rerenderCalendarAndModal();

        if (!target.row) return;

        try {
            const res = await fetch(CalendarConfig.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'delete', row: target.row })
            });
            if (res.ok) await syncChanges();
        } catch {
            // локальная запись уже удалена
        }
    }


    function openGymByReference(reference) {
        if (!window.GymsPage || typeof window.GymsPage.openGymModalByReference !== 'function') return;
        window.GymsPage.openGymModalByReference(reference);
    }

    function shiftMonthBy(step) {
        CalendarDom.calendarWrap.classList.remove('slide-left', 'slide-right');
        CalendarDom.monthTitle.classList.remove('slide-left', 'slide-right');
        CalendarDom.calendarWrap.classList.add(step > 0 ? 'slide-left' : 'slide-right', 'animating');
        CalendarDom.monthTitle.classList.add(step > 0 ? 'slide-left' : 'slide-right', 'animating');

        CalendarState.currentMonth = CalendarState.currentMonth.add(step, 'month');
        setTimeout(() => {
            CalendarRender.renderCalendar();
            CalendarDom.calendarWrap.classList.remove('animating');
            CalendarDom.monthTitle.classList.remove('animating');
        }, 80);
    }

    async function initializeCalendar() {
        const hasCache = CalendarData.loadCachedEvents();
        if (hasCache) {
            CalendarRender.renderCalendar();
            if (window.GymsPage && typeof window.GymsPage.refreshFromCalendarEvents === 'function') window.GymsPage.refreshFromCalendarEvents();
        }

        const serverEvents = await CalendarData.fetchEventsSnapshot();
        if (!serverEvents) {
            if (!hasCache) CalendarRender.renderCalendar();
            return;
        }
        reconcileWithServerSnapshot(serverEvents);
    }

    async function initializeCalendarApp() {
        window.AppCore.initializeNameInput(CalendarDom.userName);
        CalendarUI.initializeThemeSwitcher();
        initializeCalendar();
        CalendarCatalog.loadGymCatalog();
        CalendarUI.initializeModalControls();
        CalendarUI.bindModalEventGuards();
        setInterval(syncChanges, CalendarConfig.SYNC_INTERVAL_MS);
    }

    window.submitVisit = submitVisit;
    window.deleteVisit = deleteVisit;
    window.openModal = CalendarRender.openModal;
    window.shiftMonthBy = shiftMonthBy;
    window.cycleTheme = CalendarUI.cycleTheme;
    window.openGymByReference = openGymByReference;
    window.CalendarController = { initializeCalendarApp };
})();
