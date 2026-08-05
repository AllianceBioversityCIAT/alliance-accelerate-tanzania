# Runbook — Re-running the Partner Profile Onboarding

- Spec path: `docs/specs/import-export/partner-profile-onboarding/`
- Traces: `requirements.md` FR-9 (all clauses), FR-6, NFR-2 · `design.md` §4.6, §7.1, DD-8, R-8
- Audience: the ACCELERATE Tanzania (AT) data team. **You do not need to read the rest of this spec or any code to follow this document.**
- When to use it: any time the client sends a new or updated partner-profile workbook and it needs to go into the registry.

Every term this document uses is defined the first time it appears. If a step produces something other than what's described, stop and use the [When something goes wrong](#when-something-goes-wrong) table before continuing.

---

## What you're doing, in one paragraph

The registry does not read the client's Excel workbook directly — it only accepts a specific template file (the **import template**). Your job is to fill one copy of that template per source sheet (following `mapping.md`), and for each one: select the file on the Admin import page, where the system **previews** it automatically — a dry run that validates every row and writes nothing to the database. Once you've reviewed the preview, you click a button to **commit** it, which actually creates the records. After each commit, you run a short manual check confirming the new records are not visible to the public. Every record you create today stays invisible until someone on the AT team separately evidences consent for it — this runbook never publishes anything.

---

## Quick path

