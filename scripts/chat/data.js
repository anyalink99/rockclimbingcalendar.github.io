(function () {
    const { ChatConfig, ChatState } = window;

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

    function saveChatCache() {
        try {
            const items = ChatState.messages.slice(-ChatConfig.CHAT_CACHE_LIMIT);
            localStorage.setItem(ChatConfig.CHAT_CACHE_KEY, JSON.stringify(items));
        } catch (error) {
            console.warn('Unable to save chat cache', error);
        }
    }

    function loadChatCache() {
        try {
            const raw = localStorage.getItem(ChatConfig.CHAT_CACHE_KEY);
            if (!raw) return false;
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed) || !parsed.length) return false;

            ChatState.messages = normalizeChatMessages(parsed)
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                .slice(-ChatConfig.CHAT_CACHE_LIMIT);
            ChatState.offset = ChatState.messages.length;
            ChatState.hasMore = true;
            return true;
        } catch (error) {
            console.warn('Unable to load chat cache', error);
            return false;
        }
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
            script.src = `${ChatState.apiUrl}?${withCallback.toString()}`;
            document.head.appendChild(script);
        });
    }

    async function fetchChatChunk(offset = 0, limit = ChatConfig.CHAT_BATCH_SIZE) {
        const params = new URLSearchParams({
            mode: 'chat',
            chatName: ChatConfig.CHAT_NAME,
            sheet: ChatConfig.CHAT_SHEET_NAME,
            offset: String(offset),
            limit: String(limit)
        });

        const requestUrl = `${ChatState.apiUrl}?${params.toString()}`;

        try {
            const res = await fetch(requestUrl, {
                method: 'GET',
                cache: 'no-store'
            });
            if (!res.ok) throw new Error('Chat load failed');
            const data = await res.json();
            ChatState.readBlockedByCors = false;

            return {
                items: normalizeChatMessages(data.items || []),
                nextOffset: Number(data.nextOffset) || (offset + (data.items || []).length),
                hasMore: Boolean(data.hasMore),
                total: Number(data.total) || 0
            };
        } catch (error) {
            const data = await fetchChatChunkViaJsonp(params);
            ChatState.readBlockedByCors = false;

            return {
                items: normalizeChatMessages(data.items || []),
                nextOffset: Number(data.nextOffset) || (offset + (data.items || []).length),
                hasMore: Boolean(data.hasMore),
                total: Number(data.total) || 0
            };
        }
    }

    function mergeServerWithOptimisticMessages(serverMessages, currentMessages) {
        const optimisticMessages = currentMessages.filter(item => item.pending);
        const serverIds = new Set(serverMessages.map(item => item.messageId));
        const ttlMs = 60_000;
        const now = Date.now();
        const unresolvedOptimistic = optimisticMessages.filter((item) => {
            if (serverIds.has(item.messageId)) return false;
            if (!item.optimisticCreatedAt) return false;
            return now - item.optimisticCreatedAt < ttlMs;
        });

        return [...serverMessages, ...unresolvedOptimistic]
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }

    window.ChatData = {
        fetchChatChunk,
        loadChatCache,
        saveChatCache,
        mergeServerWithOptimisticMessages
    };
})();
