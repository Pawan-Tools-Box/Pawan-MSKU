# Put the CRM on GitHub and make it live

Two parts. Part 1 puts the project on GitHub. Part 2 turns that GitHub repository into a live
website with its own database, using Render (a hosting service that reads the `render.yaml` file
in this project and sets everything up for you).

You do not need to install anything on your computer for either part.

---

## Part 1: Upload to GitHub

1. Sign in at https://github.com and click **New repository** (the **+** at the top right).
2. Repository name: `oakcraft-sku-crm`. Choose **Private**. Leave every other box unticked.
   Click **Create repository**.

   Keep it private: the project contains your Amazon and Flipkart listing files in `sample-data`.

3. On the empty repository page click the link **uploading an existing file**.
4. Open the `oakcraft-sku-crm` folder on your computer. GitHub accepts at most 100 files in one
   upload and this project has about 120, so upload in two goes:

   - **First go:** drag only the `src` folder into the browser. Wait until all files are listed,
     then click **Commit changes**.
   - **Second go:** click **Add file → Upload files**, then select everything else in the folder
     (the folders `db`, `docs`, `sample-data`, `scripts` and all the loose files, including the
     ones whose names start with a dot such as `.gitignore` and `.node-version`) and drag them in.
     Click **Commit changes**.

5. Check: the repository's front page should now show `src`, `db`, `scripts`, `docs`,
   `sample-data`, `package.json`, `render.yaml` and the README.

Never upload a file named `.env`, or folders named `node_modules` or `.next`. They are not in the
folder you were given; they only appear if someone runs the project on a computer.

> Prefer an app to the browser? Install GitHub Desktop, choose **File → Add local repository**,
> pick this folder, and click **Publish repository** with **Keep this code private** ticked.

---

## Part 2: Make it live on Render

1. Go to https://render.com and sign up with **GitHub** (the "Sign in with GitHub" button).
2. In the Render dashboard click **New +** → **Blueprint**.
3. Connect your GitHub account when asked and give Render access to the `oakcraft-sku-crm`
   repository. Select it.
4. Render reads `render.yaml` and shows what it will create: one database (`oakcraft-crm-db`) and
   one web service (`oakcraft-sku-crm`). It asks you for two values:

   | Value | What to type |
   |---|---|
   | `ADMIN_EMAIL` | the email you will sign in with |
   | `ADMIN_PASSWORD` | a first password: at least 8 characters, with letters and numbers |

5. Click **Apply**. The first build takes about 5 minutes. When the web service shows **Live**,
   click its address at the top (it looks like `https://oakcraft-sku-crm.onrender.com`).
6. Sign in with the email and password from step 4. The CRM asks you to choose a new password.
7. Go to **Import Data**, choose Amazon, and upload `sample-data/Amazon.xlsx`. Repeat with
   Flipkart and `sample-data/Flipkart.xls`. Then follow "First hour" in the README.

If the build or start fails, open the service in Render and read **Logs**. The CRM prints a plain
sentence starting with "Setup stopped:" when the admin email or password is the problem.

### What the free plan means (from Render's documentation, checked October 2026)

`render.yaml` starts both pieces on Render's free plans so you can try it without paying.

- **Free web service:** goes to sleep after 15 minutes without visitors, and takes about a minute
  to wake up when someone opens it again.
- **Free database: it expires 30 days after it is created.** After that you have 14 days to move it
  to a paid plan before Render deletes it, and free databases have no backups.

So the free setup is for trying the CRM, not for keeping your mapping work. **Before you rely on it,
upgrade the database:** in Render open `oakcraft-crm-db` → change the instance type to the smallest
paid plan. Your data stays. Upgrading the web service as well stops it from sleeping. Current
prices are on https://render.com/pricing.

To start on paid plans from day one, edit the two `plan:` lines in `render.yaml` before uploading
(the file says what to change them to).

---

## Later: changing or updating the CRM

Upload the changed files to the same GitHub repository (**Add file → Upload files**, same folder
layout). Render notices the change, rebuilds and restarts the CRM on its own. Your data is in the
database and is not touched by an update.

## Backups

Once the database is on a paid plan, Render keeps backups you can restore from its dashboard. You
can also download a copy yourself at any time: every report in the CRM exports to Excel, and the
"All platform listing report" plus the "Master SKU report" together contain all Master SKUs,
listings and mappings.

## What has and has not been tested

The build and start commands in `render.yaml` were run exactly as written against a clean copy of
this project and a fresh PostgreSQL database, and the full test suite passes on the result. The
Blueprint itself has not been applied on a real Render account, because that needs your sign-in.
If Render reports a problem with `render.yaml`, send the message it shows and it can be fixed quickly.

Other hosts work too. The CRM needs only Node.js 20.9+ and a PostgreSQL 13+ database, and reads
its settings from environment variables (see the README).
