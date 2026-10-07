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

/** Leeg zolang de app op de root van zijn eigen domein staat. */
export const BASISPAD = process.env.PAGES_BASE_PATH ?? '';

/** Alleen het domein, zonder pad: metadataBase wil dat zo. */
export const HERKOMST = 'https://factuurr.nl';

/** Het volledige adres van de hoofdpagina, met een afsluitende schuine streep. */
export const SITE_URL = `${HERKOMST}${BASISPAD}/`;

/** Een pad binnen deze site als volledig adres. Geef '' voor de hoofdpagina. */
export const siteUrlVoor = (pad: string): string =>
    pad ? `${HERKOMST}${BASISPAD}/${pad.replace(/^\//, '')}` : SITE_URL;
