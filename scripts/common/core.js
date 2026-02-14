window.AppCore = {
    escapeHtml(str = '') {
        return String(str).replace(/[&<>"']/g, (m) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[m]));
    },
    getClimberName() {
        return (localStorage.getItem('climberName') || '').trim();
    },
    initializeNameInput(inputElement) {
        if (!inputElement) return;
        inputElement.value = localStorage.getItem('climberName') || '';
        inputElement.addEventListener('input', (event) => {
            localStorage.setItem('climberName', event.target.value.trim());
        });
    },
    normalizeGymReferences(rawValue, fallbackName = '') {
        const refs = String(rawValue || '')
            .split(',')
            .map(item => item.trim())
            .filter(Boolean);
        if (fallbackName && !refs.some(item => item.toLowerCase() === fallbackName.toLowerCase())) {
            refs.unshift(fallbackName);
        }
        return Array.from(new Set(refs));
    },
    getGymCatalog() {
        const fallback = (window.CalendarConfig && Array.isArray(window.CalendarConfig.defaultGymOptions)
            ? window.CalendarConfig.defaultGymOptions
            : [])
            .map(name => ({ id: name, name, details: { contacts: { clickableRefs: name } } }));

        try {
            const storageKey = window.CalendarConfig && window.CalendarConfig.GYMS_CACHE_KEY;
            if (!storageKey) return fallback;
            const raw = localStorage.getItem(storageKey);
            if (!raw) return fallback;
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed) || !parsed.length) return fallback;
            return parsed.map(item => ({
                id: String(item.id || item.name || '').trim(),
                name: String(item.name || item.id || '').trim(),
                details: item.details && typeof item.details === 'object' ? item.details : {}
            })).filter(item => item.id && item.name);
        } catch {
            return fallback;
        }
    },
    resolveGymByReference(reference) {
        const target = String(reference || '').trim().toLowerCase();
        if (!target) return null;
        return window.AppCore.getGymCatalog().find((gym) => {
            const rawRefs = (((gym.details || {}).contacts || {}).clickableRefs || gym.name || '');
            const refs = window.AppCore.normalizeGymReferences(rawRefs, gym.name).map(item => item.toLowerCase());
            return refs.includes(target);
        }) || null;
    },
    splitTextByGymReferences(text) {
        const source = String(text || '');
        if (!source) return [];

        const refs = [];
        window.AppCore.getGymCatalog().forEach((gym) => {
            const rawRefs = (((gym.details || {}).contacts || {}).clickableRefs || gym.name || '');
            window.AppCore.normalizeGymReferences(rawRefs, gym.name).forEach((ref) => {
                refs.push({ ref, refLower: ref.toLowerCase(), gymId: gym.id, gymName: gym.name });
            });
        });
        if (!refs.length) return [{ type: 'text', text: source }];

        refs.sort((a, b) => b.ref.length - a.ref.length);
        const parts = [];
        let cursor = 0;
        const lower = source.toLowerCase();

        while (cursor < source.length) {
            let matched = null;
            for (const candidate of refs) {
                if (!lower.startsWith(candidate.refLower, cursor)) continue;
                matched = candidate;
                break;
            }

            if (!matched) {
                const nextCursor = cursor + 1;
                const prev = parts[parts.length - 1];
                const chunk = source.slice(cursor, nextCursor);
                if (prev && prev.type === 'text') prev.text += chunk;
                else parts.push({ type: 'text', text: chunk });
                cursor = nextCursor;
                continue;
            }

            parts.push({
                type: 'gym-ref',
                text: source.slice(cursor, cursor + matched.ref.length),
                gymId: matched.gymId,
                gymName: matched.gymName
            });
            cursor += matched.ref.length;
        }

        return parts;
    }
};

if (window.dayjs && window.dayjs_plugin_isoWeek) {
    dayjs.extend(window.dayjs_plugin_isoWeek);
    dayjs.locale('ru');
}
