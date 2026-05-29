const APP_VERSION = 'v87.1.12-full-fixed';
/* V87_APP_VERSION_CONSTANT */
/**
 * FORM_PAYLOAD_FIX_V5
 * DRIVE_DIRECT_PLAYBACK_FIX_V6

 * השעון המשפחתי — Google Sheets + Google Drive backend
 * ------------------------------------------------------
 * גרסה מלאה:
 * - נתוני הלוח נשמרים ב-Google Sheets.
 * - הקלטות קול נשמרות כקבצים ב-Google Drive, לא בתוך התא של הגיליון.
 * - אפשר לשמור בדרייב של מנהלת האתר או בתיקיית Drive משותפת של המשפחה.
 *
 * התקנה אחרי החלפת הקוד:
 * Deploy → Manage deployments → Edit → New version → Deploy
 */

const BOARDS_SHEET = 'לוחות';
const CHUNKS_SHEET = 'לוחות_חלקים';
const LOG_SHEET = 'לוג';
const SECURITY_SHEET = 'לוחות_אבטחה';
const AUDIO_SHEET = 'קבצי_קול';
const READABLE_PREFIX = 'טבלה_';
const DEFAULT_AUDIO_FOLDER_NAME = 'השעון המשפחתי - הקלטות';
// V70: default Drive folder is resolved server-side only. The frontend does not need or show its folder ID.

const CHUNK_SIZE = 45000;


function normalizeBoardId_(boardId) {
  boardId = String(boardId || '').trim();
  try {
    if (boardId.indexOf('%') !== -1) boardId = decodeURIComponent(boardId);
  } catch (err) {}
  try {
    if (boardId.normalize) boardId = boardId.normalize('NFC');
  } catch (err) {}
  return boardId;
}




/* V85_USES_EXISTING_DOPOST_LOCKS: saves are already serialized at doPost action level; do not lock inside saveBoard_ again. */
function withScriptLock_(fn) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    return fn();
  } finally {
    try { lock.releaseLock(); } catch (err) {}
  }
}



function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = params.action || 'load';
  const callback = params.callback || '';

  let result;
  try {
    if (action === 'verifyAccessKey') {
      const boardId = normalizeBoardId_(params.board || params.boardId || '');
      result = verifyAccessKey_(boardId, accessKeyFromParams_(params));
    } else if (action === 'securityMigrationReport') {
      requireAdminSecret_(params);
      result = securityMigrationReport_(String(params.includeDetails || '') === '1');
      /* V871_PROTECTED_SECURITY_MIGRATION_REPORT */
    } else if (action === 'health') {
      result = healthCheck_();
    } else if (action === 'templateSetupInfo') {
      requireAdminSecret_(params);
      result = templateSetupInfo_();
      /* V8712_PROTECTED_TEMPLATE_SETUP_INFO */
    } else if (action === 'load') {
      const boardId = normalizeBoardId_(params.board || 'grandma-home-board');
      requireBoardAccess_(boardId, accessKeyFromParams_(params), false);
      result = loadBoard_(boardId);
    } else if (action === 'musicFolderStatus') {
      const boardId = normalizeBoardId_(params.board || '');
      requireBoardAccess_(boardId, accessKeyFromParams_(params), false);
      result = musicFolderStatus_(params.folderId || params.driveFolderId || params.id || '');
    } else if (action === 'musicFolder') {
      const boardId = normalizeBoardId_(params.board || '');
      requireBoardAccess_(boardId, accessKeyFromParams_(params), false);
      result = listMusicFolder_(params.folderId || params.driveFolderId || params.id || '');
    } else if (action === 'musicFile') {
      const boardId = normalizeBoardId_(params.board || '');
      requireBoardAccess_(boardId, accessKeyFromParams_(params), false);
      result = getMusicFile_(params.folderId || params.driveFolderId || '', params.fileId || params.id || '');
    } else if (action === 'testAudioWrite') {
      const boardId = normalizeBoardId_(params.board || 'test-board');
      requireBoardAccess_(boardId, accessKeyFromParams_(params), true);
      result = testAudioWrite_(boardId, params.folderId || params.driveFolderId || '');
    } else if (action === 'audioFolderStatus') {
      const boardId = normalizeBoardId_(params.board || '');
      requireBoardAccess_(boardId, accessKeyFromParams_(params), false);
      result = audioFolderStatus_(params.folderId || params.driveFolderId || '');
    } else if (action === 'audioMeta') {
      const boardId = normalizeBoardId_(params.board || '');
      requireBoardAccess_(boardId, accessKeyFromParams_(params), false);
      result = getAudioMeta_(boardId, params.recordingKey || params.audioKey || params.key || '');
    } else if (action === 'audio') {
      const boardId = normalizeBoardId_(params.board || '');
      requireBoardAccess_(boardId, accessKeyFromParams_(params), false);
      result = getAudio_(boardId, params.recordingKey || params.audioKey || params.key || '');
    } else if (action === 'ping') {
      const boardId = normalizeBoardId_(params.board || 'grandma-home-board');
      requireBoardAccess_(boardId, accessKeyFromParams_(params), true);
      const minutes = Math.max(1, Number(params.minutes || 5));
      const ping = {
        id: Number(params.id || new Date().getTime()),
        message: String(params.message || ''),
        createdAt: Number(params.createdAt || new Date().getTime()),
        durationMs: Number(params.durationMs || minutes * 60000),
        ack: false
      };
      result = withScriptLock_(() => saveLivePing_(boardId, ping));
    } else if (action === 'clearPing') {
      const boardId = normalizeBoardId_(params.board || 'grandma-home-board');
      requireBoardAccess_(boardId, accessKeyFromParams_(params), true);
      result = withScriptLock_(() => saveLivePing_(boardId, null));
    } else if (action === 'version') {
      result = { ok: true, version: APP_VERSION, features: ['musicFolder','musicFile','audio','audioMeta'], time: new Date().toISOString() };
    } else {
      result = { ok: false, error: 'פעולה לא מוכרת' };
    }
  } catch (err) {
    try { log_('system', 'doGet-error', String(err && err.message ? err.message : err)); } catch (logErr) {}
    result = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  

  return output_(result, callback);
}


/* V86_REMOVED_DUPLICATE_parsePostBody_ */




function doPost(e) {
  let result;
  try {
    const body = parsePostBody_(e);

    if (body.action === 'rotateAccessKey') {
      const boardId = normalizeBoardId_(body.boardId || body.board || 'grandma-home-board');
      result = withScriptLock_(() => strictRotateAccessKeyV871_(
        boardId,
        body.oldAccessKey || body.currentAccessKey || accessKeyFromBody_(body),
        body.newAccessKey || ''
      ));
    } else if (body.action === 'ping') {
      const boardId = normalizeBoardId_(body.boardId || body.board || 'grandma-home-board');
      requireBoardAccess_(boardId, accessKeyFromBody_(body), true);
      result = withScriptLock_(() => saveLivePing_(boardId, body.livePing || {
        id: Number(body.id || new Date().getTime()),
        message: String(body.message || ''),
        createdAt: Number(body.createdAt || new Date().getTime()),
        durationMs: Number(body.durationMs || Math.max(1, Number(body.minutes || 5)) * 60000),
        ack: false
      }));
    } else if (body.action === 'clearPing') {
      const boardId = normalizeBoardId_(body.boardId || body.board || 'grandma-home-board');
      requireBoardAccess_(boardId, accessKeyFromBody_(body), true);
      result = withScriptLock_(() => saveLivePing_(boardId, null));
    } else if (body.action === 'save') {
      const boardId = normalizeBoardId_(body.boardId || body.board || 'grandma-home-board');
      requireBoardAccess_(boardId, accessKeyFromBody_(body), true);
      result = withScriptLock_(() => saveBoard_(boardId, body.value || {}));
    } else if (body.action === 'setOwnerAudioFolder') {
      result = { ok: false, error: 'setOwnerAudioFolder disabled for security. Set OWNER_AUDIO_FOLDER_ID in Script Properties instead.' };
      /* V87_DISABLED_PUBLIC_SET_OWNER_AUDIO_FOLDER */
    } else if (body.action === 'saveAudio') {
      const boardId = normalizeBoardId_(body.boardId || body.board || 'grandma-home-board');
      requireBoardAccess_(boardId, accessKeyFromBody_(body), true);
      result = withScriptLock_(() => saveAudio_(boardId, body.key || 'calm', body.dataUrl || '', body.folderId || ''));
    } else if (body.action === 'deleteAudio') {
      const boardId = normalizeBoardId_(body.boardId || body.board || 'grandma-home-board');
      requireBoardAccess_(boardId, accessKeyFromBody_(body), true);
      result = withScriptLock_(() => deleteAudio_(boardId, body.key || 'calm'));
    } else {
      result = { ok: false, error: 'פעולה לא מוכרת' };
    }
  } catch (err) {
    result = { ok: false, error: String(err && err.message ? err.message : err) };
  }

  return postOutputV8717_(result);
}

