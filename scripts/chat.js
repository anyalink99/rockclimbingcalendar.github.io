const DEFAULT_CHAT_API_URL = 'https://script.google.com/macros/s/AKfycbzOcgR2msOdbDPhNj05WFbgVWpvN_hwR2nYHouCPoce_r8BR8JmUO-g8LYBOsPx54DF/exec';
const CHAT_API_URL = typeof window !== 'undefined' && typeof window.CHAT_API_URL === 'string' && window.CHAT_API_URL.trim()
    ? window.CHAT_API_URL.trim()
    : DEFAULT_CHAT_API_URL;
const CHAT_NAME = 'Залез? 2';
const CHAT_SHEET_NAME = 'Chat';
const CHAT_BATCH_SIZE = 100;
const CHAT_SYNC_INTERVAL_MS = 7_000;
const CHAT_CACHE_KEY = 'chatMessagesCacheV1';
const CHAT_CACHE_LIMIT = 200;
const CHAT_TOP_AUTOLOAD_THRESHOLD = 40;
const CHAT_NEW_MARK_MS = 5_000;

const chatState = {
    messages: [],
    offset: 0,
    hasMore: true,
    open: false,
    loading: false,
    syncTimerId: null,
    readBlockedByCors: false,
    usingReadFallback: false,
    recentMessageIds: new Set()
};

const chatPanelElement = document.getElementById('chatPanel');
const chatOverlayElement = document.getElementById('chatOverlay');
const chatMessagesElement = document.getElementById('chatMessages');
const chatMessageInputElement = document.getElementById('chatMessageInput');

function toggleChatPanel(forceOpen) {
    const nextOpen = typeof forceOpen === 'boolean' ? forceOpen : !chatState.open;
    chatState.open = nextOpen;
    chatPanelElement.classList.toggle('open', nextOpen);
    chatPanelElement.setAttribute('aria-hidden', nextOpen ? 'false' : 'true');
    chatOverlayElement.classList.toggle('open', nextOpen);
    chatOverlayElement.setAttribute('aria-hidden', nextOpen ? 'false' : 'true');

    if (!nextOpen) {
        if (chatState.syncTimerId) {
            clearInterval(chatState.syncTimerId);
            chatState.syncTimerId = null;
        }
        return;
    }

    if (!chatState.messages.length) {
        refreshChat(true);
    } else {
        renderChatMessages({ stickToBottom: true });
        refreshChat();
    }

    if (!chatState.syncTimerId) {
        chatState.syncTimerId = setInterval(() => {
            if (chatState.open) refreshChat();
        }, CHAT_SYNC_INTERVAL_MS);
    }
}


function markMessageAsRecent(messageId) {
    if (!messageId) return;
    chatState.recentMessageIds.add(messageId);
    setTimeout(() => {
        chatState.recentMessageIds.delete(messageId);
        if (chatState.open) renderChatMessages();
    }, CHAT_NEW_MARK_MS);
}

