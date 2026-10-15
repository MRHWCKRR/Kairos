# Kairos waitlist setup

The waitlist stores signups in a private Google Sheet. The website only needs the deployed Google Apps Script Web App URL.

## 1. Create the sheet

Create a Google Sheet and add a tab named `Waitlist`.

Put these headers in row 1:

`Timestamp | Name | Email`

## 2. Add the Apps Script

Open **Extensions → Apps Script**, replace the default code with the contents of `waitlist/Code.gs`, and save it.

## 3. Deploy it

Choose **Deploy → New deployment → Web app**.

Use:

- **Execute as:** Me
- **Who has access:** Anyone

Deploy and copy the Web App URL.

## 4. Connect Kairos

Open `waitlist.js` and replace:

`PASTE_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE`

with the Web App URL. Commit and deploy Kairos.

The script prevents the same email address from being added twice.

## Important

Keep the Google Sheet private. Do not publish it or put subscriber data in this repository. The free-month offer should be stated clearly in the website's terms/launch offer before collecting signups.
