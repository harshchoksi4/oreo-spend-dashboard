/**
 * Oreo Spend Dashboard — Google Apps Script backend
 * Bound to the Oreo v2 sheet COPY only. Deploy as Web App (Execute as Me, Anyone).
 * Do NOT attach this to the original sheet.
 *
 * Script property required for writes: OREO_TOKEN
 *
 * Transactions columns (A–K):
 * Date | Year | Merchant / Store | Description | Category | Subcategory |
 * One-time vs Recurring | Cat | Payment Method | Amount | Notes
 *
 * Optional schema enhancements on v2: Timestamp Added, Entered By.
 * Entered By is accepted from the client and prefixed into Notes so the
 * existing 11-column layout stays compatible.
 */

var SHEET_NAME = 'Transactions';
var HEADERS = [
  'Date',
  'Year',
  'Merchant / Store',
  'Description',
  'Category',
  'Subcategory',
  'One-time vs Recurring',
  'Cat',
  'Payment Method',
  'Amount',
  'Notes'
];

function doGet(e) {
  try {
    return jsonResponse_(buildDashboardPayload());
  } catch (err) {
    return jsonResponse_({ error: String(err && err.message ? err.message : err) });
  }
}

function doPost(e) {
  try {
    var body = parseBody_(e);
    if (!requireToken_(e, body)) {
      return jsonResponse_({ error: 'Unauthorized: missing or invalid token (send X-Oreo-Token or body.token)' });
    }
    var result = appendTransaction_(body);
    return jsonResponse_({ ok: true, row: result });
  } catch (err) {
    return jsonResponse_({ error: String(err && err.message ? err.message : err) });
  }
}

function doOptions(e) {
  return ContentService.createTextOutput('').setMimeType(ContentService.MimeType.TEXT);
}

function parseBody_(e) {
  if (e && e.postData && e.postData.contents) {
    return JSON.parse(e.postData.contents);
  }
  return {};
}

function requireToken_(e, body) {
  var expected = PropertiesService.getScriptProperties().getProperty('OREO_TOKEN');
  if (!expected) {
    return false; // fail closed if token not configured
  }
  var provided = '';
  if (body && body.token) {
    provided = String(body.token);
  }
  if (e && e.parameter && e.parameter.token) {
    provided = String(e.parameter.token);
  }
  // Custom headers are often stripped by Apps Script web-app redirects;
  // body.token is the reliable path. Still check headers if present.
  if (e && e.headers) {
    var h = e.headers['X-Oreo-Token'] || e.headers['x-oreo-token'];
    if (h) provided = String(h);
  }
  return provided && provided === expected;
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.getSheets()[0];
  }
  return sheet;
}

function buildDashboardPayload() {
  var rows = readTransactions_();
  var total = 0;
  var thisMonth = 0;
  var byCategory = {};
  var byMonth = {};
  var byMerchant = {};
  var byRecurring = {};

  var now = new Date();
  var ymNow = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM');

  rows.forEach(function (r) {
    var amt = toNumber_(r.amount);
    total += amt;

    var cat = r.category || 'Uncategorized';
    byCategory[cat] = (byCategory[cat] || 0) + amt;

    var monthKey = monthKeyFromDate_(r.date);
    if (monthKey) {
      byMonth[monthKey] = (byMonth[monthKey] || 0) + amt;
      if (monthKey === ymNow) thisMonth += amt;
    }

    var merch = r.merchant || 'Unknown';
    byMerchant[merch] = (byMerchant[merch] || 0) + amt;

    var rec = r.recurring || 'One-time';
    byRecurring[rec] = (byRecurring[rec] || 0) + amt;
  });

  var count = rows.length;
  return {
    transactions: rows,
    kpis: {
      total: round2_(total),
      thisMonth: round2_(thisMonth),
      count: count,
      average: count ? round2_(total / count) : 0
    },
    byCategory: byCategory,
    byMonth: byMonth,
    byMerchant: byMerchant,
    byRecurring: byRecurring
  };
}

