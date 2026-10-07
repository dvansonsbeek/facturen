import qrcode from "qrcode-generator";
import { Invoice } from "@/types";
import { roundToCents, summariseDocument } from "@/lib/utils";
import { chargesVat, schemeOf } from "@/lib/vat-schemes";
import { keurIban } from "@/lib/iban";

/**
 * De betaal-QR op een factuur: EPC069-12, oftewel de SEPA-overschrijvingscode.
 *
 * Je klant scant hem met zijn bankapp en de overschrijving staat ingevuld —
 * rekeningnummer, naam, bedrag en het factuurnummer als omschrijving. Dat
 * scheelt overtypen, en overtypen is waar betalingen misgaan.
 *
 * ## Waarom EPC en niet iDEAL
 *
 * Een iDEAL-QR vraagt om een contract met een betaaldienstverlener en om een
 * server die per transactie een code aanmaakt. Deze app heeft geen van beide en
 * wil ze niet. EPC069-12 is een *statische* code: hij bevat alleen wat er al op
 * de factuur staat, en is dus hier in de browser te maken zonder dat er iets
 * naar buiten gaat.
 *
 * ## Niet elke bank leest hem, en dat verandert waarschijnlijk niet
 *
 * In Nederland ondersteunen onder meer ING, bunq, Knab, SNS en ASN de EPC-code;
 * Rabobank, ABN AMRO, Triodos en RegioBank niet. Dat zijn geen kleine partijen:
 * Rabobank en ABN AMRO zijn samen ruim 60% van de markt, dus de meeste klanten
 * kunnen hem niet scannen.
 *
 * De reden is niet technisch maar commercieel. EPC069-12 is een aanbeveling van
 * de European Payments Council, geen verplichting, en een bank verdient er niets
 * aan. In Duitsland, Oostenrijk en België sloeg hij aan omdat daar geen sterk
 * eigen alternatief was; Nederland had iDEAL, van de banken zelf, en daar ging
 * het geld heen.
 *
 * Wachten op de rest heeft weinig zin. De markt zit midden in de overstap van
 * iDEAL naar Wero (European Payments Initiative): alle Nederlandse banken zijn
 * sinds oktober 2026 aangesloten en de migratie moet eind 2027 klaar zijn. Het
 * budget van de banken ligt dus voor jaren vast op een regeling die ze zelf
 * bezitten; reken er niet op dat ze daarnaast een gratis standaard oppakken.
 *
 * Wero zelf is hier geen uitweg, om dezelfde reden als iDEAL: het vraagt een
 * contract met een betaaldienstverlener en een server die per transactie een
 * code maakt. Een server betekent dat factuurgegevens de browser verlaten, en
 * dat is precies wat deze app niet doet. De code is daarom een extra gemak en
 * geen vervanging: de betaalgegevens staan gewoon op het document, en wie bij de
 * Rabobank zit typt ze over zoals iedereen deed voordat deze code bestond.
 *
 * ## Wat de bank van de betaler er zelf tegenover zet
 *
 * Sinds 9 oktober 2025 is de IBAN-Naamcontrole (Verification of Payee) verplicht
 * bij elke digitale overboeking in alle 41 SEPA-landen. Voordat de betaler
 * bevestigt — gescand of overgetypt — legt zijn eigen bank de naam naast het
 * rekeningnummer en zegt of het klopt.
 *
 * Dat maakt de controle in lib/iban.ts niet overbodig; ze zitten aan
 * verschillende kanten van de keten. Die van ons vangt een tikfout op het moment
 * dat je hem maakt, voordat er een factuur de deur uit is. De naamcontrole vangt
 * hem bij de betaler, met jouw klant die naar een waarschuwing over jou kijkt.
 *
 * ## Waar hij níet op hoort
 *
 * Niet op een offerte: er valt nog niets te betalen. En niet op een
 * creditfactuur: daar gaat het geld de andere kant op, en een code die je klant
 * uitnodigt om tóch te betalen is dan ronduit verkeerd.
 */

