/**
 * Oreo Spend Dashboard — client
 * Fetches KPIs/charts from Apps Script; POSTs new expenses with session token.
 */
(function () {
  "use strict";

  const TOKEN_KEY = "oreo_token";
  const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

  const charts = {
    category: null,
    month: null,
    merchant: null,
    recurring: null,
  };

  let allTransactions = [];

  const palette = [
    "#e8a87c", "#7dcea0", "#e8a0a0", "#a0c4e8", "#d4a5ff",
    "#f5d76e", "#95a5a6", "#48c9b0", "#f1948a", "#85c1e9",
  ];

  function $(id) { return document.getElementById(id); }

  function getConfig() {
    return window.OREO_CONFIG || { APPS_SCRIPT_URL: "", OREO_TOKEN: "" };
  }

  function getScriptUrl() {
    return (getConfig().APPS_SCRIPT_URL || "").trim();
  }

  function getWriteToken() {
    const stored = sessionStorage.getItem(TOKEN_KEY);
    if (stored) return stored;
    const fromConfig = (getConfig().OREO_TOKEN || "").trim();
    if (fromConfig) {
      sessionStorage.setItem(TOKEN_KEY, fromConfig);
      return fromConfig;
    }
    const prompted = window.prompt("Enter Oreo write token (OREO_TOKEN from Apps Script properties):");
    if (prompted && prompted.trim()) {
      sessionStorage.setItem(TOKEN_KEY, prompted.trim());
      return prompted.trim();
    }
    return "";
  }

  function showBanner(el, msg) {
    if (!el) return;
    if (!msg) {
      el.classList.add("hidden");
      el.textContent = "";
      return;
    }
    el.textContent = msg;
    el.classList.remove("hidden");
  }

  function flashSuccess(msg) {
    const el = $("successBanner");
    showBanner(el, msg);
    setTimeout(() => showBanner(el, ""), 4000);
  }

  function destroyChart(key) {
    if (charts[key]) {
      charts[key].destroy();
      charts[key] = null;
    }
  }

  function money(n) {
    const v = Number(n) || 0;
    return currency.format(v);
  }

  function parseAmount(raw) {
    if (typeof raw === "number") return raw;
    if (raw == null) return 0;
    const s = String(raw).replace(/[$,\s]/g, "");
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  }

  async function fetchData() {
    const url = getScriptUrl();
    if (!url) {
      $("setupBanner").classList.remove("hidden");
      $("txnBody").innerHTML = '<tr class="empty-row"><td colspan="5">Configure APPS_SCRIPT_URL to load data.</td></tr>';
      return;
    }
    $("setupBanner").classList.add("hidden");
    showBanner($("errorBanner"), "");

    try {
      const res = await fetch(url, { method: "GET", redirect: "follow" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      renderAll(data);
    } catch (err) {
      console.error(err);
      showBanner($("errorBanner"), "Could not load data: " + (err.message || err));
      $("txnBody").innerHTML = '<tr class="empty-row"><td colspan="5">Failed to load.</td></tr>';
    }
  }

  function renderAll(data) {
    const kpis = data.kpis || {};
    $("kpiTotal").textContent = money(kpis.total);
    $("kpiMonth").textContent = money(kpis.thisMonth);
    $("kpiCount").textContent = String(kpis.count ?? (data.transactions || []).length);
    $("kpiAvg").textContent = money(kpis.average);

    allTransactions = Array.isArray(data.transactions) ? data.transactions : [];
    renderTable(allTransactions);
    renderCharts(data);
  }

  function renderTable(rows) {
    const tbody = $("txnBody");
    const filter = ($("tableFilter").value || "").trim().toLowerCase();
    let list = rows.slice();
    if (filter) {
      list = list.filter((r) => {
        const hay = [r.date, r.merchant, r.category, r.description, r.notes, r.recurring]
          .map((x) => String(x || "").toLowerCase())
          .join(" ");
        return hay.includes(filter);
      });
    }
    if (!list.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="5">No transactions.</td></tr>';
      return;
    }
    list = list.slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    tbody.innerHTML = list.map((r) => {
      const amt = parseAmount(r.amount);
      return (
        "<tr>" +
        "<td>" + escapeHtml(formatDate(r.date)) + "</td>" +
        "<td>" + escapeHtml(r.merchant || "") + "</td>" +
        "<td>" + escapeHtml(r.category || "") + "</td>" +
        '<td class="amount">' + money(amt) + "</td>" +
        "<td>" + escapeHtml(r.recurring || "") + "</td>" +
        "</tr>"
      );
    }).join("");
  }

  function formatDate(d) {
    if (!d) return "";
    const s = String(d);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return s;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function chartDefaults() {
    Chart.defaults.color = "#d4c0a8";
    Chart.defaults.borderColor = "rgba(245,230,211,0.12)";
    Chart.defaults.font.family = "'DM Sans', system-ui, sans-serif";
  }

  function renderCharts(data) {
    if (typeof Chart === "undefined") return;
    chartDefaults();

    const byCategory = data.byCategory || {};
    const byMonth = data.byMonth || {};
    const byMerchant = data.byMerchant || {};
    const byRecurring = data.byRecurring || {};

    destroyChart("category");
    const catLabels = Object.keys(byCategory);
    charts.category = new Chart($("chartCategory"), {
      type: "doughnut",
      data: {
        labels: catLabels,
        datasets: [{
          data: catLabels.map((k) => byCategory[k]),
          backgroundColor: catLabels.map((_, i) => palette[i % palette.length]),
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "right", labels: { boxWidth: 12, font: { size: 11 } } },
        },
      },
    });

    destroyChart("month");
    const monthLabels = Object.keys(byMonth).sort();
    charts.month = new Chart($("chartMonth"), {
      type: "bar",
      data: {
        labels: monthLabels,
        datasets: [{
          label: "Spend",
          data: monthLabels.map((k) => byMonth[k]),
          backgroundColor: "#e8a87c",
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            ticks: {
              callback: (v) => "$" + v,
            },
          },
        },
      },
    });

    destroyChart("merchant");
    const merchEntries = Object.entries(byMerchant)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    charts.merchant = new Chart($("chartMerchant"), {
      type: "bar",
      data: {
        labels: merchEntries.map((e) => e[0]),
        datasets: [{
          label: "Spend",
          data: merchEntries.map((e) => e[1]),
          backgroundColor: "#7dcea0",
          borderRadius: 6,
        }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { callback: (v) => "$" + v } },
        },
      },
    });

    destroyChart("recurring");
    const recLabels = Object.keys(byRecurring);
    charts.recurring = new Chart($("chartRecurring"), {
      type: "doughnut",
      data: {
        labels: recLabels.length ? recLabels : ["One-time", "Recurring"],
        datasets: [{
          data: recLabels.length ? recLabels.map((k) => byRecurring[k]) : [0, 0],
          backgroundColor: ["#e8a87c", "#a0c4e8"],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 12 } },
        },
      },
    });
  }

  async function submitExpense(e) {
    e.preventDefault();
    const url = getScriptUrl();
    if (!url) {
      showBanner($("errorBanner"), "Set APPS_SCRIPT_URL in config.js first.");
      return;
    }

    const token = getWriteToken();
    if (!token) {
      showBanner($("errorBanner"), "Write token required to add expenses.");
      return;
    }

    const dateVal = $("fDate").value;
    const year = dateVal ? new Date(dateVal + "T12:00:00").getFullYear() : new Date().getFullYear();
    const enteredBy = ($("fEnteredBy").value || "").trim();
    let notes = ($("fNotes").value || "").trim();
    if (enteredBy) {
      notes = notes ? ("[Entered by: " + enteredBy + "] " + notes) : ("[Entered by: " + enteredBy + "]");
    }

    const payload = {
      date: dateVal,
      year: year,
      merchant: $("fMerchant").value.trim(),
      description: $("fDescription").value.trim(),
      category: $("fCategory").value,
      subcategory: $("fSubcategory").value.trim(),
      recurring: $("fRecurring").value,
      cat: "Oreo",
      paymentMethod: $("fPayment").value,
      amount: parseFloat($("fAmount").value),
      token: token,
      notes: notes,
      enteredBy: enteredBy,
    };

    if (!payload.date || !payload.merchant || !payload.category || !(payload.amount >= 0)) {
      showBanner($("errorBanner"), "Please fill required fields (date, merchant, category, amount).");
      return;
    }

    const btn = $("submitBtn");
    btn.disabled = true;
    showBanner($("errorBanner"), "");

    try {
      const res = await fetch(url, {
        method: "POST",
        redirect: "follow",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
          "X-Oreo-Token": token,
        },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch (_) {
        throw new Error("Unexpected response from Apps Script");
      }
      if (data.error) throw new Error(data.error);
      flashSuccess("Expense added.");
      $("expenseForm").reset();
      setDefaultDate();
      await fetchData();
    } catch (err) {
      console.error(err);
      showBanner($("errorBanner"), "Add failed: " + (err.message || err));
    } finally {
      btn.disabled = false;
    }
  }

  function setDefaultDate() {
    const el = $("fDate");
    if (el && !el.value) {
      const d = new Date();
      const iso = d.toISOString().slice(0, 10);
      el.value = iso;
    }
  }

  function init() {
    setDefaultDate();
    $("expenseForm").addEventListener("submit", submitExpense);
    $("refreshBtn").addEventListener("click", () => fetchData());
    $("tableFilter").addEventListener("input", () => renderTable(allTransactions));
    fetchData();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
