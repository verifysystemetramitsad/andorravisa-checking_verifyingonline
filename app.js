/**
 * Check Status Portal
 *
 * HOW TO ADD NEW RECORDS
 * ----------------------
 * Edit documents.json and add a new object:
 *
 *   {
 *     "id": "YOUR_UNIQUE_ID",
 *     "name": "FULL NAME",
 *     "nationality": "COUNTRY",
 *     "status": ["Line 1", "Line 2", "Line 3"]
 *   }
 *
 * Each person gets their own URL:
 *   https://yoursite.com/?id=YOUR_UNIQUE_ID
 *
 * GOOGLE SHEETS (optional)
 * ------------------------
 * Set DATA_SOURCE to "sheets" and add your Sheet ID.
 * Columns: id | name | nationality | status
 * Put multiple status lines in one cell, separated by | (pipe).
 */
const CONFIG = {
  DATA_SOURCE: "json",
  JSON_URL: "documents.json",
  SHEET_ID: "YOUR_GOOGLE_SHEET_ID_HERE",
  SHEET_NAME: "Sheet1",
};

const CORE_FIELDS = [
  { key: "id", label: "Application ID" },
  { key: "name", label: "Name" },
  { key: "nationality", label: "Nationality" },
  { key: "status", label: "Status", multiline: true },
];

let recordsCache = null;
let currentId = null;

const els = {
  loading: document.getElementById("loading"),
  content: document.getElementById("content"),
  statusList: document.getElementById("status-list"),
  refreshBtn: document.getElementById("refresh-btn"),
  closeBtn: document.getElementById("close-btn"),
};

document.addEventListener("DOMContentLoaded", init);

function init() {
  els.refreshBtn.addEventListener("click", onRefresh);
  els.closeBtn.addEventListener("click", () => window.history.back());

  currentId = getIdFromUrl();
  if (currentId) {
    loadAndDisplay(currentId);
  } else {
    showNotFound(null);
  }
}

function getIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  return id ? id.trim() : null;
}

async function onRefresh() {
  recordsCache = null;
  currentId = getIdFromUrl();
  if (currentId) {
    await loadAndDisplay(currentId);
  }
}

async function loadAndDisplay(id) {
  showLoading();

  try {
    const records = await loadRecords();
    const record = records.find((r) => String(r.id) === String(id));
    if (record) {
      renderRecord(record);
    } else {
      showNotFound(id);
    }
  } catch (error) {
    console.error("Failed to load records:", error);
    showNotFound(id);
  }
}

async function loadRecords() {
  if (recordsCache) return recordsCache;

  if (CONFIG.DATA_SOURCE === "sheets") {
    recordsCache = await loadFromGoogleSheets();
  } else {
    recordsCache = await loadFromJson();
  }

  return recordsCache.map(normalizeRecord);
}

async function loadFromJson() {
  const response = await fetch(CONFIG.JSON_URL + "?t=" + Date.now());
  if (!response.ok) throw new Error("Could not load documents.json");
  return response.json();
}

async function loadFromGoogleSheets() {
  const url =
    `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq` +
    `?tqx=out:json&sheet=${encodeURIComponent(CONFIG.SHEET_NAME)}`;

  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not load Google Sheet");

  const text = await response.text();
  const json = JSON.parse(text.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/, "$1"));
  const rows = json.table.rows;
  if (!rows || rows.length < 2) return [];

  const headers = json.table.cols.map((col) =>
    col.label.toLowerCase().replace(/\s+/g, "")
  );

  return rows.slice(1).map((row) => {
    const raw = {};
    row.c.forEach((cell, i) => {
      const key = headers[i];
      if (!key) return;
      raw[key] = cell && cell.v != null ? String(cell.v) : "";
    });
    return raw;
  }).filter((r) => r.id);
}

function normalizeRecord(raw) {
  const get = (...keys) => {
    for (const k of keys) {
      if (raw[k] !== undefined && raw[k] !== "") return raw[k];
      const lower = k.toLowerCase();
      if (raw[lower] !== undefined && raw[lower] !== "") return raw[lower];
    }
    return "";
  };

  const record = {
    id: get("id", "applicationid"),
    name: get("name"),
    nationality: get("nationality"),
    status: parseStatus(get("status")),
    extra: [],
  };

  if (Array.isArray(raw.extra)) {
    record.extra = raw.extra;
  }

  return record;
}

function parseStatus(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  if (typeof value === "string" && value.includes("|")) {
    return value.split("|").map((s) => s.trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.includes("\n")) {
    return value.split("\n").map((s) => s.trim()).filter(Boolean);
  }
  return [String(value)];
}

function showLoading() {
  els.loading.classList.remove("hidden");
  els.content.classList.add("hidden");
}

function renderRecord(record) {
  const rows = buildRows(record);
  els.statusList.innerHTML = rows;
  els.loading.classList.add("hidden");
  els.content.classList.remove("hidden");
}

function showNotFound(id) {
  const rows = [
    rowHtml("Application ID", id || "—", false),
    rowHtml("Name", "—", false),
    rowHtml("Nationality", "—", false),
    rowHtml("Status", ["Invalid Application ID.", "No matching record was found."], true, true),
  ].join("");

  els.statusList.innerHTML = rows;
  els.loading.classList.add("hidden");
  els.content.classList.remove("hidden");
}

function buildRows(record) {
  const html = [];

  for (const field of CORE_FIELDS) {
    const value = record[field.key];
    if (field.multiline) {
      html.push(rowHtml(field.label, value, true));
    } else {
      html.push(rowHtml(field.label, value || "—", false));
    }
  }

  if (record.extra && record.extra.length) {
    for (const item of record.extra) {
      html.push(rowHtml(item.label, item.value, false));
    }
  }

  return html.join("");
}

function rowHtml(label, value, multiline, isError) {
  let valueHtml;

  if (multiline && Array.isArray(value)) {
    const lines = value.map((line) => `<span>${escapeHtml(line)}</span>`).join("");
    valueHtml = `<dd class="status-value multiline${isError ? " not-found" : ""}">${lines}</dd>`;
  } else {
    valueHtml = `<dd class="status-value${isError ? " not-found" : ""}">${escapeHtml(String(value))}</dd>`;
  }

  return `<div class="status-row"><dt class="status-label">${escapeHtml(label)}</dt>${valueHtml}</div>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
