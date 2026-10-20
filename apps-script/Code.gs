/**
 * MTS-lab web app.
 * Deploy as a web app that runs as the owner and is available to anyone,
 * including people who are not signed in to Google. The script stores only
 * a SHA-256 hash of each participant code, never the code itself and never
 * a name, e-mail address or other personal data.
 *
 * Script properties:
 *   EXPERIMENTER_SECRET  required for register
 *   The result folder is chosen in the app: Mennesker or Boter-AI.
 *   MIDDLE_FOLDER is ignored for that choice. The code registry lives in MTS-koder.
 *   ROOT_FOLDER_ID       optional. Empty means the root of the owner's Drive.
 */

var CODE_HEADERS = ['hash', 'participantNumber', 'project', 'middle', 'expiresAt', 'createdAt', 'completed', 'configFileId'];

function doGet(e) {
  return handle_(e && e.parameter ? e.parameter : {});
}

function doPost(e) {
  var body = {};
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'Ugyldig JSON.' });
  }
  return handle_(body);
}

function handle_(body) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var action = String(body.action || 'ping');
    if (action === 'ping') {
      return json_({
        ok: true,
        service: 'mts-lab',
        auth: secretOk_(body.secret),
        secretConfigured: Boolean(prop_('EXPERIMENTER_SECRET')),
      });
    }
    if (action === 'register') return json_(register_(body));
    if (action === 'redeem') return json_(redeem_(body.hash));
    if (action === 'submit') return json_(submit_(body));
    if (action === 'cleanup') return json_(cleanupAll_());
    return json_({ ok: false, error: 'Ukjent handling.' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    lock.releaseLock();
  }
}

function register_(body) {
  if (!secretOk_(body.secret)) return { ok: false, error: 'Hemmeligheten stemmer ikke.' };
  var hash = String(body.hash || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) return { ok: false, error: 'Hash mangler.' };
  var book = codeBook_();
  var sheet = book.getSheets()[0];
  cleanupSheet_(sheet);
  var existing = findHash_(sheet, hash);
  if (existing) {
    return { ok: true, participantNumber: Number(existing.participantNumber), expiresAt: existing.expiresAt };
  }
  var used = usedNumbers_(sheet);
  var participantNumber = Number(body.participantNumber);
  if (!participantNumber || participantNumber < 10000 || used[participantNumber]) {
    participantNumber = freshNumber_(used);
  }
  var project = safeName_(body.project || 'mts');
  var middle = allowedMiddle_(body.middle);
  var expiresAt = body.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  var configFolder = childFolder_(registryFolder_(), 'oppsett');
  var configFile = configFolder.createFile(
    Utilities.newBlob(JSON.stringify(body.config || {}), 'application/json', hash + '.json')
  );
  sheet.appendRow([hash, participantNumber, project, middle, expiresAt, new Date().toISOString(), '0', configFile.getId()]);
  return { ok: true, participantNumber: participantNumber, expiresAt: expiresAt };
}

function redeem_(hash) {
  hash = String(hash || '').toLowerCase();
  var sheet = codeBook_().getSheets()[0];
  cleanupSheet_(sheet);
  var row = findHash_(sheet, hash);
  if (!row) return { ok: false, error: 'Ukjent eller utløpt kode.' };
  if (row.completed === '1' || row.completed === 1) return { ok: false, error: 'Koden er allerede brukt.' };
  var config = {};
  if (row.configFileId) {
    config = JSON.parse(DriveApp.getFileById(row.configFileId).getBlob().getDataAsString());
  }
  return { ok: true, participantNumber: Number(row.participantNumber), config: config, expiresAt: row.expiresAt };
}

