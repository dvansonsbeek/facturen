@AGENTS.md

# Facturen

A client-side invoice and quotation generator for the **Dutch** market. No backend,
no database, no accounts: everything lives in the browser.

Plenty *is* persisted, all of it on the device: company and payment details, the
customer book, the running document numbers, which sections you collapsed and which
build you last saw in `localStorage`; the archive of issued documents in IndexedDB;
and, if you set a passphrase, the key header beside it. Since the service worker, the
**whole application** is in Cache Storage as well, so it starts without a network.
Only the theme and the last-seen build are cosmetic. See *State lives in four places*,
*The archive* and *Offline, and which version you have* below — the privacy claim is
"it never leaves this browser", not "it is not written down".

## Provenance and repo rules

This repo is a fork of [eraycode/factuurr](https://github.com/eraycode/factuurr), a
**Belgian** invoice generator, adapted to Dutch invoicing law.

**On the name.** It was renamed from *Factuurr* to *Facturen* when the fork was made,
and renamed **back to Factuurr** in October 2026 — a deliberate reversal, not drift.
*Facturen* is unusable as a name: it is one of the most generic words in Dutch, so
nobody who wanted the app back could ever find it. Meanwhile `factuurr.nl` was bought
and the word appeared **nowhere** on the site except inside URLs, so a visitor could
use the app for days without once reading what it is called. The name now lives in
`lib/site.ts` as `NAAM` and `tests/page.spec.ts` holds the seven places that must agree.

This does re-use the upstream project's name. That was weighed and chosen; the licence
attribution in `LICENSE` and the provenance commits are what credit Eray's work, and
they are untouched. Still: do not contact the original author.

- Two remotes: `origin` is this fork at
  [dvansonsbeek/facturen](https://github.com/dvansonsbeek/facturen) (public), `upstream`
  is Eray's original. Every push to `main` publishes to
  [factuurr.nl](https://factuurr.nl/) via GitHub Pages, gated on the test suite.
  The custom domain is set on the repo, so the site sits at the **root** and
  `PAGES_BASE_PATH` is no longer set anywhere — `next.config.ts` then leaves
  `basePath` and `assetPrefix` off. The old project URL redirects here. Never
  push to `upstream`.
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
  voorwaarden/       gebruiksvoorwaarden + privacy, the only other route
components/
  InvoiceForm.tsx    the container: all form state, handlers and composition
  ThemeApplier.tsx   puts data-theme on <html>, on every page
  ServiceWorker.tsx  registers public/sw.js, published build only
  VersieMelding.tsx  says once when the app was updated under you
  VisitCounter.tsx   the GoatCounter pixel; renders nothing
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
  backup.ts          the Export/Import file format: builds it and vets it
  utils.ts           formatting (currency, date, IBAN) + all VAT arithmetic
  vat-schemes.ts     the VAT regime: statement on paper + UBL category
  countries.ts       country names to ISO codes, and who is in the EU
  iban.ts            the IBAN check digits (ISO 7064 MOD-97-10)
  theme.ts           light/dark store read via useSyncExternalStore
  versie.ts          the build date, and whether it changed since your last visit
  settings.ts        company + payment details, persisted in localStorage
  clients.ts         the saved customer book, persisted
  numbering.ts       the running invoice/quotation numbers, persisted
  documents.ts       the archive of issued documents, in IndexedDB, append-only
  idb.ts             the IndexedDB schema; the only module that knows its shape
  vault.ts           the passphrase, the key, and who participates in it
  crypto.ts          AES-256-GCM + PBKDF2 primitives
  foldouts.ts        which sections the user collapsed, persisted
  image.ts           downscales an uploaded logo so it fits in localStorage
  taal.ts            what the *document* says, per language; the app stays Dutch
  page-numbers.ts    stamps "pagina 1 van 2" onto the finished PDF
  payment-qr.ts      the EPC069-12 payment QR: payload + module matrix
  ubl.ts             the e-factuur: the same invoice as UBL/NLCIUS XML
public/sw.js         the service worker: makes the app start without a network
public/favicon.ico   the .ico fallback, generated from app/icon.svg
types/index.ts       Invoice, Quotation, Sender, Client, LineItem, VatScheme
scripts/             controleer-publicatie, controleer-efactuur, statische-server,
                     maak-favicon
tests/               Playwright end-to-end specs
tests/uat/           reis.spec.ts (the journey) + offline.spec.ts, published build only
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
- **Per browser** (`lib/theme.ts`, `lib/foldouts.ts`, `lib/versie.ts`): theme, collapsed
  sections, the build you last saw. The theme is *applied* by
  `components/ThemeApplier.tsx` in the layout, not by `InvoiceForm` — it used to be in
  the form, and since the form only exists on the home page, the voorwaarden route was
  permanently light. The toggle button stays in the form; that is a control, this is
  applying the choice. A useful side effect: `waitForHydration` keys on `data-theme`, so
  it now works on that route too.
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
| `export` | uitvoer buiten de EU (**goods**) | `G` | no |
| `dienst-buiten-eu` | not taxed in NL, taxed where the customer is | `O` | no |

**`export` and `dienst-buiten-eu` are not the same transaction, and conflating them
misfiles the user's VAT return.** "Uitvoer" is a goods concept. For a *service* to a
business outside the EU the place of supply moves to the customer: no Dutch VAT, and
Ondernemersplein is explicit that you *"geeft deze dienst niet aan in uw Nederlandse
btw-aangifte"* — it is out of scope, not zero-rated. Booked as 0% export it lands in
**rubriek 3a**, which is for goods. Jortt warns its own users about exactly this. Most of
this app's users sell services, so the goods-only regime was the more likely pick and the
wrong one.

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

### Adding a field to a document? Four paths, every time

This is the rule, not an anecdote about VAT. A new field on `Invoice` is only half
written when the form holds it. **Four handlers in `InvoiceForm.tsx` decide what survives**,
and each has to be considered separately:

| Handler | What it must do |
|---|---|
| `handleToggleType` | carry it between factuur and offerte |
| `handleConvertToInvoice` | carry it from an accepted quotation onto the invoice |
| `handleDuplicateDocument` | take it **from the archived document**, not from the current draft |
| `handleNextDocument` | decide deliberately whether to clear it |

It has now happened twice, identically.

**The VAT regime.** All three copying paths still copied `isVatExempt`, which is `false` on
any new document, so switching tabs, converting a quotation or duplicating an archived
invoice silently reset the regime to `normaal` and put 21% VAT on a document that must not
carry any. Nothing in the suite noticed, because every KOR test set the regime and then
looked at the same document. `tests/vat-scheme-carry.spec.ts` covers all three plus the
per-line rate being disabled, and each assertion was seen to fail first.

**The discount**, months later, in exactly the same way. Worst case: quote €500 with €50
off, the client accepts, you convert — and the invoice charges €605 instead of €544,50, more
than you offered. `handleNextDocument` is the opposite case and must *clear* it: a discount
is an agreement about this job, not a standing setting, so carrying it forward would
silently undercharge.

**A test for this passes for the wrong reason unless you force it.** The duplicate test was
green while `handleDuplicateDocument` ignored the field entirely — the current draft still
held the value, so it proved nothing. Clearing the draft first (via *Volgende factuur*) is
what makes it meaningful, and doing that is what revealed that *Volgende factuur* cleared
nothing either.

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
- **`BR-O-02` forbids *every* VAT identifier on a category `O` invoice** — the seller's
  (BT-31), the tax representative's (BT-63) **and the buyer's** (BT-48). That breadth is
  the trap: the first attempt dropped only the seller's and was still rejected, because
  the client's was still there. `BR-O-05` additionally forbids any `cbc:Percent`, not even
  `0.00`. Both are handled by `buitenBereik()` / `zonderBtwNummers()` in `lib/ubl.ts`.

  Two things survive, and both were measured rather than assumed. **`BR-NL-1` still
  passes**, because the supplier stays identifiable by KvK through `PartyLegalEntity` and
  `EndpointID` — had it not, category `O` would have been unusable here. And
  **`BR-O-11`/`BR-O-12`**, which forbid mixing `O` with another category on one document,
  cannot fire: the regime is per document, never per line.

  **Paper and XML deliberately disagree here**, and omitting it is the *only* conforming
  option — checked, not assumed. Art. 35a lid 1 Wet OB wants your btw-identificatienummer
  on the invoice; `BR-O-02` forbids it in the file. So it prints on the PDF and is absent
  from the e-factuur. Two things settle that this is intended rather than an oversight to
  work around:

  - The EN 16931 maintainers were asked to soften `BR-O-02` from "shall not" to "should
    not" ([issue #40](https://github.com/ConnectingEurope/eInvoicing-EN16931/issues/40))
    and closed it **wontfix**: changing it would mean revising the EN itself.
  - The workaround used elsewhere — carry the number as `BT-32`, the seller *tax
    registration* identifier, instead of `BT-31` — **NLCIUS specifically blocks**.
    `BR-NL-25`: *"The use of a seller tax registration identifier … is not recommended
    when the tax scheme is not VAT, since this is not applicable to suppliers in the
    Netherlands."* Verified by putting the number back under `TaxScheme` `LOC` and `TAX`
    and watching `BR-NL-25` fire on both.

  So there is no second option to weigh. In practice the stakes are low anyway: a non-EU
  client is rarely reachable over Peppol, so the PDF — which does carry the number — is
  the artefact that actually travels.
- **`cac:Delivery` must sit between `AccountingCustomerParty` and `PaymentMeans`.** UBL is
  a fixed sequence and **Schematron does not check order** — that is the XSD's job, and
  there is no XSD validator here. `check:efactuur` therefore pulls the element sequence
  out of the official `UBL-Invoice-2.1.xsd` and `UBL-CreditNote-2.1.xsd` and asserts ours
  ascends monotonically, for every generated document. This replaced checking it by hand,
  which had already been needed twice. Validated by moving `cac:Delivery` after
  `PaymentMeans`: the Schematron passed every document while the order check named
  the fault exactly — which is the whole reason it exists.

**One rule no validator can check:** `icp` to a Dutch client is a domestic supply, and to
a non-EU client it is export. `ontbrekendeVelden` refuses both, because it is a fact about
the transaction rather than about the file — the same blind spot as `E` versus `Z`.

### Discount is on the total, and that is a VAT problem

`Invoice.discount` is `{ soort: 'bedrag' | 'procent'; waarde: number }` — one discount over
the whole document, not per line. That was a deliberate choice: what people ask for is
*"€ 50 eraf omdat het uitliep"*, not a different price per item. A percentage is taken over
the subtotal **excluding** VAT; over the VAT-inclusive amount it would reduce the VAT itself,
which is not what a discount does.

**The hard part is apportionment.** With 21% and 9% lines on one invoice, the discount must
be split over both rates — taking it all off one rate makes the VAT wrong. But rounding each
share independently leaves cents adrift, and then the printed VAT lines do not add up to the
printed total: exactly the failure `roundToCents` exists to prevent. So
`grondslagNaKorting` rounds every rate except the one with the **largest base**, which
absorbs the remainder — smallest proportional distortion, and the sum is exact to the cent.

**`summariseDocument` returns `vatBases`** (the per-rate base *after* discount) precisely so
the e-factuur does not recompute the split. Two places doing the same division is how paper
and XML drift apart.

**The subtotal returns under KOR when a discount exists.** It is suppressed there because
without VAT it is the same number as the total and therefore noise — but with a discount it
is not the same number any more, and without it you cannot see what the discount came off.

**In UBL it is one `cac:AllowanceCharge` per tax category**, not a single figure: EN 16931
requires the recipient to reconcile each base to its rate. `LineExtensionAmount` stays the
sum of the lines (`BR-CO-10`), the discount sits in `AllowanceTotalAmount` and is subtracted
in `TaxExclusiveAmount` (`BR-CO-13`). None of that is something our own tests can judge, so
`check:efactuur` carries a ninth case — two rates plus a deliberately unround €33,33, so the
split has to absorb a cent — and the official validator passes it.

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

## The document can be English; the app cannot

`lib/taal.ts` holds every fixed string the document prints, per language. `Invoice.taal`
picks one, per document, exactly like the VAT regime.

**The app's interface stays Dutch, deliberately.** The user is a Dutch entrepreneur and
reads the form fine; it is their *client* in Stuttgart or Chicago who could not read the
output. Scoping it to the document rather than doing i18n of the app is what makes this a
small feature instead of a rewrite.

**It exists because the VAT work made it necessary.** Three of the six regimes — `icp`,
`export`, `dienst-buiten-eu` — are *defined* by the client being abroad, and every one of
them produced a sheet headed FACTUUR saying *"Wij verzoeken u vriendelijk…"*. Precision
about that client's VAT treatment is worth little if they cannot read the page.

**The e-factuur is untouched.** UBL carries category codes, not prose. Only
`TaxExemptionReason` follows the document's language, so paper and file state the same
sentence.

- **The VAT statements are `Record<Taal, string>`**, so TypeScript refuses a regime without
  a translation. These sentences carry the legal treatment, and **no validator checks
  them** — the Schematron sees only the category, the same blind spot as `E` versus `Z`.
  They deserve an accountant's eye alongside the `BR-O-02` question.
- **Amounts and dates change notation, which is not cosmetic.** `€ 1.234,56` reads as a
  thousand times too little to an anglophone, and `09-10-2026` reads as 10 September to an
  American. English documents use `en-IE` (`€1,234.56`) and `9 Oct 2026`.
- **Month names come from a fixed table, not `Intl`.** `en-GB` renders "Sept" and `en-US`
  puts the month first, and which you get depends on the environment's ICU. `tests/pdf.spec.ts`
  compares preview against PDF, so that variance would surface as a flake.
- **`taal` travels all four copy paths** (see *Four paths, every time*), and the fourth is
  the interesting one: *Volgende factuur* **keeps** it, unlike the discount. That button
  keeps the client, and the language belongs to the client — resetting it would quietly
  make the next invoice to the same German customer unreadable.
- **Only fixed text is translated.** Units and line descriptions are the user's own words
  and stay as typed; the help text says so, because otherwise they look like a bug.

**The payment term became a number for exactly this reason.** It used to be free text
(`"Binnen 14 dagen na factuurdatum."`), which meant an English invoice read *"Payment
terms:"* followed by a Dutch sentence. It was the only field where that happened, because
it is the one sentence the app had *seeded* rather than the user having chosen the words.
`CompanySettings.paymentTermDays` (default **30**, where Dutch law also lands when nothing
is agreed) generates it per language.

- **Free text survives as an override**, and deliberately so: a number cannot say "vooraf
  te voldoen" or "50% bij opdracht, 50% bij oplevering". Dropping the field would have
  removed those terms from under existing users at their next edit. An override is never
  translated, and the field says so.
- **`paymentTermsOnDocument()` in `utils.ts` is the single resolver** — override first,
  then the generated sentence — so the preview, the PDF and `cac:PaymentTerms/cbc:Note`
  cannot disagree.
- **That precedence order also handles archived documents for free.** A document issued
  before this change carries only the old sentence and no day count, so it falls into the
  override branch and renders exactly as issued. Same shape as `schemeOf()`: migrate on
  read, never rewrite what was saved.
- **`uitOudeBetaaltermijn()` converts stored settings losslessly.** Anything matching
  `Binnen N dagen na factuurdatum` becomes the number; anything else is kept verbatim as
  the override. Both branches are tested, because silently resetting someone's agreed term
  to 30 days would be a real change to their invoices.

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

**Correcting a sent invoice is what the creditfactuur is for.** Immutability left no lawful
way to fix a mistake, which was a hole this opened. `Invoice.creditOf` holds the original's
number and date; when set, the document is a credit note. It is created from the archive —
you credit a *specific* invoice, you do not write one from scratch — and `creditReference()`
in `lib/utils.ts` builds the one sentence all three renderers use, because the reference to
the original has to be clear and unambiguous.

Amounts stay **positive**. The document type already says which way the money goes; a minus
sign would say it a second time and thereby reverse it. The paper says *Te crediteren*
instead of *Totaal* and drops the "please transfer" footer, because on a credit note the
money moves the other way.

Three paths must clear or carry `creditOf` deliberately: *Volgende factuur* clears it (else
you would silently credit the same invoice twice), converting a quotation clears it, and
duplicating a credit note carries it. Same class of bug as the regime migration, so
`tests/creditnota.spec.ts` covers all three.

**Searching it is not a nicety.** The archive was the one part of the app that got *worse*
the more you used it: everything in one list, newest first, nothing else. Fine at ten
documents, unusable at three hundred — and three hundred is where you end up, because the
bewaarplicht runs seven years (art. 52 lid 4 AWR). This file claimed the terms page said so;
it did not, and now it does, next to the advice to keep the Export somewhere that survives
those years. One field matches number, client, type, amount
and the date in **both** forms, since it is stored as `2026-10-08` and shown as `08-10-2026`
and someone typing "2026" means both. It appears only from six documents: below that you can
see everything and a search box is clutter. The "1 van 7 documenten" count is load-bearing —
without it a filtered list reads like an archive something has vanished from, which is the
wrong fright to give someone about their own invoices.

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

**But "cannot read" is not "cannot carry".** That one host is a destination, and
`script-src` keeps `'unsafe-inline'` because Next needs it, so injected code could put a
client name into an image URL aimed at it. Narrow — one host, a GET — but real, and it
means the CSP no longer makes exfiltration *impossible*, only single-destination.
`SecurityPanel.tsx` and the README said it was impossible; both now name the exception
instead, because a claim without its limit is the one thing this project does not ship.

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

## What the app claims, and why those sentences are load-bearing

`app/voorwaarden/page.tsx` (the only other route), the footer in `app/page.tsx`, the
*Beveiliging en privacy* panel — and `tests/positionering.spec.ts`, which exists so
none of it quietly disappears.

**The positioning is the consequences, not the word "privacy".** Nobody chooses a tool
because it is privacy-friendly. They choose it because there is no account to make, no
subscription to lose, nothing to export when they leave — and, the strongest and least
obvious one, **no verwerker**. Put client data in a hosted bookkeeping package and that
supplier is a processor under the AVG: you need a verwerkersovereenkomst, you inherit
their sub-processors, and a breach at their end is your breach. Here there is nobody to
sign anything with. Competitors cannot copy that without abandoning their business
model, which is what makes it worth saying.

**Every such claim ships with its limit, and the limits are tested too.** What
disappears is the processor, not the responsibility: that moves to the device, and a
stolen laptop without a passphrase is still a data breach. `SecurityPanel` already does
this for encryption. A claim that reads better once the caveat is trimmed is exactly the
one not to trim — `tests/positionering.spec.ts` asserts the caveats, not just the
claims.

**"Er is geen betaalde versie" is structural, not a promise.** MIT on a public repo
means the last free version stays usable whatever happens later. A voluntary
contribution does not contradict it *provided* the page says it buys nothing extra —
that sentence is the difference between a gift and a disguised subscription, and it is
pinned.

**The donation link is an anchor, never their button script.** Buy Me a Coffee and
Ko-fi both offer a `<script>`. Loading one is precisely what `lib/analytics.ts` refused
for the counter: this page holds decrypted client data and, while unlocked, the key in
memory. A link transmits nothing until clicked. It is off without
`NEXT_PUBLIC_KOFFIE`, like the counter — and the variable is named for the thing, not
the supplier, because that supplier has already changed once (Ko-fi → Buy Me a Coffee,
October 2026) and renaming it again would mean touching the workflow, the repo variable
and the tests for no reason.

**The terms page carries a hand-maintained date, deliberately.** Deriving `BIJGEWERKT`
from the build would shift it on every unrelated publish, so the page would claim the
terms changed when they had not — a date that lies is worse than one that is old, the
same reasoning that keeps a copyright year out of the footer. Because hand-maintained
means forgettable, `tests/voorwaarden.spec.ts` fingerprints the page text *excluding*
the date line: change the wording and it goes red naming the new fingerprint; bump only
the date and it stays quiet, since that is never a mistake.

**A second route is what breaks on publication**, so `check:publicatie` walks to it via
the footer link rather than building the URL, and the UAT journey visits it against the
real site. Both earned it: `next/link` navigates by fetch, which the strict
`connect-src` forbids, so the link worked in development and was **dead once published**
— hence plain `<a>` with the base path applied by hand. And `scripts/statische-server.mjs`
could not serve an extensionless path at all, because with one page it had never been
asked to.

## Offline, and which version you have

`public/sw.js` (the worker), `components/ServiceWorker.tsx` (registration),
`lib/versie.ts` + `components/VersieMelding.tsx` (which build you are on).

Without it every start was a round trip to the host, which is odd for an app whose
data is already on the device — only the *program* needed the network. For most sites
offline support is a half-measure: the shell loads and the data is missing, because the
data lives on a server. Here there is no server, so **the shell is the product**.
Archive, preview, PDF and e-factuur all run in the browser; cache the files and you
have the whole thing.

**Online always wins, and that is a compliance decision, not a performance one.** The
document is fetched network-first, and everything under `/_next/static/` is
content-hashed, so a new build simply has new filenames. There is deliberately **no
"new version available" button and no frozen-by-default mode**, tempting as the
owned-software framing is. A frozen version keeps producing *wrong invoices after the
fix has shipped* — this repo produced three such bugs in a single day (the missing
`worker-src` killing Download PDF with a logo, a converted quotation charging 21% on a
KOR invoice, every Belgian client labelled Dutch in the e-factuur). The people least
likely to notice such a bug are also the least likely to press an update button.

**Never `skipWaiting()` with an automatic reload.** The draft you are typing lives in
`useState`, not storage, so a refresh nobody asked for throws away a half-written
invoice.

**Install precaches the referenced assets, and that is not optional.** A worker only
starts intercepting once it is active, by which time the bundle requests have already
gone straight past it. Caching only the HTML meant offline worked from the *second*
visit — which the test caught. `install` therefore pulls both routes and greps their
HTML for `/_next/static/` URLs. A regex rather than a build-time manifest: three lines
here against an extra build step.

**Registration is production-only**, gated like the visit counter. In development a
worker fights hot reload, and in the suite it would drag state between tests that must
start clean. That is why the offline test lives in `playwright.productie.config.ts` —
the behaviour does not exist anywhere else. It asserts that with the network cut you
can still produce a *correct* invoice, not merely that a worker is registered.

**The build date is shown because the app can now be old.** A text editor from 1995
does not rot; an invoicing tool does — VAT rates move, the KOR threshold moves,
EN 16931 carries a year, and e-invoicing is compulsory from 1 July 2030.
`NEXT_PUBLIC_BOUWDATUM` comes from `next.config.ts`, appears in *Beveiliging en
privacy*, and `VersieMelding` says once when the build changed since your last visit.
Silent updates are safe; silent updates you cannot *see* are not.

`lib/versie.ts` follows the usual store shape, and must: a `useEffect` + `setState`
would trip `react-hooks/set-state-in-effect`, and `readServerVersie` returns null
because the server cannot know what you saw last time.

**If it ever has to be undone**, deleting `sw.js` is not enough — browsers keep running
the installed copy. Publish a worker whose `install` calls
`self.registration.unregister()` and clears the caches. Worth knowing before it is
needed.

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

**A credit note is a different UBL document, not an Invoice with another code.** EN 16931
does allow type code 381 inside an `<Invoice>`, and that is how this was written first.
NLCIUS forbids it: **`BR-NL-8`** requires the `CreditNote` schema when the code is 381, and
the validator rejected the first attempt. So `lib/ubl.ts` carries a `Documentvorm` — root
element, namespace, type-code tag, line tag, quantity tag — and picks `CREDITNOTA` when
`creditOf` is set. Reasoning alone would not have produced that rule. **`BR-NL-24`** also
discourages repeating the original's issue date in `cac:BillingReference`, so only the
number goes in the XML while the paper keeps both.

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
downloads **ten** documents — one per VAT regime, plus one carrying a delivery date, one
with a discount over two VAT rates, and one credit note, since those take different paths
through `lib/ubl.ts` — and puts each through the
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

## The payment QR

`lib/payment-qr.ts` builds an **EPC069-12** SEPA credit-transfer code — beneficiary,
IBAN, amount and the invoice number as the remittance — so the recipient scans instead of
retyping, which is where payments go wrong.

**Not iDEAL.** An iDEAL QR needs a PSP contract and a server that mints a code per
transaction. EPC069-12 is *static*: it contains only what is already on the invoice, so it
can be built here with nothing leaving the browser.

**Not every Dutch bank reads it.** ING, bunq, Knab, SNS and ASN do; Rabobank and ABN AMRO
are not on the list. So it is a convenience, never a replacement — the account details stay
printed on the document exactly as before, and the caption says so.

**It is suppressed where it would be wrong**: on a quotation (nothing to pay yet) and on a
**credit note** (the money goes the other way, so a code inviting payment is not merely
redundant but incorrect). Also when there is no IBAN, no amount, or an amount outside the
specification's range.

`qrcode-generator` is the only dependency added — MIT, **zero transitive deps**. The
alternative, `qrcode`, pulls `yargs` (a CLI argument parser) into a browser bundle. It
yields a module matrix rather than an image, so `components/QrCode.tsx` turns it into one
SVG path that both the preview and the PDF draw — react-pdf has its own `Svg`/`Path`, so
no canvas and no PNG anywhere, and the PDF stays sharp at any zoom.

**The IBAN is checked, and an unchecked one gets no QR** (`lib/iban.ts`). The app used to
accept any string as an account number: `formatIban` only inserted spaces. A typo therefore
became a payment instruction. Usually that just fails, but a shifted digit can land on a
*valid* IBAN belonging to someone else — and nobody re-reads an account number they
scanned. `keurIban` runs the ISO 7064 MOD-97-10 check digits plus the per-country length,
which catches virtually every single-character slip and transposition, and `epcPayload`
returns null when it fails: **no QR is better than a wrong one**. The form says which it is,
and deliberately does not overclaim — valid check digits mean the number exists, not that
it is yours. Confirming ownership needs a bank name-check service, which needs a backend.

**What this does and does not defend against.** There is no man-in-the-middle on the QR
because nothing is transmitted to build it: it is computed locally from the stored IBAN and
drawn as vector shapes, and the CSP forbids the page making any request. The residual risks,
in order: a typo (now checked), a malicious browser extension — which can rewrite anything
in the page and which no web page can stop, as `SecurityPanel` says — and compromise of the
GitHub delivery path, which rests on HTTPS and account security. The practical backstop is
that a scan only pre-fills a transfer; the payer's bank shows them the account and amount
before they confirm.

**Verified by decoding, not by looking.** Asserting that an `<svg>` exists proves nothing
about whether a scanner can read it, and a wrong amount in a code someone scans blindly is
worse than no code. Both the rendered preview and a really-downloaded PDF were rasterised
and read back with an independent decoder (jsQR), and both returned the exact expected
payment instruction. `tests/betaal-qr.spec.ts` covers the payload and the
when-to-show rules; the decode check is a scratchpad exercise to repeat if the renderer
changes.

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

**A logo makes the PDF take a different path, and that path was broken for weeks.**
react-pdf processes the image in a Web Worker started from a `blob:` URL. The CSP never
set `worker-src`, so it fell back to `script-src`, which does not allow `blob:` — and
**Download PDF failed outright whenever a logo was set**. Nothing noticed: no test, no
`check:publicatie`, and no UAT step had ever put a logo on a document before exporting it.
All three do now, and `tests/privacy.spec.ts` asserts the directive is present, because
its absence fails silently by falling back rather than by erroring. When adding a feature
that touches the PDF, ask which of these paths it takes — an empty document exercises far
less than it looks like.

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

npm run build && npm run test:uat # the journey + the offline spec, published build
UAT_BASE_URL=https://factuurr.nl/ npm run test:uat   # the same, against the live site

# Only as a rehearsal: the site has run at the domain root since factuurr.nl, so
# PAGES_BASE_PATH is no longer set anywhere. Worth keeping working in case it moves.
PAGES_BASE_PATH=/sub npm run build && PAGES_BASE_PATH=/sub npm run test:uat

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

`tests/uat/` now holds **two** specs. `offline.spec.ts` is deliberately separate rather
than another step in the journey: cutting the network mid-journey would silently change
what every later step is testing. It belongs here and nowhere else, because the service
worker is only registered in the published build.

**Two blind spots worth knowing about when adding tests.** `extractPdfLayout` reads the
*text* layer, so anything drawn as vector — the payment QR — is invisible to it; the QR's
caption is text and serves as its proxy. And the a11y sweeps enumerate the live DOM, which
covers new fields for free but only in the state the test happens to be in: the unlock
field and the archive dialog's contents exist only in states the default sweep never
visits, so they have their own tests.

**A one-shot read is not an assertion.** `expect(await previewText(page)).toContain(x)` looks
exactly once: if React has not painted yet, it fails, and no timeout can help because nothing
retries. `await expect(app.preview).toContainText(x)` polls. The suite flaked for days on
this and the cause was only found by deliberately oversubscribing — `--workers=16` on 16
cores — where the error showed the preview still reading the value from *before* the input.
The seventeen that read the preview straight after typing were converted. What is left is
`await previewText(page)` into a variable that several `expect`s then read — **concentrated in
`document.spec.ts`, `vat.spec.ts` and `items.spec.ts`**, which is where to look first if flakes
return at normal worker counts. (This paragraph claimed "roughly a hundred" for a while; it was
22 reads by the time anyone counted. Grep for the call rather than trusting a number here — the
same reason the line count for `InvoiceForm` is deliberately rounded.) Negative assertions stay
one-shot on purpose: a retrying *"does not contain"* can pass before the change has happened at
all.

Timeouts are set deliberately in `playwright.config.ts`: **60s per test, 10s per assertion**.
Playwright's defaults are 30s and 5s, and ten assertions across three specs had already been
patched by hand to 10s or 30s — which is the signal the default did not fit. The per-test
default also made those local patches meaningless: a 30s `expect` inside a 30s test can never
reach its own limit.

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

**All selectors live in `tests/helpers.ts`.** If you split `InvoiceForm` up, that file
should be the only test file needing changes.

**Prefer the `id`; a placeholder is the last resort.** This file used to say the opposite —
that the `<label>` elements have no `htmlFor` so placeholders are the stable handle — and
that is now wrong twice over. Most fields *do* carry `htmlFor` and an `id`
(`#klant-land`, `#betalingsvoorwaarden`, `#opmerkingen`, `#bedrijf-kvk`, every field in
`ItemRow`), and placeholders turned out to be the *least* stable thing in the form: they
are display text, so layout work rewrites them. Shortening one placeholder broke three
unrelated tests, and giving the client's KvK field the example `12345678` — which the
sender's KvK field already used — broke 55 more, because one locator then matched two
inputs. Where no id exists, something structural (`list="eenheden"`,
`.item-row button[title=…]`) beats wording.

Two selectors there are deliberately narrower than they look. `preview` is scoped to
`.preview-wrapper .invoice-preview` because the archive dialog renders a second
`.invoice-preview`, and `deleteClient` matches on `title` rather than the name
"Verwijderen", which every archive row also has. Both would otherwise match more than
one element the moment a document is saved.

Run the suite before and after any refactor. It exists precisely because
`InvoiceForm.tsx` is large and under-typed at the layout level.

## Conventions

- **UI text, labels and code comments are in Dutch.** Keep it that way.
- **No em-dash in running text that a user reads.** It reads as machine-written, and Dutch
  prose has better tools for the job: a comma plus `want`/`omdat`, a colon when a list or
  consequence follows, brackets for an aside, or simply two sentences. A bare comma between
  two main clauses is a comma splice in Dutch too, so the conjunction is not optional.
  Applies to the pages, form hints, dialogs and error strings. It does **not** apply to the
  em-dash as a *separator*: `<title>` (`Factuurr — gratis facturen…`), a heading suffix
  (`Beveiliging en privacy — vergrendeld`), `— Nieuwe klant —` in a select, and the
  `Naam — uitleg` option labels all keep it. That last one is load-bearing: the fit test in
  `tests/items.spec.ts` splits on `' — '` to decide what must fit in the closed control.
  Code comments and this file keep theirs; the rule is about what ships to a reader.
- Indentation is inconsistent across files (2 spaces in `app/` and `ItemRow.tsx`,
  4 elsewhere). Match the file you are editing; do not reformat wholesale.
- Vanilla CSS with custom properties in `app/globals.css`. No Prettier, no Tailwind.
- Styling is mostly inline `style={{}}` objects. That is the existing idiom.
- **Links get their colour from `--primary`.** There was no `a` rule at all for a long
  time, so links were the browser's `#0000EE` — invisible on the dark background, and
  merely unnoticed on the light one. Inside `.invoice-preview` this is automatically
  right, because that subtree resets `--primary` to its light value: the preview is
  paper.
- **Touch rules go behind `@media (pointer: coarse)`, never a width breakpoint.** A 1180px
  iPad has the same finger as a phone; a narrow window on a laptop does not. Two standards
  live there, and both were broken until `tests/responsief.spec.ts` went looking:
  **44×44** minimum tap targets (Apple HIG; Material says 48dp, so 44 is the floor of the
  two) — the compact buttons were 25px — and **16px minimum on inputs**, because Safari on
  iOS zooms the page in when you focus anything smaller *and does not zoom back out*. The
  base rule already said 16px with that very comment, and `.item-row` overrode it three
  rules later; with `html` at 14px below 520px that came out at 12.6px. Desktop is
  deliberately untouched — 25px is fine with a mouse, and forcing 44px there would sprawl
  the form.
- **A line item asks how wide *it* is, not how wide the window is.** `.item-row` uses an
  `@container` query against `.form-section`, because from 1024px the form sits beside
  the preview in a `minmax(440px, 1.25fr)` column — so a row is *narrower* there (592px
  at a 1280px window) than on a 768px phone in landscape (638px). A viewport media query
  crushes it at exactly the wrong size. Note which measurement the query reads: the
  container's **content box**, which is already the row width — adding the section's
  padding to the threshold knocked grid mode out at 1280px.
- **Count the columns when you add a field to a row.** `.mobile-split` is
  `display: contents`, so its three fields are grid items in their own right, not one.
  Adding the unit field gave six items against five columns: everything shifted one
  place, the VAT select landed in the 40px column meant for the delete button, and the
  button dropped to a second line. `tests/items.spec.ts` now asserts columns equal items,
  which is the relationship that actually broke.
- **Columns carry a `minmax()` floor, and the container threshold is the sum of those
  floors.** Bare `fr` ratios are a fit at one width and a misfit at the next: the ratio
  tuned at 1400px truncated the name, quantity and price fields at 1280px, where the form
  is *narrower*. The floors are measured text plus padding, so the threshold (580px) is
  arithmetic — change a floor and you change the threshold. Below it the row stacks, which
  is the honest answer rather than a crushed row.
- **The fields are checked by measuring their text, not by eye or by `scrollWidth`.**
  `scrollWidth > clientWidth` sees an overflowing *value* and is blind to a clipped
  *placeholder*, so "uur, stuk…" rendered as "uur, st" with the suite green. The test in
  `tests/items.spec.ts` renders each field's text in that field's own computed font and
  compares against the space inside its padding, over **the whole form** at seven window
  widths. Form-wide matters: the worst offenders were nowhere near the item row.
- **Each kind of field fails differently, and the test knows all three.** Getting this
  wrong produces confident nonsense in both directions, so it was settled by putting a
  deliberately over-long placeholder in each and looking:
  - `<input>` truncates on one line — measure the string against the content width.
  - `<textarea>` **wraps**; it can only clip at the *bottom*. Measuring it as one line
    reported truncation that cannot happen, which is how "Extra tekst onderaan het
    document (optioneel)" got onto a fix list it did not belong on. Measure the wrapped
    height against the field's height instead.
  - `<select>` shows a chosen *value*, which is worse to lose than a hint, and the
    browser draws the arrow **inside** the content box — so 20px comes off before the
    text. That is the gap that let `21% BTW` ship as `21% BT`.
- **A placeholder is an example, never an explanation.** It cannot wrap, so a sentence in
  one is unreadable on a phone by construction: "Nodig om de e-factuur via Peppol te
  kunnen versturen" asked for 419px in a 281px field. Explanations go in a muted `<p>`
  below the field, tied to it with `aria-describedby` — the idiom `PaymentDetails.tsx`
  already used for the IBAN. Keep placeholders to a concrete example (`Duitsland`,
  `12345678`, `INKOOP-2026-77`).
- **Select options read `Naam — uitleg`, and only the name has to fit.** The open
  dropdown shows the full string; the closed control is a summary, so what must survive
  is the part that tells the options apart. Requiring the whole option to fit would force
  the VAT regimes to surrender the explanations that are most useful exactly where they
  are. This is why `kor` reads `KOR — vrijgesteld van btw (kleineondernemersregeling)`
  and not the other way round: with the long name first, a phone showed
  `Kleineondernemersregeling (KO`.
- **A placeholder is not a selector.** Three tests broke when "uur, stuk…" was shortened,
  and 55 more when the client's KvK example became `12345678` — which the *sender's* KvK
  field already used, so one locator matched two inputs. Hang test selectors on the `id`
  or on something structural (`list="eenheden"`), not on wording that layout work will
  rewrite. `tests/helpers.ts` says this at each converted line.
- **A rule inside `@media` or `@container` carries no extra weight, and three dead rules
  in one day came from forgetting it.** `.item-row`'s stacked-mode rules are written
  `.responsive-item-row .x` (0,2,0), so anything in the container query written as bare
  `.x` (0,1,0) silently loses to them — an at-rule is not a tie-breaker. The three:
  - `.responsive-item-row > *` meant to reset `order` in grid mode. The name landed in
    column 4 and the VAT select and bin fell to a third line.
  - `@media (min-width: 768px) { .row-label { display: none } }` never hid a label. The
    column floors above were first computed on the belief that it did, and that the
    placeholder is therefore a field's only name at desktop.
  - `.item-verwijderen { align-self: end }`, so the bin sat at the row *top*, exactly
    0.00px from the name cell. Locally that tie read as "not above"; on the build server
    different font metrics tipped it 0.2–0.9px the other way and the layout test failed
    there while staying green here. With the rule actually applying, the gap is 20px and
    the assertion has room.

  Not one of the three was visible by reading the stylesheet; each was found by measuring
  the computed style or the geometry. When a CSS rule seems not to take, check what wins
  before changing the value.

## Known gaps and deliberate decisions

- `InvoiceForm.tsx` is about 1050 lines, roughly two thirds state and handlers and one
  third composition. (Deliberately rounded: the exact figure was corrected twice in one
  day and drifted again within hours, which says more about citing exact counts than
  about the file.) The company, payment, client and archive sections were extracted to
  `components/form/`; *Algemene Informatie*, Items and the action buttons were left
  in place because pulling out another ~50 lines behind a props interface buys little.
  Only **one** `isQuotation` branch remains, inside `updateDocument` itself, and it is
  load-bearing: every field handler goes through `updateDocument` / `updateSender` /
  `updateClient` / `updateItems`. The handlers are genuinely interdependent
  (`handleConvertToInvoice` touches both drafts, the numbering store and the tab
  state), so splitting them into hooks would likely cost more clarity than it buys.
- **Import vets the whole file before touching anything** (`lib/backup.ts`). It used to
  check only that the JSON parsed to an object and then write straight through — and
  because `replaceDocuments` *clears before it writes*, a file containing
  `documents: [1,2,3]` emptied the archive, failed on the first record, and reported the
  failure after the originals were gone. One wrong file from a downloads folder was
  enough. `inspecteerBackup` now returns either the content with a count or every problem
  it found, `replaceDocuments` refuses a bad set before clearing, and the UI confirms
  while naming what is about to be replaced — which **Wissen**, no more destructive,
  already did. Only known setting keys are copied across; the rest of the file is ignored
  rather than spread into the settings store.
- **The archive is unencrypted unless the user sets a passphrase**, and company details,
  the customer book and the numbering are unencrypted either way. See *The optional
  passphrase* above for why, and for what encryption does and does not buy.
- Tests that depend on persisted state must call `waitForHydration` (or `openFoldout`,
  which does it) after a reload. `readServerX` returning defaults means a section the
  user had opened renders closed for one frame, and a click in that window toggles the
  DOM behind React's back — which is exactly how three encryption tests failed before
  the helper existed.
- **The tab icon exists twice, and the `.ico` is deliberately *not* in `app/`.**
  `app/icon.svg` is what the page declares, so browsers get a mark that is sharp at any
  size. But plenty of tooling never reads the HTML and simply fetches `/favicon.ico` —
  crawlers, feed readers, link unfurlers — which returned 404. `public/favicon.ico` fills
  that in as a plain static file. Put in `app/` instead, Next would emit a *second*
  `<link rel="icon">` and leave browsers to choose; in `public/` the emitted head is
  byte-identical and the `.ico` serves only whoever asks for it blindly.
  `npm run maak:favicon` regenerates it from the SVG with the Chromium Playwright already
  provides, assembling the ICO container by hand — no new dependency, and `qrcode`'s
  lesson about what a convenience package drags in applies here too. It is **not**
  automatic: the file is committed, so changing `app/icon.svg` without re-running leaves
  the two out of step. `tests/vindbaarheid.spec.ts` guards that it is *there* and is a
  real ICO, not that it is *current*.
- **GitHub Actions were all several majors behind** and were upgraded in October 2026:
  checkout/setup-node to v7, setup-java to v6, cache to v6, configure-pages to v6,
  upload-pages-artifact to v5, deploy-pages to v5. That cleared the Node 20 deprecation
  warnings. One genuine trap in there: **`upload-pages-artifact` from v4 excludes
  dotfiles**, which would have silently dropped the `out/.nojekyll` the build creates, so
  `include-hidden-files: true` is set explicitly and must stay. Harmless here (the Actions
  deploy path runs no Jekyll) but the kind of thing that disappears without an error.
- `npm audit` reports a handful of high-severity issues in the ESLint toolchain
  (brace-expansion, micromatch and friends). They are dev-only, build-time ReDoS/DoS
  issues that never reach the browser, and npm's only proposed "fix" is downgrading
  `eslint-config-next` to 14.x — **do not do that.**
- **ESLint 10 is in use** since October 2026 and behaves exactly as 9 did here. It did
  *not* clear the `npm audit` findings above: those come in through
  `eslint-config-next`, not `eslint`.
- **TypeScript 7 is blocked, and not by us.** `tsc --noEmit` and `next build` both pass
  on it, but `npm run lint` dies with *"typescript-eslint does not support TS 7.0"*
  ([typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940)
  tracks TS ≥ 7.1). The documented workaround is running typescript-eslint against a
  side-by-side TS 6 API — two TypeScript installs to lint with, in exchange for compiler
  speed on a codebase that typechecks in about a second. Revisit when 7.1 lands.
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
