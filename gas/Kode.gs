/**
 * ============================================================================
 * SADIG - SISTEM INFORMASI SUPERVISI AKADEMIK DIGITAL
 * Google Apps Script Backend (Kode.gs) Lengkap
 * ============================================================================
 * Fitur:
 * - Auto-setup seluruh sheet: Users, Guru, Aspek, Penilaian, CatatanTahap,
 *   Pengaturan, dan Rekap (otomatis terhitung).
 * - Mendukung instrumen berbeda berdasarkan role mata pelajaran:
 *   Umum vs Bimbingan dan Konseling (BK).
 * - Mendukung tipe penilaian skor (1-4) & teks (Dialog Refleksi / Sarpras BK).
 * - Mendukung logo kop surat berukuran besar (auto-chunking agar aman dari
 *   batas 50.000 karakter/sel Google Sheets).
 * - Kompatibel dengan fetch() browser tanpa error CORS preflight.
 * - Dilengkapi LockService untuk mencegah benturan penulisan data bersamaan.
 * ============================================================================
 */

var SPREADSHEET_ID = '1Wly6O5-Q-Zhnp2T3M3Xg_CJJodPJiAJZbn2iC2ywIF8';
// Kosongkan jika script dibuat dari Extensions > Apps Script di dalam Google Sheet target.
// Jika standalone script, isi dengan ID Spreadsheet Anda.

var SHEETS = {
  USERS: 'Users',
  GURU: 'Guru',
  POIN_BERKAS: 'PoinBerkas',
  ASPEK: 'Aspek',
  PENILAIAN: 'Penilaian',
  CATATAN_TAHAP: 'CatatanTahap',
  PENGATURAN: 'Pengaturan',
  REKAP: 'Rekap',
};

var HEADERS = {
  Users: ['id', 'username', 'password', 'email', 'nama', 'role', 'nip'],
  Guru: [
    'id',
    'nip',
    'namaGuru',
    'mataPelajaran',
    'tanggalPelaksanaan',
    'supervisor',
    'nipSupervisor',
    'statusBerkas',
    'kelengkapanBerkas',
    'linkDriveBerkas',
    'catatanKepsek',
    'guruEmail',
    'supervisorEmail',
    'kepsekEmail',
    'pengawasEmail',
    'cekBerkas',
  ],
  PoinBerkas: ['id', 'nama', 'deskripsi', 'orderIndex'],
  Aspek: [
    'id',
    'tahap',
    'kelompok',
    'aspek',
    'kategoriDeskripsi',
    'tipePenilaian',
    'targetMapel',
    'orderIndex',
  ],
  Penilaian: [
    'id',
    'guruId',
    'nipGuru',
    'idAspek',
    'tahap',
    'skor',
    'teksRefleksi',
    'catatan',
    'penilai',
    'updatedAt',
  ],
  CatatanTahap: [
    'id',
    'guruId',
    'nipGuru',
    'tahap',
    'masalah',
    'pemecahan',
    'rencanaTL',
    'penilai',
    'updatedAt',
  ],
  Pengaturan: ['key', 'value'],
  Rekap: [
    'idGuru',
    'nip',
    'namaGuru',
    'mataPelajaran',
    'supervisor',
    'statusBerkas',
    'nilaiPersiapan',
    'predikatPersiapan',
    'nilaiPelaksanaan',
    'predikatPelaksanaan',
    'nilaiEvaluasi',
    'predikatEvaluasi',
    'nilaiRata',
    'predikatAkhir',
    'sudahLengkap',
  ],
};

var MAX_CELL_CHARS = 45000;

// ============================================================================
// KONFIGURASI MENU & INISIALISASI SPREADSHEET
// ============================================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('SADIG Database')
    .addItem('Inisialisasi / Isi Data Awal Sheet', 'setupDatabase')
    .addItem('Tambahkan Template Aspek BK yang Belum Ada', 'menuSeedBkAspects')
    .addItem('Hitung Ulang Sheet Rekap', 'menuRebuildRekap')
    .addToUi();
}

function getSpreadsheet_() {
  if (SPREADSHEET_ID && String(SPREADSHEET_ID).trim() !== '') {
    return SpreadsheetApp.openById(String(SPREADSHEET_ID).trim());
  }
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) {
    throw new Error(
      'SPREADSHEET_ID masih kosong dan script tidak terikat ke Spreadsheet aktif.'
    );
  }
  return active;
}

function getHeadersForSheet_(sheetName, headers) {
  if (headers && headers.length > 0) return headers;
  if (HEADERS[sheetName]) return HEADERS[sheetName];
  throw new Error('Definisi header untuk sheet "' + sheetName + '" tidak ditemukan.');
}

function ensureSheet_(ss, sheetName, headers) {
  headers = getHeadersForSheet_(sheetName, headers);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  if (sheet.getLastRow() === 0) {
    var initRange = sheet.getRange(1, 1, 1, headers.length);
    initRange.setNumberFormat('@');
    initRange.setValues([headers]);
    formatHeaderRow_(sheet, headers.length);
  } else {
    var currentHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    var emptyHeader = currentHeaders.every(function (c) {
      return String(c || '').trim() === '';
    });
    var needsHeaderUpdate = false;
    for (var hi = 0; hi < headers.length; hi++) {
      if (String(currentHeaders[hi] || '').trim() === '') {
        needsHeaderUpdate = true;
        break;
      }
    }
    if (emptyHeader || needsHeaderUpdate) {
      var headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setNumberFormat('@');
      headerRange.setValues([headers]);
      formatHeaderRow_(sheet, headers.length);
    }
  }
  return sheet;
}

function formatHeaderRow_(sheet, colCount) {
  var range = sheet.getRange(1, 1, 1, colCount);
  range
    .setFontWeight('bold')
    .setBackground('#0f172a')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle');
  sheet.setFrozenRows(1);
}

function setupDatabaseInternal_(ss) {
  var seed = createDefaultSeedData_();

  // 1. Pastikan seluruh sheet & header tersedia
  Object.keys(SHEETS).forEach(function (k) {
    var name = SHEETS[k];
    ensureSheet_(ss, name, HEADERS[name]);
  });

  // 2. Isi data awal hanya jika sheet masih kosong (baru baris header)
  var userSheet = ss.getSheetByName(SHEETS.USERS);
  if (userSheet.getLastRow() <= 1) {
    writeObjectsToSheet_(ss, SHEETS.USERS, HEADERS[SHEETS.USERS], seed.users);
  }

  var guruSheet = ss.getSheetByName(SHEETS.GURU);
  if (guruSheet.getLastRow() <= 1) {
    writeObjectsToSheet_(ss, SHEETS.GURU, HEADERS[SHEETS.GURU], seed.guru);
  }

  var poinSheet = ss.getSheetByName(SHEETS.POIN_BERKAS);
  if (poinSheet && poinSheet.getLastRow() <= 1) {
    writeObjectsToSheet_(ss, SHEETS.POIN_BERKAS, HEADERS[SHEETS.POIN_BERKAS], seed.poinBerkas);
  }

  var aspekSheet = ss.getSheetByName(SHEETS.ASPEK);
  if (aspekSheet.getLastRow() <= 1) {
    writeObjectsToSheet_(ss, SHEETS.ASPEK, HEADERS[SHEETS.ASPEK], seed.aspek);
  }

  var penilaianSheet = ss.getSheetByName(SHEETS.PENILAIAN);
  if (penilaianSheet.getLastRow() <= 1) {
    writeObjectsToSheet_(ss, SHEETS.PENILAIAN, HEADERS[SHEETS.PENILAIAN], seed.penilaian);
  }

  var catatanSheet = ss.getSheetByName(SHEETS.CATATAN_TAHAP);
  if (catatanSheet.getLastRow() <= 1) {
    writeObjectsToSheet_(
      ss,
      SHEETS.CATATAN_TAHAP,
      HEADERS[SHEETS.CATATAN_TAHAP],
      seed.catatanTahap
    );
  }

  var pengaturanSheet = ss.getSheetByName(SHEETS.PENGATURAN);
  if (pengaturanSheet.getLastRow() <= 1) {
    savePengaturanObj_(ss, seed.pengaturan);
  }

  syncRekapSheet_(ss);
}

function setupDatabase() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = getSpreadsheet_();
    setupDatabaseInternal_(ss);
    try {
      SpreadsheetApp.getUi().alert('Inisialisasi database SADIG pada Spreadsheet berhasil!');
    } catch (e) {
      // Abaikan jika dijalankan dari editor / tanpa UI Spreadsheet
    }
  } finally {
    lock.releaseLock();
  }
}

function menuSeedBkAspects() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = getSpreadsheet_();
    ensureAllSheetsExist_(ss);
    var added = seedBkAspectsInternal_(ss);
    syncRekapSheet_(ss);
    SpreadsheetApp.getUi().alert(
      added > 0
        ? added + ' butir instrumen Administrasi BK berhasil ditambahkan ke sheet Aspek.'
        : 'Seluruh template instrumen Administrasi BK sudah tersedia di sheet Aspek.'
    );
  } finally {
    lock.releaseLock();
  }
}

function menuRebuildRekap() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = getSpreadsheet_();
    ensureAllSheetsExist_(ss);
    syncRekapSheet_(ss);
    SpreadsheetApp.getUi().alert('Sheet Rekap berhasil dihitung ulang.');
  } finally {
    lock.releaseLock();
  }
}

function ensureAllSheetsExist_(ss) {
  var pengSheet = ss.getSheetByName(SHEETS.PENGATURAN);
  var userSheet = ss.getSheetByName(SHEETS.USERS);
  var needInitialSeed =
    !pengSheet || pengSheet.getLastRow() <= 1 || !userSheet || userSheet.getLastRow() <= 1;

  Object.keys(SHEETS).forEach(function (k) {
    var name = SHEETS[k];
    ensureSheet_(ss, name, HEADERS[name]);
  });

  if (needInitialSeed) {
    setupDatabaseInternal_(ss);
  } else {
    var poinSheet = ss.getSheetByName(SHEETS.POIN_BERKAS);
    if (poinSheet && poinSheet.getLastRow() <= 1) {
      writeObjectsToSheet_(
        ss,
        SHEETS.POIN_BERKAS,
        HEADERS[SHEETS.POIN_BERKAS],
        getDefaultPoinBerkas_()
      );
    }
  }
}

// ============================================================================
// HTTP ENDPOINTS (WEB APP: doGet & doPost)
// ============================================================================

function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    var action = String(params.action || 'state').trim();
    var ss = getSpreadsheet_();
    ensureAllSheetsExist_(ss);

    if (action === 'ping') {
      var info = readPengaturanObj_(ss);
      return jsonResponse_({
        success: true,
        message: 'SADIG Spreadsheet API aktif',
        namaSekolah: info.namaSekolah || '',
        spreadsheetName: ss.getName(),
        timestamp: new Date().toISOString(),
      });
    }

    if (action === 'branding') {
      var pengaturan = readPengaturanObj_(ss);
      return jsonResponse_({
        success: true,
        data: {
          namaSekolah: pengaturan.namaSekolah,
          logoKiri: pengaturan.logoKiri || '',
          logoKanan: pengaturan.logoKanan || '',
        },
      });
    }

    // Default: action === 'state'
    var payload = buildFullStatePayload_(ss);
    return jsonResponse_({
      success: true,
      data: payload,
    });
  } catch (err) {
    return jsonResponse_({
      success: false,
      message: err && err.message ? err.message : String(err),
    });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    var ss = getSpreadsheet_();
    ensureAllSheetsExist_(ss);

    var body = parsePostBody_(e);
    var queryAction = e && e.parameter && e.parameter.action ? String(e.parameter.action) : '';
    var action = String(body.action || queryAction || '').trim();
    var data = body.data !== undefined ? body.data : body;

    if (!action) {
      return jsonResponse_({ success: false, message: 'Parameter action tidak ditemukan.' });
    }

    switch (action) {
      case 'ping':
        var info = readPengaturanObj_(ss);
        return jsonResponse_({
          success: true,
          message: 'SADIG Spreadsheet API aktif',
          namaSekolah: info.namaSekolah || '',
          spreadsheetName: ss.getName(),
        });

      case 'state':
        return jsonResponse_({
          success: true,
          data: buildFullStatePayload_(ss),
        });

      case 'setupDatabase':
        setupDatabaseInternal_(ss);
        return jsonResponse_({
          success: true,
          message: 'Database Spreadsheet berhasil diinisialisasi.',
          data: buildFullStatePayload_(ss),
        });

      case 'login':
        return jsonResponse_(handleLogin_(ss, data));

      case 'quickLogin':
        return jsonResponse_(handleQuickLogin_(ss, data));

      case 'saveGuru':
        return jsonResponse_(handleSaveGuru_(ss, data));

      case 'bulkImportGuru':
        return jsonResponse_(handleBulkImportGuru_(ss, data));

      case 'deleteGuru':
        return jsonResponse_(handleDeleteGuru_(ss, data));

      case 'uploadBerkasGuru':
        return jsonResponse_(handleUploadBerkasGuru_(ss, data));

      case 'verifikasiKepsek':
        return jsonResponse_(handleVerifikasiKepsek_(ss, data));

      case 'savePoinBerkas':
        return jsonResponse_(handleSavePoinBerkas_(ss, data));

      case 'deletePoinBerkas':
        return jsonResponse_(handleDeletePoinBerkas_(ss, data));

      case 'savePenilaian':
        return jsonResponse_(handleSavePenilaian_(ss, data));

      case 'saveAspek':
        return jsonResponse_(handleSaveAspek_(ss, data));

      case 'seedBkAspek':
        return jsonResponse_(handleSeedBkAspek_(ss));

      case 'deleteAspek':
        return jsonResponse_(handleDeleteAspek_(ss, data));

      case 'saveUser':
        return jsonResponse_(handleSaveUser_(ss, data));

      case 'deleteUser':
        return jsonResponse_(handleDeleteUser_(ss, data));

      case 'savePengaturan':
        return jsonResponse_(handleSavePengaturan_(ss, data));

      case 'syncRekap':
        syncRekapSheet_(ss);
        return jsonResponse_({
          success: true,
          message: 'Rekap berhasil disinkronkan.',
          data: buildFullStatePayload_(ss),
        });

      default:
        return jsonResponse_({
          success: false,
          message: 'Action tidak dikenali: ' + action,
        });
    }
  } catch (err) {
    return jsonResponse_({
      success: false,
      message: err && err.message ? err.message : String(err),
    });
  } finally {
    try {
      lock.releaseLock();
    } catch (ignore) {}
  }
}