function submit_(body) {
  var hash = String(body.hash || '').toLowerCase();
  var sheet = codeBook_().getSheets()[0];
  cleanupSheet_(sheet);
  var row = findHash_(sheet, hash);
  if (!row) return { ok: false, error: 'Ukjent eller utløpt kode.' };
  if (row.completed === '1' || row.completed === 1) return { ok: false, error: 'Koden er allerede brukt.' };
  var middle = allowedMiddle_(row.middle || body.middle);
  var project = safeName_(row.project || body.project || 'mts');
  var participantNumber = String(row.participantNumber);
  var folder = childFolder_(childFolder_(middleFolder_(middle), project), participantNumber);
  var ss = upsertSheet_(folder, participantNumber);
  writeObjects_(ss, 'Data', body.rows || []);
  writeObjects_(ss, 'Parametere', body.parameters || []);
  writeObjects_(ss, 'Hendelser', body.events || []);
  dropEmptyDefault_(ss);
  if (body.csv) replaceText_(folder, participantNumber + '.csv', String(body.csv), 'text/csv');
  if (body.eventsCsv) replaceText_(folder, participantNumber + '_hendelser.csv', String(body.eventsCsv), 'text/csv');
  if (body.xlsxBase64) {
    var bytes = Utilities.base64Decode(String(body.xlsxBase64));
    replaceBlob_(
      folder,
      participantNumber + '.xlsx',
      Utilities.newBlob(bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', participantNumber + '.xlsx')
    );
  }
  if (body.final) setCompleted_(sheet, hash);
  return { ok: true, participantNumber: Number(participantNumber), folder: folder.getName() };
}

function cleanupAll_() {
  var sheet = codeBook_().getSheets()[0];
  var removed = cleanupSheet_(sheet);
  return { ok: true, removed: removed };
}

function cleanupSheet_(sheet) {
  var values = sheet.getDataRange().getValues();
  var removed = 0;
  var now = Date.now();
  for (var i = values.length - 1; i >= 1; i--) {
    var expires = Date.parse(values[i][4]);
    if (!expires || expires > now) continue;
    var fileId = values[i][7];
    if (fileId) {
      try { DriveApp.getFileById(fileId).setTrashed(true); } catch (ignore) {}
    }
    sheet.deleteRow(i + 1);
    removed++;
  }
  return removed;
}

function codeBook_() {
  var folder = registryFolder_();
  var files = folder.getFilesByName('MTS-koder');
  while (files.hasNext()) {
    var file = files.next();
    if (file.getMimeType() === MimeType.GOOGLE_SHEETS) return SpreadsheetApp.openById(file.getId());
  }
  var created = SpreadsheetApp.create('MTS-koder');
  DriveApp.getFileById(created.getId()).moveTo(folder);
  created.getSheets()[0].appendRow(CODE_HEADERS);
  return created;
}

function findHash_(sheet, hash) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return null;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).toLowerCase() !== hash) continue;
    var row = { _index: i + 1 };
    for (var c = 0; c < CODE_HEADERS.length; c++) row[CODE_HEADERS[c]] = values[i][c];
    return row;
  }
  return null;
}

function setCompleted_(sheet, hash) {
  var row = findHash_(sheet, hash);
  if (!row) return;
  sheet.getRange(row._index, 7).setValue('1');
}

function usedNumbers_(sheet) {
  var values = sheet.getDataRange().getValues();
  var used = {};
  for (var i = 1; i < values.length; i++) used[String(values[i][1])] = true;
  return used;
}

function freshNumber_(used) {
  for (var i = 0; i < 50; i++) {
    var n = 10000 + Math.floor(Math.random() * 90000);
    if (!used[String(n)]) return n;
  }
  return 100000 + Math.floor(Math.random() * 900000);
}

function middleFolder_(name) {
  var rootId = prop_('ROOT_FOLDER_ID');
  var root = rootId ? DriveApp.getFolderById(rootId) : DriveApp.getRootFolder();
  return childFolder_(root, safeName_(name || prop_('MIDDLE_FOLDER') || 'Mennesker'));
}

function registryFolder_() {
  var rootId = prop_('ROOT_FOLDER_ID');
  var root = rootId ? DriveApp.getFolderById(rootId) : DriveApp.getRootFolder();
  return childFolder_(root, 'MTS-koder');
}

/** The app sends Mennesker or Boter-AI. That string is the Drive folder name. */
function allowedMiddle_(requested) {
  var wanted = String(requested || '').trim();
  if (wanted === 'Boter-AI' || wanted === 'Mennesker') return wanted;
  return 'Mennesker';
}

function childFolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
}

function upsertSheet_(folder, name) {
  var files = folder.getFilesByName(name);
  while (files.hasNext()) {
    var file = files.next();
    if (file.getMimeType() === MimeType.GOOGLE_SHEETS) return SpreadsheetApp.openById(file.getId());
  }
  var created = SpreadsheetApp.create(name);
  DriveApp.getFileById(created.getId()).moveTo(folder);
  return created;
}

function writeObjects_(ss, title, rows) {
  var sheet = ss.getSheetByName(title);
  if (!sheet) sheet = ss.insertSheet(title);
  sheet.clear();
  if (!rows || !rows.length) return;
  var headers = Object.keys(rows[0]);
  var values = [headers];
  for (var r = 0; r < rows.length; r++) {
    var line = [];
    for (var c = 0; c < headers.length; c++) {
      var value = rows[r][headers[c]];
      line.push(value == null ? '' : value);
    }
    values.push(line);
  }
  sheet.getRange(1, 1, values.length, headers.length).setValues(values);
}

function dropEmptyDefault_(ss) {
  var names = ['Sheet1', 'Ark1'];
  for (var i = 0; i < names.length; i++) {
    var sheet = ss.getSheetByName(names[i]);
    if (sheet && ss.getSheets().length > 1) ss.deleteSheet(sheet);
  }
}

function replaceText_(folder, name, text, mime) {
  replaceBlob_(folder, name, Utilities.newBlob(text, mime, name));
}

function replaceBlob_(folder, name, blob) {
  var files = folder.getFilesByName(name);
  while (files.hasNext()) files.next().setTrashed(true);
  folder.createFile(blob);
}

function safeName_(name) {
  var text = String(name || 'mts').replace(/[\/\\?%*:|"<>]/g, ' ').replace(/\s+/g, ' ').trim();
  return text.slice(0, 80) || 'mts';
}

function secretOk_(secret) {
  var expected = prop_('EXPERIMENTER_SECRET');
  return Boolean(expected) && String(secret || '') === expected;
}

function prop_(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
