(function () {
    function getPricingSlots(gym) {
        const slots = Array.isArray(gym?.details?.pricingSlots) ? gym.details.pricingSlots : [];
        return slots.filter((slot) => slot && (slot.label || slot.dayType || slot.start || slot.end || slot.prices));
    }

    function resolveSlotSocialFlag(slot) {
        if (slot.isSocial === 'yes' || slot.isSocial === 'no') return slot.isSocial;
        if (slot.audience === 'social') return 'yes';
        if (slot.audience === 'regular') return 'no';
        return '';
    }

    function getVisiblePricingSlots(gym, socialMode) {
        const slots = getPricingSlots(gym);
        if (!socialMode) {
            return slots.filter((slot) => {
                const socialFlag = resolveSlotSocialFlag(slot);
                if (!socialFlag) return true;
                return socialFlag === 'no';
            });
        }

        const socialSlots = slots.filter(slot => resolveSlotSocialFlag(slot) === 'yes');
        if (socialSlots.length) return socialSlots;

        return slots.filter((slot) => {
            const socialFlag = resolveSlotSocialFlag(slot);
            return !socialFlag || socialFlag === 'no';
        });
    }

    function resolveTariffType(slot) {
        if (slot.tariffType) return slot.tariffType;
        const prices = slot.prices || {};
        if (prices.unlimitedPrice || prices.unlimitedDuration) return 'unlimited';
        if (prices.membershipPrice || prices.membershipVisits) return 'membership';
        return 'single';
    }

    function chooseTopPrice(slot) {
        const prices = slot.prices || {};
        if (prices.singlePrice) return prices.singlePrice;
        const tariffType = resolveTariffType(slot);
        if (tariffType === 'membership') return prices.membershipPrice || prices.singlePrice || '';
        if (tariffType === 'unlimited') return prices.unlimitedPrice || '';
        return prices.singlePrice || prices.membershipPrice || prices.unlimitedPrice || '';
    }

    function pickBestSlot(slots, defaultPricingTime) {
        if (!slots.length) return null;
        const defaultMinutes = Number(defaultPricingTime.split(':')[0]) * 60 + Number(defaultPricingTime.split(':')[1]);
        const parseTime = (timeValue) => {
            const [hours, minutes] = String(timeValue || '').split(':');
            const h = Number(hours);
            const m = Number(minutes);
            if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
            return h * 60 + m;
        };

        const slotContainsDefaultTime = (slot) => {
            const startMinutes = parseTime(slot.start);
            const endMinutes = parseTime(slot.end);
            if (startMinutes === null || endMinutes === null) return true;
            return defaultMinutes >= startMinutes && defaultMinutes <= endMinutes;
        };

        const strictWeekday = slots.filter(slot => slot.dayType === 'weekday' && slotContainsDefaultTime(slot));
        if (strictWeekday.length) return strictWeekday[0];

        const fallbackAnyDay = slots.filter(slot => !slot.dayType && slotContainsDefaultTime(slot));
        if (fallbackAnyDay.length) return fallbackAnyDay[0];

        const withScore = slots.map((slot) => {
            const dayScore = slot.dayType === 'weekday' ? 0 : slot.dayType ? 2 : 1;
            const start = parseTime(slot.start);
            const end = parseTime(slot.end);
            let timeScore = 0;
            if (start !== null && end !== null) {
                if (defaultMinutes < start) timeScore = start - defaultMinutes;
                else if (defaultMinutes > end) timeScore = defaultMinutes - end;
            }
            return { slot, score: dayScore * 1000 + timeScore };
        });
        withScore.sort((a, b) => a.score - b.score);
        return withScore[0].slot;
    }

    function sortPricingSlotsForReadMode(slots) {
        const tariffPriority = { single: 0, membership: 1, unlimited: 2 };
        return [...slots].sort((a, b) => {
            const aType = tariffPriority[resolveTariffType(a)] ?? 99;
            const bType = tariffPriority[resolveTariffType(b)] ?? 99;
            if (aType !== bType) return aType - bType;
            return String(a.label || '').localeCompare(String(b.label || ''), 'ru');
        });
    }

    function renderSlotCustomSelect({ field, value, options, placeholder }) {
        const selected = options.find(option => option.value === value) || null;
        return `<div class="custom-select pricing-slot-select" data-slot-select="${window.AppCore.escapeHtml(field)}">
            <input type="hidden" data-slot-field="${window.AppCore.escapeHtml(field)}" value="${window.AppCore.escapeHtml(value || '')}">
            <button type="button" class="custom-select-trigger" data-slot-select-trigger="1" aria-expanded="false">
                <span class="custom-select-value">${window.AppCore.escapeHtml((selected && selected.label) || placeholder)}</span>
                <span class="custom-select-arrow">▾</span>
            </button>
            <div class="custom-select-menu" data-slot-select-menu="1">${options.map(option => `<button type="button" class="custom-select-option ${option.value === value ? 'active' : ''}" data-slot-select-option="${window.AppCore.escapeHtml(option.value)}">${window.AppCore.escapeHtml(option.label)}</button>`).join('')}</div>
        </div>`;
    }

    function renderPricingFields(slot) {
        const tariffType = resolveTariffType(slot);
        const prices = slot.prices || {};
        if (tariffType === 'single') {
            return `<label><span>Цена разового</span><input data-slot-field="singlePrice" type="text" value="${window.AppCore.escapeHtml(prices.singlePrice || '')}"></label>`;
        }
        if (tariffType === 'membership') {
            return `<label><span>Цена абонемента</span><input data-slot-field="membershipPrice" type="text" value="${window.AppCore.escapeHtml(prices.membershipPrice || '')}"></label>
                <label><span>Кол-во посещений</span><input data-slot-field="membershipVisits" type="text" value="${window.AppCore.escapeHtml(prices.membershipVisits || '')}"></label>`;
        }
        return `<label><span>Цена безлимита</span><input data-slot-field="unlimitedPrice" type="text" value="${window.AppCore.escapeHtml(prices.unlimitedPrice || '')}"></label>
                <label><span>Длительность</span><input data-slot-field="unlimitedDuration" type="text" value="${window.AppCore.escapeHtml(prices.unlimitedDuration || '')}" placeholder="например, 30 дней"></label>`;
    }

    function renderSlotTimeSelect(field, value, pricingTimeOptions) {
        const normalizedValue = String(value || '').trim();
        const valueForSelect = pricingTimeOptions.includes(normalizedValue) ? normalizedValue : '';
        return renderSlotCustomSelect({
            field,
            value: valueForSelect,
            placeholder: 'Не выбрано',
            options: [{ value: '', label: 'Не выбрано' }, ...pricingTimeOptions.map(item => ({ value: item, label: item }))]
        });
    }

    function collectPricingSlotsFromForm(gymModalBody, { includeEmpty = false } = {}) {
        const editor = gymModalBody.querySelector('#pricingSlotsEditor');
        if (!editor) return [];
        const slots = Array.from(editor.querySelectorAll('.pricing-slot-item')).map((node) => {
            const get = (field) => String((node.querySelector(`[data-slot-field="${field}"]`) || {}).value || '').trim();
            return {
                label: get('label'), dayType: get('dayType'), start: get('start'), end: get('end'), isSocial: get('isSocial'), tariffType: get('tariffType') || 'single',
                prices: {
                    singlePrice: get('singlePrice'),
                    membershipPrice: get('membershipPrice'),
                    membershipVisits: get('membershipVisits'),
                    unlimitedPrice: get('unlimitedPrice'),
                    unlimitedDuration: get('unlimitedDuration')
                }
            };
        });
        if (includeEmpty) return slots;
        return slots.filter(slot => slot.label
            || slot.dayType
            || slot.start
            || slot.end
            || (slot.isSocial && slot.isSocial !== 'no')
            || (slot.tariffType && slot.tariffType !== 'single')
            || Object.values(slot.prices).some(Boolean));
    }

    window.GymsPricing = {
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
    };
})();