/** Een lege regel is in dit formaat betekenisvol; de volgorde ligt vast. */
const SERVICE_TAG = 'BCD';
/** 002 mag de BIC weglaten binnen de EER; 001 niet. */
const VERSIE = '002';
const TEKENSET_UTF8 = '1';
const OVERSCHRIJVING = 'SCT';

/** De specificatie staat niet meer dan 331 bytes toe. */
export const MAX_BYTES = 331;

/** Grenzen uit EPC069-12; langer mag niet, dus korten we af. */
const MAX_NAAM = 70;
const MAX_OMSCHRIJVING = 140;

const kort = (waarde: string, lengte: number) => waarde.trim().slice(0, lengte);

/**
 * Het bedrag zoals de specificatie het wil: EUR met een punt en twee decimalen.
 * Onder één cent of boven 999.999.999,99 mag er geen code zijn.
 */
const bedragVoorQr = (totaal: number): string | null => {
    const afgerond = roundToCents(totaal);
    if (afgerond < 0.01 || afgerond > 999999999.99) return null;
    return `EUR${afgerond.toFixed(2)}`;
};

/**
 * De tekst die in de QR-code komt, of null als er geen code hoort te zijn.
 *
 * Apart van het tekenen gehouden: zo is in een test te zien wat er precies in
 * staat, en dat is bij een betaalopdracht het enige dat telt.
 */
export const epcPayload = (data: Invoice): string | null => {
    // Een creditfactuur vraagt niet om een betaling, dus ook niet om een code.
    if (data.creditOf) return null;

    // Alleen een rekeningnummer dat zijn eigen controlegetal haalt. Geen code is
    // beter dan een code met een tikfout erin: wie scant, kijkt niet meer na wat
    // er in stond, en het geld kan bij een vreemde belanden.
    const oordeel = keurIban(data.bankAccount ?? '');
    if (!oordeel.ok) return null;
    const iban = oordeel.genormaliseerd;

    const naam = kort(data.sender.name ?? '', MAX_NAAM);
    if (!naam) return null;

    const { total } = summariseDocument(data.items, !chargesVat(schemeOf(data)));
    const bedrag = bedragVoorQr(total);
    if (!bedrag) return null;

    const regels = [
        SERVICE_TAG,
        VERSIE,
        TEKENSET_UTF8,
        OVERSCHRIJVING,
        // BIC mag leeg bij versie 002; staat hij er, dan nemen we hem mee.
        kort((data.bic ?? '').replace(/\s+/g, '').toUpperCase(), 11),
        naam,
        iban,
        bedrag,
        '',  // Purpose: niet van toepassing op een gewone factuur.
        '',  // Gestructureerde mededeling: of deze, of de vrije hieronder.
        kort(`Factuur ${data.invoiceNumber}`, MAX_OMSCHRIJVING),
    ];

    const payload = regels.join('\n');
    // Te lang kan alleen bij extreem lange namen; dan liever geen code dan een
    // code die niet scant.
    return new TextEncoder().encode(payload).length > MAX_BYTES ? null : payload;
};

/**
 * De QR-code als rooster van zwarte vakjes.
 *
 * Een rooster en geen plaatje, zodat het voorbeeld en de PDF er allebei hun
 * eigen vorm van kunnen tekenen — vierkantjes in SVG — zonder canvas en zonder
 * een PNG te hoeven maken. Dat scheelt een omweg én houdt de PDF scherp op elk
 * formaat.
 *
 * Foutcorrectieniveau M: genoeg marge om door een geprinte en weer gescande
 * factuur heen te komen, zonder de code onnodig fijn te maken.
 */
export const qrMatrix = (payload: string): boolean[][] => {
    // 0 = kies zelf de kleinste versie die past.
    const qr = qrcode(0, 'M');
    qr.addData(payload);
    qr.make();

    const n = qr.getModuleCount();
    return Array.from({ length: n }, (_, rij) =>
        Array.from({ length: n }, (_, kolom) => qr.isDark(rij, kolom)));
};

/** Het rooster voor een document, of null als er geen code hoort te zijn. */
export const paymentQrMatrix = (data: Invoice): boolean[][] | null => {
    const payload = epcPayload(data);
    return payload ? qrMatrix(payload) : null;
};