function postOutputV8717_(obj) {
  // V8717_POST_TEXT_OUTPUT: form/iframe POST callers do not need executable JSON.
  // Returning text/plain avoids browser CORB warnings that can appear when an
  // Apps Script POST response is loaded cross-origin in a hidden iframe.
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.TEXT);
}


function accessKeyFromParams_(params) {
  return String((params && (params.accessKey || params.token || params.boardKey || params.key)) || '');
}

function accessKeyFromBody_(body) {
  return String((body && (body.accessKey || body.token || body.boardKey || body.key)) || '');
}

function hashAccessKey_(key) {
  key = String(key || '');
  if (!key) return '';
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, key, Utilities.Charset.UTF_8);
  return bytes.map(function(b) {
    const v = (b < 0 ? b + 256 : b);
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

function getSecurityRow_(boardId) {
  const sheet = getOrCreateSheet_(SECURITY_SHEET, ['board_id', 'access_hash', 'created_at', 'updated_at']);
  const last = sheet.getLastRow();
  if (last <= 1) return null;
  const values = sheet.getRange(2, 1, last - 1, 4).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(boardId)) {
      return {
        row: i + 2,
        hash: String(values[i][1] || ''),
        createdAt: values[i][2] || '',
        updatedAt: values[i][3] || ''
      };
    }
  }
  return null;
}

function registerBoardAccess_(boardId, accessKey) {
  if (!accessKey) return;
  const sheet = getOrCreateSheet_(SECURITY_SHEET, ['board_id', 'access_hash', 'created_at', 'updated_at']);
  const hash = hashAccessKey_(accessKey);
  const now = new Date();
  const existing = getSecurityRow_(boardId);
  if (existing) {
    if (!existing.hash) sheet.getRange(existing.row, 2, 1, 3).setValues([[hash, now, now]]);
    return;
  }
  sheet.appendRow([boardId, hash, now, now]);
}

function requireBoardAccess_(boardId, accessKey, allowRegister) {
  ensureSheets_();
  boardId = normalizeBoardId_(boardId);
  if (!boardId) throw new Error('חסר מזהה לוח');

  const row = getSecurityRow_(boardId);

  // Backward compatibility: old boards can still be read.
  // Writes must include a family access key; first write with a key migrates the board.
  if (!row) {
    if (allowRegister) {
      if (!accessKey) throw new Error('חסר מפתח גישה משפחתי לשמירה');
      registerBoardAccess_(boardId, accessKey);
    }
    return true;
  }

  if (!row.hash) {
    if (allowRegister) {
      if (!accessKey) throw new Error('חסר מפתח גישה משפחתי לשמירה');
      registerBoardAccess_(boardId, accessKey);
    }
    return true;
  }
  

  if (!accessKey) throw new Error('חסר מפתח גישה משפחתי');
  if (hashAccessKey_(accessKey) !== row.hash) throw new Error('מפתח גישה לא נכון ללוח הזה');

  return true;
}




function rotateBoardAccessKey_(boardId, oldAccessKey, newAccessKey) {
  // Legacy entry point kept for compatibility, but it must not auto-register unsecured boards.
  return strictRotateAccessKeyV871_(boardId, oldAccessKey, newAccessKey);
}




function safeJsonpCallback_(callback) {
  callback = String(callback || '').trim();
  if (!callback) return '';
  if (/^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)?$/.test(callback)) return callback;
  return '';
}



function output_(obj, callback) {
  callback = safeJsonpCallback_(callback);
  const json = JSON.stringify(obj);
  if (callback) {
    // V8714_JSONP_CALLBACK_GUARD: if a slow Apps Script response arrives after
    // the browser timed out and cleaned the callback, do not throw ReferenceError.
    return ContentService.createTextOutput('try{if(typeof ' + callback + '===\"function\")' + callback + '(' + json + ');}catch(e){}')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function getSpreadsheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('הסקריפט חייב להיות מחובר ל-Google Sheet.');
  return ss;
}

function getOrCreateSheet_(name, headers) {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  if (headers && headers.length) {
    const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    const isEmpty = firstRow.every(v => !v);
    if (isEmpty) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      sheet.autoResizeColumns(1, headers.length);
    }
  }
  return sheet;
}

function ensureSheets_() {
  getOrCreateSheet_(BOARDS_SHEET, ['board_id', 'mode', 'updated_at', 'chunk_count', 'json_small']);
  getOrCreateSheet_(CHUNKS_SHEET, ['board_id', 'part', 'chunk']);
  getOrCreateSheet_(AUDIO_SHEET, ['board_id', 'key', 'file_id', 'file_name', 'mime_type', 'folder_id', 'updated_at']);
  getOrCreateSheet_(LOG_SHEET, ['time', 'board_id', 'action', 'note']);
  getOrCreateSheet_(SECURITY_SHEET, ['board_id', 'access_hash', 'created_at', 'updated_at']);
}


function saveLivePing_(boardId, ping) {
  boardId = normalizeBoardId_(boardId);
  const loaded = loadBoard_(boardId);
  const value = (loaded && loaded.value) ? loaded.value : {};
  value.livePing = ping || null;
  const saved = saveBoard_(boardId, value);
  return { ok: true, livePing: value.livePing, saved: saved && saved.ok !== false };
}



function loadBoard_(boardId) {
  boardId = normalizeBoardId_(boardId);

  const cached = getBoardCache_(boardId);
  if (cached !== null && typeof cached !== 'undefined') return cached;

  ensureSheets_();
  const sheet = getOrCreateSheet_(BOARDS_SHEET, ['board_id', 'mode', 'updated_at', 'chunk_count', 'json_small']);
  const last = sheet.getLastRow();
  if (last <= 1) {
    const missing = { ok: true, exists: false, boardId, value: null, updated_at: '' };
    putBoardCache_(boardId, missing);
    return missing;
  }

  const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  let row = -1;
  for (let i = 0; i < ids.length; i++) {
    if (normalizeBoardId_(ids[i][0]) === boardId) {
      row = i + 2;
      break;
    }
  }

  if (row === -1) {
    const missing = { ok: true, exists: false, boardId, value: null, updated_at: '' };
    putBoardCache_(boardId, missing);
    return missing;
  }

  const r = sheet.getRange(row, 1, 1, 5).getValues()[0];
  const mode = String(r[1] || 'small');
  let json = '';

  if (mode === 'chunked') json = readChunks_(boardId, Number(r[3] || 0));
  else json = r[4] || '{}';

  let value = {};
  try { value = JSON.parse(json || '{}'); } catch (err) { value = {}; }

  value.voiceRecordings = value.voiceRecordings || {};
  attachAudioRefs_(boardId, value);

  const result = { ok: true, exists: true, boardId, value, updated_at: r[2] || '' };
  putBoardCache_(boardId, result);
  return result;
}
/* V85_CACHED_OPTIMIZED_LOAD_BOARD */

