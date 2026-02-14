function getGymsSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
}

function gymsJson(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function normalizeGymRecord(record) {
  const details = record.details && typeof record.details === 'object' ? record.details : {};
  return {
    id: String(record.id || record.name || ''),
    name: String(record.name || ''),
    icon: String(record.icon || ''),
    details
  };
}

function mapGymsRows(rows) {
  return rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => Array.isArray(row) && row[0])
    .map(({ row, index }) => {
      let details = {};
      try {
        details = row[2] ? JSON.parse(String(row[2])) : {};
      } catch (err) {
        details = {};
      }
      return {
        row: index + 1,
        id: String(row[0] || row[1] || ''),
        name: String(row[1] || ''),
        icon: String(row[3] || ''),
        details
      };
    });
}

function doGet(e) {
  const action = e && e.parameter && e.parameter.action;
  if (action && action !== 'list') return gymsJson({ ok: false, error: 'Unknown action' });
  const rows = getGymsSheet().getDataRange().getValues();
  return gymsJson({ ok: true, items: mapGymsRows(rows) });
}

function upsertGym(sheet, gym) {
  const next = normalizeGymRecord(gym);
  const rows = sheet.getDataRange().getValues();
  const existingRow = rows.findIndex((row) => String(row[0] || row[1] || '') === next.id || String(row[1] || '') === next.name);
  const payload = [next.id, next.name, JSON.stringify(next.details || {}), next.icon];

  if (existingRow >= 0) {
    sheet.getRange(existingRow + 1, 1, 1, payload.length).setValues([payload]);
    return existingRow + 1;
  }

  sheet.appendRow(payload);
  return sheet.getLastRow();
}

function seedGymsFromCalendar(sheet, gyms) {
  if (!Array.isArray(gyms)) return 0;
  let inserted = 0;
  gyms.forEach(function (gym) {
    const normalized = normalizeGymRecord(gym);
    if (!normalized.name) return;
    const rowNumber = upsertGym(sheet, normalized);
    if (rowNumber) inserted += 1;
  });
  return inserted;
}

function doPost(e) {
  const params = JSON.parse((e.postData && e.postData.contents) || '{}');
  const action = params.action || 'saveGym';
  const sheet = getGymsSheet();

  if (action === 'seedFromCalendar') {
    const count = seedGymsFromCalendar(sheet, params.gyms || []);
    return gymsJson({ ok: true, seeded: count });
  }

  if (action === 'saveGym' && params.gym) {
    const row = upsertGym(sheet, params.gym);
    return gymsJson({ ok: true, row: row });
  }

  return gymsJson({ ok: false, error: 'Unknown action' });
}
