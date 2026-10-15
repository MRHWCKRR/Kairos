const SHEET_NAME = 'Waitlist';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || '{}');
    const name = String(data.name || '').trim();
    const email = String(data.email || '').trim().toLowerCase();

    if (!name || !email || !email.includes('@')) {
      return json({ success: false, message: 'Invalid details.' });
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error('Create a sheet named Waitlist first.');

    const values = sheet.getDataRange().getValues();
    const existing = values.slice(1).some(row => String(row[1] || '').trim().toLowerCase() === email);
    if (!existing) sheet.appendRow([new Date(), name, email]);

    return json({ success: true });
  } catch (error) {
    return json({ success: false, message: error.message });
  }
}

function json(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