function saveBoard_(boardId, value) {
  boardId = normalizeBoardId_(boardId);
  clearBoardCache_(boardId);
  ensureSheets_();

  // Important: audio dataUrl should not be stored inside the Sheet JSON.
  if (value && value.voiceRecordings) {
    Object.keys(value.voiceRecordings).forEach(k => {
      const v = String(value.voiceRecordings[k] || '');
      if (v.indexOf('data:audio') === 0) value.voiceRecordings[k] = '';
    });
  }

  const sheet = getOrCreateSheet_(BOARDS_SHEET, ['board_id', 'mode', 'updated_at', 'chunk_count', 'json_small']);
  const json = JSON.stringify(value || {});
  const now = new Date();

  let row = findBoardRow_(sheet, boardId);
  if (row === -1) row = sheet.getLastRow() + 1;

  // Always remove old chunks first, even if the new payload becomes small.
  clearChunks_(boardId);

  if (json.length <= CHUNK_SIZE) {
    sheet.getRange(row, 1, 1, 5).setValues([[boardId, 'small', now, 0, json]]);
  } else {
    const chunks = splitString_(json, CHUNK_SIZE);
    writeChunks_(boardId, chunks);
    sheet.getRange(row, 1, 1, 5).setValues([[boardId, 'chunked', now, chunks.length, '']]);
  }

  writeReadableSheets_(boardId, value || {});
  log_(boardId, 'save', 'נשמר. גודל JSON: ' + json.length);

  const result = { ok: true, boardId, updated_at: now.toISOString(), size: json.length };
  // Do not populate cache optimistically after save. Let the next load read the sheet once,
  // attach audio refs, and then cache the confirmed result.
  clearBoardCache_(boardId);
  return result;
}
/* V85_SAFE_SAVE_BOARD_CACHE_INVALIDATION */
/* V86_SAVEBOARD_NO_OPTIMISTIC_CACHE */

function safeFolderNameForBoard_(boardId) {
  boardId = normalizeBoardId_(boardId);
  const clean = String(boardId || 'board').replace(/[\\/:*?"<>|#%{}^~[\]`]/g, '-').slice(0, 80);
  return 'board-' + clean;
}

function getOrCreateChildFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
}

function resolveAudioFolderForBoard_(folderId, boardId) {
  folderId = extractDriveFolderId_(folderId);
  if (folderId) return resolveAudioFolder_(folderId);
  const root = resolveAudioFolder_('');
  return getOrCreateChildFolder_(root, safeFolderNameForBoard_(boardId));
}
/* V79_PER_BOARD_AUDIO_FOLDERS */

function saveAudio_(boardId, key, dataUrl, folderId) {
  boardId = normalizeBoardId_(boardId);
  ensureSheets_();
  if (!dataUrl || String(dataUrl).indexOf('data:audio') !== 0) throw new Error('לא התקבל קובץ קול תקין');

  const match = String(dataUrl).match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.*)$/s);
  if (!match) throw new Error('פורמט קובץ קול לא תקין');

  const mime = String(match[1] || 'audio/webm').toLowerCase().split(';')[0].trim();
  
  const allowedMime = {
    'audio/webm': true,
    'audio/mp4': true,
    'audio/mpeg': true,
    'audio/wav': true,
    'audio/x-wav': true,
    'audio/aac': true,
    'audio/ogg': true
  };
  if (!allowedMime[mime]) throw new Error('סוג קובץ קול לא נתמך');
  const base64 = String(match[2] || '');
  if (base64.length > 7 * 1024 * 1024) throw new Error('קובץ הקול גדול מדי');
  const bytes = Utilities.base64Decode(base64);
  if (bytes.length > 5 * 1024 * 1024) throw new Error('קובץ הקול גדול מדי');
  const ext = mime.indexOf('mp4') >= 0 ? 'm4a' : mime.indexOf('mpeg') >= 0 ? 'mp3' : mime.indexOf('wav') >= 0 ? 'wav' : mime.indexOf('ogg') >= 0 ? 'ogg' : 'webm';
  
  const fileName = boardId + '_' + key + '_' + new Date().toISOString().replace(/[:.]/g, '-') + '.' + ext;

  const folder = resolveAudioFolderForBoard_(folderId, boardId);
  const blob = Utilities.newBlob(bytes, mime, fileName);
  const file = folder.createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (err) {}

  upsertAudioRow_(boardId, key, file.getId(), fileName, mime, folder.getId());

  // V8719_VOICE_SYNCFIX: audio references are attached during loadBoard_(),
  // which is cached. Clear the board cache immediately after saving audio so
  // the patient page can see the new family recording on its next cloud load.
  clearBoardCache_(boardId);

  log_(boardId, 'saveAudio', key + ' נשמר בדרייב בתיקייה נפרדת ללוח');

  return {
    ok: true,
    boardId,
    key,
    fileId: file.getId(),
    fileName: fileName,
    mimeType: mime,
    folderId: folder.getId(),
    directUrl: driveAudioUrl_(file.getId()),
    voiceRecording: 'drive:' + file.getId(),
    updated_at: new Date().toISOString()
  };
}



function extractDriveFolderId_(value) {
  value = String(value || '').trim();
  if (!value) return '';
  const m = value.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  const id = value.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (id) return id[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(value)) return value;
  return '';
}




/* V86_REMOVED_DUPLICATE_findDriveFileInFolderTree_ */


/* V86_REMOVED_DUPLICATE_isSupportedAudioFile_ */




/* V86_REMOVED_DUPLICATE_addAudioFilesFromFolder_ */






/* V86_REMOVED_DUPLICATE_musicFolderStatus_ */



/* V86_REMOVED_DUPLICATE_listMusicFolder_ */





function getMusicFile_(folderId, fileId) {
  folderId = extractDriveFolderId_(folderId);
  fileId = String(fileId || '').trim();
  if (!folderId || !fileId) return { ok: false, error: 'חסרה תיקייה או קובץ שיר' };

  let folder;
  try {
    folder = DriveApp.getFolderById(folderId);
  } catch (err) {
    return { ok: false, error: 'לאפליקציה אין גישה לתיקיית השירים הזו. צריך לשתף את התיקייה עם חשבון Google שמריץ את Apps Script.', details: String(err && err.message ? err.message : err) };
  }

  const file = findDriveFileInFolderTree_(folder, fileId, 2);
  if (!file) return { ok: false, error: 'קובץ השיר לא נמצא בתיקייה או בתת-תיקיות שלה' };
  if (!isSupportedAudioFile_(file)) return { ok: false, error: 'הקובץ אינו קובץ שמע נתמך' };

  const name = String(file.getName() || '');
  const blob = file.getBlob();
  const mime = String(blob.getContentType() || file.getMimeType() || 'audio/mpeg');
  const size = file.getSize ? file.getSize() : blob.getBytes().length;
  const directUrl = driveAudioUrl_(file.getId());

  // For small files, return a dataUrl so it works even when direct Drive playback is picky.
  // For normal songs, files are often too large for JSONP/dataUrl, so return directUrl fallback.
  if (size > 9 * 1024 * 1024) {
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (err) {}
    return {
      ok: true,
      fileId: file.getId(),
      name: name,
      mimeType: mime,
      size: size,
      tooLargeForDataUrl: true,
      directUrl: directUrl,
      url: directUrl
    };
  }

  const bytes = blob.getBytes();
  return {
    ok: true,
    fileId: file.getId(),
    name: name,
    mimeType: mime,
    size: size,
    directUrl: directUrl,
    url: directUrl,
    dataUrl: 'data:' + mime + ';base64,' + Utilities.base64Encode(bytes)
  };
}







