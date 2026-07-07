# Omega Network — Client Billing Tracker

A single small web app to track client bill commitment days and payment status, built to match how you already deploy tools: plain HTML/JS front end + a small PHP backend, no Node build step, no external database server to provision.

## Why this stack (not React/Supabase)

You deploy via FTP/cPanel to PHP-capable subdomain hosting. Supabase needs an external account and network calls out to it; a React build needs a Node build step you'd run locally every time you change something. Neither fits a "upload files, done" workflow. Instead:

- **Frontend:** plain HTML + vanilla JS (`index.html`, `app.js`) — no build step, edit and re-upload directly.
- **Backend:** PHP (`api.php`, `db.php`) — runs on any standard cPanel PHP hosting, same as `save.php` in your registration system.
- **Storage:** SQLite, a single file (`data/clients.sqlite`), created automatically the first time `api.php` runs. No MySQL database to create in cPanel, no credentials to manage. It supports proper filtering/sorting/search, which flat CSV/text files don't do well once you're querying by due date and status.

## File structure

```
billing/
├── index.html          ← the app (open this in the browser)
├── app.js              ← all frontend logic (search, filters, quick-edit, import)
├── api.php             ← backend endpoints (list, update, create, delete, import)
├── db.php              ← database bootstrap (creates schema + one-time seed)
├── seed.json            ← your 100 current clients, converted from the Excel file
└── data/
    ├── clients.sqlite   ← created automatically on first run (do not upload this)
    └── .htaccess        ← blocks direct web access to the database file
```

## Your data, already loaded

I converted `Billing_List_7-7-2026_6752cc.xlsx` into `seed.json`. The first time `api.php` runs, it loads all 100 clients from that file into the database automatically — you don't need to re-enter anything or run an import for your existing list.

One thing worth knowing about your data: **`Ex.Date` is a day-of-month (1–31), not a calendar date** — it's the recurring day each client commits to pay, every month. The dashboard is built around that: "Due Today" and "Due This Week" compare each client's day-of-month against today's date, wrapping correctly at month-end.

Payment status was derived from your `PaymentDate` column: clients with a payment date already logged this month are marked **Paid**; everyone else starts as **Pending**. From here on, use the one-click status toggle in the app instead of re-importing.

## Deploying (matches your usual FTP/cPanel workflow)

1. Create a folder for this, e.g. `htdocs/billing/`.
2. Upload all files **except `data/clients.sqlite`** (it doesn't exist yet — it's created automatically).
3. Make sure `data/` is writable by PHP (cPanel File Manager → right-click `data` → Permissions → `755`, or `775` if `755` gives a permission error).
4. Visit `https://yoursubdomain.com/billing/` in the browser. On first load, `api.php` creates the database and seeds it from `seed.json`. After that first run, you can delete `seed.json` from the server if you like — it's only used when the database is empty.

That's it — no build step, no `npm install`, no database credentials to configure.

## Deploying on Vercel instead

This repo also works on Vercel, as a second option alongside cPanel — useful if you want a quick hosted preview or prefer Vercel going forward. It needs a different backend, though: **Vercel functions have no persistent disk**, so the SQLite file approach (`api.php` + `db.php`) can't be used there — anything written to it would vanish between requests. Instead, the Vercel version (`api/index.js`) uses **Vercel Postgres**, a real hosted database, so your data actually persists.

Steps:
1. Push this repo to GitHub (see below) and import it into Vercel (vercel.com → Add New → Project → pick the repo).
2. In the Vercel project, go to **Storage → Create Database → Postgres** and connect it to this project. Vercel sets the required `POSTGRES_URL` environment variable for you automatically — nothing to copy/paste.
3. Deploy (or redeploy after connecting the database). On first request, `api/index.js` creates the table and seeds it from `api/seed.json`, the same 100 clients as the cPanel version.
4. Visit the deployed URL — same app, same features, different storage underneath.

The frontend (`index.html`, `app.js`) is unchanged and works with either backend: `vercel.json` quietly routes its calls to `/api.php` over to the Node function, so nothing in the JS needed to change.

`api.php`, `db.php`, and `data/` are excluded from the Vercel deployment (see `.vercelignore`) since they're only used for cPanel hosting — they stay in the repo for that purpose but Vercel ignores them.

## Running it locally to test first (optional)

If you have PHP installed on your own machine:
```
cd billing
php -S localhost:8000
```
Then open `http://localhost:8000` in your browser.

## Using the app

**Dashboard cards** (top of the page) — click any of them to filter the table instantly:
- **Due Today** — clients whose commitment day is today
- **Due This Week** — commitment day falls within the next 7 days
- **Pending** — anyone not yet marked paid
- **Overdue** — pending clients whose commitment day this month has already passed

**Search & filter bar** — search by name, Client ID/IP, mobile, or client code; filter by status (Paid/Pending) or zone; combine with a due-date filter.

**Quick edit, right in the table** — no need to open a form:
- Click the status pill to toggle **Paid ⇄ Pending** in one click (marking Paid also clears the balance and stamps today's date).
- Edit the commitment day or balance directly in their table cells — it saves as soon as you click away.
- Click **Edit** on a row to open the full form for anything else (mobile, package, notes, etc.), or delete the client.

**+ Add Client** — for a brand-new customer, one at a time.

**⇪ Import CSV** — for bulk updates (e.g. a fresh export from your billing system next month):
1. Choose the CSV file.
2. Map each of its columns to the matching field — the app guesses based on common header names (`ID/IP`, `Client Name`, `Ex.Date`, `M.Bill`, etc.) so you'll mostly just confirm.
3. Confirm and import. Existing clients (matched by Client ID) get their account details updated; new Client IDs get added. **Payment status and any manual edits you've made are left alone** — import only touches account/billing details, never overwrites your Paid/Pending marks.

## Notes on the data model

The app stores more fields than the bare minimum you asked for (zone, package, speed, client type, connection type, comments, etc.) because your actual spreadsheet already tracks these, and having them searchable/editable in one place is more useful than a stripped-down version. Nothing is required beyond Name and a Client ID for a new entry — everything else is optional.