function parsePostBody_(e) {
  if (e && e.parameter && e.parameter.payload) {
    try {
      return JSON.parse(String(e.parameter.payload));
    } catch (err) {
      throw new Error('Format parameter payload tidak valid: ' + err.message);
    }
  }
  if (!e || !e.postData || !e.postData.contents) {
    return (e && e.parameter) || {};
  }
  var raw = String(e.postData.contents || '').trim();
  if (!raw) return (e && e.parameter) || {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error('Format body JSON tidak valid: ' + err.message);
  }
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

// ============================================================================
// HANDLER AKSI BISNIS SADIG
// ============================================================================

function handleLogin_(ss, input) {
  var identifier = String(input.identifier || '').trim();
  var password = String(input.password || '').trim();

  if (!identifier || !password) {
    return { success: false, message: 'Username/NIP dan kata sandi wajib diisi.' };
  }

  var users = readUsers_(ss);
  var normId = identifier.toLowerCase().replace(/\s+/g, '');

  var matched = null;
  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    var unameMatch = String(u.username || '').toLowerCase() === identifier.toLowerCase();
    var nipMatch = String(u.nip || '').replace(/\s+/g, '').toLowerCase() === normId;
    var emailMatch =
      String(u.email || '').trim() !== '' &&
      String(u.email || '').toLowerCase() === identifier.toLowerCase();

    if ((unameMatch || nipMatch || emailMatch) && String(u.password || '') === password) {
      matched = u;
      break;
    }
  }

  if (!matched) {
    return { success: false, message: 'Username/NIP atau kata sandi tidak cocok.' };
  }
  return { success: true, user: matched };
}

function handleQuickLogin_(ss, input) {
  var role = String(input.role || '').trim();
  var users = readUsers_(ss);
  for (var i = 0; i < users.length; i++) {
    if (users[i].role === role) {
      return { success: true, user: users[i] };
    }
  }
  return { success: false, message: 'Akun dengan role ' + role + ' tidak ditemukan.' };
}

function handleSaveGuru_(ss, input) {
  var nip = String(input.nip || '').trim();
  var namaGuru = String(input.namaGuru || '').trim();
  var mataPelajaran = String(input.mataPelajaran || '').trim();

  if (!nip || !namaGuru || !mataPelajaran) {
    return { success: false, message: 'NIP, Nama Guru, dan Mata Pelajaran wajib diisi.' };
  }

  var guruList = readGuru_(ss);
  var users = readUsers_(ss);
  var pengaturan = readPengaturanObj_(ss);

  var spvName = String(input.supervisor || '').trim();
  var spvUser = findByField_(users, 'nama', spvName);
  var emails = resolveRoleEmails_(users, nip, namaGuru, spvName);

  if (input.id) {
    var targetId = String(input.id).trim();
    var idx = findIndexByField_(guruList, 'id', targetId);
    if (idx === -1) {
      return { success: false, message: 'Data guru tidak ditemukan.' };
    }
    var oldNip = guruList[idx].nip;
    guruList[idx] = {
      id: targetId,
      nip: nip,
      namaGuru: namaGuru,
      mataPelajaran: mataPelajaran,
      tanggalPelaksanaan:
        String(input.tanggalPelaksanaan || '').trim() || guruList[idx].tanggalPelaksanaan,
      supervisor: spvName,
      nipSupervisor:
        (spvUser && spvUser.nip) ||
        String(input.nipSupervisor || guruList[idx].nipSupervisor || ''),
      statusBerkas: guruList[idx].statusBerkas || 'Belum Dicek',
      kelengkapanBerkas: guruList[idx].kelengkapanBerkas || 'Belum Ada',
      linkDriveBerkas: guruList[idx].linkDriveBerkas || '',
      catatanKepsek: guruList[idx].catatanKepsek || '',
      guruEmail: String(
        input.guruEmail !== undefined
          ? input.guruEmail
          : guruList[idx].guruEmail || emails.guruEmail
      ),
      supervisorEmail: String(
        input.supervisorEmail !== undefined
          ? input.supervisorEmail
          : guruList[idx].supervisorEmail || emails.supervisorEmail
      ),
      kepsekEmail: emails.kepsekEmail,
      pengawasEmail: emails.pengawasEmail,
      cekBerkas: guruList[idx].cekBerkas || {},
    };

    if (oldNip && oldNip !== nip) {
      var penilaianList = readPenilaian_(ss);
      penilaianList.forEach(function (p) {
        if (p.guruId === targetId || p.nipGuru === oldNip) {
          p.nipGuru = nip;
        }
      });
      writeObjectsToSheet_(ss, SHEETS.PENILAIAN, HEADERS[SHEETS.PENILAIAN], penilaianList);

      var catatanList = readCatatanTahap_(ss);
      catatanList.forEach(function (c) {
        if (c.guruId === targetId || c.nipGuru === oldNip) {
          c.nipGuru = nip;
        }
      });
      writeObjectsToSheet_(ss, SHEETS.CATATAN_TAHAP, HEADERS[SHEETS.CATATAN_TAHAP], catatanList);
    }
  } else {
    var normNewNip = nip.replace(/\s+/g, '');
    var duplicate = guruList.some(function (g) {
      return String(g.nip || '').replace(/\s+/g, '') === normNewNip;
    });
    if (duplicate) {
      return { success: false, message: 'NIP guru sudah terdaftar.' };
    }

    var maxNum = nextSeqNumber_(guruList, 'id');
    var newId = 'G' + padZero_(maxNum, 3);

    guruList.push({
      id: newId,
      nip: nip,
      namaGuru: namaGuru,
      mataPelajaran: mataPelajaran,
      tanggalPelaksanaan:
        String(input.tanggalPelaksanaan || '').trim() ||
        pengaturan.tanggalPelaksanaanUmum ||
        todayIso_(),
      supervisor: spvName,
      nipSupervisor: (spvUser && spvUser.nip) || String(input.nipSupervisor || ''),
      statusBerkas: 'Belum Dicek',
      kelengkapanBerkas: 'Belum Ada',
      linkDriveBerkas: '',
      catatanKepsek: '',
      guruEmail: String(input.guruEmail || emails.guruEmail),
      supervisorEmail: String(input.supervisorEmail || emails.supervisorEmail),
      kepsekEmail: emails.kepsekEmail,
      pengawasEmail: emails.pengawasEmail,
    });
  }

  writeObjectsToSheet_(ss, SHEETS.GURU, HEADERS[SHEETS.GURU], guruList);
  syncRekapSheet_(ss);

  return {
    success: true,
    message: 'Data guru berhasil disimpan.',
    data: buildFullStatePayload_(ss),
  };
}

function handleBulkImportGuru_(ss, input) {
  var items = Array.isArray(input.items) ? input.items : [];
  if (items.length === 0) {
    return { success: false, message: 'Tidak ada data CSV untuk diimpor.' };
  }

  var guruList = readGuru_(ss);
  var users = readUsers_(ss);
  var pengaturan = readPengaturanObj_(ss);
  var defaultDate = String(
    input.defaultDate || pengaturan.tanggalPelaksanaanUmum || todayIso_()
  );

  var nextNum = nextSeqNumber_(guruList, 'id');
  var added = 0;

  items.forEach(function (it, index) {
    var namaGuru = String(it.namaGuru || '').trim();
    var mataPelajaran = String(it.mataPelajaran || '').trim();
    if (!namaGuru || !mataPelajaran) return;

    var nip =
      String(it.nip || '').trim() ||
      '19900101 202001 1 ' + padZero_(index + 10, 3);
    var normNip = nip.replace(/\s+/g, '');
    if (
      guruList.some(function (g) {
        return String(g.nip || '').replace(/\s+/g, '') === normNip;
      })
    ) {
      return;
    }

    var spvName = String(it.supervisor || '').trim();
    var spvUser = findByField_(users, 'nama', spvName);
    var emails = resolveRoleEmails_(users, nip, namaGuru, spvName);

    guruList.push({
      id: 'G' + padZero_(nextNum++, 3),
      nip: nip,
      namaGuru: namaGuru,
      mataPelajaran: mataPelajaran,
      tanggalPelaksanaan: String(it.tanggalPelaksanaan || '').trim() || defaultDate,
      supervisor: spvName,
      nipSupervisor: (spvUser && spvUser.nip) || '',
      statusBerkas: 'Belum Dicek',
      kelengkapanBerkas: 'Belum Ada',
      linkDriveBerkas: '',
      catatanKepsek: '',
      guruEmail: emails.guruEmail,
      supervisorEmail: emails.supervisorEmail,
      kepsekEmail: emails.kepsekEmail,
      pengawasEmail: emails.pengawasEmail,
    });
    added++;
  });

  writeObjectsToSheet_(ss, SHEETS.GURU, HEADERS[SHEETS.GURU], guruList);
  syncRekapSheet_(ss);

  return {
    success: true,
    count: added,
    message: added + ' data guru berhasil diimpor.',
    data: buildFullStatePayload_(ss),
  };
}

function handleDeleteGuru_(ss, input) {
  var id = String(input.id || '').trim();
  if (!id) {
    return { success: false, message: 'ID guru wajib disertakan.' };
  }

  var guruList = readGuru_(ss);
  var target = findByField_(guruList, 'id', id);
  if (!target) {
    return { success: false, message: 'Data guru tidak ditemukan.' };
  }

  guruList = guruList.filter(function (g) {
    return g.id !== id;
  });
  writeObjectsToSheet_(ss, SHEETS.GURU, HEADERS[SHEETS.GURU], guruList);

  var penilaianList = readPenilaian_(ss).filter(function (p) {
    return p.guruId !== id && p.nipGuru !== target.nip;
  });
  writeObjectsToSheet_(ss, SHEETS.PENILAIAN, HEADERS[SHEETS.PENILAIAN], penilaianList);

  var catatanList = readCatatanTahap_(ss).filter(function (c) {
    return c.guruId !== id && c.nipGuru !== target.nip;
  });
  writeObjectsToSheet_(ss, SHEETS.CATATAN_TAHAP, HEADERS[SHEETS.CATATAN_TAHAP], catatanList);

  syncRekapSheet_(ss);

  return {
    success: true,
    message: 'Data guru dan penilaiannya berhasil dihapus.',
    data: buildFullStatePayload_(ss),
  };
}

function handleUploadBerkasGuru_(ss, input) {
  var idGuru = String(input.idGuru || input.id || '').trim();
  var linkDriveBerkas = String(input.linkDriveBerkas || '').trim();

  if (!idGuru || !linkDriveBerkas) {
    return { success: false, message: 'ID guru dan tautan Google Drive wajib diisi.' };
  }

  var guruList = readGuru_(ss);
  var idx = findIndexByField_(guruList, 'id', idGuru);
  if (idx === -1) {
    return { success: false, message: 'Data guru tidak ditemukan.' };
  }

  guruList[idx].linkDriveBerkas = linkDriveBerkas;
  guruList[idx].statusBerkas = 'Belum Dicek';
  guruList[idx].kelengkapanBerkas = 'Belum Ada';
  guruList[idx].catatanKepsek = '';
  guruList[idx].cekBerkas = {};

  writeObjectsToSheet_(ss, SHEETS.GURU, HEADERS[SHEETS.GURU], guruList);
  syncRekapSheet_(ss);

  return {
    success: true,
    message: 'Tautan berkas berhasil disimpan dan menunggu verifikasi Kepala Sekolah.',
    data: buildFullStatePayload_(ss),
  };
}

