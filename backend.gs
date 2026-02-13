function doGet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = sheet.getDataRange().getValues();

  const events = data
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => Array.isArray(row) && row.length >= 4)
    .map(({ row, index }) => ({
      row: index + 1,
      date: row[0],
      name: row[1],
      gym: row[2],
      time: row[3]
    }))
    .filter(item => item.date && item.name);

  return ContentService
    .createTextOutput(JSON.stringify(events))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const params = JSON.parse((e.postData && e.postData.contents) || '{}');
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  if (params.action === 'delete' && params.row) {
    const rowNumber = Number(params.row);
    if (!Number.isNaN(rowNumber) && rowNumber > 0 && rowNumber <= sheet.getLastRow()) {
      sheet.deleteRow(rowNumber);
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: 'Invalid row' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  sheet.appendRow([params.date, params.name, params.gym, params.time]);
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
