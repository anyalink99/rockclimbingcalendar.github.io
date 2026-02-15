(function () {
    const { CalendarConfig } = window;

    async function loadGymCatalog() {
        CalendarConfig.gymOptions = [...CalendarConfig.defaultGymOptions];
        CalendarConfig.gymMeta = { ...CalendarConfig.defaultGymMeta };

        try {
            const res = await fetch(`${CalendarConfig.GYMS_API_URL}?action=list`);
            if (!res.ok) return;

            const payload = await res.json();
            if (!payload || !Array.isArray(payload.items) || payload.items.length === 0) return;

            const options = payload.items.map(item => String(item.name || '').trim()).filter(Boolean);
            if (options.length > 0) CalendarConfig.gymOptions = options;

            const nextMeta = {};
            payload.items.forEach((item) => {
                const name = String(item.name || '').trim();
                if (!name) return;
                const fallbackIcon = (CalendarConfig.defaultGymMeta[name] && CalendarConfig.defaultGymMeta[name].image) || '';
                nextMeta[name] = { image: String(item.icon || '').trim() || fallbackIcon };
            });
            CalendarConfig.gymMeta = nextMeta;
        } catch {
            // fallback to defaults
        }
    }

    window.CalendarCatalog = {
        loadGymCatalog
    };
})();
