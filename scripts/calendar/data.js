(function () {
    const { CalendarConfig, CalendarState } = window;

    function setEvents(nextEvents) {
        CalendarState.events = nextEvents;
    }

    function buildEventsByDateIndex(eventsList) {
        const byDate = new Map();
        eventsList.forEach((event) => {
            if (!byDate.has(event.date)) byDate.set(event.date, []);
            byDate.get(event.date).push(event);
        });
        return byDate;
    }

    function parseUnsureFromName(nameValue) {
        const rawName = String(nameValue || '').trim();
        if (!rawName) return { name: '', unsure: false };
        if (!rawName.endsWith(CalendarConfig.UNSURE_MARK)) return { name: rawName, unsure: false };
        return { name: rawName.slice(0, -CalendarConfig.UNSURE_MARK.length).trim(), unsure: true };
    }

    function eventFingerprint(item) {
        return [item.date || '', item.name || '', item.gym || '', item.time || '', item.unsure ? '1' : '0'].join('|');
    }

    function withFingerprint(item) {
        return { ...item, fingerprint: eventFingerprint(item) };
    }

    function normalizeUnsure(value) {
        if (typeof value === 'boolean') return value;
        const raw = String(value || '').trim().toLowerCase();
        return raw === 'true' || raw === '1' || raw === 'да' || raw === 'yes';
    }

    function looksLikeDateTime(value) {
        return /T/.test(value) || /[zZ]|[+-]\d{2}:?\d{2}/.test(value);
    }

    function toUtcPlus3(dateObj) {
        return new Date(dateObj.getTime() + CalendarConfig.UTC_PLUS_3_OFFSET_MINUTES * 60_000);
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

    function normalizeDate(input) {
        if (!input) return '';
        const raw = String(input).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
        if (looksLikeDateTime(raw)) {
            const parsed = new Date(raw);
            if (!Number.isNaN(parsed.getTime())) return formatDateForUtcPlus3(parsed);
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
            if (!Number.isNaN(parsed.getTime())) return formatTimeForUtcPlus3(parsed);
        }
        const isoTime = raw.match(/T(\d{2}:\d{2})/);
        if (isoTime) return isoTime[1];
        const plainTime = raw.match(/\b(\d{2}:\d{2})(?::\d{2})?\b/);
        if (plainTime) return plainTime[1];
        return raw;
    }

    function normalizeEvents(rawData) {
        if (!Array.isArray(rawData)) return [];
        if (rawData.length > 0 && !Array.isArray(rawData[0])) {
            return rawData.filter(item => item && item.date && item.name).map((item) => {
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
            }).map(withFingerprint).filter(item => item.date);
        }

        return rawData.map((row, index) => ({ row, sourceRow: index + 1 }))
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
            }).map(withFingerprint).filter(item => item.date && item.name);
    }

    async function fetchEventsSnapshot() {
        try {
            const res = await fetch(CalendarConfig.API_URL);
            const rawData = await res.json();
            return normalizeEvents(rawData);
        } catch {
            return null;
        }
    }

    function persistEvents() {
        localStorage.setItem(CalendarConfig.EVENTS_CACHE_KEY, JSON.stringify(CalendarState.events));
    }

    function pruneDeletionShadows(now = Date.now()) {
        CalendarState.deletionShadows = CalendarState.deletionShadows.filter(item => now - item.createdAt < CalendarConfig.SHADOW_TTL_MS);
    }

    function loadCachedEvents() {
        try {
            const raw = localStorage.getItem(CalendarConfig.EVENTS_CACHE_KEY);
            if (!raw) return false;
            setEvents(normalizeEvents(JSON.parse(raw)));
            return true;
        } catch {
            return false;
        }
    }

    function getEventsByDate(dateStr, eventsByDateIndex = buildEventsByDateIndex(CalendarState.events)) {
        const dayEvents = eventsByDateIndex.get(dateStr) || [];
        return {
            all: dayEvents,
            sure: dayEvents.filter(event => !event.unsure),
            unsure: dayEvents.filter(event => event.unsure)
        };
    }

    function mergeServerWithOptimisticEvents(serverEvents, currentEvents) {
        const now = Date.now();
        pruneDeletionShadows(now);
        const blockedFingerprints = new Set(CalendarState.deletionShadows.map(item => item.fingerprint));
        const filteredServerEvents = serverEvents.filter(event => !blockedFingerprints.has(event.fingerprint));
        const serverFingerprints = new Set(serverEvents.map(event => event.fingerprint));

        const optimisticEvents = window.AppOptimistic.collectUnresolvedOptimisticItems({
            currentItems: currentEvents,
            serverItems: serverEvents,
            ttlMs: CalendarConfig.SHADOW_TTL_MS,
            now,
            isResolved: (event) => serverFingerprints.has(event.fingerprint)
        });

        return [...filteredServerEvents, ...optimisticEvents];
    }

    window.CalendarData = {
        setEvents,
        withFingerprint,
        fetchEventsSnapshot,
        loadCachedEvents,
        persistEvents,
        buildEventsByDateIndex,
        getEventsByDate,
        pruneDeletionShadows,
        mergeServerWithOptimisticEvents
    };
})();
