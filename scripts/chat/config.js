window.ChatConfig = {
    CHAT_NAME: 'Залез? 2',
    CHAT_SHEET_NAME: 'Chat',
    CHAT_BATCH_SIZE: 100,
    CHAT_SYNC_INTERVAL_MS: 7_000,
    CHAT_CACHE_KEY: 'chatMessagesCacheV1',
    CHAT_CACHE_LIMIT: 200,
    CHAT_TOP_AUTOLOAD_THRESHOLD: 40,
    CHAT_AUTO_STICKY_THRESHOLD: 24,
    CHAT_INTERACTION_LOCK_MS: 300,
    CHAT_PANEL_BASE_BOTTOM: 86,
    CHAT_TOGGLE_BASE_BOTTOM: 18
};

window.ChatDom = {
    panel: document.getElementById('chatPanel'),
    overlay: document.getElementById('chatOverlay'),
    messages: document.getElementById('chatMessages'),
    input: document.getElementById('chatMessageInput'),
    sendButton: document.getElementById('chatSendButton'),
    toggleButton: document.getElementById('chatToggleButton')
};

const resolvedApiUrl = window.AppEndpoints.chatApi;

window.ChatState = {
    apiUrl: resolvedApiUrl,
    messages: [],
    offset: 0,
    hasMore: true,
    open: false,
    loading: false,
    syncTimerId: null,
    readBlockedByCors: false,
    renderedMessageIds: new Set(),
    interactionTimeoutId: null,
    interactionToken: 0,
    interactionUnlockedAt: 0,
    keyboardInset: 0,
    suppressNextRefreshAnimation: false
};