function handleVerifikasiKepsek_(ss, input) {
  var idGuru = String(input.idGuru || input.id || '').trim();
  var kelengkapanBerkas = String(input.kelengkapanBerkas || 'Belum Ada').trim();
  var statusBerkas = String(input.statusBerkas || 'Belum Dicek').trim();
  var catatanKepsek = String(input.catatanKepsek || '').trim();
  var cekBerkas = parseJsonObj_(input.cekBerkas);

  var guruList = readGuru_(ss);
  var idx = findIndexByField_(guruList, 'id', idGuru);
  if (idx === -1) {
    return { success: false, message: 'Data guru tidak ditemukan.' };
  }

  if (statusBerkas === 'Disetujui' && kelengkapanBerkas !== 'Ada') {
    return {
      success: false,
      message: 'Berkas harus ditandai "Ada" sebelum memberikan persetujuan (Disetujui).',
    };
  }

  guruList[idx].kelengkapanBerkas = kelengkapanBerkas;
  guruList[idx].statusBerkas = statusBerkas;
  guruList[idx].catatanKepsek = catatanKepsek;
  guruList[idx].cekBerkas = cekBerkas;

  writeObjectsToSheet_(ss, SHEETS.GURU, HEADERS[SHEETS.GURU], guruList);
  syncRekapSheet_(ss);

  return {
    success: true,
    message: 'Status verifikasi berkas berhasil diperbarui.',
    data: buildFullStatePayload_(ss),
  };
}

function handleSavePoinBerkas_(ss, input) {
  var idInput = String(input.id || '').trim();
  var nama = String(input.nama || '').trim();
  var deskripsi = String(input.deskripsi || '').trim();
  if (!nama) {
    return { success: false, message: 'Nama poin pemeriksaan berkas wajib diisi.' };
  }

  var list = readPoinBerkas_(ss);
  if (idInput) {
    var idx = findIndexByField_(list, 'id', idInput);
    if (idx === -1) {
      return { success: false, message: 'Poin berkas tidak ditemukan.' };
    }
    list[idx].nama = nama;
    list[idx].deskripsi = deskripsi;
    if (input.orderIndex !== undefined && input.orderIndex !== '') {
      list[idx].orderIndex = Number(input.orderIndex);
    }
  } else {
    var nextNum = nextSeqNumber_(list, 'id');
    var maxOrder = list.reduce(function (m, p) {
      return Math.max(m, Number(p.orderIndex || 0));
    }, list.length);
    list.push({
      id: 'PB' + nextNum,
      nama: nama,
      deskripsi: deskripsi,
      orderIndex:
        input.orderIndex !== undefined && input.orderIndex !== ''
          ? Number(input.orderIndex)
          : maxOrder + 1,
    });
  }

  list.sort(function (a, b) {
    return Number(a.orderIndex || 0) - Number(b.orderIndex || 0);
  });

  writeObjectsToSheet_(ss, SHEETS.POIN_BERKAS, HEADERS[SHEETS.POIN_BERKAS], list);

  return {
    success: true,
    message: 'Poin pemeriksaan berkas berhasil disimpan.',
    data: buildFullStatePayload_(ss),
  };
}

function handleDeletePoinBerkas_(ss, input) {
  var id = String(input.id || '').trim();
  if (!id) {
    return { success: false, message: 'ID poin berkas wajib disertakan.' };
  }

  var list = readPoinBerkas_(ss).filter(function (p) {
    return p.id !== id;
  });
  writeObjectsToSheet_(ss, SHEETS.POIN_BERKAS, HEADERS[SHEETS.POIN_BERKAS], list);

  return {
    success: true,
    message: 'Poin pemeriksaan berkas berhasil dihapus.',
    data: buildFullStatePayload_(ss),
  };
}

function handleSavePenilaian_(ss, input) {
  var tahap = String(input.tahap || '').trim();
  if (['Persiapan', 'Pelaksanaan', 'Evaluasi'].indexOf(tahap) === -1) {
    return { success: false, message: 'Tahap supervisi tidak valid.' };
  }

  var guruList = readGuru_(ss);
  var guru = null;
  if (input.guru && input.guru.id) {
    guru = findByField_(guruList, 'id', String(input.guru.id));
  }
  if (!guru && input.guruId) {
    guru = findByField_(guruList, 'id', String(input.guruId));
  }
  if (!guru && input.nipGuru) {
    guru = findByField_(guruList, 'nip', String(input.nipGuru));
  }

  if (!guru) {
    return { success: false, message: 'Data guru tidak ditemukan.' };
  }
  if (guru.statusBerkas !== 'Disetujui') {
    return {
      success: false,
      message: 'Berkas guru belum disetujui Kepala Sekolah sehingga belum dapat dinilai.',
    };
  }

  var items = Array.isArray(input.items) ? input.items : [];
  if (items.length === 0) {
    return { success: false, message: 'Daftar aspek penilaian tidak boleh kosong.' };
  }

  var allAspek = readAspek_(ss);
  var stageRawAspek = allAspek.filter(function (a) {
    return a.tahap === tahap;
  });
  var activeAspek = getAspekForGuru_(stageRawAspek, tahap, guru.mataPelajaran);
  var penilai = String(input.penilai || guru.supervisor || 'Pengawas Supervisi').trim();
  var nowIso = todayIso_();

  var penilaianList = readPenilaian_(ss).filter(function (p) {
    var sameGuru = p.nipGuru === guru.nip || (p.guruId && p.guruId === guru.id);
    return !(sameGuru && p.tahap === tahap);
  });

  items.forEach(function (item) {
    var idAspek = String(item.idAspek || '').trim();
    if (!idAspek) return;

    var def = findByField_(activeAspek, 'id', idAspek);
    var isText = def && def.tipePenilaian === 'teks';
    var skorVal = null;

    if (!isText) {
      var n = Number(item.skor);
      if ([1, 2, 3, 4].indexOf(n) !== -1) {
        skorVal = n;
      }
    }

    penilaianList.push({
      id: guru.id + '_' + idAspek,
      guruId: guru.id,
      nipGuru: guru.nip,
      idAspek: idAspek,
      tahap: tahap,
      skor: skorVal === null ? '' : skorVal,
      teksRefleksi: isText ? String(item.teksRefleksi || '').trim() : '',
      catatan: String(item.catatan || '').trim(),
      penilai: penilai,
      updatedAt: nowIso,
    });
  });

  writeObjectsToSheet_(ss, SHEETS.PENILAIAN, HEADERS[SHEETS.PENILAIAN], penilaianList);

  var catatanList = readCatatanTahap_(ss).filter(function (c) {
    var sameGuru = c.nipGuru === guru.nip || (c.guruId && c.guruId === guru.id);
    return !(sameGuru && c.tahap === tahap);
  });

  catatanList.push({
    id: guru.id + '_' + tahap,
    guruId: guru.id,
    nipGuru: guru.nip,
    tahap: tahap,
    masalah: String(input.masalah || '').trim(),
    pemecahan: String(input.pemecahan || '').trim(),
    rencanaTL: String(input.rencanaTL || '').trim(),
    penilai: penilai,
    updatedAt: nowIso,
  });

  writeObjectsToSheet_(ss, SHEETS.CATATAN_TAHAP, HEADERS[SHEETS.CATATAN_TAHAP], catatanList);
  syncRekapSheet_(ss);

  return {
    success: true,
    message: 'Penilaian tahap ' + tahap + ' berhasil disimpan ke Spreadsheet.',
    data: buildFullStatePayload_(ss),
  };
}

function handleSaveAspek_(ss, input) {
  var tahap = String(input.tahap || '').trim();
  if (['Persiapan', 'Pelaksanaan', 'Evaluasi'].indexOf(tahap) === -1) {
    return {
      success: false,
      message: 'Tahap aspek wajib Persiapan, Pelaksanaan, atau Evaluasi.',
    };
  }

  var kelompok = String(input.kelompok || 'UMUM').trim();
  var aspekText = String(input.aspek || '').trim();
  var kategoriDeskripsi = String(input.kategoriDeskripsi || '').trim();

  if (!aspekText) {
    return { success: false, message: 'Nama aspek penilaian wajib diisi.' };
  }

  var tipePenilaian =
    input.tipePenilaian === 'teks' || input.tipePenilaian === 'skor'
      ? input.tipePenilaian
      : tahap === 'Evaluasi'
      ? 'teks'
      : 'skor';

  var idInput = String(input.id || '').trim();
  var targetMapel =
    input.targetMapel === 'BK' || idInput.indexOf('BK_') === 0 ? 'BK' : 'Umum';

  var allAspek = readAspek_(ss);

  if (idInput) {
    var idx = findIndexByField_(allAspek, 'id', idInput);
    if (idx === -1) {
      return { success: false, message: 'Aspek tidak ditemukan.' };
    }
    allAspek[idx].kelompok = kelompok;
    allAspek[idx].aspek = aspekText;
    allAspek[idx].kategoriDeskripsi = kategoriDeskripsi;
    allAspek[idx].tipePenilaian = tipePenilaian;
    allAspek[idx].targetMapel = targetMapel;
    if (input.orderIndex !== undefined && input.orderIndex !== '') {
      allAspek[idx].orderIndex = Number(input.orderIndex);
    }
  } else {
    var prefix = tahap === 'Persiapan' ? 'P' : tahap === 'Pelaksanaan' ? 'L' : 'E';
    var scopedStage = allAspek.filter(function (a) {
      return a.tahap === tahap && resolveAspekTargetMapel_(a) === targetMapel;
    });
    var nextNum = nextSeqNumber_(scopedStage, 'id');
    var newId = targetMapel === 'BK' ? 'BK_' + prefix + nextNum : prefix + nextNum;

    allAspek.push({
      id: newId,
      tahap: tahap,
      kelompok: kelompok,
      aspek: aspekText,
      kategoriDeskripsi: kategoriDeskripsi,
      tipePenilaian: tipePenilaian,
      targetMapel: targetMapel,
      orderIndex:
        input.orderIndex !== undefined
          ? Number(input.orderIndex)
          : targetMapel === 'BK'
          ? 100 + scopedStage.length + 1
          : allAspek.filter(function (a) {
              return a.tahap === tahap;
            }).length + 1,
    });
  }

  writeObjectsToSheet_(ss, SHEETS.ASPEK, HEADERS[SHEETS.ASPEK], allAspek);
  syncRekapSheet_(ss);

  return {
    success: true,
    message: 'Aspek instrumen berhasil disimpan.',
    data: buildFullStatePayload_(ss),
  };
}

function handleSeedBkAspek_(ss) {
  var added = seedBkAspectsInternal_(ss);
  syncRekapSheet_(ss);
  return {
    success: true,
    added: added,
    message:
      added > 0
        ? added + ' butir instrumen Administrasi BK berhasil ditambahkan.'
        : 'Seluruh butir instrumen Administrasi BK sudah tersedia.',
    data: buildFullStatePayload_(ss),
  };
}

function seedBkAspectsInternal_(ss) {
  var allAspek = readAspek_(ss);
  var existingIds = {};
  allAspek.forEach(function (a) {
    existingIds[a.id] = true;
  });

  var bkDefaults = getDefaultBkAllAspek_();
  var added = 0;
  bkDefaults.forEach(function (item) {
    if (!existingIds[item.id]) {
      allAspek.push(item);
      added++;
    }
  });

  if (added > 0) {
    writeObjectsToSheet_(ss, SHEETS.ASPEK, HEADERS[SHEETS.ASPEK], allAspek);
  }
  return added;
}

function handleDeleteAspek_(ss, input) {
  var id = String(input.id || '').trim();
  var tahap = String(input.tahap || '').trim();
  if (!id) {
    return { success: false, message: 'ID aspek wajib disertakan.' };
  }

  var allAspek = readAspek_(ss).filter(function (a) {
    if (tahap) {
      return !(a.id === id && a.tahap === tahap);
    }
    return a.id !== id;
  });
  writeObjectsToSheet_(ss, SHEETS.ASPEK, HEADERS[SHEETS.ASPEK], allAspek);

  var penilaianList = readPenilaian_(ss).filter(function (p) {
    if (tahap) {
      return !(p.idAspek === id && p.tahap === tahap);
    }
    return p.idAspek !== id;
  });
  writeObjectsToSheet_(ss, SHEETS.PENILAIAN, HEADERS[SHEETS.PENILAIAN], penilaianList);

  syncRekapSheet_(ss);

  return {
    success: true,
    message: 'Aspek instrumen berhasil dihapus.',
    data: buildFullStatePayload_(ss),
  };
}

