@AGENTS.md

# Facturen

A client-side invoice and quotation generator for the **Dutch** market. No backend,
no database, no accounts: everything lives in the browser.

Plenty *is* persisted, all of it on the device: company and payment details, the
customer book, the running document numbers and which sections you collapsed in
`localStorage`; the archive of issued documents in IndexedDB; and, if you set a
passphrase, the key header beside it. Only the theme is cosmetic. See *State lives in
four places* and *The archive* below — the privacy claim is "it never leaves this
browser", not "it is not written down".

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
  csp.ts             the Content-Security-Policy the page ships with
  analytics.ts       the GoatCounter visit pixel, off unless configured
  utils.ts           formatting (currency, date, IBAN) + all VAT arithmetic
  vat-schemes.ts     the VAT regime: statement on paper + UBL category
  countries.ts       country names to ISO codes, and who is in the EU
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
  ubl.ts             the e-factuur: the same invoice as UBL/NLCIUS XML
types/index.ts       Invoice, Quotation, Sender, Client, LineItem, VatScheme
scripts/             controleer-publicatie, controleer-efactuur, statische-server
tests/               Playwright end-to-end specs
```

`Quotation extends Omit<Invoice, 'invoiceNumber'>` and adds `quotationNumber` and
`validUntil`. The two are held as **separate `useState` drafts** in `InvoiceForm`
(`InvoiceDraft` / `QuotationDraft`, which omit everything living in the stores), and
`handleToggleType` copies the shared per-document fields when you switch tabs.

## State lives in four places, deliberately

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

So under `kor` the document must show **no BTW column, no per-rate BTW
rows, and no subtotal** (a subtotal identical to the total is noise) — just a total and
the exemption sentence. Rendering `BTW (0%): € 0,00` on a KOR invoice is a compliance
bug, not a cosmetic one.

The regime governs **display only**. It must never overwrite each line's `vatRate`: an
earlier version zeroed every rate on toggle, which destroyed the data permanently when
you toggled back off.

**0% is not one thing either.** `lib/vat-schemes.ts` holds the document's regime —
`normaal`, `kor`, `verlegd`, `icp`, `export`, `nultarief` — because a Dutch invoice at 0%
has four legitimate reasons and each needs a different statement on paper *and* a
different UBL category:

| Regime | Statement on paper | UBL | Needs client VAT no. |
|---|---|---|---|
| `kor` | KOR exemption, art. 25 Wet OB | `E` | no |
| `verlegd` | btw verlegd, verleggingsregeling | `AE` | **yes** |
| `icp` | intracommunautaire levering | `K` | **yes** |
| `export` | uitvoer buiten de EU | `G` | no |

**A plain zero rate is not a regime** — it is `normaal` with lines at 0%, which already
shows `BTW (0%): € 0,00` and already produces UBL category `Z` via the per-rate path.
A `nultarief` regime existed briefly and was wrong: a genuine zero rate is not an
exemption, so the law wants the rate and the amount *shown*, and that regime hid them.
It survives in `VAT_SCHEMES` but not in `VAT_SCHEME_ORDER`, so it cannot be chosen while
an archived document carrying it still renders as issued — the same reason `isVatExempt`
is still there. `schemeOf()` also falls back to `normaal` for any value it does not
recognise, so an imported file cannot crash the app on a missing table row.

This replaced a plain `isVatExempt` boolean plus a bare 0% rate, which said *nothing*
about why there was no VAT — incomplete on paper and wrong in the XML. The regime is
**per document, not per line**, because these follow from who the client is and where
they are, not from what you sold; a half-intracommunautaire invoice does not exist.

`schemeOf()` is the only place that reads the legacy `isVatExempt`, so archived documents
from before the regime existed keep working without ever being rewritten. Everything else
asks `schemeOf()`.

**Every path that copies a document must carry the regime, via `schemeOf()`.** There are
three — `handleToggleType`, `handleConvertToInvoice`, `handleDuplicateDocument` — and when
the regime was introduced all three were missed: they still copied `isVatExempt`, which is
`false` on any new document, so switching tabs, converting a quotation or duplicating an
archived invoice silently reset the regime to `normaal` and put 21% VAT on a document that
must not carry any. Nothing in the existing suite noticed, because every KOR test set the
regime and then looked at the same document. `tests/vat-scheme-carry.spec.ts` covers all
three plus the per-line rate being disabled, and each assertion was seen to fail first.

Every non-`normaal` regime looks **identical** on the document — lines excluding VAT, no
VAT amounts, total equal to the subtotal, plus the statement. That is why
`summariseDocument` did not need to change: only the sentence and the category differ.

Three traps found by the official validator, not by reasoning:

- **`BR-Z-10` forbids an exemption reason on category `Z`.** The statement on paper and
  the UBL `TaxExemptionReason` are *different fields*. Only the retired `nultarief`
  regime maps to `Z`; a 0% line under `normaal` goes through the per-rate loop, which
  never emits a reason.
- **`BR-IC-11` and `BR-IC-12`** require an actual delivery date and a deliver-to country
  for `icp`, hence `cac:Delivery`. `Invoice.deliveryDate` is more general than that,
  though — see below.
- **`cac:Delivery` must sit between `AccountingCustomerParty` and `PaymentMeans`.** UBL is
  a fixed sequence and Schematron does not check order — that is the XSD's job, and we
  have no XSD validator. Order was verified by extracting the sequence from
  `UBL-Invoice-2.1.xsd` and confirming ours ascends monotonically.

**One rule no validator can check:** `icp` to a Dutch client is a domestic supply, and to
a non-EU client it is export. `ontbrekendeVelden` refuses both, because it is a fact about
the transaction rather than about the file — the same blind spot as `E` versus `Z`.

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

**The date of supply belongs on the invoice when it differs.** Art. 35a lid 1 Wet OB 1968
wants the date the goods or service were supplied *"voor zover die datum vastgesteld en
verschillend is van de uitreikingsdatum"* — which is the normal case the moment you
invoice after the fact, as most freelancers do at month end. `Invoice.deliveryDate` holds
it, and `supplyDateOnDocument()` in `lib/utils.ts` decides whether it is shown: filled
*and* different from the invoice date. Equal to the invoice date it is noise, so it is
suppressed. That one rule lives in `utils.ts` rather than in the renderers, so the
preview and the PDF cannot disagree about it; both print it, and `tests/pdf.spec.ts`
checks they match. In UBL it is `cac:Delivery/cbc:ActualDeliveryDate`, emitted whenever
the field is set — not only for `icp`, which merely *also* requires it.

Note this is a different field from a due date, and does not reopen that question:

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

## The visit counter, and what it costs the privacy claim

`lib/analytics.ts` plus `components/VisitCounter.tsx` count page views with
GoatCounter. Deliberately **not** their `count.js`.

**A third-party script was not an option.** This page holds decrypted client data and,
while the archive is unlocked, the key in memory — `SecurityPanel.tsx` tells users
exactly that. Loading someone else's script into it is the risk that panel describes.
An image request cannot read anything, so the counter is a pixel whose URL this app
builds itself, filling in referrer and screen size that GoatCounter's script would
otherwise collect. The policy therefore grows by **one host in `img-src` only**;
`script-src` and `connect-src` are untouched.

**It is off unless `NEXT_PUBLIC_GOATCOUNTER` is set.** No variable, no pixel, and the CSP
is byte-identical to before — which is how the dev server and the whole test suite run.
It is set only in `pages.yml`.

**It stays silent for anyone who asked**: Do Not Track, Global Privacy Control, and
`navigator.webdriver`. That last one matters practically — the publication check and the
UAT journey open the published build several times per commit, and without it every CI
run would land in the statistics.

**The absolute claim had to go.** "This page makes no outbound request" was true, tested
and enforced; it no longer is. What survives is the claim that actually mattered: *what
you type never leaves the browser*. `tests/privacy.spec.ts` now asserts that any request
leaving the origin is the counter and that it carries none of the document's content,
and `scripts/controleer-publicatie.mjs` fails the build if a request smuggles out a name
filled into the form. The README and `SecurityPanel.tsx` say plainly that counting
happens — an app that asks for trust reports its own telemetry rather than waiting to be
found out.

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

## The e-factuur is a third renderer

`lib/ubl.ts` writes the same invoice as UBL 2.1 in the Dutch customisation —
**NLCIUS / SI-UBL 2.0** — so the recipient's bookkeeping can read it instead of a human
retyping a PDF. Central government already accepts nothing else, and domestic B2B is
coming. It fits this app because it needs no server: it is a text file built in the
browser. This app produces the file; it does not send it over Peppol.

**It is a third view of one document, so it takes its numbers from
`summariseDocument`.** The same rule as for the preview and the PDF, and for the same
reason — an e-factuur quoting different amounts than the PDF sent alongside it is worse
than no e-factuur. Never compute VAT here.

**The category comes from the document's regime**, not from a boolean — see *0% is not
one thing either* above. `taxCategory()` is the one place that decides, and only falls
back to the per-line rate (`S` above zero, `Z` at zero) for `normaal`. Its test was
validated by flipping KOR to `Z`.

**Country codes are resolved, never guessed** (`lib/countries.ts`). An earlier version
mapped anything that was not "Nederland" or already a two-letter code to `NL`, so a
Belgian client was labelled Dutch on *every* invoice. Unknown input now makes
`ontbrekendeVelden` refuse rather than emit a plausible lie.

**Two fields exist only for this** and deliberately do not appear on the PDF, because
paper is read by a person and processing metadata does not belong there:

- `Invoice.buyerReference` — NLCIUS requires a buyer reference or an order reference. It
  is how the buyer's AP system matches the invoice to an order or cost centre, so
  `ontbrekendeVelden` refuses export without it rather than quietly substituting the
  invoice number, which would pass validation and then still be rejected in practice.
- `Client.kvkNumber` — the buyer's Peppol endpoint. Optional, because a foreign client
  or a consumer has no KvK number, and refusing export would be worse. Without it the
  file is still valid NLCIUS to hand over directly, but a Peppol access point cannot
  route it.

**Free-text units become UN/ECE Rec 20 codes.** The unit field is deliberately free —
nobody knows every unit — so `unitCode()` maps what it knows and falls back to `C62`
("one"). An invented word must not make the file invalid; the line description carries
the real meaning.

**The official Schematron runs too, and it is not the same thing as our own tests.**
`npm run check:efactuur` (`scripts/controleer-efactuur.mjs`) drives the built app,
downloads one invoice per VAT regime — six of them — and puts each through the
Nederlandse Peppolautoriteit's compiled SI-UBL 2.0 stylesheet with Saxon-HE. It fires
**86 rules** on a normal invoice. Both artefacts are permissively licensed (the
validation repo is MIT, Stichting Simplerinvoicing; Saxon-HE is MPL-2.0), pinned to an
exact version, fetched on use into `.validatie-cache/` rather than vendored, and cached
in CI. It needs a JRE, which is why both workflows set up Java.

Why both layers exist, and why neither replaces the other:

- `lib/ubl.ts` and `tests/ubl.spec.ts` were written by the same hand, so those tests can
  only confirm what that hand already believed. The Schematron is an independent oracle,
  and it earned that immediately: `BR-NL-1` (supplier KvK or OIN) and `BR-NL-2` (buyer
  reference or order reference) turn out to be hard NLCIUS requirements, not the
  judgement calls they were written as.
- **The Schematron cannot see the `E`/`Z` distinction.** Both are valid UBL; whether
  *this* invoice is exempt rather than zero-rated is a question about the Wet OB that no
  schema can answer. Verified by feeding it a KOR invoice written as `Z` — it passes.
  That is precisely the mistake this app exists not to make, so it stays guarded by
  `tests/ubl.spec.ts`, which was in turn validated by flipping `taxCategory()`.

The script's own teeth were checked by removing `BuyerReference` from `lib/ubl.ts` and
confirming it exits 1 naming `BR-NL-2` on every invoice it generates.

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
`InvoiceDocument.tsx`.** Fixing one alone is how these two drift apart. If it changes
*amounts* or the VAT treatment, `lib/ubl.ts` is a third place that says the same thing —
though it takes them from `summariseDocument`, so sharing that function is what keeps all
three in step.

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

npm run check:efactuur            # the e-factuur through the official SI-UBL validator
```

`check:efactuur` needs a JRE (`apt install default-jre`); it says so and exits rather
than quietly skipping. It also needs `out/`, so build first.

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