function testAudioWrite_(boardId, folderId) {
  const folder = resolveAudioFolder_(folderId || '');
  const fileName = normalizeBoardId_(boardId) + '_drive_test_' + new Date().toISOString().replace(/[:.]/g, '-') + '.txt';
  const file = folder.createFile(Utilities.newBlob('Drive write test OK ' + new Date().toISOString(), 'text/plain', fileName));
  return {
    ok: true,
    boardId: normalizeBoardId_(boardId),
    fileId: file.getId(),
    fileName: fileName,
    folderId: folder.getId(),
    folderName: folder.getName()
  };
}


function audioFolderStatus_(folderId) {
  folderId = extractDriveFolderId_(folderId);
  let folder;
  try {
    folder = folderId ? DriveApp.getFolderById(folderId) : resolveAudioFolder_('');
  } catch (err) {
    return { ok: false, error: 'לאפליקציה אין גישה לתיקיית ההקלטות', details: String(err && err.message ? err.message : err) };
  }
  let count = 0;
  try {
    const files = folder.getFiles();
    while (files.hasNext() && count < 500) { files.next(); count++; }
  } catch (err) {}
  return {
    ok: true,
    folderId: folder.getId(),
    folderName: folder.getName(),
    fileCount: count,
    usesOwnerAudioFolderProperty: !!String(PropertiesService.getScriptProperties().getProperty('OWNER_AUDIO_FOLDER_ID') || '').trim()
  };
}




function getAudioMeta_(boardId, key) {
  boardId = normalizeBoardId_(boardId);
  ensureSheets_();
  const row = findAudioRow_(boardId, key);
  if (!row || !row.fileId) return { ok: true, exists: false, boardId: boardId, key: key };
  let folderName = '';
  try { if (row.folderId) folderName = DriveApp.getFolderById(row.folderId).getName(); } catch (err) {}
  return {
    ok: true,
    exists: true,
    boardId: boardId,
    key: key,
    fileId: row.fileId,
    fileName: row.fileName || '',
    mimeType: row.mimeType || '',
    folderId: row.folderId || '',
    folderName: folderName,
    directUrl: driveAudioUrl_(row.fileId),
    updated_at: row.updatedAt || ''
  };
  
}



function getAudio_(boardId, key) {
  boardId = normalizeBoardId_(boardId);
  ensureSheets_();
  const row = findAudioRow_(boardId, key);
  if (!row) return { ok: true, exists: false, boardId, key, dataUrl: '' };

  const file = DriveApp.getFileById(row.fileId);
  const blob = file.getBlob();
  const dataUrl = 'data:' + (row.mimeType || blob.getContentType() || 'audio/webm') + ';base64,' + Utilities.base64Encode(blob.getBytes());
  return { ok: true, exists: true, boardId, key, dataUrl, directUrl: driveAudioUrl_(row.fileId), fileId: row.fileId, updated_at: row.updatedAt || '' };
}

function deleteAudio_(boardId, key) {
  boardId = normalizeBoardId_(boardId);
  ensureSheets_();
  const sheet = getOrCreateSheet_(AUDIO_SHEET, ['board_id', 'key', 'file_id', 'file_name', 'mime_type', 'folder_id', 'updated_at']);
  const last = sheet.getLastRow();
  if (last <= 1) return { ok: true, deleted: false };

  const values = sheet.getRange(2, 1, last - 1, 7).getValues();
  for (let i = values.length - 1; i >= 0; i--) {
    if (String(values[i][0]) === String(boardId) && String(values[i][1]) === String(key)) {
      const fileId = String(values[i][2] || '');
      if (fileId) {
        try { DriveApp.getFileById(fileId).setTrashed(true); } catch (err) {}
      }
      sheet.deleteRow(i + 2);
    }
  }
  clearBoardCache_(boardId);
  log_(boardId, 'deleteAudio', key + ' נמחק');
  return { ok: true, deleted: true };
}

function driveAudioUrl_(fileId) {
  return 'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(fileId);
}


function ownerAudioFolderId_() {
  const props = PropertiesService.getScriptProperties();
  return String(
    props.getProperty('OWNER_AUDIO_FOLDER_ID') ||
    props.getProperty('DEFAULT_AUDIO_FOLDER_ID') ||
    ''
  ).trim();
}

function setOwnerAudioFolderId_(folderId) {
  folderId = extractDriveFolderId_(folderId);
  if (!folderId) throw new Error('Folder ID לא תקין');
  const folder = DriveApp.getFolderById(folderId);
  PropertiesService.getScriptProperties().setProperty('OWNER_AUDIO_FOLDER_ID', folder.getId());
  return { ok: true, folderId: folder.getId(), folderName: folder.getName() };
}



function resolveAudioFolder_(folderId) {
  folderId = extractDriveFolderId_(folderId);
  if (folderId) {
    try { return DriveApp.getFolderById(folderId); }
    catch (err) { throw new Error('לא נמצאה תיקיית Drive. בדקי Folder ID ושיתוף עם חשבון ה-Apps Script.'); }
  }

  const props = PropertiesService.getScriptProperties();

  const ownerId = String(props.getProperty('OWNER_AUDIO_FOLDER_ID') || '').trim();
  if (ownerId) {
    try { return DriveApp.getFolderById(ownerId); }
    catch (err) { throw new Error('OWNER_AUDIO_FOLDER_ID מוגדר אבל ל-Apps Script אין גישה לתיקייה הזו.'); }
  }

  const existing = String(props.getProperty('DEFAULT_AUDIO_FOLDER_ID') || '').trim();
  if (existing) {
    try { return DriveApp.getFolderById(existing); } catch (err) {}
  }

  const folder = DriveApp.createFolder(DEFAULT_AUDIO_FOLDER_NAME);
  props.setProperty('DEFAULT_AUDIO_FOLDER_ID', folder.getId());
  return folder;
}


function upsertAudioRow_(boardId, key, fileId, fileName, mime, folderId) {
  const sheet = getOrCreateSheet_(AUDIO_SHEET, ['board_id', 'key', 'file_id', 'file_name', 'mime_type', 'folder_id', 'updated_at']);
  const last = sheet.getLastRow();
  let row = -1;
  if (last > 1) {
    const values = sheet.getRange(2, 1, last - 1, 7).getValues();
    for (let i = 0; i < values.length; i++) {
      if (String(values[i][0]) === String(boardId) && String(values[i][1]) === String(key)) row = i + 2;
    }
  }
  if (row === -1) row = sheet.getLastRow() + 1;
  sheet.getRange(row, 1, 1, 7).setValues([[boardId, key, fileId, fileName, mime, folderId, new Date()]]);
}

function findAudioRow_(boardId, key) {
  const sheet = getOrCreateSheet_(AUDIO_SHEET, ['board_id', 'key', 'file_id', 'file_name', 'mime_type', 'folder_id', 'updated_at']);
  const last = sheet.getLastRow();
  if (last <= 1) return null;
  const values = sheet.getRange(2, 1, last - 1, 7).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(boardId) && String(values[i][1]) === String(key)) {
      return {
        fileId: String(values[i][2] || ''),
        fileName: String(values[i][3] || ''),
        mimeType: String(values[i][4] || ''),
        folderId: String(values[i][5] || ''),
        updatedAt: values[i][6] || ''
      };
    }
  }
  return null;
}

