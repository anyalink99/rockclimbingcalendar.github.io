function getActiveSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
}

function mapSheetRowsToEvents(rows) {
  return rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => Array.isArray(row) && row.length >= 4)
    .map(({ row, index }) => ({
      row: index + 1,
      date: row[0],
      name: row[1],
      gym: row[2],
      time: row[3],
      unsure: row[4]
    }))
    .filter(item => item.date && item.name);
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  const rows = getActiveSheet().getDataRange().getValues();
  return jsonResponse(mapSheetRowsToEvents(rows));
}

function deleteRowIfValid(sheet, rowNumber) {
  if (Number.isNaN(rowNumber) || rowNumber <= 0 || rowNumber > sheet.getLastRow()) {
    return false;
  }

  sheet.deleteRow(rowNumber);
  return true;
}

function doPost(e) {
  const params = JSON.parse((e.postData && e.postData.contents) || '{}');
  const sheet = getActiveSheet();

  if (params.action === 'delete' && params.row) {
    const deleted = deleteRowIfValid(sheet, Number(params.row));
    if (deleted) return jsonResponse({ ok: true });
    return jsonResponse({ ok: false, error: 'Invalid row' });
  }

  sheet.appendRow([params.date, params.name, params.gym, params.time, !!params.unsure]);
  return jsonResponse({ ok: true });
}