function readTransactions_() {
  var sheet = getSheet_();
  var values = sheet.getDataRange().getValues();
  if (!values || values.length < 2) return [];

  var headers = values[0].map(function (h) { return String(h || '').trim(); });
  var col = mapColumns_(headers);

  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (isEmptyRow_(row)) continue;
    var dateVal = row[col.date];
    var dateStr = formatDateIso_(dateVal);
    out.push({
      date: dateStr,
      year: row[col.year] != null && row[col.year] !== '' ? row[col.year] : (dateStr ? dateStr.slice(0, 4) : ''),
      merchant: String(row[col.merchant] || ''),
      description: String(row[col.description] || ''),
      category: String(row[col.category] || ''),
      subcategory: String(row[col.subcategory] || ''),
      recurring: String(row[col.recurring] || ''),
      cat: String(row[col.cat] || ''),
      paymentMethod: String(row[col.payment] || ''),
      amount: toNumber_(row[col.amount]),
      notes: String(row[col.notes] || '')
    });
  }
  return out;
}

function mapColumns_(headers) {
  function idx(names, fallback) {
    for (var i = 0; i < names.length; i++) {
      var n = names[i].toLowerCase();
      for (var j = 0; j < headers.length; j++) {
        if (headers[j].toLowerCase() === n) return j;
      }
    }
    return fallback;
  }
  return {
    date: idx(['Date'], 0),
    year: idx(['Year'], 1),
    merchant: idx(['Merchant / Store', 'Merchant', 'Store'], 2),
    description: idx(['Description'], 3),
    category: idx(['Category'], 4),
    subcategory: idx(['Subcategory'], 5),
    recurring: idx(['One-time vs Recurring', 'Recurring'], 6),
    cat: idx(['Cat'], 7),
    payment: idx(['Payment Method', 'Payment'], 8),
    amount: idx(['Amount'], 9),
    notes: idx(['Notes'], 10)
  };
}

function appendTransaction_(body) {
  if (!body) throw new Error('Empty body');
  var sheet = getSheet_();
  ensureHeaders_(sheet);

  var dateStr = body.date ? String(body.date).slice(0, 10) : '';
  if (!dateStr) throw new Error('Date is required');
  var year = body.year || Number(dateStr.slice(0, 4));
  var merchant = String(body.merchant || '').trim();
  if (!merchant) throw new Error('Merchant is required');
  var amount = toNumber_(body.amount);
  var category = String(body.category || '').trim();
  if (!category) throw new Error('Category is required');

  var notes = String(body.notes || '');
  if (body.enteredBy && String(body.enteredBy).trim()) {
    var tag = '[Entered by: ' + String(body.enteredBy).trim() + ']';
    if (notes.indexOf(tag) === -1) {
      notes = notes ? (tag + ' ' + notes) : tag;
    }
  }

  var row = [
    dateStr,
    year,
    merchant,
    String(body.description || ''),
    category,
    String(body.subcategory || ''),
    String(body.recurring || 'One-time'),
    String(body.cat || 'Oreo'),
    String(body.paymentMethod || 'Card'),
    amount,
    notes
  ];

  sheet.appendRow(row);
  return {
    date: dateStr,
    year: year,
    merchant: merchant,
    category: category,
    amount: amount
  };
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
  }
}

function isEmptyRow_(row) {
  for (var i = 0; i < row.length; i++) {
    if (row[i] !== '' && row[i] != null) return false;
  }
  return true;
}

function toNumber_(v) {
  if (typeof v === 'number') return v;
  if (v == null || v === '') return 0;
  var s = String(v).replace(/[$,\s]/g, '');
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function round2_(n) {
  return Math.round(n * 100) / 100;
}

function formatDateIso_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = String(v || '');
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

function monthKeyFromDate_(dateStr) {
  if (!dateStr) return '';
  var s = String(dateStr);
  if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7);
  return '';
}

function jsonResponse_(obj) {
  // Simple JSON responses work cross-origin for GET.
  // Client POSTs as text/plain to avoid CORS preflight; token travels in JSON body.
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
