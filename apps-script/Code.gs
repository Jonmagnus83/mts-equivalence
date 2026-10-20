/**
 * MTS-lab web app.
 * Deploy as a web app that runs as the owner and is available to anyone,
 * including people who are not signed in to Google. The script stores only
 * a SHA-256 hash of each participant code, never the code itself and never
 * a name, e-mail address or other personal data.
 *
 * Experimenter login (never commit these):
 *   Run installerEksperimentator once. It reads OPPSETT_BRUKERNAVN and
 *   OPPSETT_PASSORD, stores a salted SHA-256 hash, then deletes the plaintext.
 *   EXPERIMENTER_USER, EXPERIMENTER_SALT, EXPERIMENTER_PASSWORD_HASH, SESSION_SECRET
 *
 * Result folder is chosen in the app: Mennesker or Boter-AI.
 * ROOT_FOLDER_ID is optional. Empty means the root of the owner's Drive.
 * The code registry lives in the MTS-koder folder. Only code hashes are stored.
 */

var SESSION_TTL_SEC = 21600;
var CODE_ALPHABET_ = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

var CODE_HEADERS = ['hash', 'participantNumber', 'project', 'middle', 'expiresAt', 'createdAt', 'completed', 'configFileId', 'openedAt'];
var OPEN_TTL_MS_ = 6 * 60 * 60 * 1000;

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
        experimenterConfigured: Boolean(prop_('EXPERIMENTER_PASSWORD_HASH')),
      });
    }
    if (action === 'login') return json_(login_(body));
    if (action === 'register') return json_(register_(body));
    if (action === 'list') return json_(list_(body));
    if (action === 'download') return json_(download_(body));
    if (action === 'redeem') return json_(redeem_(body.hash));
    if (action === 'submit') return json_(submit_(body));
    if (action === 'cleanup') return json_(cleanupAll_(body));
    return json_({ ok: false, error: 'Ukjent handling.' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    lock.releaseLock();
  }
}

/**
 * One-time setup. In Script properties, set OPPSETT_BRUKERNAVN and OPPSETT_PASSORD,
 * run this function, then delete is done for you. The plaintext password is not kept.
 */
function installerEksperimentator() {
  var props = PropertiesService.getScriptProperties();
  var username = String(props.getProperty('OPPSETT_BRUKERNAVN') || '').trim();
  var password = String(props.getProperty('OPPSETT_PASSORD') || '');
  if (!username || password.length < 8) {
    throw new Error('Legg inn OPPSETT_BRUKERNAVN og OPPSETT_PASSORD (minst 8 tegn) før du kjører funksjonen.');
  }
  var salt = Utilities.getUuid() + Utilities.getUuid();
  props.setProperties({
    EXPERIMENTER_USER: username,
    EXPERIMENTER_SALT: salt,
    EXPERIMENTER_PASSWORD_HASH: hashPassword_(password, salt),
    SESSION_SECRET: Utilities.getUuid() + Utilities.getUuid(),
  });
  props.deleteProperty('OPPSETT_PASSORD');
  props.deleteProperty('OPPSETT_BRUKERNAVN');
  Logger.log('Eksperimentator er satt opp for ' + username + '. Klartekstpassordet er slettet.');
}

function login_(body) {
  var props = PropertiesService.getScriptProperties();
  var username = props.getProperty('EXPERIMENTER_USER') || '';
  var salt = props.getProperty('EXPERIMENTER_SALT') || '';
  var expected = props.getProperty('EXPERIMENTER_PASSWORD_HASH') || '';
  if (!username || !salt || !expected) return { ok: false, error: 'Eksperimentator er ikke satt opp.' };
  var givenUser = String(body.username || '').trim();
  var givenHash = hashPassword_(String(body.password || ''), salt);
  if (givenUser !== username || givenHash !== expected) {
    return { ok: false, error: 'Feil brukernavn eller passord.' };
  }
  var token = sha256hex_((props.getProperty('SESSION_SECRET') || '') + Utilities.getUuid() + Utilities.getUuid());
  CacheService.getScriptCache().put('tok_' + token, username, SESSION_TTL_SEC);
  return { ok: true, token: token, expiresInSec: SESSION_TTL_SEC };
}

function requireExperimenter_(body) {
  var token = String(body.token || '');
  if (!token) return false;
  return Boolean(CacheService.getScriptCache().get('tok_' + token));
}

function register_(body) {
  if (!requireExperimenter_(body)) return { ok: false, error: 'Logg inn på nytt.' };
  var code = generateCode_();
  var hash = sha256hex_(normalizeCode_(code));
  var book = codeBook_();
  var sheet = book.getSheets()[0];
  cleanupSheet_(sheet);
  var used = usedNumbers_(sheet);
  var participantNumber = freshNumber_(used);
  var project = safeName_(body.project || 'mts');
  var middle = allowedMiddle_(body.middle);
  ensureOpenedColumn_(sheet);
  var configFolder = childFolder_(registryFolder_(), 'oppsett');
  var configFile = configFolder.createFile(
    Utilities.newBlob(JSON.stringify(body.config || {}), 'application/json', hash + '.json')
  );
  sheet.appendRow([hash, participantNumber, project, middle, '', new Date().toISOString(), '0', configFile.getId(), '']);
  return {
    ok: true,
    code: code.slice(0, 4) + '-' + code.slice(4),
    participantNumber: participantNumber,
    openedAt: '',
    expiresAt: '',
    validForHoursAfterOpen: 6,
  };
}

