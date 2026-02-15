(function () {
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
            const details = item.details && typeof item.details === 'object' ? item.details : {};
            const contacts = details.contacts && typeof details.contacts === 'object' ? details.contacts : {};
            const normalizedRefs = window.AppCore.normalizeGymReferences(contacts.clickableRefs || name, name).join(', ');
            return withFingerprint({
                id: id || name,
                name,
                icon: String(item.icon || '').trim(),
                details: { ...details, contacts: { ...contacts, clickableRefs: normalizedRefs } },
                pending: Boolean(item.pending),
                optimisticCreatedAt: Number(item.optimisticCreatedAt || 0)
            });
        }).filter(item => item.id && item.name);
    }

    function persistGyms(gyms) {
        localStorage.setItem(window.CalendarConfig.GYMS_CACHE_KEY, JSON.stringify(gyms || []));
    }

    function loadCachedGyms() {
        try {
            const raw = localStorage.getItem(window.CalendarConfig.GYMS_CACHE_KEY);
            if (!raw) return null;
            const gyms = normalizeGyms(JSON.parse(raw));
            return gyms.length ? gyms : null;
        } catch {
            return null;
        }
    }

    function pruneGymShadows(gymShadows, now = Date.now()) {
        return (Array.isArray(gymShadows) ? gymShadows : []).filter(item => now - item.createdAt < window.CalendarConfig.SHADOW_TTL_MS);
    }

    function mergeServerWithOptimisticGyms(serverGyms, currentGyms, gymShadows, now = Date.now()) {
        const freshShadows = pruneGymShadows(gymShadows, now);
        const shadowById = new Map(freshShadows.map(item => [item.id, item]));

        const filteredServer = serverGyms.filter((gym) => {
            const shadow = shadowById.get(gym.id);
            if (!shadow) return true;
            return shadow.fingerprint === gym.fingerprint;
        });

        const byId = new Map(filteredServer.map(item => [item.id, item]));
        const unresolvedOptimisticGyms = window.AppOptimistic.collectUnresolvedOptimisticItems({
            currentItems: currentGyms,
            serverItems: filteredServer,
            ttlMs: window.CalendarConfig.SHADOW_TTL_MS,
            now,
            isResolved: (gym) => {
                const serverVersion = byId.get(gym.id);
                return Boolean(serverVersion && serverVersion.fingerprint === gym.fingerprint);
            }
        });

        unresolvedOptimisticGyms.forEach((gym) => {
            byId.set(gym.id, withFingerprint({ ...gym }));
        });

        return {
            gyms: Array.from(byId.values()),
            gymShadows: freshShadows
        };
    }

    async function fetchGymsSnapshot() {
        try {
            const res = await fetch(`${window.AppEndpoints.gymsApi}?action=list`);
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

    window.GymsData = {
        withFingerprint,
        persistGyms,
        loadCachedGyms,
        mergeServerWithOptimisticGyms,
        fetchGymsSnapshot,
        fallbackGymsFromConfig
    };
})();
