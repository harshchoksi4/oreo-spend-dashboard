# Oreo Spend Dashboard

Mobile-friendly static dashboard for Oreo kitten expenses. Frontend on **GitHub Pages**; backend is a **Google Apps Script** web app bound to the **v2 Google Sheet COPY** (never the original).

**Sheet (COPY only):** [Oreo Spend v2](https://docs.google.com/spreadsheets/d/1YrAUQRYp0Ln4qDVWl2wJ7zL8l7BfiSS5rqDzrEgLMm8/edit)  
Sheet ID: `1YrAUQRYp0Ln4qDVWl2wJ7zL8l7BfiSS5rqDzrEgLMm8`

## Architecture

| Piece | Role |
|-------|------|
| `index.html` / `styles.css` / `app.js` | Dashboard UI (KPIs, Chart.js charts, table, add-expense form) |
| `config.js` | `APPS_SCRIPT_URL` (empty placeholders in repo) |
| `apps-script/Code.gs` | `doGet` JSON API + `doPost` append row |
| Google Sheet `Transactions` | Source of truth |

**Write token:** Do **not** put a real `OREO_TOKEN` in public `config.js`. The UI prompts once and stores it in `sessionStorage` under `oreo_token`. The client also sends `token` in the POST JSON body (Apps Script often strips custom headers).

## Transactions columns

`Date | Year | Merchant / Store | Description | Category | Subcategory | One-time vs Recurring | Cat | Payment Method | Amount | Notes`

On add: **Year** = year of Date; **Cat** defaults to `Oreo`; **Payment Method** defaults to `Card`.

Categories: Misc/Household, Adoption & Licensing, Insurance, Litter & Hygiene, Food & Treats, Vet – Routine, Vet – Emergency, Toys & Enrichment, Grooming.

### Optional schema enhancements (v2)

You may add columns such as **Timestamp Added** or **Entered By**. The form’s optional **Entered By** field is written as a `[Entered by: …]` prefix on **Notes**, so it stays compatible if those columns are missing.

## Human setup checklist

### 1. Apps Script on the v2 COPY sheet

1. Open the [v2 sheet](https://docs.google.com/spreadsheets/d/1YrAUQRYp0Ln4qDVWl2wJ7zL8l7BfiSS5rqDzrEgLMm8/edit) (the COPY — do not modify the original).
2. **Extensions → Apps Script**.
3. Paste contents of `apps-script/Code.gs` into `Code.gs` (replace any stub).
4. Optional: paste `apps-script/appsscript.json` via Project Settings → show `appsscript.json`, or set time zone to `America/New_York`.
5. **Project Settings → Script properties → Add script property**
   - Property: `OREO_TOKEN`
   - Value: a long random secret you invent (share only with people who may add expenses).
6. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
7. Authorize when prompted, then copy the **Web app URL**.

### 2. Wire the dashboard config

1. Edit `config.js` on `main`:
   - Set `APPS_SCRIPT_URL` to the web app URL from step 1.
   - Leave `OREO_TOKEN` as `""`.
2. Commit/push that one-line URL change (or edit in the GitHub UI).

### 3. GitHub Pages

1. Repo **Settings → Pages**.
2. Source: **Deploy from a branch**.
3. Branch: **main** / folder: **/ (root)**.
4. Save. Site URL will be like `https://harshchoksi4.github.io/oreo-spend-dashboard/`.

### 4. Share the sheet

Share the **v2 COPY** sheet with your wife as **Editor** so she can also view/edit rows in Sheets if needed. Dashboard writes go through Apps Script (running as you).

### 5. First use

1. Open the Pages URL.
2. If URL is empty, you’ll see a setup banner linking to the sheet.
3. After config is set, KPIs/charts/table load via `doGet`.
4. First **Add expense** prompts for the write token → stored in `sessionStorage` for that browser tab session.

## Local note

This is a static site — open via Pages (or any static server). Opening `index.html` as a `file://` URL may block fetches.

## Files

- `index.html` — dashboard shell
- `styles.css` — cream/cocoa kitten theme
- `app.js` — fetch/render/POST/refresh
- `config.js` / `config.example.js` — URL placeholders
- `apps-script/Code.gs` — backend
- `apps-script/appsscript.json` — timezone + webapp metadata