function list_(body) {
  if (!requireExperimenter_(body)) return { ok: false, error: 'Logg inn på nytt.' };
  var sheet = codeBook_().getSheets()[0];
  cleanupSheet_(sheet);
  var values = sheet.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    rows.push({
      participantNumber: values[i][1],
      project: values[i][2],
      middle: values[i][3],
      expiresAt: values[i][4],
      createdAt: values[i][5],
      completed: String(values[i][6]) === '1',
    });
  }
  return { ok: true, rows: rows };
}

function download_(body) {
  if (!requireExperimenter_(body)) return { ok: false, error: 'Logg inn på nytt.' };
  var sheet = codeBook_().getSheets()[0];
  var wanted = String(body.participantNumber || '');
  var values = sheet.getDataRange().getValues();
  var row = null;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][1]) === wanted) row = values[i];
  }
  if (!row) return { ok: false, error: 'Fant ikke deltakeren.' };
  var folder = childFolder_(
    childFolder_(middleFolder_(allowedMiddle_(row[3])), safeName_(row[2])),
    wanted
  );
  var files = folder.getFilesByName(wanted + '.csv');
  if (!files.hasNext()) return { ok: false, error: 'Ingen resultatfil ennå.' };
  return { ok: true, participantNumber: wanted, csv: files.next().getBlob().getDataAsString() };
}

function redeem_(hash) {
  hash = String(hash || '').toLowerCase();
  var sheet = codeBook_().getSheets()[0];
  cleanupSheet_(sheet);
  var row = findHash_(sheet, hash);
  if (!row) return { ok: false, error: 'Ukjent eller utløpt kode.' };
  if (row.completed === '1' || row.completed === 1) return { ok: false, error: 'Koden er allerede brukt.' };
  row = stampOpen_(sheet, row);
  if (!row) return { ok: false, error: 'utløpt', expired: true };
  var config = {};
  if (row.configFileId) {
    config = JSON.parse(DriveApp.getFileById(row.configFileId).getBlob().getDataAsString());
  }
  return {
    ok: true,
    participantNumber: Number(row.participantNumber),
    config: config,
    openedAt: row.openedAt,
    expiresAt: row.expiresAt,
  };
}

function submit_(body) {
  var hash = String(body.hash || '').toLowerCase();
  var sheet = codeBook_().getSheets()[0];
  cleanupSheet_(sheet);
  var row = findHash_(sheet, hash);
  if (!row) return { ok: false, error: 'Ukjent eller utløpt kode.' };
  if (isOpenExpired_(row)) return { ok: false, error: 'utløpt', expired: true };
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

function cleanupAll_(body) {
  if (!requireExperimenter_(body)) return { ok: false, error: 'Logg inn på nytt.' };
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
  var headers = values[0];
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).toLowerCase() !== hash) continue;
    var row = { _index: i + 1 };
    for (var c = 0; c < headers.length; c++) {
      if (headers[c]) row[String(headers[c])] = values[i][c];
    }
    return row;
  }
  return null;
}

function ensureOpenedColumn_(sheet) {
  var last = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, last).getValues()[0];
  if (headers.indexOf('openedAt') !== -1) return;
  sheet.getRange(1, last + 1).setValue('openedAt');
}

function columnNumber_(sheet, name) {
  var last = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, last).getValues()[0];
  var index = headers.indexOf(name);
  return index === -1 ? 0 : index + 1;
}

/** First redeem starts a 6-hour window. A later redeem after that window is rejected. */
function stampOpen_(sheet, row) {
  ensureOpenedColumn_(sheet);
  var now = new Date();
  if (!row.openedAt) {
    var expires = new Date(now.getTime() + OPEN_TTL_MS_);
    sheet.getRange(row._index, columnNumber_(sheet, 'openedAt')).setValue(now.toISOString());
    sheet.getRange(row._index, columnNumber_(sheet, 'expiresAt')).setValue(expires.toISOString());
    row.openedAt = now.toISOString();
    row.expiresAt = expires.toISOString();
    return row;
  }
  if (isOpenExpired_(row)) return null;
  return row;
}

function isOpenExpired_(row) {
  if (!row.openedAt) return false;
  var exp = Date.parse(row.expiresAt);
  return !exp || exp <= Date.now();
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

function generateCode_() {
  var raw = '';
  for (var i = 0; i < 8; i++) raw += CODE_ALPHABET_.charAt(Math.floor(Math.random() * CODE_ALPHABET_.length));
  return raw;
}

function normalizeCode_(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function sha256hex_(text) {
  return toHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8));
}

function hashPassword_(password, salt) {
  return sha256hex_(salt + '\n' + password);
}

function toHex_(bytes) {
  return bytes.map(function (b) {
    var v = b < 0 ? b + 256 : b;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

function prop_(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
