(function () {
    function isPendingItemFresh(item, { ttlMs, now = Date.now(), pendingField = 'pending', createdAtField = 'optimisticCreatedAt' }) {
        if (!item || !item[pendingField]) return false;
        const createdAt = Number(item[createdAtField] || 0);
        if (!createdAt) return false;
        return now - createdAt < ttlMs;
    }

    function collectUnresolvedOptimisticItems({ currentItems, serverItems, ttlMs, now = Date.now(), isResolved }) {
        if (!Array.isArray(currentItems) || !currentItems.length) return [];
        const resolver = typeof isResolved === 'function' ? isResolved : () => false;

        return currentItems.filter((item) => {
            if (!isPendingItemFresh(item, { ttlMs, now })) return false;
            return !resolver(item, serverItems);
        });
    }

    window.AppOptimistic = {
        isPendingItemFresh,
        collectUnresolvedOptimisticItems
    };
})();