1. **Download the current template** from the "Download template (.xlsx)" link on the Admin import page. Do this even if you already have one — a stale template is rejected outright (see [Terms](#terms-you-need)).
2. **Fill one template per source sheet**, following `mapping.md`'s rules for that sheet. There are 8 source sheets, so this produces 8 filled template files.
3. **Select the filled template** on the Admin import page (or drag it onto the drop zone). **Preview runs automatically** the moment the file is accepted — it writes nothing to the database.
4. **Read the results before committing anything.** Check the totals and the per-reason breakdown (defined below).
5. **Note the current "Actors mapped" count on the public home page** (while logged out) and write it down — this is your baseline for the post-commit check.
6. Only after you've reviewed the preview, **click "Import N actors"** in the "Review and confirm" section. This is what actually creates the records.
7. **Run the post-commit check** (below) after every commit, before moving to the next sheet.
8. Repeat steps 3–7 for each of the 8 sheets, one at a time.

---

## Terms you need

| Term | Meaning |
|---|---|
| **Import template** | The `.xlsx` file the registry accepts. It has a fixed set of columns and a version number, currently **`v2`**. You get it from the "Download template (.xlsx)" link on the Admin import page — always use the freshest download, never reuse an old copy. |
| **Preview** | What happens automatically the moment you select a filled template on the Admin import page (or drop it on the drop zone) — there is no separate mode to choose. The system validates every row and tells you what would happen — created, skipped, quarantined — but **writes nothing to the database**. To check a corrected file, click **"Replace file"** and select it; that removes the current file and previews the new one automatically, with no side effects. |
| **Commit** | What happens when you click the **"Import N actors"** button after reviewing a preview (found in the page's "Review and confirm" section; N is the number of rows that will be created). This is the step that actually creates records. It commits the exact file you just previewed — the system never asks you to upload it a second time. |
| **Quarantine** | A row that failed validation (e.g., a region the system doesn't recognize) is not created and not treated as an error that stops the rest of the sheet — it's set aside. It shows up in the results as a failure with a reason. |
| **Reason breakdown** | After a preview or commit, the results include a list of reasons rows didn't import, each with a count (e.g., `region: 4` means 4 rows failed because of their region value). This is how you see *why* rows didn't land without reading every row individually. |
| **`consentStatus`** | A field on every record. Every record this runbook creates gets `consentStatus = UNKNOWN`. This is not something you choose — the template is filled so that it always comes out this way. **Publishing a record — setting `consentStatus` to `GRANTED`** — is a separate, later step done by the AT team once they have evidence of that organisation's consent. **Nothing in this runbook publishes anything.** |
| **Source sheet** | One tab in the client's original workbook (e.g., "Offtaker_Beans"). There are 8. Each gets its own filled template and its own upload — never combine two source sheets into one upload. |

---

## Step-by-step procedure

Repeat this whole procedure once per source sheet (8 times total for a full onboarding run).

### 1. Get the current template

Go to the Admin import page and use the **"Download template (.xlsx)"** link. Always download fresh — don't reuse a template file from a previous session, because if the registry's template has been updated since then, your upload will be rejected (see [stale template](#when-something-goes-wrong)).

### 2. Fill the template for one sheet

Follow `mapping.md` for the sheet you're working on:
- The three offtaker sheets (`Offtaker_Beans`, `Offtaker_Sorghum`, `Offtaker_Groundnuts`) are covered in `mapping.md` §3.
- The remaining five sheets (`Bulk buyers_beans`, `Humantarian`, `Digital Service Provider`, `Seed Company`, `QDS_ Seed producers`) are covered in `mapping.md` §4.

`mapping.md` tells you, column by column, what goes where, including any values you compute by hand (like deriving a region from a district) and any rows you should skip entirely because the source data is unusable. Fill in every row for that sheet before moving on.

### 3. Select the filled template — preview runs automatically

On the Admin import page, click **"Select .xlsx file"** (or drag the file onto the drop zone). As soon as the file is accepted, the page validates it and shows you a preview — **you do not choose a mode**; there is no upload step separate from this.

**Preview writes nothing.** You can re-check as many times as you need while you're still fixing your filled template (see step 4). Nothing is created in the database until you separately commit in step 6.

**Upload limits** — if your filled template is too big, it is rejected outright rather than partially processed:
- No more than **1,000 data rows** per upload.
- No more than **4 MB** once the file is decoded.

Because you're uploading one template per source sheet already, and the largest single sheet in this workbook is well under 1,000 rows, you should not hit these limits under normal use. If you do, split that sheet's filled template into two files and select each separately — never merge two source sheets into one upload just to get under the limit.

### 4. Read the preview results before doing anything else

The preview response shows you:
- **Totals** — how many rows would be created, how many skipped, how many failed.
- **The reason breakdown** — a list of reasons rows didn't make it in, each with a count (e.g., `traderId: 2, region: 5`). The counts always add up to the total number of skipped-plus-failed rows.

Compare these numbers against what you expect for that sheet (from `mapping.md`'s per-sheet notes). If a count looks wrong — far more quarantined rows than `mapping.md` predicted, or a reason you don't recognize — **stop and investigate before committing.**

If you need to fix a row in your filled template, click **"Replace file"**, then select the corrected file — this previews the new file automatically, with no extra step. Re-checking a corrected file costs nothing; fixing it after commit does not undo what was already created.

### 5. Record the pre-commit baseline

Before you commit, you need a number to compare against afterward, and you can only get it now. In a private/incognito window (or a browser where you are not logged in), open the public home page and note the **"Actors mapped"** figure shown in the dark metrics band near the top. Write this number down next to this sheet's row in `reconciliation.md` — you'll compare against it in step 7.

Do this before committing. Once the commit happens, this baseline is gone and step 7's check cannot be performed correctly.

### 6. Commit

Once you're satisfied with the preview, click the **"Import N actors"** button in the "Review and confirm" section (N is the number of rows about to be created). This is the only irreversible action on the page. The system commits the exact file you just previewed — you never upload it a second time, so preview-before-commit is guaranteed by the screen itself, not by remembering to do things in order.

The response looks the same as the preview response (totals + reason breakdown), except this time the created rows are real.

A row that was previously created (from an earlier run of this same file) will not be created again — it shows up as skipped instead. This means re-uploading a workbook you already committed is safe: nothing gets duplicated.

### 7. Run the post-commit check

After every commit, confirm by hand that nothing you just created is visible to the public. **This check is manual — you do it yourself by looking at three places. Nothing in this system runs it for you automatically.**

Check exactly these three things, and nothing else — these are the only three ways the public can see registry data:

| # | What to check | How | Expected result |
|---|---|---|---|
| 1 | The public actor list | Without logging in, search the public actor list for one distinctive `traderName` you just committed | It does **not** appear |
| 2 | The public actor detail page | While still logged in as Admin, open the Admin actors list, find one record you just committed, and click **Edit**. The record's internal id is the `id=` value in the resulting URL (`/admin/actors/edit?id=<id>`) — **this is not the Trader ID** you put in the template (e.g. `OFB-1036`), which the public site never uses. Copy that id, then log out (or switch to a private/incognito window) and open `/profile?id=<that id>` | The page shows "not found" (or equivalent) — not the record |
| 3 | The public actor count | Without logging in, open the public home page and read the **"Actors mapped"** figure in the dark metrics band | The count is the **same as the baseline you recorded in step 5** — it has not gone up |

If any of the three shows the new record, **stop immediately** and escalate — do not continue committing further sheets. This would mean a record leaked to the public despite `consentStatus = UNKNOWN`, which should never happen.

Record the result of this check (pass/fail, and which sheet) in `reconciliation.md`.

### 8. Move to the next sheet

Repeat steps 1–7 for the next source sheet. Step 1 (downloading the template) only strictly needs to happen once per session unless the template changes mid-session, but re-downloading it before each sheet costs nothing and avoids the stale-template rejection.

---

## When something goes wrong

| Symptom | What it means | What to do |
|---|---|---|
| **Upload rejected: "This template is out of date"** | You're using an older template version than the registry currently expects (currently `v2`). The message names both the version you uploaded and the current version. | Go back to the Admin import page and download a fresh copy from the **"Download template (.xlsx)"** link, re-fill it from your working data (or copy your filled values into the new file), and re-select it. |
| **A dialog appears asking you to confirm publishing ("Publish imported actors?")** | This should never happen under this runbook — that dialog only appears when a previewed row would set `consentStatus` to `GRANTED`, and every row this runbook creates is `UNKNOWN`. | **Click Cancel — do not confirm, and do not commit this file.** Something in your filled template (or the mapping applied to it) produced a `GRANTED` row. Stop and escalate before doing anything else with this sheet. |
| **A row shows up quarantined with a reason you didn't expect** | The row failed validation for that reason (e.g., its region value isn't one the system recognizes). This is not a bug — it's the system refusing to guess. | Check `mapping.md` for that sheet — it records the known cases where a row is expected to quarantine. If your row isn't one of the known cases, look at the source cell yourself: is the value genuinely ambiguous or missing? If so, the quarantine is correct and the row is simply left out. If you believe the value should resolve and doesn't, do not force it in — flag it for follow-up rather than editing the template to make it pass. |
| **The `Seed Company` sheet reports 0 created** | Expected, not a bug. Every row on this sheet quarantines pending an AT-team region pass — its location columns hold no data in the source workbook at all. | Nothing to do. Record 0 created for this sheet in `reconciliation.md` and move to the next sheet. |
| **The total created count doesn't match what you expected for that sheet** | Either more rows quarantined than expected, or fewer. | Compare the reason breakdown against `mapping.md`'s per-sheet expected counts before assuming anything is wrong — some rows are *supposed* to quarantine (that's the whole point of the breakdown). If the mismatch isn't explained by a known quarantine reason, stop and investigate rather than committing. |
| **Upload rejected for size** | The filled template exceeds 1,000 data rows or 4 MB decoded. | Split that sheet's filled template into two files and select each separately, reviewing the preview of each before committing it. |
| **The post-commit check (step 7) shows the new record publicly** | Something is visible that should not be. | Stop committing further sheets immediately and escalate — do not attempt to fix this yourself by editing records. |
| **Re-uploading a workbook you already committed** | Every row you already created shows up as skipped, not re-created, and nothing is duplicated. | This is expected and safe. If you see rows being created that you didn't expect to still be missing, that's worth double-checking against your records of what you'd already committed. |

---

## The rules that never change

- **Every record this runbook creates gets `consentStatus = UNKNOWN`.** You never set it to `GRANTED` as part of this process, ever. Publishing a record is a separate act, done later by the AT team once they have evidence of that specific organisation's consent — it is not part of an import run.
- **Preview happens automatically before every commit.** The screen enforces this — you cannot commit a file without a preview of that exact file having run first — but it is still on you to actually read the preview before clicking "Import N actors".
- **One upload per source sheet.** Don't combine sheets into a single upload file, and don't split a single sheet across two uploads unless you're hitting the size limit above.
- **Run the post-commit check after every commit**, not just once at the end. It's the only way anyone finds out if something leaked, and it only has to check three places: the public actor list, a public actor detail page, and the public actor count.

---

## Reference

- **Endpoint used by both preview and commit:** `POST /api/v1/admin/actors/import` — this requires an Admin login; it is not reachable anonymously.
- **Current template version:** `v2`.
- **Upload limits:** 1,000 data rows, 4 MB decoded, per upload.
- **The three public paths checked in step 7, and no others:** the public actor list, a public actor detail page, and the public actor count on the home page.