function handleSaveUser_(ss, input) {
  var username = String(input.username || '').trim();
  var password = String(input.password || '123').trim();
  var email = String(input.email || '').trim();
  var nama = String(input.nama || '').trim();
  var role = String(input.role || 'Guru').trim();
  var nip = String(input.nip || '').trim();
  var oldUsername = String(input.oldUsername || '').trim();

  if (!username || !nama) {
    return { success: false, message: 'Username dan Nama lengkap wajib diisi.' };
  }

  var users = readUsers_(ss);

  if (oldUsername) {
    var idx = findIndexByField_(users, 'username', oldUsername);
    if (idx === -1) {
      return { success: false, message: 'Pengguna tidak ditemukan.' };
    }
    if (oldUsername !== username && findIndexByField_(users, 'username', username) !== -1) {
      return { success: false, message: 'Username baru sudah digunakan.' };
    }
    users[idx] = {
      id: users[idx].id || 'U' + padZero_(idx + 1, 3),
      username: oldUsername === 'admin' ? 'admin' : username,
      password: password,
      email: email,
      nama: nama,
      role: oldUsername === 'admin' ? 'Admin' : role,
      nip: nip,
    };
  } else {
    if (findIndexByField_(users, 'username', username) !== -1) {
      return { success: false, message: 'Username sudah terdaftar.' };
    }
    var nextNum = nextSeqNumber_(users, 'id');
    users.push({
      id: 'U' + padZero_(nextNum, 3),
      username: username,
      password: password,
      email: email,
      nama: nama,
      role: role,
      nip: nip,
    });
  }

  writeObjectsToSheet_(ss, SHEETS.USERS, HEADERS[SHEETS.USERS], users);

  return {
    success: true,
    message: 'Data akun pengguna berhasil disimpan.',
    data: buildFullStatePayload_(ss),
  };
}

function handleDeleteUser_(ss, input) {
  var username = String(input.username || '').trim();
  var id = String(input.id || '').trim();

  if (username === 'admin') {
    return { success: false, message: 'Akun Administrator utama tidak dapat dihapus.' };
  }

  var users = readUsers_(ss).filter(function (u) {
    if (username) return u.username !== username;
    if (id) return u.id !== id;
    return true;
  });

  writeObjectsToSheet_(ss, SHEETS.USERS, HEADERS[SHEETS.USERS], users);

  return {
    success: true,
    message: 'Akun pengguna berhasil dihapus.',
    data: buildFullStatePayload_(ss),
  };
}

function handleSavePengaturan_(ss, input) {
  var current = readPengaturanObj_(ss);
  var merged = {
    namaSekolah: String(
      input.namaSekolah !== undefined ? input.namaSekolah : current.namaSekolah
    ),
    dinasPendidikan: String(
      input.dinasPendidikan !== undefined ? input.dinasPendidikan : current.dinasPendidikan
    ),
    pemerintahDaerah: String(
      input.pemerintahDaerah !== undefined ? input.pemerintahDaerah : current.pemerintahDaerah
    ),
    alamatSekolah: String(
      input.alamatSekolah !== undefined ? input.alamatSekolah : current.alamatSekolah
    ),
    tahunPelajaran: String(
      input.tahunPelajaran !== undefined ? input.tahunPelajaran : current.tahunPelajaran
    ),
    semester: String(input.semester !== undefined ? input.semester : current.semester),
    namaKepalaSekolah: String(
      input.namaKepalaSekolah !== undefined
        ? input.namaKepalaSekolah
        : current.namaKepalaSekolah
    ),
    nipKepalaSekolah: String(
      input.nipKepalaSekolah !== undefined ? input.nipKepalaSekolah : current.nipKepalaSekolah
    ),
    namaPengawasSekolah: String(
      input.namaPengawasSekolah !== undefined
        ? input.namaPengawasSekolah
        : current.namaPengawasSekolah
    ),
    nipPengawas: String(
      input.nipPengawas !== undefined ? input.nipPengawas : current.nipPengawas
    ),
    tanggalPelaksanaanUmum: String(
      input.tanggalPelaksanaanUmum !== undefined
        ? input.tanggalPelaksanaanUmum
        : current.tanggalPelaksanaanUmum
    ),
    tempatTanggalCetak: String(
      input.tempatTanggalCetak !== undefined
        ? input.tempatTanggalCetak
        : current.tempatTanggalCetak
    ),
    logoKiri: String(input.logoKiri !== undefined ? input.logoKiri : current.logoKiri || ''),
    logoKanan: String(input.logoKanan !== undefined ? input.logoKanan : current.logoKanan || ''),
  };

  savePengaturanObj_(ss, merged);

  return {
    success: true,
    message: 'Pengaturan identitas sekolah berhasil diperbarui.',
    data: buildFullStatePayload_(ss),
  };
}

// ============================================================================
// OPERASI BACA / TULIS SHEET GENERIK
// ============================================================================

function cellStr_(val) {
  if (val === null || val === undefined) return '';
  if (Object.prototype.toString.call(val) === '[object Date]' && !isNaN(val.getTime())) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(val);
}

function readSheetObjects_(ss, sheetName, headers) {
  headers = getHeadersForSheet_(sheetName, headers);
  var sheet = ensureSheet_(ss, sheetName, headers);
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var result = [];

  for (var r = 0; r < values.length; r++) {
    var row = values[r];
    var isBlank = row.every(function (cell) {
      return cell === '' || cell === null || cell === undefined;
    });
    if (isBlank) continue;

    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      obj[headers[c]] = cellStr_(row[c]);
    }
    result.push(obj);
  }
  return result;
}

function writeObjectsToSheet_(ss, sheetName, headers, list) {
  headers = getHeadersForSheet_(sheetName, headers);
  var sheet = ensureSheet_(ss, sheetName, headers);
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, headers.length).clearContent();
  }

  if (!list || list.length === 0) return;

  var rows = list.map(function (obj) {
    return headers.map(function (h) {
      var val = obj[h];
      if (val === null || val === undefined) return '';
      if (typeof val === 'object') return JSON.stringify(val);
      return String(val);
    });
  });

  var range = sheet.getRange(2, 1, rows.length, headers.length);
  range.setNumberFormat('@');
  range.setValues(rows);
}

function parseJsonObj_(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    var parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    return {};
  }
}

function readUsers_(ss) {
  return readSheetObjects_(ss, SHEETS.USERS, HEADERS[SHEETS.USERS]);
}

function readGuru_(ss) {
  return readSheetObjects_(ss, SHEETS.GURU, HEADERS[SHEETS.GURU]).map(function (g) {
    g.cekBerkas = parseJsonObj_(g.cekBerkas);
    return g;
  });
}

function readPoinBerkas_(ss) {
  var rows = readSheetObjects_(ss, SHEETS.POIN_BERKAS, HEADERS[SHEETS.POIN_BERKAS]);
  return rows
    .map(function (r) {
      return {
        id: String(r.id || '').trim(),
        nama: String(r.nama || ''),
        deskripsi: String(r.deskripsi || ''),
        orderIndex: Number(r.orderIndex || 0),
      };
    })
    .sort(function (a, b) {
      return a.orderIndex - b.orderIndex;
    });
}

function readAspek_(ss) {
  var rows = readSheetObjects_(ss, SHEETS.ASPEK, HEADERS[SHEETS.ASPEK]);
  return rows
    .map(function (r) {
      var id = String(r.id || '').trim();
      var targetMapel = r.targetMapel === 'BK' || id.indexOf('BK_') === 0 ? 'BK' : 'Umum';
      return {
        id: id,
        tahap: r.tahap || 'Persiapan',
        kelompok: r.kelompok || '',
        aspek: r.aspek || '',
        kategoriDeskripsi: r.kategoriDeskripsi || '',
        tipePenilaian: r.tipePenilaian === 'teks' ? 'teks' : 'skor',
        targetMapel: targetMapel,
        orderIndex: Number(r.orderIndex || 0),
      };
    })
    .sort(function (a, b) {
      return a.orderIndex - b.orderIndex;
    });
}

function readPenilaian_(ss) {
  var rows = readSheetObjects_(ss, SHEETS.PENILAIAN, HEADERS[SHEETS.PENILAIAN]);
  return rows.map(function (r) {
    var skorNum = Number(r.skor);
    return {
      id: r.id || '',
      guruId: r.guruId || '',
      nipGuru: r.nipGuru || '',
      idAspek: r.idAspek || '',
      tahap: r.tahap || 'Persiapan',
      skor: r.skor !== '' && !isNaN(skorNum) && skorNum >= 1 && skorNum <= 4 ? skorNum : null,
      teksRefleksi: r.teksRefleksi || '',
      catatan: r.catatan || '',
      penilai: r.penilai || '',
      updatedAt: r.updatedAt || '',
    };
  });
}

function readCatatanTahap_(ss) {
  return readSheetObjects_(ss, SHEETS.CATATAN_TAHAP, HEADERS[SHEETS.CATATAN_TAHAP]);
}

function readPengaturanObj_(ss) {
  var rows = readSheetObjects_(ss, SHEETS.PENGATURAN, HEADERS[SHEETS.PENGATURAN]);
  var defaults = createDefaultSeedData_().pengaturan;
  var rawMap = {};
  rows.forEach(function (r) {
    if (r.key) {
      rawMap[r.key] = r.value !== undefined ? r.value : '';
    }
  });
  var out = {};
  Object.keys(defaults).forEach(function (k) {
    var val = rawMap[k] !== undefined ? rawMap[k] : defaults[k];
    if (typeof val === 'string' && val.indexOf('__CHUNKED__:') === 0) {
      var count = parseInt(val.split(':')[1], 10) || 0;
      var assembled = '';
      for (var p = 0; p < count; p++) {
        assembled += rawMap[k + '__part_' + p] || '';
      }
      out[k] = assembled;
    } else {
      out[k] = val;
    }
  });
  return out;
}

function savePengaturanObj_(ss, pengaturanObj) {
  var keys = [
    'namaSekolah',
    'dinasPendidikan',
    'pemerintahDaerah',
    'alamatSekolah',
    'tahunPelajaran',
    'semester',
    'namaKepalaSekolah',
    'nipKepalaSekolah',
    'namaPengawasSekolah',
    'nipPengawas',
    'tanggalPelaksanaanUmum',
    'tempatTanggalCetak',
    'logoKiri',
    'logoKanan',
  ];
  var rows = [];
  keys.forEach(function (k) {
    var val =
      pengaturanObj[k] !== undefined && pengaturanObj[k] !== null
        ? String(pengaturanObj[k])
        : '';
    if (val.length <= MAX_CELL_CHARS) {
      rows.push({ key: k, value: val });
    } else {
      var partCount = Math.ceil(val.length / MAX_CELL_CHARS);
      rows.push({ key: k, value: '__CHUNKED__:' + partCount });
      for (var p = 0; p < partCount; p++) {
        rows.push({
          key: k + '__part_' + p,
          value: val.slice(p * MAX_CELL_CHARS, (p + 1) * MAX_CELL_CHARS),
        });
      }
    }
  });
  writeObjectsToSheet_(ss, SHEETS.PENGATURAN, HEADERS[SHEETS.PENGATURAN], rows);
}

// ============================================================================
// PERHITUNGAN REKAP, LOGIKA MAPEL BK, & PEMBENTUK PAYLOAD
// ============================================================================

function isGuruBK_(mataPelajaran) {
  var normalized = String(mataPelajaran || '')
    .trim()
    .toLowerCase();
  if (!normalized) return false;
  return (
    /\bb\.?k\.?\b/.test(normalized) ||
    (normalized.indexOf('bimbingan') !== -1 && normalized.indexOf('konseling') !== -1) ||
    normalized === 'konseling'
  );
}

function resolveAspekTargetMapel_(item) {
  if (item && (item.targetMapel === 'BK' || String(item.id || '').indexOf('BK_') === 0)) {
    return 'BK';
  }
  return 'Umum';
}

function getAspekForGuru_(stageAspekList, tahap, mataPelajaran) {
  if (isGuruBK_(mataPelajaran)) {
    var dbBk = stageAspekList.filter(function (a) {
      return resolveAspekTargetMapel_(a) === 'BK';
    });
    if (dbBk.length > 0) return dbBk;
    return getDefaultBkAllAspek_().filter(function (a) {
      return a.tahap === tahap;
    });
  }
  return stageAspekList.filter(function (a) {
    return resolveAspekTargetMapel_(a) !== 'BK';
  });
}

function hitungPredikat_(nilai) {
  if (nilai === null || nilai === undefined || isNaN(nilai)) return 'Belum Dinilai';
  if (nilai >= 86) return 'Amat Baik';
  if (nilai >= 71) return 'Baik';
  if (nilai >= 56) return 'Cukup';
  return 'Kurang';
}

