@AGENTS.md

# Facturen

A client-side invoice and quotation generator for the **Dutch** market. No backend,
no database, no accounts: everything lives in the browser and nothing is persisted
except the theme choice in `localStorage`.

## Provenance and repo rules

This repo is a fork of [eraycode/factuurr](https://github.com/eraycode/factuurr), a
**Belgian** invoice generator, adapted to Dutch invoicing law and renamed from
*Factuurr* to *Facturen*.

- Two remotes: `origin` is this fork at
  [dvansonsbeek/facturen](https://github.com/dvansonsbeek/facturen) (public), `upstream`
  is Eray's original. Every push to `main` publishes to
  [dvansonsbeek.github.io/facturen](https://dvansonsbeek.github.io/facturen/) via
  GitHub Pages, gated on the test suite. Never push to `upstream`.
- The first four commits (Feb 2026, authored by Eray) are kept intentionally as
  provenance. Do not rewrite that history.
- The repo was published under MIT after a deliberate decision; see the licence note
  below. Publishing was the irreversible step, and it has been taken.
- `LICENSE` is MIT with two copyright lines: Eray for the original work, Dennis for
  the Dutch adaptations. Names only, no email addresses — Eray's address is a student
  address and is already in the git log; it does not need wider distribution.
- Do not contact the original author.

## Architecture

```
app/                 layout + page shell (server components, 2-space indent)
components/
  InvoiceForm.tsx    the container: all form state, handlers and composition
  form/              presentational sections, props in, callbacks out
    CompanyDetails.tsx   Mijn Bedrijfsgegevens (foldout)
    PaymentDetails.tsx   Mijn Betaalgegevens (foldout, invoice only)
    ClientDetails.tsx    client fields plus the customer book
    DocumentArchive.tsx  saved documents (foldout) + the read-only view dialog
    SecurityPanel.tsx    what "in the browser" means, and the passphrase controls
  InvoicePreview.tsx the on-screen HTML preview
  InvoiceDocument.tsx the PDF document (@react-pdf/renderer)
  ItemRow.tsx        one line item
lib/
  utils.ts           formatting (currency, date, IBAN) + all VAT arithmetic
  theme.ts           light/dark store read via useSyncExternalStore
  settings.ts        company + payment details, persisted in localStorage
  clients.ts         the saved customer book, persisted
  numbering.ts       the running invoice/quotation numbers, persisted
  documents.ts       the archive of issued documents, in IndexedDB, append-only
  idb.ts             the IndexedDB schema; the only module that knows its shape
  vault.ts           the passphrase, the key, and who participates in it
  crypto.ts          AES-256-GCM + PBKDF2 primitives
  foldouts.ts        which sections the user collapsed, persisted
  image.ts           downscales an uploaded logo so it fits in localStorage
  page-numbers.ts    stamps "pagina 1 van 2" onto the finished PDF
types/index.ts       Invoice, Quotation, Sender, Client, LineItem
tests/               Playwright end-to-end specs
```

`Quotation extends Omit<Invoice, 'invoiceNumber'>` and adds `quotationNumber` and
`validUntil`. The two are held as **separate `useState` drafts** in `InvoiceForm`
(`InvoiceDraft` / `QuotationDraft`, which omit everything living in the stores), and
`handleToggleType` copies the shared per-document fields when you switch tabs.

## State lives in three places, deliberately

- **Per document** (`useState`): number, dates, client, items, exemption, notes.
  Two drafts, one per document type.
- **Per user** (`lib/settings.ts`, `lib/clients.ts`): company details, logo, IBAN,
  BIC, payment conditions, and the saved customer book. Shared by both document
  types, persisted to `localStorage`. `currentData` merges settings onto the active
  draft for the renderers.

  The customer book and the client *on a document* are deliberately separate. Picking
  a customer copies its fields onto the draft; editing them afterwards changes only
  that document. Only **Opslaan** writes back to the book. Auto-saving edits would
  silently rewrite a customer's address because you tweaked it for one invoice —
  there is a test named *"bewerken zonder opslaan verandert de bewaarde klant niet"*
  guarding exactly that.

  Once a customer is selected the client input fields are hidden behind **Bewerken**,
  because the preview already shows who the document is for. Saving folds them away
  again. Deleting a customer from the book leaves the document's client untouched —
  you may be halfway through an invoice to them.
- **Per browser** (`lib/theme.ts`, `lib/foldouts.ts`): theme, collapsed sections.
- **Issued, and therefore frozen** (`lib/documents.ts`): the archive. See below — it
  is the one store that is append-only and the one that is not in `localStorage`.

All these persisted stores follow the same shape: `subscribeX` / `readX` /
`readServerX` / `writeX`, read with `useSyncExternalStore`. Two rules matter:

1. **`readX` must return the same reference when nothing changed**, or React
   re-renders forever. Each store caches the raw string and only re-parses when it
   differs.
2. **`readServerX` returns the defaults.** The server cannot know the device. This is
   what keeps hydration consistent — and it is why the stores exist rather than a
   `useEffect` that calls `setState`, which would trip `react-hooks/set-state-in-effect`.

Never derive a section's open/closed state from "is there data yet": that flips on the
first keystroke and the section collapses while the user is typing. It was written
that way once and the tests caught it.

## Dutch VAT rules — the part that is easy to get wrong

**Rates are 21% / 9% / 0%.** Belgium's 12% and 6% do not exist here. If you see them,
something regressed.

**KOR (kleineondernemersregeling, art. 25 Wet OB 1968)** is the small-business
exemption, threshold €20.000 of Dutch turnover per calendar year. It is opt-in via
the Belastingdienst.

The critical distinction, and the thing a previous version of this app got wrong:

> **"Vrijgesteld" is not the same as "0%".** 0% (nultarief) is a *rate* — exports,
> intra-EU supplies. KOR is an *exemption*: no VAT may appear on the invoice at all.

So when `isVatExempt` is true the document must show **no BTW column, no per-rate BTW
rows, and no subtotal** (a subtotal identical to the total is noise) — just a total and
the exemption sentence. Rendering `BTW (0%): € 0,00` on a KOR invoice is a compliance
bug, not a cosmetic one.

`isVatExempt` governs **display only**. It must never overwrite each line's `vatRate`:
an earlier version zeroed every rate on toggle, which destroyed the data permanently
when you toggled back off.

**Rounding.** `lib/utils.ts` rounds at every step via `roundToCents` (half away from
zero). VAT is summed per rate over the whole base and rounded once per rate, the way a
btw-aangifte does it. This is not fussiness: without it the printed VAT lines can fail
to add up to the printed total (€2,02 @ 21% + €5,05 @ 9% printed €7,95 against lines
summing to €7,94). There is a regression test for exactly that case.

**Invoice numbers are remembered, never auto-consumed.** An invoice needs a sequential
number that uniquely identifies it (art. 35a Wet OB 1968), so *duplicates* are a real
compliance failure while *gaps* are merely something to explain. The counter therefore
advances only on an explicit **Volgende factuur** click — never on PDF download, since
downloading to check the layout is not issuing an invoice. The field stays editable and
`nextNumber` increments the last run of digits, so manual jumps and custom prefixes both
keep working. Sequence resets to `-001` when the year changes. Invoices and quotations
have separate series. The counter lives in `localStorage`, so **two devices means two
diverging series and genuine duplicate risk** — there is no fix for that without a
backend; Export/Import carries the counter so it travels with the rest.

**No vervaldatum on an invoice.** Only the *factuurdatum* is legally required (art. 35a
Wet OB 1968); the payment term is contractual and lives in `paymentConditions`. A
separate editable due-date field could contradict it — "Vervaldatum: 09-10" above
"Binnen 14 dagen na factuurdatum" — so `dueDate` was removed from the type rather than
left unused. A **quotation** does keep `validUntil`: there the end date *is* the term,
and nothing else states it.

**Other NL specifics:** VAT number format `NL123456789B01`; the KvK number is required
on invoices by the Handelsregisterwet (independent of VAT law); Dutch IBANs are 18
characters.

## The archive: issued means frozen

`lib/documents.ts` keeps the documents you pressed **Bewaren** on. It breaks two
house patterns on purpose.

**It is in IndexedDB, not `localStorage`.** Documents accumulate, and the 5 MB
`localStorage` budget is already shared with a logo data-URL. IndexedDB is also async,
which is what passphrase encryption would need, since Web Crypto is async too.

**A saved document is never updated.** There is no update function, and `bewaarDocument`
writes with `add()` rather than `put()`, so IndexedDB itself refuses an existing id —
immutability is enforced by the storage layer, not by convention. Changing a saved
document means duplicating it into a new draft.

**The record stores the whole merged document, sender and payment details included.**
Those normally live in `lib/settings.ts` and apply to everything you make, so without
a snapshot at save time, moving offices next year would silently rewrite every invoice
you already sent. The test *"latere wijzigingen aan je bedrijfsgegevens veranderen hem
niet"* guards this, and it was validated by re-merging live settings at display time
and confirming it goes red.

**Duplicating does not copy the number.** Duplicate numbers are a real compliance
failure (art. 35a Wet OB 1968) while gaps merely need explaining, so a duplicate starts
at wherever your series currently stands. Saving likewise does **not** advance the
counter: *Bewaren* and *Volgende factuur* are separate acts, the same distinction as
between downloading and issuing.

Deletion *is* allowed, with a confirmation. Data you cannot get back out of your own
browser is a worse outcome than data you can delete by accident; Export carries the
archive so a copy can live outside the browser, which also makes it the backup.

The frozen document opens in a `<dialog>` above the page rather than in the preview
pane. If it took over the live preview, typing in the form would appear to do nothing.
The `<dialog>` lives outside the `<details>` foldout, because a closed `<details>` sets
`display: none` on its children and a modal in that subtree never appears.

Because the archive loads asynchronously, `readDocuments` returns a frozen empty array
until IndexedDB answers — the same reference `readServerDocuments` returns, which is
what keeps hydration consistent. The rules above still hold.

## The optional passphrase

`lib/crypto.ts` (primitives), `lib/vault.ts` (the key and who uses it), `lib/idb.ts`
(the database shape). Off by default, because a forgotten passphrase destroys the data
and nobody who did not ask for that should get it.

**It covers the archive and the customer book, and deliberately not the rest.** Those
two hold *other people's* personal data, which is what matters if someone else can reach
the device. Company details and numbering stay readable on purpose: they are printed on
every invoice you send and sit in the Handelsregister, a sequence number is not a secret,
and encrypting them would mean the app could not be used at all without the passphrase.
The payoff is that a locked app still works — you can write a fresh invoice, you just
cannot see saved customers or documents, and saving either is refused. There is a test
(*"je eigen bedrijfsgegevens blijven met een zin leesbaar, en dat is de bedoeling"*) that
pins this choice so it is not reversed by accident.

**Participants register with the vault; the vault does not know them.** `vault.ts`
exposes `doeMee({ herschrijf, herlaad, sluit })` and calls those on set / unlock / lock.
Without that inversion the vault would have to import both stores, and those two would
then import each other through it. All three callbacks are also called when there is
nothing to do, so they must be safe to run twice.

**The customer book infers its own lock state from the shape of what is stored**, not
from the vault's load. The vault reads its header from IndexedDB asynchronously, while
`readClients` is synchronous — so the book checks whether its own localStorage value is
an encrypted block and reports locked on that basis. That keeps `readX` synchronous,
which is what let this be a small change rather than a rewrite of three stores.

**Writes are refused while locked, in both stores.** Writing a readable record next to
encrypted ones would leave half the data exposed. `saveClient` returns `null` and
`deleteClient` returns `false` rather than silently doing nothing, and the UI says which
it was.

**State the limits, in the UI and not only here.** Encryption protects the archive *at
rest*: someone with access to the browser profile — another user of the device, an
administrator, a stolen laptop, a disk backup — sees noise instead of client names and
amounts. It does **not** protect an unlocked session. Once the passphrase is entered the
key is in the page's memory and the archive is readable, so anything running in the page
can read it. The CSP in `lib/csp.ts` is what addresses that, and a malicious browser
extension sits outside any CSP and cannot be defended against by a web page at all.
`SecurityPanel.tsx` says all of this to the user, including the sentence that a
passphrase does *not* help against extensions. Do not quietly drop those caveats to make
the feature sound better; a false sense of security is worse than none.

- **AES-256-GCM**, so a tampered or truncated record fails to decrypt rather than
  yielding garbage. A fresh 12-byte IV per record: reusing an IV under one key breaks
  GCM completely.
- **PBKDF2-HMAC-SHA-256, 600,000 rounds** (OWASP 2024). Argon2id would resist GPU
  cracking better, but PBKDF2 is the only slow KDF the browser ships; Argon2 would mean
  ~100 kB of WebAssembly in an app that has no backend to fetch it from.
- **The salt and round count live in the stored data, not in the code**, so raising the
  rounds later does not orphan last year's archive.
- **The key is never persisted.** It is `extractable: false` and held only in module
  memory, so a reload asks again. Storing it — even as a non-extractable `CryptoKey` in
  IndexedDB, which is a known pattern — would hand the archive back to anyone with
  device access and defeat the whole feature.
- **Only the `id` stays in the clear**, which is why `bewaarDocument` uses
  `crypto.randomUUID()`. The earlier scheme embedded the invoice number in the id, so
  the number would have been readable on disk despite the encryption.
- **Export writes both stores as stored**, encrypted when they are, with the vault
  record (header *and* proof) so the same passphrase opens the import. Without the proof
  an unlock cannot tell a wrong passphrase from corrupt data. A backup that silently
  wrote everything in the clear would undo the feature; the trade-off — forget the
  passphrase and the backup is lost too — is stated in the confirmation dialog.
- **Import takes the file's vault first**, then the data, and drops the session key:
  after importing an encrypted file everything is locked until *that file's* passphrase
  is entered.

The tests for this read IndexedDB and localStorage directly, outside the app
(`ruweRecords` / `ruweKlanten` in `tests/encryption.spec.ts`), because the only claim
worth checking is what an intruder would actually find on disk. There are deliberate
baseline tests asserting the client name *is* readable without a passphrase, so the
encrypted cases prove something — both were validated by bypassing encryption in the
write path and confirming they go red.

## Two renderers, one document

The live preview is HTML/CSS; the PDF is `@react-pdf/renderer`. The preview is *not*
rendered through `PDFViewer`, because re-rendering a PDF on every keystroke is slow and
the live preview is the app's selling point. That means the visual layout exists twice,
so:

- The **VAT/KOR rule is shared** via `summariseDocument` in `lib/utils.ts`. Never
  reimplement that logic in one renderer only.
- The **drift is caught by tests**: `tests/pdf.spec.ts` downloads the real PDF,
  extracts its text layer with pdf.js, and asserts the content matches the preview.

**Page numbers are stamped on afterwards** (`lib/page-numbers.ts`, pdf-lib), not drawn
by react-pdf. Its `<Text fixed render={...} />` is never invoked in 4.9.0 — verified
with an unstyled diagnostic element — and `Page.layout`, the documented alternative,
switches the document to an experimental pagination engine that turned a two-page
invoice into five with a wrong total. Stamping leaves the verified layout untouched.
Revisit only if react-pdf fixes `render`; 4.9.0 is the latest as of October 2026.

**Text assertions cannot see layout.** Twice in one session a document nobody would
send passed every text test: once the payment footer ran straight through the table
rows, once an experimental pagination engine turned a two-page invoice into five
half-empty ones. Both times all twelve text tests were green.
`tests/pdf-layout.spec.ts` therefore asserts *positions* via `extractPdfLayout`:
nothing outside the margins, the payment line inside the bottom band with content
staying above it, pages filled before a new one starts, the table header above its
rows, and a sane page count. They were validated by deliberately breaking the footer
and confirming they go red while the text tests stay green. Prefer geometry over image
baselines here — font rasterisation differs between machines, so pixel baselines get
re-approved until they mean nothing, while coordinates do not.

**Any change to what the document says must be made in both `InvoicePreview.tsx` and
`InvoiceDocument.tsx`.** Fixing one alone is how these two drift apart.

**The preview is paper, not interface.** `.invoice-preview` in `globals.css` redefines
`--foreground`, `--primary`, `--secondary`, `--muted` and `--border` to their light
values for that subtree, so the document stays white with dark ink in dark mode. Without
it `--foreground` resolved to near-white and the company name vanished on the white
sheet. Do not use theme-dependent colours inside the preview expecting them to adapt —
they deliberately do not. The PDF has its own hardcoded `COLORS` and was never affected.

The PDF export was previously html2canvas + jspdf, which rasterised the preview into a
PNG. Do not reintroduce that approach: the output text was unselectable and resolution
depended on the user's screen.

## Testing

```bash
npx playwright install chromium   # once, and again after upgrading @playwright/test
npm test                          # the suites, against `next dev`

npm run build && npm run test:uat # the UAT journey, against the published build
PAGES_BASE_PATH=/facturen npm run build && PAGES_BASE_PATH=/facturen npm run test:uat
UAT_BASE_URL=https://dvansonsbeek.github.io/facturen/ npm run test:uat
```

Playwright starts its own dev server and reuses one already on :3000.

**There are two configurations, on purpose.** `playwright.config.ts` runs the suites
against `next dev`, in parallel, each test in a clean browser.
`playwright.productie.config.ts` runs `tests/uat/` against the static export — a
different code path, under the strict CSP — on one worker, with no retries, because what
it tests *is* the order of events. The main config carries `testIgnore: '**/uat/**'` so
the journey does not also get dragged into the parallel run.

`tests/uat/reis.spec.ts` is **one test with `test.step()` calls**, not a series of tests:
Playwright gives every test a fresh browser context, which would wipe localStorage and
IndexedDB between steps, and the whole point is that the state carries. It walks the path
a user walks — fill in the company, invoice two customers, re-download and inspect one,
delete it, convert a quotation, encrypt everything, reload, unlock, export, delete the
last one, wipe — and so it catches what only exists in sequence. It already caught an
index-based archive lookup that deleted the wrong document once a quotation shifted the
order; prefer `archiveRowFor(nummer)` over `archiveRow(i)` for that reason.

`UAT_BASE_URL` points it at a real site instead, which is how CI re-runs it against
GitHub Pages after deploying. That is safe to do against production precisely because
there is no backend: everything the journey creates lives in the test's own browser
profile and goes away with it. It is the step that catches publication-only faults — a
wrong `basePath`, a missing `.nojekyll`, an asset Pages will not serve.

**All selectors live in `tests/helpers.ts`.** The form's `<label>` elements have no
`htmlFor`, so `getByLabel` does not work and placeholders are the stable handle. If you
split `InvoiceForm` up, that file should be the only test file needing changes.

Two selectors there are deliberately narrower than they look. `preview` is scoped to
`.preview-wrapper .invoice-preview` because the archive dialog renders a second
`.invoice-preview`, and `deleteClient` matches on `title` rather than the name
"Verwijderen", which every archive row also has. Both would otherwise match more than
one element the moment a document is saved.

Run the suite before and after any refactor. It exists precisely because
`InvoiceForm.tsx` is large and under-typed at the layout level.

## Conventions

- **UI text, labels and code comments are in Dutch.** Keep it that way.
- Indentation is inconsistent across files (2 spaces in `app/` and `ItemRow.tsx`,
  4 elsewhere). Match the file you are editing; do not reformat wholesale.
- Vanilla CSS with custom properties in `app/globals.css`. No Prettier, no Tailwind.
- Styling is mostly inline `style={{}}` objects. That is the existing idiom.

## Known gaps and deliberate decisions

- `InvoiceForm.tsx` is ~770 lines: roughly 540 of state and handlers, 230 of
  composition. The company, payment, client and archive sections were extracted to
  `components/form/`; *Algemene Informatie*, Items and the action buttons were left
  in place because pulling out another ~50 lines behind a props interface buys little.
  Only **one** `isQuotation` branch remains, inside `updateDocument` itself, and it is
  load-bearing: every field handler goes through `updateDocument` / `updateSender` /
  `updateClient` / `updateItems`. The handlers are genuinely interdependent
  (`handleConvertToInvoice` touches both drafts, the numbering store and the tab
  state), so splitting them into hooks would likely cost more clarity than it buys.
- Settings import (`importSettings`) only checks that the file parses to an object —
  any shape beyond that is written straight into the settings store. That now includes
  `documents` and `documentsKey`, which go into the archive through `replaceDocuments`
  unvalidated.
- **The archive is unencrypted unless the user sets a passphrase**, and company details,
  the customer book and the numbering are unencrypted either way. See *The optional
  passphrase* above for why, and for what encryption does and does not buy.
- Tests that depend on persisted state must call `waitForHydration` (or `openFoldout`,
  which does it) after a reload. `readServerX` returning defaults means a section the
  user had opened renders closed for one frame, and a click in that window toggles the
  DOM behind React's back — which is exactly how three encryption tests failed before
  the helper existed.
- `npm audit` reports a handful of high-severity issues in the ESLint toolchain
  (brace-expansion, micromatch and friends). They are dev-only, build-time ReDoS/DoS
  issues that never reach the browser, and npm's only proposed "fix" is downgrading
  `eslint-config-next` to 14.x — **do not do that.**
- ESLint 10 and TypeScript 7 are allowed by peer ranges but untested here. Both are
  majors; upgrade deliberately, not incidentally.
- One lint warning remains: the `<img>` hint in `InvoicePreview`. `next/image` cannot
  help there — the logo is a browser data URL and image optimisation is off under
  static export — so the same hint in `CompanyDetails` carries an explicit disable
  with that reason.

## AGENTS.md is generated

`next dev` writes and re-adds the marker block in `AGENTS.md`. Because that file exists
and hosts the block, Next **skips `CLAUDE.md`** entirely (see
`node_modules/next/dist/server/lib/generate-agent-files.js`), which is why this file is
safe to edit by hand. Keep the `@AGENTS.md` import on the first line and commit
`AGENTS.md` rather than fighting its regeneration.

Do **not** write Next's `BEGIN:nextjs-agent-rules` HTML comment into this file — not
even as an example. The generator decides where to write by a plain substring search
for it, so a stray copy here can redirect the upsert into `CLAUDE.md` if `AGENTS.md`
ever loses its block, and clobber this document.
