(function () {
    function isLocked({ state, unlockedAtKey = 'interactionUnlockedAt' }) {
        return Date.now() < Number(state[unlockedAtKey] || 0);
    }

    function lock({ state, durationMs, tokenKey = 'interactionToken', timeoutKey = 'interactionTimeoutId', unlockedAtKey = 'interactionUnlockedAt', onLock, onUnlock }) {
        if (state[timeoutKey]) {
            clearTimeout(state[timeoutKey]);
            state[timeoutKey] = null;
        }

        state[tokenKey] = Number(state[tokenKey] || 0) + 1;
        const token = state[tokenKey];
        state[unlockedAtKey] = Date.now() + durationMs;
        if (typeof onLock === 'function') onLock();

        state[timeoutKey] = setTimeout(() => {
            if (token !== state[tokenKey]) return;
            state[timeoutKey] = null;
            if (typeof onUnlock === 'function') onUnlock();
        }, durationMs);
    }

    function reset({ state, tokenKey = 'interactionToken', timeoutKey = 'interactionTimeoutId', unlockedAtKey = 'interactionUnlockedAt', onUnlock }) {
        state[tokenKey] = Number(state[tokenKey] || 0) + 1;
        state[unlockedAtKey] = 0;
        if (state[timeoutKey]) {
            clearTimeout(state[timeoutKey]);
            state[timeoutKey] = null;
        }
        if (typeof onUnlock === 'function') onUnlock();
    }

    window.AppInteractionLock = {
        isLocked,
        lock,
        reset
    };
})();