function computeTahapSummary_(nipGuru, tahap, aspekList, penilaianList) {
  var jumlahAspek = aspekList.length;
  var numericAspeks = aspekList.filter(function (a) {
    return a.tipePenilaian !== 'teks';
  });
  var textAspeks = aspekList.filter(function (a) {
    return a.tipePenilaian === 'teks';
  });

  var mode =
    textAspeks.length === jumlahAspek && jumlahAspek > 0
      ? 'teks'
      : numericAspeks.length === jumlahAspek
      ? 'skor'
      : 'campuran';

  var aspekIds = {};
  aspekList.forEach(function (a) {
    aspekIds[a.id] = true;
  });

  var matched = penilaianList.filter(function (p) {
    return p.nipGuru === nipGuru && p.tahap === tahap && !!aspekIds[p.idAspek];
  });

  var terisi = 0;
  var totalSkor = 0;
  var numericFilled = 0;

  aspekList.forEach(function (a) {
    var entry = findByField_(matched, 'idAspek', a.id);
    if (!entry) return;
    if (a.tipePenilaian === 'teks') {
      if (entry.teksRefleksi && String(entry.teksRefleksi).trim().length > 0) {
        terisi++;
      }
    } else if (entry.skor && [1, 2, 3, 4].indexOf(Number(entry.skor)) !== -1) {
      terisi++;
      numericFilled++;
      totalSkor += Number(entry.skor);
    }
  });

  var skorMaksimal = numericAspeks.length * 4;
  var nilai =
    skorMaksimal > 0 && numericFilled > 0
      ? Number(((totalSkor / skorMaksimal) * 100).toFixed(1))
      : null;

  var predikat =
    mode === 'teks'
      ? terisi > 0
        ? 'Tuntas (Dialog Refleksi)'
        : 'Belum Diisi'
      : hitungPredikat_(nilai);

  return {
    jumlahAspek: jumlahAspek,
    terisi: terisi,
    totalSkor: totalSkor,
    skorMaksimal: skorMaksimal,
    nilai: nilai,
    predikat: predikat,
    mode: mode,
  };
}

function buildRekap_(guruList, aspekPersiapan, aspekPelaksanaan, aspekEvaluasi, penilaianList) {
  return guruList.map(function (g) {
    var persiapanList = getAspekForGuru_(aspekPersiapan, 'Persiapan', g.mataPelajaran);
    var pelaksanaanList = getAspekForGuru_(aspekPelaksanaan, 'Pelaksanaan', g.mataPelajaran);
    var evaluasiList = getAspekForGuru_(aspekEvaluasi, 'Evaluasi', g.mataPelajaran);

    var persiapan = computeTahapSummary_(g.nip, 'Persiapan', persiapanList, penilaianList);
    var pelaksanaan = computeTahapSummary_(g.nip, 'Pelaksanaan', pelaksanaanList, penilaianList);
    var evaluasi = computeTahapSummary_(g.nip, 'Evaluasi', evaluasiList, penilaianList);

    var availableScores = [persiapan.nilai, pelaksanaan.nilai, evaluasi.nilai].filter(function (n) {
      return n !== null;
    });
    var nilaiRata =
      availableScores.length > 0
        ? Number(
            (
              availableScores.reduce(function (acc, cur) {
                return acc + cur;
              }, 0) / availableScores.length
            ).toFixed(1)
          )
        : null;

    var sudahLengkap = persiapan.terisi > 0 && pelaksanaan.terisi > 0 && evaluasi.terisi > 0;

    return {
      guru: g,
      persiapan: persiapan,
      pelaksanaan: pelaksanaan,
      evaluasi: evaluasi,
      nilaiRata: nilaiRata,
      predikatAkhir: availableScores.length > 0 ? hitungPredikat_(nilaiRata) : 'Belum Lengkap',
      sudahLengkap: sudahLengkap,
    };
  });
}

function buildFullStatePayload_(ss) {
  var users = readUsers_(ss);
  var guru = readGuru_(ss);
  var poinBerkas = readPoinBerkas_(ss);
  var allAspek = readAspek_(ss);
  var penilaian = readPenilaian_(ss);
  var catatanTahap = readCatatanTahap_(ss);
  var pengaturan = readPengaturanObj_(ss);

  var aspekPersiapan = allAspek.filter(function (a) {
    return a.tahap === 'Persiapan';
  });
  var aspekPelaksanaan = allAspek.filter(function (a) {
    return a.tahap === 'Pelaksanaan';
  });
  var aspekEvaluasi = allAspek.filter(function (a) {
    return a.tahap === 'Evaluasi';
  });

  var rekap = buildRekap_(guru, aspekPersiapan, aspekPelaksanaan, aspekEvaluasi, penilaian);

  return {
    users: users,
    guru: guru,
    poinBerkas: poinBerkas,
    aspekPersiapan: aspekPersiapan,
    aspekPelaksanaan: aspekPelaksanaan,
    aspekEvaluasi: aspekEvaluasi,
    penilaian: penilaian,
    catatanTahap: catatanTahap,
    pengaturan: pengaturan,
    rekap: rekap,
  };
}

function syncRekapSheet_(ss) {
  var payload = buildFullStatePayload_(ss);
  var rows = payload.rekap.map(function (r) {
    return {
      idGuru: r.guru.id,
      nip: r.guru.nip,
      namaGuru: r.guru.namaGuru,
      mataPelajaran: r.guru.mataPelajaran,
      supervisor: r.guru.supervisor,
      statusBerkas: r.guru.statusBerkas,
      nilaiPersiapan: r.persiapan.nilai !== null ? r.persiapan.nilai : '-',
      predikatPersiapan: r.persiapan.predikat,
      nilaiPelaksanaan: r.pelaksanaan.nilai !== null ? r.pelaksanaan.nilai : '-',
      predikatPelaksanaan: r.pelaksanaan.predikat,
      nilaiEvaluasi:
        r.evaluasi.nilai !== null
          ? r.evaluasi.nilai
          : r.evaluasi.mode === 'teks' && r.evaluasi.terisi > 0
          ? 'Refleksi'
          : '-',
      predikatEvaluasi: r.evaluasi.predikat,
      nilaiRata: r.nilaiRata !== null ? r.nilaiRata : '-',
      predikatAkhir: r.predikatAkhir,
      sudahLengkap: r.sudahLengkap ? 'Lengkap' : 'Belum Lengkap',
    };
  });
  writeObjectsToSheet_(ss, SHEETS.REKAP, HEADERS[SHEETS.REKAP], rows);
}

// ============================================================================
// UTILITAS PENCARIAN & HELPER
// ============================================================================

function nextSeqNumber_(list, field) {
  var maxNum = list.reduce(function (max, item) {
    var digits = String((item && item[field]) || '').replace(/\D/g, '');
    var n = parseInt(digits, 10);
    if (isNaN(n) || n >= 100000) return max;
    return Math.max(max, n);
  }, 0);
  return maxNum + 1;
}

function findByField_(arr, field, value) {
  for (var i = 0; i < arr.length; i++) {
    if (String(arr[i][field] || '') === String(value || '')) {
      return arr[i];
    }
  }
  return null;
}

function findIndexByField_(arr, field, value) {
  for (var i = 0; i < arr.length; i++) {
    if (String(arr[i][field] || '') === String(value || '')) {
      return i;
    }
  }
  return -1;
}

function resolveRoleEmails_(users, guruNip, guruNama, supervisorNama) {
  var guruMatch = null;
  var spvMatch = null;
  var kepsekMatch = null;
  var pengawasMatch = null;

  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    if (!guruMatch && ((guruNip && u.nip === guruNip) || (guruNama && u.nama === guruNama))) {
      guruMatch = u;
    }
    if (!spvMatch && supervisorNama && u.nama === supervisorNama) {
      spvMatch = u;
    }
    if (!kepsekMatch && u.role === 'Kepala Sekolah') {
      kepsekMatch = u;
    }
    if (!pengawasMatch && u.role === 'Pengawas Sekolah') {
      pengawasMatch = u;
    }
  }

  return {
    guruEmail: (guruMatch && guruMatch.email) || '',
    supervisorEmail: (spvMatch && spvMatch.email) || '',
    kepsekEmail: (kepsekMatch && kepsekMatch.email) || '',
    pengawasEmail: (pengawasMatch && pengawasMatch.email) || '',
  };
}

function padZero_(num, size) {
  var s = String(num);
  while (s.length < size) s = '0' + s;
  return s;
}

function todayIso_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// ============================================================================
// DATA AWAL (SEED): AKUN, GURU, ASPEK UMUM + ASPEK BK LENGKAP, & PENGATURAN
// ============================================================================

function getDefaultPoinBerkas_() {
  return [
    {
      id: 'PB1',
      nama: 'RPP',
      deskripsi: 'Rencana Pelaksanaan Pembelajaran sesuai fase/kelas yang diampu.',
      orderIndex: 1,
    },
    {
      id: 'PB2',
      nama: 'Modul Ajar',
      deskripsi: 'Modul Ajar Kurikulum Merdeka lengkap dengan tujuan dan langkah pembelajaran.',
      orderIndex: 2,
    },
    {
      id: 'PB3',
      nama: 'Alur Tujuan Pembelajaran (ATP)',
      deskripsi: 'Dokumen CP, TP, dan Alur Tujuan Pembelajaran semester berjalan.',
      orderIndex: 3,
    },
    {
      id: 'PB4',
      nama: 'LKPD & Bahan Ajar',
      deskripsi: 'Lembar Kerja Peserta Didik dan bahan bacaan kontekstual.',
      orderIndex: 4,
    },
    {
      id: 'PB5',
      nama: 'Instrumen & Rubrik Asesmen',
      deskripsi: 'Instrumen asesmen awal, formatif, sumatif, beserta rubrik penilaian.',
      orderIndex: 5,
    },
  ];
}

