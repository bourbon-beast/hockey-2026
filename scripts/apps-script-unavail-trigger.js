/**
 * apps-script-unavail-trigger.js
 *
 * Paste this into the Google Apps Script editor bound to the
 * "2026 Unavailability" spreadsheet.
 *
 * Setup steps:
 *   1. Open the sheet → Extensions → Apps Script
 *   2. Paste this code, replacing FUNCTION_URL below with the correct env URL
 *   3. Add your secret: Apps Script → Project Settings → Script Properties
 *      Key: AUTO_SYNC_SECRET   Value: <same secret set in Firebase>
 *   4. Run installTrigger() once manually to register the onChange trigger
 *   5. Grant permissions when prompted
 */

// ── Config ────────────────────────────────────────────────────────────────────

// UAT:  https://australia-southeast1-hockey-2026-uat.cloudfunctions.net/autoSyncUnavailability
// PROD: https://australia-southeast1-hockey-2026-f521f.cloudfunctions.net/autoSyncUnavailability
const FUNCTION_URL = 'https://australia-southeast1-hockey-2026-f521f.cloudfunctions.net/autoSyncUnavailability';

// Read secret from Script Properties (never hardcode)
const SECRET = PropertiesService.getScriptProperties().getProperty('AUTO_SYNC_SECRET');

// ── Trigger handler ───────────────────────────────────────────────────────────

function onSheetChange(e) {
  // Only fire for the unavailability tab
  const sheetName = e && e.source
    ? e.source.getActiveSheet().getName()
    : null;

  if (sheetName !== '2026 Unavailability') return;

  // Debounce: skip if another execution is already running
  const lock = LockService.getScriptLock();
  const acquired = lock.tryLock(1000);
  if (!acquired) {
    Logger.log('autoSync: skipped — another sync in progress');
    return;
  }

  try {
    Logger.log('autoSync: change detected, calling Cloud Function...');

    const response = UrlFetchApp.fetch(FUNCTION_URL, {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + SECRET,
        'Content-Type': 'application/json',
      },
      payload: JSON.stringify({ source: 'apps_script' }),
      muteHttpExceptions: true,
    });

    const code = response.getResponseCode();
    const body = response.getContentText();
    Logger.log('autoSync [' + code + ']: ' + body);

  } catch (err) {
    Logger.log('autoSync ERROR: ' + err.toString());
  } finally {
    lock.releaseLock();
  }
}

// ── Install / remove trigger ──────────────────────────────────────────────────
// Run installTrigger() once from the Apps Script editor.

function installTrigger() {
  // Remove duplicates first
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'onSheetChange') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onSheetChange')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onChange()
    .create();
  Logger.log('Trigger installed OK');
}

function uninstallTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'onSheetChange') ScriptApp.deleteTrigger(t);
  });
  Logger.log('Trigger removed');
}

// ── Manual test ───────────────────────────────────────────────────────────────
// Run testSync() from the editor to fire a sync without touching the sheet.

function testSync() {
  onSheetChange({ source: SpreadsheetApp.getActive() });
}
