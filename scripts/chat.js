const CHAT_API_URL = API_URL;
const CHAT_NAME = 'Залез? 2';
const CHAT_SHEET_NAME = 'Chat';
const CHAT_BATCH_SIZE = 100;
const CHAT_SYNC_INTERVAL_MS = 7_000;

const chatState = {
    messages: [],
    offset: 0,
    hasMore: true,
    open: false,
    loading: false
};

const chatPanelElement = document.getElementById('chatPanel');
const chatMessagesElement = document.getElementById('chatMessages');
const chatLoadMoreButtonElement = document.getElementById('chatLoadMoreButton');
const chatMessageInputElement = document.getElementById('chatMessageInput');

function toggleChatPanel(forceOpen) {
    const nextOpen = typeof forceOpen === 'boolean' ? forceOpen : !chatState.open;
    chatState.open = nextOpen;
    chatPanelElement.classList.toggle('open', nextOpen);
    chatPanelElement.setAttribute('aria-hidden', nextOpen ? 'false' : 'true');

    if (!nextOpen) return;

    if (!chatState.messages.length) {
        refreshChat(true);
    } else {
        renderChatMessages({ stickToBottom: true });
    }
}

function normalizeChatMessages(rawItems) {
    if (!Array.isArray(rawItems)) return [];
    return rawItems
        .filter(item => item && item.author && item.text)
        .map(item => ({
            messageId: String(item.message_id || item.id || crypto.randomUUID()),
            date: String(item.date || ''),
            author: String(item.author || ''),
            text: String(item.text || '')
        }));
}

async function fetchChatChunk(offset = 0, limit = CHAT_BATCH_SIZE) {
    const params = new URLSearchParams({
        mode: 'chat',
        chatName: CHAT_NAME,
        sheet: CHAT_SHEET_NAME,
        offset: String(offset),
        limit: String(limit)
    });

    const res = await fetch(`${CHAT_API_URL}?${params.toString()}`);
    if (!res.ok) throw new Error('Chat load failed');
    const data = await res.json();

    return {
        items: normalizeChatMessages(data.items || []),
        nextOffset: Number(data.nextOffset) || (offset + (data.items || []).length),
        hasMore: Boolean(data.hasMore)
    };
}

async function refreshChat(initial = false) {
    if (!chatState.open || chatState.loading) return;
    chatState.loading = true;

    try {
        if (initial) {
            const chunk = await fetchChatChunk(0);
            chatState.messages = chunk.items;
            chatState.offset = chunk.nextOffset;
            chatState.hasMore = chunk.hasMore;
            renderChatMessages({ stickToBottom: true });
            return;
        }

        const existingIds = new Set(chatState.messages.map(item => item.messageId));
        const latestChunk = await fetchChatChunk(0);
        const fresh = latestChunk.items.filter(item => !existingIds.has(item.messageId));

        if (fresh.length) {
            chatState.messages = [...chatState.messages, ...fresh]
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            chatState.offset += fresh.length;
            renderChatMessages({ stickToBottom: true });
        }

        chatState.hasMore = latestChunk.hasMore || chatState.hasMore;
        updateChatLoadMoreState();
    } catch (error) {
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
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        chatState.offset = chunk.nextOffset;
        chatState.hasMore = chunk.hasMore;
        renderChatMessages();
        const newHeight = chatMessagesElement.scrollHeight;
        chatMessagesElement.scrollTop += (newHeight - previousHeight);
    } catch (error) {
        console.error(error);
    } finally {
        chatState.loading = false;
    }
}

function renderChatMessages({ stickToBottom = false } = {}) {
    if (!chatMessagesElement) return;

    if (!chatState.messages.length) {
        chatMessagesElement.innerHTML = '<div class="chat-message-item">Пока сообщений нет.</div>';
        updateChatLoadMoreState();
        return;
    }

    chatMessagesElement.innerHTML = chatState.messages.map(message => `
        <div class="chat-message-item">
            <div class="chat-message-meta">
                <strong>${escapeHtml(message.author)}</strong>
                <span>${escapeHtml(formatChatDate(message.date))}</span>
            </div>
            <div class="chat-message-text">${escapeHtml(message.text)}</div>
        </div>
    `).join('');

    updateChatLoadMoreState();
    if (stickToBottom) chatMessagesElement.scrollTop = chatMessagesElement.scrollHeight;
}

function updateChatLoadMoreState() {
    chatLoadMoreButtonElement.disabled = !chatState.hasMore || chatState.loading;
    if (chatState.loading) {
        chatLoadMoreButtonElement.textContent = 'Загрузка...';
    } else {
        chatLoadMoreButtonElement.textContent = chatState.hasMore ? 'Загрузить ещё 100' : 'История загружена';
    }
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
        text
    };

    chatState.messages = [...chatState.messages, optimisticMessage];
    renderChatMessages({ stickToBottom: true });
    chatMessageInputElement.value = '';

    try {
        const res = await fetch(CHAT_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action: 'chat_send',
                sheet: CHAT_SHEET_NAME,
                chat_name: CHAT_NAME,
                author,
                text
            })
        });

        if (!res.ok) throw new Error('chat_send failed');
        await refreshChat();
    } catch (error) {
        chatState.messages = chatState.messages.filter(item => item.messageId !== optimisticMessage.messageId);
        renderChatMessages({ stickToBottom: true });
        alert('Не удалось отправить сообщение. Попробуй ещё раз.');
        console.error(error);
    }
}


chatMessageInputElement.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        sendChatMessage();
    }
});

renderChatMessages();
setInterval(() => {
    if (chatState.open) refreshChat();
}, CHAT_SYNC_INTERVAL_MS);