function attachAudioRefs_(boardId, value) {
  boardId = normalizeBoardId_(boardId);
  const keys = ['calm', 'confused', 'night'];
  value.voiceRecordings = value.voiceRecordings || {};
  value.voiceDriveRefs = value.voiceDriveRefs || {};
  keys.forEach(key => {
    const row = findAudioRow_(boardId, key);
    if (row && row.fileId) {
      value.voiceRecordings[key] = 'drive:' + row.fileId;
      value.voiceDriveRefs[key] = { fileId: row.fileId, directUrl: driveAudioUrl_(row.fileId), updatedAt: row.updatedAt || '' };
    }
  });
}

function findBoardRow_(sheet, boardId) {
  boardId = normalizeBoardId_(boardId);
  const last = sheet.getLastRow();
  if (last <= 1) return -1;
  const values = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (normalizeBoardId_(values[i][0]) === boardId) return i + 2;
  }
  return -1;
}
/* V86_NORMALIZED_FIND_BOARD_ROW */


function splitString_(str, size) {
  const out = [];
  for (let i = 0; i < str.length; i += size) out.push(str.slice(i, i + size));
  return out;
}

function writeChunks_(boardId, chunks) {
  boardId = normalizeBoardId_(boardId);
  const sheet = getOrCreateSheet_(CHUNKS_SHEET, ['board_id', 'part', 'chunk']);
  if (!chunks.length) return;
  // saveBoard_ calls clearChunks_ before this function. This extra cleanup is intentionally
  // omitted here to avoid deleting chunks after another caller has already prepared rows.
  const rows = chunks.map((chunk, i) => [boardId, i, chunk]);
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 3).setValues(rows);
}
/* V85_SAFE_WRITE_CHUNKS */

function readChunks_(boardId, expectedCount) {
  boardId = normalizeBoardId_(boardId);
  const sheet = getOrCreateSheet_(CHUNKS_SHEET, ['board_id', 'part', 'chunk']);
  const last = sheet.getLastRow();
  if (last <= 1) return '{}';
  const values = sheet.getRange(2, 1, last - 1, 3).getValues();
  const chunks = [];
  values.forEach(r => {
    if (normalizeBoardId_(r[0]) === boardId) chunks[Number(r[1])] = String(r[2] || '');
  });
  if (expectedCount && chunks.filter(x => x !== undefined).length < expectedCount) throw new Error('חסרים חלקי נתונים');
  return chunks.join('') || '{}';
}
/* V86_NORMALIZED_READ_CHUNKS */


function clearChunks_(boardId) {
  boardId = normalizeBoardId_(boardId);
  const sheet = getOrCreateSheet_(CHUNKS_SHEET, ['board_id', 'part', 'chunk']);
  const last = sheet.getLastRow();
  if (last <= 1) return;
  const values = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (let i = values.length - 1; i >= 0; i--) {
    if (normalizeBoardId_(values[i][0]) === boardId) sheet.deleteRow(i + 2);
  }
}
/* V86_NORMALIZED_CLEAR_CHUNKS */


function writeReadableSheets_(boardId, data) {
  writeKeyValue_(READABLE_PREFIX + 'פרופיל', boardId, data.person || {}, [
    ['stage', data.stage || ''],
    ['firstName', data.person && data.person.firstName || ''],
    ['fullName', data.person && data.person.fullName || ''],
    ['address', data.person && data.person.address || ''],
    ['city', data.person && data.person.city || ''],
    ['safeMessage', data.person && data.person.safeMessage || ''],
    ['identityNote', data.person && data.person.identityNote || ''],
    ['calmingTips', data.person && data.person.calmingTips || ''],
    ['riskNotes', data.person && data.person.riskNotes || '']
  ]);
  writeArray_(READABLE_PREFIX + 'שגרה', boardId, data.schedule || [], ['id', 'time', 'text', 'image', 'days', 'forPatient', 'done']);
  writeArray_(READABLE_PREFIX + 'טלפונים', boardId, data.contacts || [], ['id', 'relation', 'name', 'phone', 'note', 'photo', 'videoLink']);
  writeArray_(READABLE_PREFIX + 'משפחה', boardId, data.family || [], ['id', 'relation', 'name', 'city', 'note', 'emoji', 'photo']);
  writeArray_(READABLE_PREFIX + 'תרופות', boardId, data.medications || [], ['id', 'time', 'name', 'dose', 'instructions', 'taken', 'givenBy', 'notes']);
  writeArray_(READABLE_PREFIX + 'יומן', boardId, data.symptoms || [], ['id', 'date', 'time', 'type', 'what', 'before', 'helped']);
  writeArray_(READABLE_PREFIX + 'חודשי', boardId, data.monthly || [], ['id', 'date', 'title']);
}

function writeKeyValue_(sheetName, boardId, obj, rows) {
  const sheet = getOrCreateSheet_(sheetName, ['board_id', 'field', 'value']);
  removeBoardRows_(sheet, boardId);
  if (!rows || !rows.length) return;
  const output = rows.map(r => [boardId, r[0], stringifyCell_(r[1])]);
  sheet.getRange(sheet.getLastRow() + 1, 1, output.length, 3).setValues(output);
}

function writeArray_(sheetName, boardId, arr, fields) {
  const headers = ['board_id'].concat(fields);
  const sheet = getOrCreateSheet_(sheetName, headers);
  removeBoardRows_(sheet, boardId);
  if (!arr || !arr.length) return;
  const output = arr.map(item => [boardId].concat(fields.map(f => stringifyCell_(item && item[f]))));
  sheet.getRange(sheet.getLastRow() + 1, 1, output.length, headers.length).setValues(output);
}

function removeBoardRows_(sheet, boardId) {
  const last = sheet.getLastRow();
  if (last <= 1) return;
  const values = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (let i = values.length - 1; i >= 0; i--) if (String(values[i][0]) === String(boardId)) sheet.deleteRow(i + 2);
}

function stringifyCell_(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join(',');
  if (typeof value === 'object') {
    const s = JSON.stringify(value);
    return s.length > 49000 ? s.slice(0, 49000) : s;
  }
  const s = String(value);
  return s.length > 49000 ? s.slice(0, 49000) : s;
}

function log_(boardId, action, note) {
  const sheet = getOrCreateSheet_(LOG_SHEET, ['time', 'board_id', 'action', 'note']);
  getOrCreateSheet_(SECURITY_SHEET, ['board_id', 'access_hash', 'created_at', 'updated_at']);
  sheet.appendRow([new Date(), boardId, action, note || '']);
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('השעון המשפחתי')
    .addItem('הכנת גיליונות', 'ensureSheets_')
    .addItem('בדיקת חיבור', 'showHealth_')
    .addToUi();
}

function showHealth_() {
  SpreadsheetApp.getUi().alert('הכול תקין. עכשיו צריך לפרוס כ-Web App ולהעתיק את ה-URL.');
}






















































function supportedMusicExtensionRegexV75_() {
  return /\.(mp3|m4a|mp4|aac|wav|wave|ogg|oga|webm|flac|opus|amr|3gp|3gpp)$/i;
}

function isDriveShortcutMimeV75_(mime) {
  return String(mime || '') === 'application/vnd.google-apps.shortcut';
}

function isDriveFolderMimeV75_(mime) {
  return String(mime || '') === 'application/vnd.google-apps.folder';
}

function isSupportedAudioFile_(file) {
  const name = String(file && file.getName ? file.getName() : '');
  const mime = String(file && file.getMimeType ? file.getMimeType() : '');
  if (mime.indexOf('audio/') === 0) return true;
  if (mime === 'video/mp4' || mime === 'video/webm' || mime === 'application/octet-stream') {
    return supportedMusicExtensionRegexV75_().test(name);
  }
  return supportedMusicExtensionRegexV75_().test(name);
}

