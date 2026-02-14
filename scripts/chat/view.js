(function () {
    const { ChatDom, ChatState, ChatConfig } = window;

    function formatChatDate(dateValue) {
        const parsed = dayjs(dateValue);
        if (!parsed.isValid()) return dateValue || '';
        return parsed.format('DD.MM HH:mm');
    }

    function renderMessageParts(parts) {
        return parts.map((part) => {
            if (part.type === 'link') {
                const href = window.AppCore.escapeHtml(part.href || part.text);
                return `<a href="${href}" target="_blank" rel="noopener noreferrer">${window.AppCore.escapeHtml(part.text)}</a>`;
            }
            if (part.type === 'mention') {
                return `<span class="chat-message-mention">${window.AppCore.escapeHtml(part.text)}</span>`;
            }
            return window.AppCore.escapeHtml(part.text || '');
        }).join('');
    }

    function markMessagesAsRendered(messages) {
        messages.forEach((message) => ChatState.renderedMessageIds.add(message.messageId));
    }

    function renderChatMessages({ stickToBottom = false, animateNew = true } = {}) {
        if (!ChatDom.messages) return;

        const previousScrollTop = ChatDom.messages.scrollTop;
        const previousRenderedIds = ChatState.renderedMessageIds;
        const nextRenderedIds = new Set();

        if (!ChatState.messages.length) {
            ChatDom.messages.innerHTML = '<div class="chat-message-item">Пока сообщений нет.</div>';
            return;
        }

        ChatDom.messages.innerHTML = ChatState.messages.map(message => {
            nextRenderedIds.add(message.messageId);
            const isNew = animateNew && !previousRenderedIds.has(message.messageId) ? ' is-new' : '';
            return `
                <div class="chat-message-item${isNew}">
                    <div class="chat-message-meta">
                        <strong>${window.AppCore.escapeHtml(message.author)}</strong>
                        <span>${window.AppCore.escapeHtml(formatChatDate(message.date))}</span>
                    </div>
                    <div class="chat-message-text">${renderMessageParts(message.parts || [{ type: 'text', text: message.text }])}</div>
                </div>
            `;
        }).join('');

        ChatState.renderedMessageIds = nextRenderedIds;

        if (stickToBottom) {
            ChatDom.messages.scrollTop = ChatDom.messages.scrollHeight;
            return;
        }

        ChatDom.messages.scrollTop = previousScrollTop;
    }

    function isChatNearBottom() {
        const distance = ChatDom.messages.scrollHeight - ChatDom.messages.scrollTop - ChatDom.messages.clientHeight;
        return distance <= ChatConfig.CHAT_AUTO_STICKY_THRESHOLD;
    }

    window.ChatView = {
        renderChatMessages,
        markMessagesAsRendered,
        isChatNearBottom
    };
})();
