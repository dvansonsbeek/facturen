/**
 * Waar deze site staat. Eén plek, met reden.
 *
 * Bij de verhuizing naar factuurr.nl stond het adres op vijf plaatsen: de
 * metadata, twee workflows, de README en CLAUDE.md. Dat is vijf kansen om er één
 * te vergeten. robots.txt en de sitemap hebben het absolute adres óók nodig, dus
 * voordat het er zeven werden: hier.
 *
 * Het basispad is er apart van. Sinds het eigen domein staat de app op de root en
 * is PAGES_BASE_PATH nergens meer gezet, maar next.config.ts kan er nog steeds
 * mee overweg als de site ooit onder een submap belandt — en dan moeten robots,
 * sitemap en de verwijzingen in de voettekst meebewegen.
 */

/**
 * Hoe de app heet.
 *
 * Was "Facturen & Offertes", en dat is als naam onbruikbaar: "facturen" is een van
 * de meest algemene woorden die er zijn, dus wie de app later terugzoekt vindt
 * hem nooit. Ondertussen stond "Factuurr" alleen in het webadres en in geen enkel
 * zichtbaar woord — je kon de app dagen gebruiken zonder de naam ooit te lezen,
 * en dan onthoud je hem ook niet.
 *
 * Eén constante, omdat de naam op zeven plaatsen stond: titel, kop, manifest,
 * og:site_name, gestructureerde gegevens, de voorwaarden en de README. Zie
 * tests/page.spec.ts, dat ze tegen elkaar legt.
 */
export const NAAM = 'Factuurr';

/** Leeg zolang de app op de root van zijn eigen domein staat. */
export const BASISPAD = process.env.PAGES_BASE_PATH ?? '';

/** Alleen het domein, zonder pad: metadataBase wil dat zo. */
export const HERKOMST = 'https://factuurr.nl';

/** Het volledige adres van de hoofdpagina, met een afsluitende schuine streep. */
export const SITE_URL = `${HERKOMST}${BASISPAD}/`;

/** Een pad binnen deze site als volledig adres. Geef '' voor de hoofdpagina. */
export const siteUrlVoor = (pad: string): string =>
    pad ? `${HERKOMST}${BASISPAD}/${pad.replace(/^\//, '')}` : SITE_URL;
