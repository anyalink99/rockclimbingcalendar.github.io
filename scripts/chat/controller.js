(function () {
    const { ChatConfig, ChatDom, ChatState, ChatData, ChatView } = window;

    function isChatInteractionLocked() {
        return window.AppInteractionLock.isLocked({ state: ChatState });
    }

    function lockChatInteraction() {
        window.AppInteractionLock.lock({ state: ChatState, durationMs: ChatConfig.CHAT_INTERACTION_LOCK_MS });
    }

    function handleChatReadError(error) {
        const isCorsLikeError = error instanceof TypeError || /failed to fetch/i.test(String(error && error.message));
        if (!isCorsLikeError) return;

        if (!ChatState.readBlockedByCors) {
            ChatState.readBlockedByCors = true;
            console.warn('Chat read failed via fetch and JSONP fallback. Check Apps Script deployment URL and callback support.');
        }

        if (ChatState.syncTimerId) {
            clearInterval(ChatState.syncTimerId);
            ChatState.syncTimerId = null;
        }

        if (!ChatState.messages.length) {
            ChatDom.messages.innerHTML = '<div class="chat-message-item">Чат временно недоступен из-за CORS в Apps Script.</div>';
        }
    }

    async function refreshChat(initial = false) {
        if (!ChatState.open || ChatState.loading) return;
        ChatState.loading = true;

        try {
            if (initial) {
                const chunk = await ChatData.fetchChatChunk(0);
                ChatState.messages = chunk.items;
                ChatState.offset = chunk.nextOffset;
                ChatState.hasMore = chunk.hasMore;
                ChatView.renderChatMessages({ stickToBottom: true, animateNew: false });
                ChatData.saveChatCache();
                return;
            }

            const existingIds = new Set(ChatState.messages.map(item => item.messageId));
            const latestChunk = await ChatData.fetchChatChunk(0, ChatConfig.CHAT_BATCH_SIZE);
            const freshServerItems = latestChunk.items.filter(item => !existingIds.has(item.messageId));

            if (freshServerItems.length) {
                const wasNearBottom = ChatView.isChatNearBottom();
                ChatState.messages = ChatData.mergeServerWithOptimisticMessages(latestChunk.items, ChatState.messages);
                ChatState.offset += freshServerItems.length;
                const shouldAnimateNew = !ChatState.suppressNextRefreshAnimation;
                ChatView.renderChatMessages({ stickToBottom: wasNearBottom, animateNew: shouldAnimateNew });
                ChatState.suppressNextRefreshAnimation = false;
                ChatData.saveChatCache();
            }

            ChatState.hasMore = latestChunk.total > 0 ? ChatState.offset < latestChunk.total : latestChunk.hasMore;
            ChatState.suppressNextRefreshAnimation = false;
        } catch (error) {
            handleChatReadError(error);
            console.error(error);
        } finally {
            ChatState.loading = false;
        }
    }

    async function loadOlderChatMessages() {
        if (!ChatState.hasMore || ChatState.loading) return;
        ChatState.loading = true;
        ChatDom.messages.classList.add('is-loading-older');
        const previousHeight = ChatDom.messages.scrollHeight;

        try {
            const chunk = await ChatData.fetchChatChunk(ChatState.offset);
            ChatState.messages = [...chunk.items, ...ChatState.messages]
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            ChatState.offset = chunk.nextOffset;
            ChatState.hasMore = chunk.hasMore;
            ChatView.renderChatMessages({ animateNew: false });
            ChatData.saveChatCache();

            const newHeight = ChatDom.messages.scrollHeight;
            ChatDom.messages.scrollTop += (newHeight - previousHeight);
        } catch (error) {
            handleChatReadError(error);
            console.error(error);
        } finally {
            ChatState.loading = false;
            ChatDom.messages.classList.remove('is-loading-older');
        }
    }

    function closeChatPanel() {
        window.AppInteractionLock.reset({ state: ChatState });

        ChatState.open = false;
        ChatDom.panel.classList.remove('open');
        ChatDom.panel.setAttribute('aria-hidden', 'true');
        ChatDom.overlay.classList.remove('open');
        ChatDom.overlay.setAttribute('aria-hidden', 'true');

        if (ChatState.syncTimerId) {
            clearInterval(ChatState.syncTimerId);
            ChatState.syncTimerId = null;
        }

        const calendarModalOpen = document.getElementById('modal')?.classList.contains('open');
        const gymModalOpen = document.getElementById('gymModal')?.classList.contains('open');
        if (!calendarModalOpen && !gymModalOpen) {
            document.body.style.overflow = '';
        }
    }

    function openChatPanel() {
        ChatState.open = true;
        ChatDom.panel.classList.add('open');
        ChatDom.panel.setAttribute('aria-hidden', 'false');
        ChatDom.overlay.classList.add('open');
        ChatDom.overlay.setAttribute('aria-hidden', 'false');
        lockChatInteraction();

        if (!ChatState.messages.length) {
            refreshChat(true);
        } else {
            ChatView.renderChatMessages({ stickToBottom: true, animateNew: false });
            ChatState.suppressNextRefreshAnimation = true;
            refreshChat();
        }

        if (!ChatState.syncTimerId) {
            ChatState.syncTimerId = setInterval(() => {
                if (ChatState.open) refreshChat();
            }, ChatConfig.CHAT_SYNC_INTERVAL_MS);
        }
    }

    function toggleChatPanel(forceOpen) {
        const nextOpen = typeof forceOpen === 'boolean' ? forceOpen : !ChatState.open;
        if (!nextOpen) {
            closeChatPanel();
            return;
        }

        openChatPanel();
    }

    async function sendChatMessage() {
        const author = window.AppCore.getClimberName();
        if (!author) return alert('Сначала введи имя');

        const text = ChatDom.input.value.trim();
        if (!text) return;

        const optimisticMessageId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const optimisticMessage = {
            messageId: optimisticMessageId,
            date: new Date().toISOString(),
            author,
            text,
            parts: [{ type: 'text', text }],
            pending: true,
            optimisticCreatedAt: Date.now()
        };

        ChatState.messages = [...ChatState.messages, optimisticMessage];
        ChatView.renderChatMessages({ stickToBottom: true, animateNew: true });
        ChatData.saveChatCache();
        ChatDom.input.value = '';

        try {
            const payload = JSON.stringify({
                action: 'chat_send',
                sheet: ChatConfig.CHAT_SHEET_NAME,
                chat_name: ChatConfig.CHAT_NAME,
                message_id: optimisticMessageId,
                author,
                text
            });

            let res;
            try {
                res = await fetch(ChatState.apiUrl, {
                    method: 'POST',
                    mode: 'cors',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: payload
                });
            } catch (error) {
                await fetch(ChatState.apiUrl, {
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
            ChatState.messages = ChatState.messages.filter(item => item.messageId !== optimisticMessage.messageId);
            ChatView.renderChatMessages({ stickToBottom: true, animateNew: false });
            ChatData.saveChatCache();
            alert('Не удалось отправить сообщение. Попробуй ещё раз.');
            console.error(error);
        }
    }


    function openGymFromReference(reference) {
        if (!window.GymsPage || typeof window.GymsPage.openGymModalByReference !== 'function') return;
        window.GymsPage.openGymModalByReference(reference);
    }

    function maybeLoadOlderOnScroll() {
        if (!ChatState.open || ChatState.loading || !ChatState.hasMore) return;
        if (ChatDom.messages.scrollTop <= ChatConfig.CHAT_TOP_AUTOLOAD_THRESHOLD) {
            loadOlderChatMessages();
        }
    }


    function updateViewportInset() {
        const viewport = window.visualViewport;
        if (!viewport) {
            ChatState.keyboardInset = 0;
        } else {
            const inset = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
            ChatState.keyboardInset = inset;
        }

        ChatDom.panel.style.bottom = `${ChatConfig.CHAT_PANEL_BASE_BOTTOM + ChatState.keyboardInset}px`;
        ChatDom.toggleButton.style.bottom = `${ChatConfig.CHAT_TOGGLE_BASE_BOTTOM + ChatState.keyboardInset}px`;
    }

    function bindViewportHandlers() {
        updateViewportInset();
        if (!window.visualViewport) return;
        window.visualViewport.addEventListener('resize', updateViewportInset);
        window.visualViewport.addEventListener('scroll', updateViewportInset);
        window.addEventListener('orientationchange', updateViewportInset);
    }

    function attachChatListeners() {
        ChatDom.overlay.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (isChatInteractionLocked()) return;
            closeChatPanel();
        });

        ChatDom.overlay.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            event.stopPropagation();
        });

        ChatDom.panel.addEventListener('pointerdown', (event) => {
            event.stopPropagation();
        });

        ChatDom.messages.addEventListener('scroll', maybeLoadOlderOnScroll);
        ChatDom.messages.addEventListener('click', (event) => {
            const gymRefNode = event.target.closest('[data-gym-ref]');
            if (!gymRefNode) return;
            event.preventDefault();
            openGymFromReference(gymRefNode.getAttribute('data-gym-ref'));
        });

        ChatDom.sendButton.addEventListener('click', (event) => {
            event.preventDefault();
            sendChatMessage();
        });

        ChatDom.input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendChatMessage();
            }
        });
    }

    function initializeChat() {
        const hasCache = ChatData.loadChatCache();
        if (hasCache) {
            ChatView.markMessagesAsRendered(ChatState.messages);
        }
        ChatView.renderChatMessages({ animateNew: false });
        attachChatListeners();
        bindViewportHandlers();
    }

    window.toggleChatPanel = toggleChatPanel;
    window.ChatController = {
        initializeChat
    };
})();