function getDefaultBkAllAspek_() {
  return [
    {
      id: 'BK_P1',
      tahap: 'Persiapan',
      kelompok: 'I. ADMINISTRASI PERENCANAAN (PROGRAM)',
      aspek: 'Asesmen Kebutuhan (Analisis AKPD/AUM)',
      kategoriDeskripsi: 'Ketersediaan dan kelengkapan dokumen asesmen kebutuhan peserta didik (AKPD/AUM).',
      tipePenilaian: 'skor',
      targetMapel: 'BK',
      orderIndex: 101,
    },
    {
      id: 'BK_P2',
      tahap: 'Persiapan',
      kelompok: 'I. ADMINISTRASI PERENCANAAN (PROGRAM)',
      aspek: 'Program Tahunan',
      kategoriDeskripsi: 'Ketersediaan dan kelengkapan dokumen Program Tahunan layanan BK.',
      tipePenilaian: 'skor',
      targetMapel: 'BK',
      orderIndex: 102,
    },
    {
      id: 'BK_P3',
      tahap: 'Persiapan',
      kelompok: 'I. ADMINISTRASI PERENCANAAN (PROGRAM)',
      aspek: 'Program Semesteran (Promes)',
      kategoriDeskripsi: 'Ketersediaan dan kelengkapan dokumen Program Semesteran (Promes) layanan BK.',
      tipePenilaian: 'skor',
      targetMapel: 'BK',
      orderIndex: 103,
    },
    {
      id: 'BK_P4',
      tahap: 'Persiapan',
      kelompok: 'I. ADMINISTRASI PERENCANAAN (PROGRAM)',
      aspek: 'Rencana Pelaksanaan Layanan (RPL)',
      kategoriDeskripsi: 'Ketersediaan dan kelengkapan Rencana Pelaksanaan Layanan (RPL) Bimbingan dan Konseling.',
      tipePenilaian: 'skor',
      targetMapel: 'BK',
      orderIndex: 104,
    },
    {
      id: 'BK_P5',
      tahap: 'Persiapan',
      kelompok: 'I. ADMINISTRASI PERENCANAAN (PROGRAM)',
      aspek: 'Silabus/Peta Materi BK',
      kategoriDeskripsi: 'Ketersediaan dan kelengkapan Silabus atau Peta Materi layanan BK.',
      tipePenilaian: 'skor',
      targetMapel: 'BK',
      orderIndex: 105,
    },
    {
      id: 'BK_L1',
      tahap: 'Pelaksanaan',
      kelompok: 'II. ADMINISTRASI PELAKSANAAN LAYANAN',
      aspek: 'Jurnal/Buku Harian Guru BK',
      kategoriDeskripsi: 'Pencatatan kegiatan layanan harian Guru BK secara tertib dan berkala.',
      tipePenilaian: 'skor',
      targetMapel: 'BK',
      orderIndex: 101,
    },
    {
      id: 'BK_L2',
      tahap: 'Pelaksanaan',
      kelompok: 'II. ADMINISTRASI PELAKSANAAN LAYANAN',
      aspek: 'Buku Klasifikasi Masalah',
      kategoriDeskripsi: 'Pemetaan dan klasifikasi permasalahan peserta didik (pribadi, sosial, belajar, karier).',
      tipePenilaian: 'skor',
      targetMapel: 'BK',
      orderIndex: 102,
    },
    {
      id: 'BK_L3',
      tahap: 'Pelaksanaan',
      kelompok: 'II. ADMINISTRASI PELAKSANAAN LAYANAN',
      aspek: 'Dokumentasi Konseling Perorangan',
      kategoriDeskripsi: 'Kelengkapan catatan dan dokumentasi pelaksanaan layanan konseling perorangan.',
      tipePenilaian: 'skor',
      targetMapel: 'BK',
      orderIndex: 103,
    },
    {
      id: 'BK_L4',
      tahap: 'Pelaksanaan',
      kelompok: 'II. ADMINISTRASI PELAKSANAAN LAYANAN',
      aspek: 'Dokumentasi Konseling Kelompok',
      kategoriDeskripsi: 'Kelengkapan catatan dan dokumentasi pelaksanaan layanan konseling kelompok.',
      tipePenilaian: 'skor',
      targetMapel: 'BK',
      orderIndex: 104,
    },
    {
      id: 'BK_L5',
      tahap: 'Pelaksanaan',
      kelompok: 'II. ADMINISTRASI PELAKSANAAN LAYANAN',
      aspek: 'Dokumentasi Bimbingan Klasikal',
      kategoriDeskripsi: 'Kelengkapan daftar hadir, materi, dan dokumentasi layanan bimbingan klasikal.',
      tipePenilaian: 'skor',
      targetMapel: 'BK',
      orderIndex: 105,
    },
    {
      id: 'BK_L6',
      tahap: 'Pelaksanaan',
      kelompok: 'II. ADMINISTRASI PELAKSANAAN LAYANAN',
      aspek: 'Catatan Home Visit',
      kategoriDeskripsi: 'Dokumentasi kunjungan rumah (home visit) beserta tindak lanjut penanganan kasus.',
      tipePenilaian: 'skor',
      targetMapel: 'BK',
      orderIndex: 106,
    },
    {
      id: 'BK_L7',
      tahap: 'Pelaksanaan',
      kelompok: 'II. ADMINISTRASI PELAKSANAAN LAYANAN',
      aspek: 'Buku Referal (Alih Tangan Kasus)',
      kategoriDeskripsi: 'Pencatatan dan dokumentasi alih tangan kasus (referal) kepada pihak terkait.',
      tipePenilaian: 'skor',
      targetMapel: 'BK',
      orderIndex: 107,
    },
    {
      id: 'BK_E1',
      tahap: 'Evaluasi',
      kelompok: 'III. ADMINISTRASI EVALUASI & TINDAK LANJUT',
      aspek: 'Evaluasi Proses',
      kategoriDeskripsi: 'Pelaksanaan dan dokumentasi evaluasi proses layanan bimbingan dan konseling.',
      tipePenilaian: 'skor',
      targetMapel: 'BK',
      orderIndex: 101,
    },
    {
      id: 'BK_E2',
      tahap: 'Evaluasi',
      kelompok: 'III. ADMINISTRASI EVALUASI & TINDAK LANJUT',
      aspek: 'Evaluasi Hasil (Laiseg, Laijapen, Laijapang)',
      kategoriDeskripsi: 'Pelaksanaan penilaian segera (Laiseg), jangka pendek (Laijapen), dan jangka panjang (Laijapang).',
      tipePenilaian: 'skor',
      targetMapel: 'BK',
      orderIndex: 102,
    },
    {
      id: 'BK_E3',
      tahap: 'Evaluasi',
      kelompok: 'III. ADMINISTRASI EVALUASI & TINDAK LANJUT',
      aspek: 'Laporan Bulanan/Semesteran',
      kategoriDeskripsi: 'Penyusunan laporan pelaksanaan program BK secara bulanan dan semesteran.',
      tipePenilaian: 'skor',
      targetMapel: 'BK',
      orderIndex: 103,
    },
    {
      id: 'BK_E4',
      tahap: 'Evaluasi',
      kelompok: 'III. ADMINISTRASI EVALUASI & TINDAK LANJUT',
      aspek: 'Analisis Tindak Lanjut',
      kategoriDeskripsi: 'Analisis hasil evaluasi layanan dan penyusunan rencana tindak lanjut perbaikan.',
      tipePenilaian: 'skor',
      targetMapel: 'BK',
      orderIndex: 104,
    },
    {
      id: 'BK_E5',
      tahap: 'Evaluasi',
      kelompok: 'IV. SARANA PRASARANA PENUNJANG',
      aspek: 'Ruang Konseling (Privat)',
      kategoriDeskripsi: 'Kondisi fasilitas: Layak / Tidak (isikan kelayakan dan kondisi ruang konseling privat).',
      tipePenilaian: 'teks',
      targetMapel: 'BK',
      orderIndex: 105,
    },
    {
      id: 'BK_E6',
      tahap: 'Evaluasi',
      kelompok: 'IV. SARANA PRASARANA PENUNJANG',
      aspek: 'Kotak Masalah / Papan Bimbingan',
      kategoriDeskripsi: 'Kondisi fasilitas: Ada / Tidak (isikan ketersediaan kotak masalah atau papan bimbingan).',
      tipePenilaian: 'teks',
      targetMapel: 'BK',
      orderIndex: 106,
    },
    {
      id: 'BK_E7',
      tahap: 'Evaluasi',
      kelompok: 'IV. SARANA PRASARANA PENUNJANG',
      aspek: 'Lemari Arsip (Terkunci/Rahasia)',
      kategoriDeskripsi: 'Kondisi fasilitas: Ada / Tidak (isikan ketersediaan lemari arsip terkunci untuk kerahasiaan data).',
      tipePenilaian: 'teks',
      targetMapel: 'BK',
      orderIndex: 107,
    },
  ];
}