function parseStructuredChatText(rawText) {
    if (typeof rawText !== 'string') return [];
    const trimmed = rawText.trim();
    if (!trimmed) return [];

    if (!(trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        return [{ type: 'text', text: rawText }];
    }

    try {
        const normalized = trimmed.replace(/\bNone\b/g, 'null');
        const parsed = JSON.parse(normalized.replace(/'/g, '"'));
        if (!Array.isArray(parsed)) {
            return [{ type: 'text', text: rawText }];
        }

        const chunks = [];
        parsed.forEach((part) => {
            if (typeof part === 'string') {
                if (part) chunks.push({ type: 'text', text: part });
                return;
            }
            if (!part || typeof part !== 'object') return;

            const itemType = String(part.type || '').toLowerCase();
            const itemText = String(part.text || '');
            if (!itemText) return;

            if (itemType === 'link') {
                chunks.push({ type: 'link', text: itemText, href: itemText });
                return;
            }

            if (itemType === 'mention') {
                chunks.push({ type: 'mention', text: itemText });
                return;
            }

            chunks.push({ type: 'text', text: itemText });
        });

        return chunks.length ? chunks : [{ type: 'text', text: rawText }];
    } catch (error) {
        return [{ type: 'text', text: rawText }];
    }
}

function normalizeChatMessages(rawItems) {
    if (!Array.isArray(rawItems)) return [];
    return rawItems
        .filter(item => item && item.author && item.text)
        .map(item => {
            const text = String(item.text || '');
            return {
                messageId: String(item.message_id || item.id || crypto.randomUUID()),
                date: String(item.date || ''),
                author: String(item.author || ''),
                text,
                parts: parseStructuredChatText(text)
            };
        });
}

function fetchChatChunkViaJsonp(params) {
    return new Promise((resolve, reject) => {
        const callbackName = `chatJsonp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const script = document.createElement('script');
        const timeoutId = setTimeout(() => {
            cleanup();
            reject(new Error('Chat JSONP timeout'));
        }, 10000);

        function cleanup() {
            clearTimeout(timeoutId);
            delete window[callbackName];
            if (script.parentNode) script.parentNode.removeChild(script);
        }

        window[callbackName] = (data) => {
            cleanup();
            resolve(data || {});
        };

        script.onerror = () => {
            cleanup();
            reject(new Error('Chat JSONP failed'));
        };

        const withCallback = new URLSearchParams(params);
        withCallback.set('callback', callbackName);
        script.src = `${CHAT_API_URL}?${withCallback.toString()}`;
        document.head.appendChild(script);
    });
}

function saveChatCache() {
    try {
        const items = chatState.messages.slice(-CHAT_CACHE_LIMIT);
        localStorage.setItem(CHAT_CACHE_KEY, JSON.stringify(items));
    } catch (error) {
        console.warn('Unable to save chat cache', error);
    }
}

function loadChatCache() {
    try {
        const raw = localStorage.getItem(CHAT_CACHE_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || !parsed.length) return false;

        chatState.messages = normalizeChatMessages(parsed)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .slice(-CHAT_CACHE_LIMIT);
        chatState.offset = chatState.messages.length;
        chatState.hasMore = true;
        return true;
    } catch (error) {
        console.warn('Unable to load chat cache', error);
        return false;
    }
}

async function fetchChatChunk(offset = 0, limit = CHAT_BATCH_SIZE) {
    const params = new URLSearchParams({
        mode: 'chat',
        chatName: CHAT_NAME,
        sheet: CHAT_SHEET_NAME,
        offset: String(offset),
        limit: String(limit)
    });

    const requestUrl = `${CHAT_API_URL}?${params.toString()}`;

    try {
        const res = await fetch(requestUrl, {
            method: 'GET',
            cache: 'no-store'
        });
        if (!res.ok) throw new Error('Chat load failed');
        const data = await res.json();
        chatState.readBlockedByCors = false;

        return {
            items: normalizeChatMessages(data.items || []),
            nextOffset: Number(data.nextOffset) || (offset + (data.items || []).length),
            hasMore: Boolean(data.hasMore)
        };
    } catch (error) {
        const data = await fetchChatChunkViaJsonp(params);
        chatState.readBlockedByCors = false;

        return {
            items: normalizeChatMessages(data.items || []),
            nextOffset: Number(data.nextOffset) || (offset + (data.items || []).length),
            hasMore: Boolean(data.hasMore)
        };
    }
}

function handleChatReadError(error) {
    const isCorsLikeError = error instanceof TypeError || /failed to fetch/i.test(String(error && error.message));
    if (!isCorsLikeError) return;

    if (!chatState.readBlockedByCors) {
        chatState.readBlockedByCors = true;
        console.warn('Chat read failed via fetch and JSONP fallback. Check Apps Script deployment URL and callback support.');
    }

    if (chatState.syncTimerId) {
        clearInterval(chatState.syncTimerId);
        chatState.syncTimerId = null;
    }

    if (!chatState.messages.length) {
        chatMessagesElement.innerHTML = '<div class="chat-message-item">Чат временно недоступен из-за CORS в Apps Script.</div>';
    }
}

async function refreshChat(initial = false) {
    if (!chatState.open || chatState.loading) return;
    chatState.loading = true;

    try {
        if (initial) {
            const chunk = await fetchChatChunk(0);
            chatState.messages = chunk.items.slice(-CHAT_CACHE_LIMIT);
            chatState.offset = chunk.nextOffset;
            chatState.hasMore = chunk.hasMore;
            renderChatMessages({ stickToBottom: true });
            saveChatCache();
            return;
        }

        const existingIds = new Set(chatState.messages.map(item => item.messageId));
        const latestChunk = await fetchChatChunk(0, Math.max(chatState.messages.length + CHAT_BATCH_SIZE, CHAT_BATCH_SIZE));
        const fresh = latestChunk.items.filter(item => !existingIds.has(item.messageId));

        if (fresh.length || latestChunk.items.length !== chatState.messages.length) {
            fresh.forEach(item => markMessageAsRecent(item.messageId));
            chatState.messages = latestChunk.items.slice(-CHAT_CACHE_LIMIT);
            chatState.offset = latestChunk.nextOffset;
            renderChatMessages({ stickToBottom: true });
            saveChatCache();
        }

        chatState.hasMore = latestChunk.hasMore;
    } catch (error) {
        handleChatReadError(error);
        console.error(error);
    } finally {
        chatState.loading = false;
    }
}

async function loadOlderChatMessages() {
    if (!chatState.hasMore || chatState.loading) return;
    chatState.loading = true;
    const previousHeight = chatMessagesElement.scrollHeight;

    try {
        const chunk = await fetchChatChunk(chatState.offset);
        chatState.messages = [...chunk.items, ...chatState.messages]
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .slice(-CHAT_CACHE_LIMIT);
        chatState.offset = chunk.nextOffset;
        chatState.hasMore = chunk.hasMore;
        renderChatMessages();
        saveChatCache();

        const newHeight = chatMessagesElement.scrollHeight;
        chatMessagesElement.scrollTop += (newHeight - previousHeight);
    } catch (error) {
        handleChatReadError(error);
        console.error(error);
    } finally {
        chatState.loading = false;
    }
}

function renderMessageParts(parts) {
    return parts.map((part) => {
        if (part.type === 'link') {
            const href = escapeHtml(part.href || part.text);
            return `<a href="${href}" target="_blank" rel="noopener noreferrer">${escapeHtml(part.text)}</a>`;
        }
        if (part.type === 'mention') {
            return `<span class="chat-message-mention">${escapeHtml(part.text)}</span>`;
        }
        return escapeHtml(part.text || '');
    }).join('');
}

function renderChatMessages({ stickToBottom = false } = {}) {
    if (!chatMessagesElement) return;

    if (!chatState.messages.length) {
        chatMessagesElement.innerHTML = '<div class="chat-message-item">Пока сообщений нет.</div>';
        return;
    }

    chatMessagesElement.innerHTML = chatState.messages.map(message => `
        <div class="chat-message-item${chatState.recentMessageIds.has(message.messageId) ? " chat-message-item-new" : ""}">
            <div class="chat-message-meta">
                <strong>${escapeHtml(message.author)}</strong>
                <span>${escapeHtml(formatChatDate(message.date))}</span>
            </div>
            <div class="chat-message-text">${renderMessageParts(message.parts || [{ type: 'text', text: message.text }])}</div>
        </div>
    `).join('');

    if (stickToBottom) chatMessagesElement.scrollTop = chatMessagesElement.scrollHeight;
}

function formatChatDate(dateValue) {
    const parsed = dayjs(dateValue);
    if (!parsed.isValid()) return dateValue || '';
    return parsed.format('DD.MM HH:mm');
}

async function sendChatMessage() {
    const author = (localStorage.getItem('climberName') || '').trim();
    if (!author) return alert('Сначала введи имя');

    const text = chatMessageInputElement.value.trim();
    if (!text) return;

    const optimisticMessage = {
        messageId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        date: new Date().toISOString(),
        author,
        text,
        parts: [{ type: 'text', text }]
    };

    markMessageAsRecent(optimisticMessage.messageId);
    chatState.messages = [...chatState.messages, optimisticMessage].slice(-CHAT_CACHE_LIMIT);
    renderChatMessages({ stickToBottom: true });
    saveChatCache();
    chatMessageInputElement.value = '';

    try {
        const payload = JSON.stringify({
            action: 'chat_send',
            sheet: CHAT_SHEET_NAME,
            chat_name: CHAT_NAME,
            author,
            text
        });

        let res;
        try {
            res = await fetch(CHAT_API_URL, {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: payload
            });
        } catch (error) {
            await fetch(CHAT_API_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: payload
            });
            res = { ok: true };
        }

        if (!res.ok) throw new Error('chat_send failed');
        await refreshChat();
    } catch (error) {
        chatState.messages = chatState.messages.filter(item => item.messageId !== optimisticMessage.messageId);
        renderChatMessages({ stickToBottom: true });
        saveChatCache();
        alert('Не удалось отправить сообщение. Попробуй ещё раз.');
        console.error(error);
    }
}

function maybeLoadOlderOnScroll() {
    if (!chatState.open || chatState.loading || !chatState.hasMore) return;
    if (chatMessagesElement.scrollTop <= CHAT_TOP_AUTOLOAD_THRESHOLD) {
        loadOlderChatMessages();
    }
}

chatOverlayElement.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleChatPanel(false);
});

chatOverlayElement.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
});

chatPanelElement.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
});

chatMessagesElement.addEventListener('scroll', maybeLoadOlderOnScroll);

document.getElementById('chatSendButton').addEventListener('click', (event) => {
    event.preventDefault();
    sendChatMessage();
});

chatMessageInputElement.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendChatMessage();
    }
});

loadChatCache();
renderChatMessages();
