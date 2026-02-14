function chatJsonResponse(payload, params) {
  const callback = params && String(params.callback || '').trim();
  const callbackSafe = /^[A-Za-z_$][0-9A-Za-z_$]*(?:\.[A-Za-z_$][0-9A-Za-z_$]*)*$/.test(callback);

  if (callbackSafe) {
    return ContentService
      .createTextOutput(`${callback}(${JSON.stringify(payload)})`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function getChatSheetByNameOrActive(name) {
  if (name) {
    const sheetByName = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
    if (sheetByName) return sheetByName;
  }

  return SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
}

function mapSheetRowsToChat(rows) {
  if (!rows.length) return [];

  const [header, ...dataRows] = rows;
  const hasHeader = Array.isArray(header)
    && String(header[0]).toLowerCase() === 'chat_name'
    && String(header[1]).toLowerCase() === 'message_id';

  const rowsToParse = hasHeader ? dataRows : rows;

  return rowsToParse
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => Array.isArray(row) && row.length >= 5)
    .map(({ row, index }) => ({
      row: index + (hasHeader ? 2 : 1),
      chat_name: String(row[0] || ''),
      message_id: String(row[1] || ''),
      date: row[2] || '',
      author: String(row[3] || ''),
      text: String(row[4] || ''),
      reply_to: row[5] || '',
      reactions_total: row[6] || 0
    }))
    .filter(item => item.chat_name && item.author && item.text);
}

function handleChatGet(params) {
  if (params.mode !== 'chat') return null;

  const sheet = getChatSheetByNameOrActive(params.sheet);
  const rows = sheet.getDataRange().getValues();
  const allMessages = mapSheetRowsToChat(rows)
    .filter(item => !params.chatName || item.chat_name === params.chatName)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const limit = Math.max(1, Math.min(Number(params.limit) || 100, 200));
  const offset = Math.max(0, Number(params.offset) || 0);
  const end = allMessages.length - offset;
  const start = Math.max(0, end - limit);
  const items = allMessages.slice(start, end);

  return {
    items,
    nextOffset: offset + items.length,
    hasMore: start > 0,
    total: allMessages.length
  };
}

function handleChatPost(params) {
  if (params.action !== 'chat_send') return null;

  const chatSheet = getChatSheetByNameOrActive(params.sheet);
  const timestamp = new Date();
  const messageId = params.message_id || ('msg-' + timestamp.getTime());

  chatSheet.appendRow([
    params.chat_name || 'Общий чат',
    messageId,
    timestamp.toISOString(),
    params.author || 'Аноним',
    params.text || '',
    params.reply_to || '',
    Number(params.reactions_total) || 0
  ]);

  return { ok: true, message_id: messageId, date: timestamp.toISOString() };
}

function doGet(e) {
  const params = (e && e.parameter) || {};
  const chatResponse = handleChatGet(params);
  if (chatResponse) return chatJsonResponse(chatResponse, params);
  return chatJsonResponse({ ok: false, error: 'Unsupported mode' }, params);
}

function doPost(e) {
  const params = JSON.parse((e.postData && e.postData.contents) || '{}');
  const chatResponse = handleChatPost(params);
  if (chatResponse) return chatJsonResponse(chatResponse, params);
  return chatJsonResponse({ ok: false, error: 'Unsupported action' }, params);
}