function resolveDriveShortcutV75_(file) {
  const mime = String(file && file.getMimeType ? file.getMimeType() : '');
  if (!isDriveShortcutMimeV75_(mime)) return { file: file, folder: null, shortcut: false };

  try {
    const targetId = file.getTargetId();
    const targetMime = file.getTargetMimeType ? String(file.getTargetMimeType() || '') : '';
    if (isDriveFolderMimeV75_(targetMime)) {
      return { file: null, folder: DriveApp.getFolderById(targetId), shortcut: true, targetId: targetId, targetMime: targetMime };
    }
    return { file: DriveApp.getFileById(targetId), folder: null, shortcut: true, targetId: targetId, targetMime: targetMime };
  } catch (err) {
    return { file: file, folder: null, shortcut: true, error: String(err && err.message ? err.message : err) };
  }
}

function addAudioFileToOutV75_(file, out, originalName) {
  if (!file || !isSupportedAudioFile_(file)) return;
  if (out.length >= 120) return;

  const name = originalName || String(file.getName() || '');
  const mime = String(file.getMimeType() || '');
  let size = 0;
  try { size = file.getSize ? file.getSize() : 0; } catch (err) {}

  // Music fallback only. Family recordings are not handled here.
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (err) {}

  out.push({
    id: file.getId(),
    fileId: file.getId(),
    name: name,
    mimeType: mime || 'audio/mpeg',
    size: size,
    url: driveAudioUrl_(file.getId()),
    directUrl: driveAudioUrl_(file.getId())
  });
}

/* V86_REMOVED_DUPLICATE_addAudioFilesFromFolder_ */



function collectAudioFilesFromFolderV75_(folder, out, depth, seenFiles, seenFolders) {
  if (!folder || out.length >= 120) return;
  const folderId = folder.getId();
  if (seenFolders[folderId]) return;
  seenFolders[folderId] = true;

  const files = folder.getFiles();
  while (files.hasNext() && out.length < 120) {
    const raw = files.next();
    const resolved = resolveDriveShortcutV75_(raw);

    if (resolved.folder && depth > 0) {
      collectAudioFilesFromFolderV75_(resolved.folder, out, depth - 1, seenFiles, seenFolders);
      continue;
    }

    const file = resolved.file || raw;
    const fileId = file.getId();
    if (seenFiles[fileId]) continue;
    seenFiles[fileId] = true;

    const displayName = resolved.shortcut ? (String(raw.getName() || '') + ' → ' + String(file.getName() || '')) : String(file.getName() || '');
    addAudioFileToOutV75_(file, out, displayName);
  }

  if (depth > 0 && out.length < 120) {
    const folders = folder.getFolders();
    while (folders.hasNext() && out.length < 120) {
      collectAudioFilesFromFolderV75_(folders.next(), out, depth - 1, seenFiles, seenFolders);
    }
  }
}

/* V86_REMOVED_DUPLICATE_findDriveFileInFolderTree_ */


function findDriveFileInFolderTreeV75_(folder, fileId, depth, seenFiles, seenFolders) {
  if (!folder || !fileId) return null;
  const folderId = folder.getId();
  if (seenFolders[folderId]) return null;
  seenFolders[folderId] = true;

  const files = folder.getFiles();
  while (files.hasNext()) {
    const raw = files.next();
    const resolved = resolveDriveShortcutV75_(raw);

    if (resolved.folder && depth > 0) {
      const foundInShortcutFolder = findDriveFileInFolderTreeV75_(resolved.folder, fileId, depth - 1, seenFiles, seenFolders);
      if (foundInShortcutFolder) return foundInShortcutFolder;
      continue;
    }

    const file = resolved.file || raw;
    if (seenFiles[file.getId()]) continue;
    seenFiles[file.getId()] = true;
    if (String(file.getId()) === fileId) return file;
  }

  if (depth > 0) {
    const folders = folder.getFolders();
    while (folders.hasNext()) {
      const found = findDriveFileInFolderTreeV75_(folders.next(), fileId, depth - 1, seenFiles, seenFolders);
      if (found) return found;
    }
  }

  return null;
}

function collectFolderDebugFilesV75_(folder, depth, out, seenFolders) {
  if (!folder || out.length >= 80) return;
  const folderId = folder.getId();
  if (seenFolders[folderId]) return;
  seenFolders[folderId] = true;

  const files = folder.getFiles();
  while (files.hasNext() && out.length < 80) {
    const raw = files.next();
    let row = {
      name: String(raw.getName() || ''),
      mimeType: String(raw.getMimeType() || ''),
      size: 0,
      isShortcut: false
    };
    try { row.size = raw.getSize ? raw.getSize() : 0; } catch (err) {}

    const resolved = resolveDriveShortcutV75_(raw);
    if (resolved.shortcut) {
      row.isShortcut = true;
      row.targetId = resolved.targetId || '';
      row.targetMime = resolved.targetMime || '';
      row.error = resolved.error || '';
      if (resolved.file) {
        row.targetName = String(resolved.file.getName() || '');
        row.targetMime = String(resolved.file.getMimeType() || row.targetMime || '');
      }
    }
    out.push(row);

    if (resolved.folder && depth > 0) {
      collectFolderDebugFilesV75_(resolved.folder, depth - 1, out, seenFolders);
    }
  }

  if (depth > 0 && out.length < 80) {
    const folders = folder.getFolders();
    while (folders.hasNext() && out.length < 80) {
      const sub = folders.next();
      out.push({ name: '[תיקייה] ' + sub.getName(), mimeType: 'application/vnd.google-apps.folder', size: 0 });
      collectFolderDebugFilesV75_(sub, depth - 1, out, seenFolders);
    }
  }
}

/* V86_REMOVED_DUPLICATE_listMusicFolder_ */



/* V82_MOBILE_CLOUD_SHARE_FIX_APPS_SCRIPT */