function createDefaultSeedData_() {
  var users = [
    { id: 'U001', username: 'admin', password: '123', email: '', nama: 'Rizky Pratama, S.Kom', role: 'Admin', nip: '19880312 201402 1 002' },
    { id: 'U002', username: 'pengawas', password: '123', email: '', nama: 'Dr. H. Zulkipli, M.Pd', role: 'Pengawas Sekolah', nip: '19731231 200112 1 022' },
    { id: 'U003', username: 'kepsek', password: '123', email: '', nama: 'Emilia Purnawadi, S.E., M.Pd', role: 'Kepala Sekolah', nip: '19780514 200312 2 005' },
    { id: 'U004', username: 'supervisor1', password: '123', email: '', nama: 'Dra. Hj. Ratna Dewi, M.Pd', role: 'Pengawas Supervisi', nip: '19750820 200212 2 003' },
    { id: 'U005', username: 'supervisor2', password: '123', email: '', nama: 'Bambang Sutrisno, S.Pd., M.Si', role: 'Pengawas Supervisi', nip: '19810410 200604 1 011' },
    { id: 'U006', username: 'guru1', password: '123', email: '', nama: 'Ahmad Hidayat, S.Pd', role: 'Guru', nip: '19850115 201001 1 004' },
    { id: 'U007', username: 'guru2', password: '123', email: '', nama: 'Siti Aminah, S.Pd., Gr', role: 'Guru', nip: '19900222 201502 2 003' },
    { id: 'U008', username: 'guru3', password: '123', email: '', nama: 'Dedi Kurniawan, M.Pd', role: 'Guru', nip: '19871109 201403 1 001' },
    { id: 'U009', username: 'guru4', password: '123', email: '', nama: 'Nurul Hidayah, S.Pd', role: 'Guru', nip: '19920618 201903 2 007' },
    { id: 'U010', username: 'guru_bk', password: '123', email: '', nama: 'Rina Marlina, S.Pd', role: 'Guru', nip: '19910315 201803 2 004' },
  ];

  var guru = [
    {
      id: 'G001',
      nip: '19850115 201001 1 004',
      namaGuru: 'Ahmad Hidayat, S.Pd',
      mataPelajaran: 'Matematika',
      tanggalPelaksanaan: '2026-11-10',
      supervisor: 'Dra. Hj. Ratna Dewi, M.Pd',
      nipSupervisor: '19750820 200212 2 003',
      statusBerkas: 'Disetujui',
      kelengkapanBerkas: 'Ada',
      linkDriveBerkas: 'https://drive.google.com/drive/folders/1A2b3C4d5E6fModulMatematika',
      catatanKepsek: 'Modul Ajar, ATP, LKPD, dan instrumen asesmen lengkap sesuai Kurikulum Merdeka.',
      guruEmail: '',
      supervisorEmail: '',
      kepsekEmail: '',
      pengawasEmail: '',
    },
    {
      id: 'G002',
      nip: '19900222 201502 2 003',
      namaGuru: 'Siti Aminah, S.Pd., Gr',
      mataPelajaran: 'Bahasa Indonesia',
      tanggalPelaksanaan: '2026-11-12',
      supervisor: 'Dra. Hj. Ratna Dewi, M.Pd',
      nipSupervisor: '19750820 200212 2 003',
      statusBerkas: 'Disetujui',
      kelengkapanBerkas: 'Ada',
      linkDriveBerkas: 'https://drive.google.com/drive/folders/2B3c4D5e6F7gModulBIndo',
      catatanKepsek: 'Berkas kesiapan disetujui untuk pelaksanaan observasi kelas dan evaluasi.',
      guruEmail: '',
      supervisorEmail: '',
      kepsekEmail: '',
      pengawasEmail: '',
    },
    {
      id: 'G003',
      nip: '19871109 201403 1 001',
      namaGuru: 'Dedi Kurniawan, M.Pd',
      mataPelajaran: 'IPA Terpadu',
      tanggalPelaksanaan: '2026-11-14',
      supervisor: 'Dra. Hj. Ratna Dewi, M.Pd',
      nipSupervisor: '19750820 200212 2 003',
      statusBerkas: 'Belum Dicek',
      kelengkapanBerkas: 'Belum Ada',
      linkDriveBerkas: 'https://drive.google.com/file/d/3C4d5E6f7G8hPerangkatIPA/view',
      catatanKepsek: '',
      guruEmail: '',
      supervisorEmail: '',
      kepsekEmail: '',
      pengawasEmail: '',
    },
    {
      id: 'G004',
      nip: '19920618 201903 2 007',
      namaGuru: 'Nurul Hidayah, S.Pd',
      mataPelajaran: 'Bahasa Inggris',
      tanggalPelaksanaan: '2026-11-16',
      supervisor: 'Bambang Sutrisno, S.Pd., M.Si',
      nipSupervisor: '19810410 200604 1 011',
      statusBerkas: 'Ditolak',
      kelengkapanBerkas: 'Belum Ada',
      linkDriveBerkas: 'https://drive.google.com/file/d/4D5e6F7g8H9iDraftInggris/view',
      catatanKepsek: 'Mohon lengkapi lampiran rubrik asesmen formatif dan LKPD terdiferensiasi pada tautan Drive.',
      guruEmail: '',
      supervisorEmail: '',
      kepsekEmail: '',
      pengawasEmail: '',
    },
    {
      id: 'G005',
      nip: '19910315 201803 2 004',
      namaGuru: 'Rina Marlina, S.Pd',
      mataPelajaran: 'Bimbingan dan Konseling (BK)',
      tanggalPelaksanaan: '2026-11-18',
      supervisor: 'Dra. Hj. Ratna Dewi, M.Pd',
      nipSupervisor: '19750820 200212 2 003',
      statusBerkas: 'Disetujui',
      kelengkapanBerkas: 'Ada',
      linkDriveBerkas: 'https://drive.google.com/drive/folders/5E6f7G8h9I0jAdministrasiBK',
      catatanKepsek: 'Perangkat administrasi BK (AKPD/AUM, Prota, Promes, RPL) disetujui untuk supervisi.',
      guruEmail: '',
      supervisorEmail: '',
      kepsekEmail: '',
      pengawasEmail: '',
    },
  ];

  var aspekUmum = [
    { id: 'P1', tahap: 'Persiapan', kelompok: 'I. IDENTITAS & CAPAIAN', aspek: 'Identitas Modul Ajar / Perangkat Pembelajaran', kategoriDeskripsi: 'Mencantumkan satuan pendidikan, mata pelajaran, fase/kelas, semester, dan alokasi waktu.', tipePenilaian: 'skor', targetMapel: 'Umum', orderIndex: 1 },
    { id: 'P2', tahap: 'Persiapan', kelompok: 'I. IDENTITAS & CAPAIAN', aspek: 'Identifikasi Kesiapan Peserta Didik', kategoriDeskripsi: 'Memetakan kesiapan belajar, minat, dan profil belajar murid berbasis asesmen diagnostik.', tipePenilaian: 'skor', targetMapel: 'Umum', orderIndex: 2 },
    { id: 'P3', tahap: 'Persiapan', kelompok: 'I. IDENTITAS & CAPAIAN', aspek: 'Dimensi Profil Lulusan / Profil Pelajar Pancasila', kategoriDeskripsi: 'Menentukan dimensi karakter yang relevan dan terintegrasi pada tujuan pembelajaran.', tipePenilaian: 'skor', targetMapel: 'Umum', orderIndex: 3 },
    { id: 'P4', tahap: 'Persiapan', kelompok: 'II. DESAIN PEMBELAJARAN', aspek: 'Perumusan CP, TP, dan Alur Tujuan Pembelajaran (ATP)', kategoriDeskripsi: 'Tujuan pembelajaran terukur, selaras dengan Capaian Pembelajaran fase terkini.', tipePenilaian: 'skor', targetMapel: 'Umum', orderIndex: 4 },
    { id: 'P5', tahap: 'Persiapan', kelompok: 'II. DESAIN PEMBELAJARAN', aspek: 'Pemilihan Model & Pedagogi Pembelajaran Mendalam', kategoriDeskripsi: 'Merancang pengalaman belajar memahami, mengaplikasikan, dan merefleksikan materi.', tipePenilaian: 'skor', targetMapel: 'Umum', orderIndex: 5 },
    { id: 'P6', tahap: 'Persiapan', kelompok: 'II. DESAIN PEMBELAJARAN', aspek: 'Langkah Pembelajaran Berdiferensiasi', kategoriDeskripsi: 'Kegiatan pendahuluan, inti, dan penutup mengakomodasi kebutuhan belajar beragam.', tipePenilaian: 'skor', targetMapel: 'Umum', orderIndex: 6 },
    { id: 'P7', tahap: 'Persiapan', kelompok: 'III. ASESMEN & SUMBER BELAJAR', aspek: 'Rancangan Asesmen Awal, Formatif, dan Sumatif', kategoriDeskripsi: 'Tersedia instrumen dan rubrik penilaian autentik yang terukur dan objektif.', tipePenilaian: 'skor', targetMapel: 'Umum', orderIndex: 7 },
    { id: 'P8', tahap: 'Persiapan', kelompok: 'III. ASESMEN & SUMBER BELAJAR', aspek: 'Media Digital, LKPD, dan Bahan Ajar Kontekstual', kategoriDeskripsi: 'Melampirkan LKPD, bahan bacaan relevan, dan pemanfaatan media pembelajaran digital.', tipePenilaian: 'skor', targetMapel: 'Umum', orderIndex: 8 },

    { id: 'L1', tahap: 'Pelaksanaan', kelompok: 'I. KEGIATAN PENDAHULUAN', aspek: 'Pengondisian Kelas & Kesepakatan Belajar', kategoriDeskripsi: 'Menciptakan suasana aman, nyaman, berdoa, dan menegakkan kesepakatan kelas positif.', tipePenilaian: 'skor', targetMapel: 'Umum', orderIndex: 1 },
    { id: 'L2', tahap: 'Pelaksanaan', kelompok: 'I. KEGIATAN PENDAHULUAN', aspek: 'Apersepsi, Motivasi & Penyampaian Tujuan', kategoriDeskripsi: 'Mengaitkan materi dengan pengalaman nyata murid dan menyampaikan tujuan pembelajaran.', tipePenilaian: 'skor', targetMapel: 'Umum', orderIndex: 2 },
    { id: 'L3', tahap: 'Pelaksanaan', kelompok: 'II. KEGIATAN INTI (PEMBELAJARAN MENDALAM)', aspek: 'Penguasaan Materi & Pertanyaan Pemantik Kritis', kategoriDeskripsi: 'Menyajikan materi terstruktur dengan pertanyaan pemantik yang merangsang nalar kritis.', tipePenilaian: 'skor', targetMapel: 'Umum', orderIndex: 3 },
    { id: 'L4', tahap: 'Pelaksanaan', kelompok: 'II. KEGIATAN INTI (PEMBELAJARAN MENDALAM)', aspek: 'Fasilitasi Kolaborasi & Diferensiasi Proses', kategoriDeskripsi: 'Mendampingi kelompok belajar secara adil dan adaptif sesuai kebutuhan murid.', tipePenilaian: 'skor', targetMapel: 'Umum', orderIndex: 4 },
    { id: 'L5', tahap: 'Pelaksanaan', kelompok: 'II. KEGIATAN INTI (PEMBELAJARAN MENDALAM)', aspek: 'Pemanfaatan Teknologi & Media Interaktif', kategoriDeskripsi: 'Menggunakan perangkat digital/alat peraga secara efektif untuk memperjelas konsep.', tipePenilaian: 'skor', targetMapel: 'Umum', orderIndex: 5 },
    { id: 'L6', tahap: 'Pelaksanaan', kelompok: 'II. KEGIATAN INTI (PEMBELAJARAN MENDALAM)', aspek: 'Asesmen Formatif & Umpan Balik Konstruktif', kategoriDeskripsi: 'Memantau proses belajar murid dan memberi umpan balik langsung yang membangun.', tipePenilaian: 'skor', targetMapel: 'Umum', orderIndex: 6 },
    { id: 'L7', tahap: 'Pelaksanaan', kelompok: 'III. KEGIATAN PENUTUP', aspek: 'Penyimpulan Bersama & Refleksi Pembelajaran', kategoriDeskripsi: 'Melibatkan murid menyimpulkan inti materi dan merefleksikan pengalaman belajar.', tipePenilaian: 'skor', targetMapel: 'Umum', orderIndex: 7 },
    { id: 'L8', tahap: 'Pelaksanaan', kelompok: 'III. KEGIATAN PENUTUP', aspek: 'Asesmen Akhir & Tindak Lanjut Pertemuan', kategoriDeskripsi: 'Melakukan pengecekan ketercapaian tujuan dan menginformasikan rencana pertemuan berikutnya.', tipePenilaian: 'skor', targetMapel: 'Umum', orderIndex: 8 },

    { id: 'E1', tahap: 'Evaluasi', kelompok: 'I. ANALISIS HASIL ASESMEN', aspek: 'Rekapitulasi & Analisis Ketuntasan Hasil Belajar', kategoriDeskripsi: 'Dialog refleksi bersama guru mengenai capaian asesmen formatif/sumatif murid.', tipePenilaian: 'teks', targetMapel: 'Umum', orderIndex: 1 },
    { id: 'E2', tahap: 'Evaluasi', kelompok: 'I. ANALISIS HASIL ASESMEN', aspek: 'Identifikasi Butir Soal / Indikator Belum Tuntas', kategoriDeskripsi: 'Dialog mengenai materi esensial yang masih mengalami miskonsepsi atau di bawah KKTP.', tipePenilaian: 'teks', targetMapel: 'Umum', orderIndex: 2 },
    { id: 'E3', tahap: 'Evaluasi', kelompok: 'II. PROGRAM TINDAK LANJUT', aspek: 'Pelaksanaan Program Remedial Terstruktur', kategoriDeskripsi: 'Kesepakatan strategi pendampingan ulang bagi murid yang belum mencapai tujuan.', tipePenilaian: 'teks', targetMapel: 'Umum', orderIndex: 3 },
    { id: 'E4', tahap: 'Evaluasi', kelompok: 'II. PROGRAM TINDAK LANJUT', aspek: 'Pelaksanaan Program Pengayaan & Tantangan Lanjut', kategoriDeskripsi: 'Umpan balik atas tugas pengayaan kontekstual bagi murid yang melampaui capaian.', tipePenilaian: 'teks', targetMapel: 'Umum', orderIndex: 4 },
    { id: 'E5', tahap: 'Evaluasi', kelompok: 'III. REFLEKSI & PELAPORAN', aspek: 'Refleksi Profesional Guru atas Efektivitas Mengajar', kategoriDeskripsi: 'Hasil dialog kekuatan mengajar, kendala kelas, dan perbaikan strategi pedagogis.', tipePenilaian: 'teks', targetMapel: 'Umum', orderIndex: 5 },
    { id: 'E6', tahap: 'Evaluasi', kelompok: 'III. REFLEKSI & PELAPORAN', aspek: 'Dokumentasi Portofolio & Pelaporan Berkala', kategoriDeskripsi: 'Catatan kelengkapan portofolio murid dan penyampaian progres ke orang tua/sekolah.', tipePenilaian: 'teks', targetMapel: 'Umum', orderIndex: 6 },
  ];

  var aspek = aspekUmum.concat(getDefaultBkAllAspek_());

  var penilaian = [
    { id: 'G001_P1', guruId: 'G001', nipGuru: '19850115 201001 1 004', idAspek: 'P1', tahap: 'Persiapan', skor: 4, teksRefleksi: '', catatan: 'Identitas modul ajar sangat lengkap.', penilai: 'Dra. Hj. Ratna Dewi, M.Pd', updatedAt: '2026-11-10' },
    { id: 'G001_P2', guruId: 'G001', nipGuru: '19850115 201001 1 004', idAspek: 'P2', tahap: 'Persiapan', skor: 4, teksRefleksi: '', catatan: 'Pemetaan asesmen diagnostik awal tersedia.', penilai: 'Dra. Hj. Ratna Dewi, M.Pd', updatedAt: '2026-11-10' },
    { id: 'G001_P3', guruId: 'G001', nipGuru: '19850115 201001 1 004', idAspek: 'P3', tahap: 'Persiapan', skor: 3, teksRefleksi: '', catatan: 'Dimensi bernalar kritis terintegrasi baik.', penilai: 'Dra. Hj. Ratna Dewi, M.Pd', updatedAt: '2026-11-10' },
    { id: 'G001_P4', guruId: 'G001', nipGuru: '19850115 201001 1 004', idAspek: 'P4', tahap: 'Persiapan', skor: 4, teksRefleksi: '', catatan: 'ATP runtut sesuai fase D.', penilai: 'Dra. Hj. Ratna Dewi, M.Pd', updatedAt: '2026-11-10' },
    { id: 'G001_P5', guruId: 'G001', nipGuru: '19850115 201001 1 004', idAspek: 'P5', tahap: 'Persiapan', skor: 4, teksRefleksi: '', catatan: 'Model problem-based learning tergambar jelas.', penilai: 'Dra. Hj. Ratna Dewi, M.Pd', updatedAt: '2026-11-10' },
    { id: 'G001_P6', guruId: 'G001', nipGuru: '19850115 201001 1 004', idAspek: 'P6', tahap: 'Persiapan', skor: 3, teksRefleksi: '', catatan: 'Diferensiasi konten sudah disiapkan.', penilai: 'Dra. Hj. Ratna Dewi, M.Pd', updatedAt: '2026-11-10' },
    { id: 'G001_P7', guruId: 'G001', nipGuru: '19850115 201001 1 004', idAspek: 'P7', tahap: 'Persiapan', skor: 4, teksRefleksi: '', catatan: 'Rubrik penilaian sangat terukur.', penilai: 'Dra. Hj. Ratna Dewi, M.Pd', updatedAt: '2026-11-10' },
    { id: 'G001_P8', guruId: 'G001', nipGuru: '19850115 201001 1 004', idAspek: 'P8', tahap: 'Persiapan', skor: 4, teksRefleksi: '', catatan: 'LKPD interaktif GeoGebra terlampir.', penilai: 'Dra. Hj. Ratna Dewi, M.Pd', updatedAt: '2026-11-10' },

    { id: 'G001_L1', guruId: 'G001', nipGuru: '19850115 201001 1 004', idAspek: 'L1', tahap: 'Pelaksanaan', skor: 4, teksRefleksi: '', catatan: 'Kelas kondusif dan interaktif.', penilai: 'Dra. Hj. Ratna Dewi, M.Pd', updatedAt: '2026-11-10' },
    { id: 'G001_L2', guruId: 'G001', nipGuru: '19850115 201001 1 004', idAspek: 'L2', tahap: 'Pelaksanaan', skor: 4, teksRefleksi: '', catatan: 'Apersepsi kontekstual menarik perhatian siswa.', penilai: 'Dra. Hj. Ratna Dewi, M.Pd', updatedAt: '2026-11-10' },
    { id: 'G001_L3', guruId: 'G001', nipGuru: '19850115 201001 1 004', idAspek: 'L3', tahap: 'Pelaksanaan', skor: 4, teksRefleksi: '', catatan: 'Pertanyaan pemantik memicu diskusi aktif.', penilai: 'Dra. Hj. Ratna Dewi, M.Pd', updatedAt: '2026-11-10' },
    { id: 'G001_L4', guruId: 'G001', nipGuru: '19850115 201001 1 004', idAspek: 'L4', tahap: 'Pelaksanaan', skor: 3, teksRefleksi: '', catatan: 'Pendampingan kelompok merata.', penilai: 'Dra. Hj. Ratna Dewi, M.Pd', updatedAt: '2026-11-10' },
    { id: 'G001_L5', guruId: 'G001', nipGuru: '19850115 201001 1 004', idAspek: 'L5', tahap: 'Pelaksanaan', skor: 4, teksRefleksi: '', catatan: 'Visualisasi grafik digital sangat membantu.', penilai: 'Dra. Hj. Ratna Dewi, M.Pd', updatedAt: '2026-11-10' },
    { id: 'G001_L6', guruId: 'G001', nipGuru: '19850115 201001 1 004', idAspek: 'L6', tahap: 'Pelaksanaan', skor: 3, teksRefleksi: '', catatan: 'Umpan balik lisan diberikan tepat waktu.', penilai: 'Dra. Hj. Ratna Dewi, M.Pd', updatedAt: '2026-11-10' },
    { id: 'G001_L7', guruId: 'G001', nipGuru: '19850115 201001 1 004', idAspek: 'L7', tahap: 'Pelaksanaan', skor: 4, teksRefleksi: '', catatan: 'Siswa menyimpulkan materi dengan percaya diri.', penilai: 'Dra. Hj. Ratna Dewi, M.Pd', updatedAt: '2026-11-10' },
    { id: 'G001_L8', guruId: 'G001', nipGuru: '19850115 201001 1 004', idAspek: 'L8', tahap: 'Pelaksanaan', skor: 4, teksRefleksi: '', catatan: 'Kuis formatif akhir berjalan tertib.', penilai: 'Dra. Hj. Ratna Dewi, M.Pd', updatedAt: '2026-11-10' },

    { id: 'G001_E1', guruId: 'G001', nipGuru: '19850115 201001 1 004', idAspek: 'E1', tahap: 'Evaluasi', skor: '', teksRefleksi: 'Guru memaparkan 87% murid telah mencapai KKTP pada materi persamaan linear; 4 murid masih perlu pendampingan pemodelan soal cerita.', catatan: 'Analisis per TP sudah terdokumentasi rapi.', penilai: 'Dra. Hj. Ratna Dewi, M.Pd', updatedAt: '2026-11-11' },
    { id: 'G001_E2', guruId: 'G001', nipGuru: '19850115 201001 1 004', idAspek: 'E2', tahap: 'Evaluasi', skor: '', teksRefleksi: 'Disepakati bersama bahwa miskonsepsi terbesar terjadi saat menerjemahkan kalimat perbandingan ke bentuk aljabar.', catatan: 'Perlu variasi latihan kontekstual.', penilai: 'Dra. Hj. Ratna Dewi, M.Pd', updatedAt: '2026-11-11' },
    { id: 'G001_E3', guruId: 'G001', nipGuru: '19850115 201001 1 004', idAspek: 'E3', tahap: 'Evaluasi', skor: '', teksRefleksi: 'Guru menjadwalkan klinik belajar kelompok kecil 30 menit pasca jam pelajaran menggunakan alat peraga kartu aljabar.', catatan: 'Jadwal remedial sudah dikomunikasikan.', penilai: 'Dra. Hj. Ratna Dewi, M.Pd', updatedAt: '2026-11-11' },
    { id: 'G001_E4', guruId: 'G001', nipGuru: '19850115 201001 1 004', idAspek: 'E4', tahap: 'Evaluasi', skor: '', teksRefleksi: 'Murid yang melampaui capaian diberi tantangan proyek eksplorasi tarif transportasi lokal dengan GeoGebra.', catatan: 'Sangat kontekstual.', penilai: 'Dra. Hj. Ratna Dewi, M.Pd', updatedAt: '2026-11-11' },
    { id: 'G001_E5', guruId: 'G001', nipGuru: '19850115 201001 1 004', idAspek: 'E5', tahap: 'Evaluasi', skor: '', teksRefleksi: 'Guru merefleksikan perlunya pembagian peran moderator dan pencatat pada diskusi kelompok agar 2 siswa pasif lebih terlibat.', catatan: 'Komitmen perbaikan jelas.', penilai: 'Dra. Hj. Ratna Dewi, M.Pd', updatedAt: '2026-11-11' },
    { id: 'G001_E6', guruId: 'G001', nipGuru: '19850115 201001 1 004', idAspek: 'E6', tahap: 'Evaluasi', skor: '', teksRefleksi: 'Portofolio hasil LKPD digital sudah tersimpan di folder kelas dan rekap nilai formatif siap dilaporkan ke wali kelas.', catatan: 'Tertib administrasi.', penilai: 'Dra. Hj. Ratna Dewi, M.Pd', updatedAt: '2026-11-11' },

    { id: 'G002_P1', guruId: 'G002', nipGuru: '19900222 201502 2 003', idAspek: 'P1', tahap: 'Persiapan', skor: 4, teksRefleksi: '', catatan: 'Lengkap.', penilai: 'Dra. Hj. Ratna Dewi, M.Pd', updatedAt: '2026-11-12' },
    { id: 'G002_P2', guruId: 'G002', nipGuru: '19900222 201502 2 003', idAspek: 'P2', tahap: 'Persiapan', skor: 3, teksRefleksi: '', catatan: 'Sudah ada pemetaan gaya belajar.', penilai: 'Dra. Hj. Ratna Dewi, M.Pd', updatedAt: '2026-11-12' },
    { id: 'G002_P3', guruId: 'G002', nipGuru: '19900222 201502 2 003', idAspek: 'P3', tahap: 'Persiapan', skor: 3, teksRefleksi: '', catatan: 'Baik.', penilai: 'Dra. Hj. Ratna Dewi, M.Pd', updatedAt: '2026-11-12' },
    { id: 'G002_P4', guruId: 'G002', nipGuru: '19900222 201502 2 003', idAspek: 'P4', tahap: 'Persiapan', skor: 3, teksRefleksi: '', catatan: 'Tujuan terukur.', penilai: 'Dra. Hj. Ratna Dewi, M.Pd', updatedAt: '2026-11-12' },
    { id: 'G002_P5', guruId: 'G002', nipGuru: '19900222 201502 2 003', idAspek: 'P5', tahap: 'Persiapan', skor: 4, teksRefleksi: '', catatan: 'Menggunakan pendekatan teks autentik.', penilai: 'Dra. Hj. Ratna Dewi, M.Pd', updatedAt: '2026-11-12' },
    { id: 'G002_P6', guruId: 'G002', nipGuru: '19900222 201502 2 003', idAspek: 'P6', tahap: 'Persiapan', skor: 3, teksRefleksi: '', catatan: 'Cukup terstruktur.', penilai: 'Dra. Hj. Ratna Dewi, M.Pd', updatedAt: '2026-11-12' },
    { id: 'G002_P7', guruId: 'G002', nipGuru: '19900222 201502 2 003', idAspek: 'P7', tahap: 'Persiapan', skor: 3, teksRefleksi: '', catatan: 'Rubrik teks persuasi tersedia.', penilai: 'Dra. Hj. Ratna Dewi, M.Pd', updatedAt: '2026-11-12' },
    { id: 'G002_P8', guruId: 'G002', nipGuru: '19900222 201502 2 003', idAspek: 'P8', tahap: 'Persiapan', skor: 3, teksRefleksi: '', catatan: 'LKPD cetak dan digital siap.', penilai: 'Dra. Hj. Ratna Dewi, M.Pd', updatedAt: '2026-11-12' },

    { id: 'G002_L1', guruId: 'G002', nipGuru: '19900222 201502 2 003', idAspek: 'L1', tahap: 'Pelaksanaan', skor: 4, teksRefleksi: '', catatan: 'Kesepakatan kelas berjalan baik.', penilai: 'Dra. Hj. Ratna Dewi, M.Pd', updatedAt: '2026-11-12' },
    { id: 'G002_L2', guruId: 'G002', nipGuru: '19900222 201502 2 003', idAspek: 'L2', tahap: 'Pelaksanaan', skor: 3, teksRefleksi: '', catatan: 'Apersepsi baik.', penilai: 'Dra. Hj. Ratna Dewi, M.Pd', updatedAt: '2026-11-12' },
    { id: 'G002_L3', guruId: 'G002', nipGuru: '19900222 201502 2 003', idAspek: 'L3', tahap: 'Pelaksanaan', skor: 3, teksRefleksi: '', catatan: 'Diskusi teks hidup.', penilai: 'Dra. Hj. Ratna Dewi, M.Pd', updatedAt: '2026-11-12' },
    { id: 'G002_L4', guruId: 'G002', nipGuru: '19900222 201502 2 003', idAspek: 'L4', tahap: 'Pelaksanaan', skor: 3, teksRefleksi: '', catatan: 'Perlu manajemen waktu kelompok.', penilai: 'Dra. Hj. Ratna Dewi, M.Pd', updatedAt: '2026-11-12' },
    { id: 'G002_L5', guruId: 'G002', nipGuru: '19900222 201502 2 003', idAspek: 'L5', tahap: 'Pelaksanaan', skor: 4, teksRefleksi: '', catatan: 'Slide presentasi interaktif.', penilai: 'Dra. Hj. Ratna Dewi, M.Pd', updatedAt: '2026-11-12' },
    { id: 'G002_L6', guruId: 'G002', nipGuru: '19900222 201502 2 003', idAspek: 'L6', tahap: 'Pelaksanaan', skor: 3, teksRefleksi: '', catatan: 'Umpan balik cukup jelas.', penilai: 'Dra. Hj. Ratna Dewi, M.Pd', updatedAt: '2026-11-12' },
    { id: 'G002_L7', guruId: 'G002', nipGuru: '19900222 201502 2 003', idAspek: 'L7', tahap: 'Pelaksanaan', skor: 3, teksRefleksi: '', catatan: 'Refleksi tertulis dilakukan.', penilai: 'Dra. Hj. Ratna Dewi, M.Pd', updatedAt: '2026-11-12' },
    { id: 'G002_L8', guruId: 'G002', nipGuru: '19900222 201502 2 003', idAspek: 'L8', tahap: 'Pelaksanaan', skor: 3, teksRefleksi: '', catatan: 'Penutup tertib.', penilai: 'Dra. Hj. Ratna Dewi, M.Pd', updatedAt: '2026-11-12' },
  ];

  var catatanTahap = [
    {
      id: 'G001_Persiapan',
      guruId: 'G001',
      nipGuru: '19850115 201001 1 004',
      tahap: 'Persiapan',
      masalah: 'Alokasi waktu untuk diferensiasi produk pada modul ajar masih terlalu padat dalam 2 JP.',
      pemecahan: 'Memecah aktivitas eksplorasi proyek mini ke dalam LKPD terstruktur berbasis kelompok.',
      rencanaTL: 'Guru menyempurnakan pembagian alokasi waktu pada pertemuan siklus berikutnya.',
      penilai: 'Dra. Hj. Ratna Dewi, M.Pd',
      updatedAt: '2026-11-10',
    },
    {
      id: 'G001_Pelaksanaan',
      guruId: 'G001',
      nipGuru: '19850115 201001 1 004',
      tahap: 'Pelaksanaan',
      masalah: 'Dua siswa di barisan belakang masih pasif saat sesi presentasi kelompok.',
      pemecahan: 'Menerapkan pembagian peran spesifik (moderator, penyaji, penanya) di tiap kelompok.',
      rencanaTL: 'Pendampingan variasi teknik bertanya terbuka pada observasi lanjutan.',
      penilai: 'Dra. Hj. Ratna Dewi, M.Pd',
      updatedAt: '2026-11-10',
    },
    {
      id: 'G001_Evaluasi',
      guruId: 'G001',
      nipGuru: '19850115 201001 1 004',
      tahap: 'Evaluasi',
      masalah: '4 siswa masih mengalami kesulitan pada soal pemecahan masalah berbasis cerita kontekstual.',
      pemecahan: 'Menyusun modul remedial bertahap dengan visualisasi model konkret.',
      rencanaTL: 'Melaksanakan klinik belajar 30 menit pasca jam pelajaran dan melaporkan perkembangan.',
      penilai: 'Dra. Hj. Ratna Dewi, M.Pd',
      updatedAt: '2026-11-11',
    },
    {
      id: 'G002_Persiapan',
      guruId: 'G002',
      nipGuru: '19900222 201502 2 003',
      tahap: 'Persiapan',
      masalah: 'Rubrik penilaian keterampilan menulis belum mencantumkan indikator kelengkapan argumen.',
      pemecahan: 'Menambahkan deskriptor skor 1-4 khusus aspek kohesi dan bukti argumen.',
      rencanaTL: 'Revisi rubrik diunggah ulang ke folder perangkat Drive.',
      penilai: 'Dra. Hj. Ratna Dewi, M.Pd',
      updatedAt: '2026-11-12',
    },
    {
      id: 'G002_Pelaksanaan',
      guruId: 'G002',
      nipGuru: '19900222 201502 2 003',
      tahap: 'Pelaksanaan',
      masalah: 'Waktu diskusi kelompok melebihi alokasi 10 menit sehingga sesi refleksi terburu-buru.',
      pemecahan: 'Menggunakan pengatur waktu proyektor agar transisi antar fase lebih disiplin.',
      rencanaTL: 'Menerapkan timer kelas dan lembar refleksi singkat digital.',
      penilai: 'Dra. Hj. Ratna Dewi, M.Pd',
      updatedAt: '2026-11-12',
    },
  ];

  var pengaturan = {
    namaSekolah: 'SMP NEGERI 4 KOTA JAMBI',
    dinasPendidikan: 'DINAS PENDIDIKAN DAN KEBUDAYAAN KOTA JAMBI',
    pemerintahDaerah: 'PEMERINTAH KOTA JAMBI',
    alamatSekolah: 'Jalan Kopral Toekini RT.16 No.28 Kel. Lingkar Selatan Kec. Paal Merah',
    tahunPelajaran: '2026/2027',
    semester: 'GANJIL',
    namaKepalaSekolah: 'Emilia Purnawadi, S.E., M.Pd',
    nipKepalaSekolah: '19780514 200312 2 005',
    namaPengawasSekolah: 'Dr. H. Zulkipli, M.Pd',
    nipPengawas: '19731231 200112 1 022',
    tanggalPelaksanaanUmum: '2026-11-10',
    tempatTanggalCetak: 'Kota Jambi, 13 November 2026',
    logoKiri: '',
    logoKanan: '',
  };

  return {
    users: users,
    guru: guru,
    poinBerkas: getDefaultPoinBerkas_(),
    aspek: aspek,
    penilaian: penilaian,
    catatanTahap: catatanTahap,
    pengaturan: pengaturan,
  };
}