function musicExtRegexV83_() {
  return /\.(mp3|m4a|mp4|aac|wav|wave|ogg|oga|webm|flac|opus|amr|3gp|3gpp)$/i;
}
function isSupportedMusicFileV83_(file) {
  const name = String(file && file.getName ? file.getName() : '');
  const mime = String(file && file.getMimeType ? file.getMimeType() : '');
  if (mime.indexOf('audio/') === 0) return true;
  if (mime === 'video/mp4' || mime === 'video/webm' || mime === 'application/octet-stream') return musicExtRegexV83_().test(name);
  return musicExtRegexV83_().test(name);
}
function resolveShortcutV83_(file) {
  const mime = String(file && file.getMimeType ? file.getMimeType() : '');
  if (mime !== 'application/vnd.google-apps.shortcut') return { type: 'file', file: file, shortcut: false };
  try {
    const targetId = file.getTargetId();
    const targetMime = file.getTargetMimeType ? String(file.getTargetMimeType() || '') : '';
    if (targetMime === 'application/vnd.google-apps.folder') {
      return { type: 'folder', folder: DriveApp.getFolderById(targetId), shortcut: true, targetId: targetId, targetMime: targetMime };
    }
    return { type: 'file', file: DriveApp.getFileById(targetId), shortcut: true, originalName: String(file.getName() || ''), targetId: targetId, targetMime: targetMime };
  } catch (err) {
    return { type: 'brokenShortcut', file: file, shortcut: true, error: String(err && err.message ? err.message : err) };
  }
}
function driveMusicRowV83_(file, displayName) {
  let size = 0;
  try { size = file.getSize ? file.getSize() : 0; } catch (err) {}
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (err) {}
  return {
    id: file.getId(),
    fileId: file.getId(),
    name: String(displayName || file.getName() || ''),
    mimeType: String(file.getMimeType() || 'audio/mpeg'),
    size: size,
    url: driveAudioUrl_(file.getId()),
    directUrl: driveAudioUrl_(file.getId())
  };
}
function scanMusicFolderIterativeV83_(rootFolder, includeDebug) {
  const filesOut = [];
  const debugFiles = [];
  const seenFolders = {};
  const seenFiles = {};
  const queue = [{ folder: rootFolder, path: rootFolder.getName() }];
  let scannedFolders = 0;
  const maxFolders = 45;
  const maxFiles = 70;
  const maxDebug = 40;
  const startedAtV85 = Date.now();
  const maxMillisV85 = 18000;
  /* V86_MUSIC_SCAN_SAFER_CAPS */
  /* V85_MUSIC_SCAN_TIMEOUT_GUARD */

  while (queue.length && scannedFolders < maxFolders && filesOut.length < maxFiles && (Date.now() - startedAtV85) < maxMillisV85) {
    const item = queue.shift();
    const folder = item.folder;
    const folderId = folder.getId();
    if (seenFolders[folderId]) continue;
    seenFolders[folderId] = true;
    scannedFolders++;

    let it;
    try { it = folder.getFiles(); }
    catch (err) {
      if (includeDebug && debugFiles.length < maxDebug) debugFiles.push({ name: '[שגיאה בקריאת תיקייה] ' + item.path, mimeType: String(err && err.message ? err.message : err), size: 0 });
      continue;
    }

    while (it.hasNext() && filesOut.length < maxFiles) {
      const raw = it.next();
      const rawName = String(raw.getName() || '');
      const rawMime = String(raw.getMimeType() || '');
      const resolved = resolveShortcutV83_(raw);

      if (includeDebug && debugFiles.length < maxDebug) {
        const row = { name: rawName, mimeType: rawMime, size: 0, path: item.path, isShortcut: !!resolved.shortcut };
        try { row.size = raw.getSize ? raw.getSize() : 0; } catch (err) {}
        if (resolved.shortcut) {
          row.targetId = resolved.targetId || '';
          row.targetMime = resolved.targetMime || '';
          row.error = resolved.error || '';
          if (resolved.file) row.targetName = String(resolved.file.getName() || '');
          if (resolved.folder) row.targetName = String(resolved.folder.getName() || '');
        }
        debugFiles.push(row);
      }

      if (resolved.type === 'folder' && resolved.folder) {
        const sid = resolved.folder.getId();
        if (!seenFolders[sid] && queue.length < maxFolders) queue.push({ folder: resolved.folder, path: item.path + ' / ' + rawName });
        continue;
      }

      const file = resolved.file || raw;
      const fileId = file.getId();
      if (seenFiles[fileId]) continue;
      seenFiles[fileId] = true;

      if (isSupportedMusicFileV83_(file)) {
        const display = resolved.shortcut && resolved.originalName ? resolved.originalName + ' → ' + file.getName() : file.getName();
        filesOut.push(driveMusicRowV83_(file, display));
      }
    }

    let folders;
    try { folders = folder.getFolders(); }
    catch (err) { folders = null; }
    if (folders) {
      while (folders.hasNext() && queue.length < maxFolders) {
        const sub = folders.next();
        const sid = sub.getId();
        if (seenFolders[sid]) continue;
        if (includeDebug && debugFiles.length < maxDebug) debugFiles.push({ name: '[תיקייה] ' + sub.getName(), mimeType: 'application/vnd.google-apps.folder', size: 0, path: item.path });
        queue.push({ folder: sub, path: item.path + ' / ' + sub.getName() });
      }
    }
  }

  filesOut.sort(function(a, b) { return String(a.name || '').localeCompare(String(b.name || ''), 'he'); });
  return { files: filesOut, debugFiles: debugFiles, scannedFolders: scannedFolders };
}
function addAudioFilesFromFolder_(folder, out, depth) {
  const result = scanMusicFolderIterativeV83_(folder, false);
  result.files.forEach(function(f) { if (out.length < 120) out.push(f); });
}
/* V83_ITERATIVE_ADD_AUDIO_FILES */
function findDriveFileInFolderTree_(folder, fileId, depth) {
  fileId = String(fileId || '').trim();
  if (!folder || !fileId) return null;
  const seenFolders = {};
  const seenFiles = {};
  const queue = [folder];
  let count = 0;
  while (queue.length && count < 250) {
    const current = queue.shift();
    const fid = current.getId();
    if (seenFolders[fid]) continue;
    seenFolders[fid] = true;
    count++;

    const files = current.getFiles();
    while (files.hasNext()) {
      const raw = files.next();
      const resolved = resolveShortcutV83_(raw);
      if (resolved.type === 'folder' && resolved.folder) {
        const sid = resolved.folder.getId();
        if (!seenFolders[sid]) queue.push(resolved.folder);
        continue;
      }
      const file = resolved.file || raw;
      const id = file.getId();
      if (seenFiles[id]) continue;
      seenFiles[id] = true;
      if (String(id) === fileId) return file;
    }

    const folders = current.getFolders();
    while (folders.hasNext() && queue.length < 250) {
      const sub = folders.next();
      if (!seenFolders[sub.getId()]) queue.push(sub);
    }
  }
  return null;
}
/* V83_ITERATIVE_FIND_DRIVE_FILE */
function listMusicFolder_(folderId) {
  folderId = extractDriveFolderId_(folderId);
  if (!folderId) return { ok: false, error: 'חסרה תיקיית שירים או שקישור ה-Drive לא תקין' };
  let folder;
  try { folder = DriveApp.getFolderById(folderId); }
  catch (err) { return { ok: false, error: 'לאפליקציה אין גישה לתיקיית השירים הזו. צריך לשתף את התיקייה עם חשבון Google שמריץ את Apps Script.', details: String(err && err.message ? err.message : err) }; }
  const result = scanMusicFolderIterativeV83_(folder, true);
  return {
    ok: true,
    count: result.files.length,
    files: result.files,
    folderId: folder.getId(),
    folderName: folder.getName(),
    scannedFolders: result.scannedFolders,
    debugFiles: result.files.length ? [] : result.debugFiles,
    message: result.files.length ? '' : 'לא נמצאו קבצי שמע נתמכים. בבדיקת התיקייה יוצגו שמות וסוגי הקבצים שנמצאו.'
  };
}
/* V83_ITERATIVE_LIST_MUSIC_FOLDER */
function musicFolderStatus_(folderId) {
  folderId = extractDriveFolderId_(folderId);
  if (!folderId) return { ok: false, error: 'קישור תיקיית שירים לא תקין' };
  let folder;
  try { folder = DriveApp.getFolderById(folderId); }
  catch (err) { return { ok: false, error: 'אין ל-Apps Script גישה לתיקיית השירים', details: String(err && err.message ? err.message : err) }; }
  const result = scanMusicFolderIterativeV83_(folder, true);
  return {
    ok: true,
    folderId: folder.getId(),
    folderName: folder.getName(),
    scannedFolders: result.scannedFolders,
    count: result.files.length,
    files: result.files.slice(0, 40),
    debugFiles: result.debugFiles.slice(0, 100)
  };
}
/* V83_ITERATIVE_MUSIC_FOLDER_STATUS */


/* V83_MUSIC_FOLDER_RECURSION_FIX_APPS_SCRIPT */



function parsePostBody_(e) {
  const contentType = String(e && e.postData && e.postData.type || '').toLowerCase();
  let raw = '';

  if (e && e.parameter && e.parameter.payload) {
    raw = String(e.parameter.payload || '').trim();
    const directParam = tryParseJsonV87_(raw);
    if (directParam) return directParam;
  }

  if (!raw && e && e.postData && typeof e.postData.contents !== 'undefined') {
    raw = String(e.postData.contents || '').trim();
  }
  if (!raw) return {};

  const direct = tryParseJsonV87_(raw);
  if (direct) return direct;

  // text/plain hidden-form fallback: payload=<raw JSON>. Do NOT convert + to spaces,
  // because audio base64/dataUrl can legitimately contain + characters.
  if (contentType.indexOf('text/plain') >= 0 || raw.indexOf('payload=') === 0) {
    let payload = raw.indexOf('payload=') === 0 ? raw.substring(8) : raw;
    payload = payload.replace(/\r?\n-+.*$/s, '').trim();
    const parsed = tryParseJsonV87_(payload);
    if (parsed) return parsed;
  }

  // URL-encoded forms: + means space only here.
  if (contentType.indexOf('application/x-www-form-urlencoded') >= 0 || raw.indexOf('&') >= 0) {
    try {
      const params = {};
      raw.split('&').forEach(function(part) {
        if (!part) return;
        const eq = part.indexOf('=');
        const k = eq >= 0 ? part.slice(0, eq) : part;
        const v = eq >= 0 ? part.slice(eq + 1) : '';
        const key = decodeURIComponent(k.replace(/\+/g, ' '));
        const val = decodeURIComponent(v.replace(/\+/g, ' '));
        params[key] = val;
      });
      if (params.payload) {
        const parsed = tryParseJsonV87_(params.payload);
        if (parsed) return parsed;
      }
    } catch (err) {}
  }

  try { log_('system', 'parsePostBody-error', 'unparseable body, length=' + raw.length + ', type=' + contentType); } catch (err) {}
  return {};
}

function tryParseJsonV87_(s) {
  try {
    const parsed = JSON.parse(String(s || '').trim());
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (err) {
    return null;
  }
}
/* V87_PARSE_POST_BODY_CONTENT_TYPE_SAFE */






function boardCacheKey_(boardId) {
  return 'board_' + normalizeBoardId_(boardId);
}
function putBoardCache_(boardId, value) {
  try {
    const json = typeof value === 'string' ? value : JSON.stringify(value || {});
    if (json.length < 95000) CacheService.getScriptCache().put(boardCacheKey_(boardId), json, 120);
  } catch (err) {}
}
function getBoardCache_(boardId) {
  try {
    const cached = CacheService.getScriptCache().get(boardCacheKey_(boardId));
    if (!cached) return null;
    return JSON.parse(cached);
  } catch (err) {
    return null;
  }
}
function clearBoardCache_(boardId) {
  try { CacheService.getScriptCache().remove(boardCacheKey_(boardId)); } catch (err) {}
}
/* V85_SAFE_CACHE_SERVICE_HELPERS */


/* V85_REMOVED_RISKY_V84_WRAPPER */

/* V85_REMOVED_RISKY_V84_WRAPPER */



function clearOldChunks_(sheet, boardId) {
  boardId = normalizeBoardId_(boardId);
  if (!sheet || !boardId) return;
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = ids.length - 1; i >= 0; i--) {
    if (normalizeBoardId_(ids[i][0]) === boardId) {
      sheet.deleteRow(i + 2);
    }
  }
}
/* V84_CLEAR_OLD_CHUNKS_HELPER */




function templateSetupInfo_() {
  const ss = SpreadsheetApp.getActive();
  return {
    ok: true,
    spreadsheetId: ss ? ss.getId() : '',
    spreadsheetName: ss ? ss.getName() : '',
    copyUrl: ss ? ('https://docs.google.com/spreadsheets/d/' + ss.getId() + '/copy') : '',
    instructions: 'Share the clean template Sheet as view-only, then send the /copy URL. Each friend deploys their copied Apps Script as Execute as Me / Anyone.'
  };
}
/* V84_TEMPLATE_SETUP_INFO */


/* V84_SCALE_SECURITY_TEMPLATE_APPS_SCRIPT */

/* V85_APPS_SCRIPT_TIMEOUT_FIX */



function healthCheck_() {
  return {
    ok: true,
    version: APP_VERSION,
    time: new Date().toISOString(),
    cache: !!CacheService.getScriptCache(),
    spreadsheet: !!SpreadsheetApp.getActive()
  };
}
/* V86_HEALTH_CHECK_ENDPOINT */


/* V86_STABILITY_HARDENING_APPS_SCRIPT */

/* V87_DOGET_ERROR_LABEL */

/* V87_VERSION_STRINGS_UNIFIED */




function adminSecretOk_(params) {
  const expected = String(PropertiesService.getScriptProperties().getProperty('MIGRATION_ADMIN_SECRET') || '').trim();
  const got = String((params && (params.adminSecret || params.secret || params.migrationSecret)) || '').trim();
  return !!expected && got === expected;
}

function requireAdminSecret_(params) {
  if (!adminSecretOk_(params)) throw new Error('unauthorized');
}


function strictRotateAccessKeyV871_(boardId, oldAccessKey, newAccessKey) {
  boardId = normalizeBoardId_(boardId);
  oldAccessKey = String(oldAccessKey || '').trim();
  newAccessKey = String(newAccessKey || '').trim();
  if (!boardId || !newAccessKey) throw new Error('חסר מזהה לוח או מפתח חדש');

  const row = getSecurityRow_(boardId);
  if (!row || !row.hash) {
    throw new Error('board is not secured yet');
  }
  if (!oldAccessKey || hashAccessKey_(oldAccessKey) !== row.hash) {
    throw new Error('מפתח הגישה הישן אינו תקין');
  }

  const hash = hashAccessKey_(newAccessKey);
  const sheet = getOrCreateSheet_(SECURITY_SHEET, ['board_id', 'access_hash', 'created_at', 'updated_at']);
  sheet.getRange(row.row, 2, 1, 3).setValues([[hash, row.createdAt || new Date(), new Date()]]);
  return { ok: true, boardId, secured: true };
}
/* V871_STRICT_ROTATE_ACCESS_KEY */

function verifyAccessKey_(boardId, accessKey) {
  boardId = normalizeBoardId_(boardId);
  accessKey = String(accessKey || '').trim();
  if (!boardId || !accessKey) return { ok: false, secured: false, error: 'missing board or key' };

  const row = getSecurityRow_(boardId);
  if (!row || !row.hash) {
    return { ok: false, secured: false, error: 'board is not secured yet' };
  }

  const ok = hashAccessKey_(accessKey) === row.hash;
  return { ok: ok, secured: true, boardId: boardId };
}
/* V871_ADMIN_SECRET_AND_VERIFY_ACCESS_KEY */

function securityMigrationReport_(includeDetails) {
  ensureSheets_();
  const boardsSheet = getOrCreateSheet_(BOARDS_SHEET, ['board_id', 'mode', 'updated_at', 'chunk_count', 'json_small']);
  const secSheet = getOrCreateSheet_(SECURITY_SHEET, ['board_id', 'access_hash', 'created_at', 'updated_at']);
  const boards = {};
  const lastB = boardsSheet.getLastRow();
  if (lastB > 1) {
    boardsSheet.getRange(2, 1, lastB - 1, 1).getValues().forEach(r => {
      const id = normalizeBoardId_(r[0]);
      if (id) boards[id] = true;
    });
  }
  const secured = {};
  const lastS = secSheet.getLastRow();
  if (lastS > 1) {
    secSheet.getRange(2, 1, lastS - 1, 2).getValues().forEach(r => {
      const id = normalizeBoardId_(r[0]);
      if (id && r[1]) secured[id] = true;
    });
  }
  const missing = Object.keys(boards).filter(id => !secured[id]).sort();
  const result = { ok: true, version: APP_VERSION, missingSecurityCount: missing.length };
  if (includeDetails === true) result.missingSecurityBoards = missing.slice(0, 100);
  return result;
}
/* V871_SECURITY_MIGRATION_REPORT_COUNT_ONLY */



/* V87_SECURITY_RELEASE_CANDIDATE_APPS_SCRIPT */

/* V871_SECURITY_BLOCKERS_FIX_APPS_SCRIPT */

/* V871_ROTATE_DOPOST_STRICT_CALL */
