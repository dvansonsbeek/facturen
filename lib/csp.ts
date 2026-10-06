/**
 * Het beveiligingsbeleid dat de pagina meestuurt.
 *
 * De app belooft dat alles wat je invult in je eigen browser blijft. Een
 * Content-Security-Policy maakt daar meer van dan een belofte: `connect-src`
 * noemt geen enkele herkomst op het netwerk, dus deze pagina kan niets
 * versturen — afgedwongen door de browser zelf, ook als er ooit code in zou
 * sluipen die dat wel zou willen.
 *
 * Let op de precieze formulering. Er gaat wél één verzoek naar buiten: de
 * bezoekersteller haalt een afbeelding op bij GoatCounter (lib/analytics.ts).
 * Die draagt het pad, de herkomst en het schermformaat — gegevens over het
 * bezoek, niet over het document — en hij staat alleen in `img-src`. Daarmee
 * blijft overeind wat de belofte altijd was: wat je intypt kan er niet uit.
 *
 * Meegegeven via een meta-tag, want een statische export op GitHub Pages kan
 * geen HTTP-headers zetten. Let op: frame-ancestors en sandbox werken niet via
 * meta, alleen via een header.
 */
/**
 * De enige host die hier ooit bij komt, en alleen voor afbeeldingen: de
 * bezoekersteller (lib/analytics.ts). Staat NEXT_PUBLIC_GOATCOUNTER niet
 * gezet, dan verandert er niets en blijft het beleid dicht zoals het was.
 *
 * Let op wat hier *niet* gebeurt: script-src en connect-src blijven ongemoeid.
 * Een afbeelding ophalen kan geen gegevens uit deze pagina lezen; een script
 * van een andere host wel, en dat is in een pagina met een ontsleuteld archief
 * geen aanvaardbare ruil.
 */
const tellerHost = (process.env.NEXT_PUBLIC_GOATCOUNTER ?? '').trim()
    ? ` https://${(process.env.NEXT_PUBLIC_GOATCOUNTER ?? '').trim()}.goatcounter.com`
    : '';

const gedeeld = [
    "default-src 'self'",
    "style-src 'self' 'unsafe-inline'",   // React zet stijlen rechtstreeks op elementen
    "font-src 'self'",
    // geüpload logo is een data-URL, PDF-voorbeeld een blob
    `img-src 'self' data: blob:${tellerHost}`,
    "object-src 'self' blob:",
    "form-action 'none'",
    "base-uri 'none'",
];

/**
 * Wat er daadwerkelijk wordt gepubliceerd.
 *
 * connect-src staat alleen `data:` toe en geen enkele herkomst op het netwerk.
 * Dat is geen gat: een data-URL draagt zijn eigen inhoud mee en gaat nergens
 * heen, dus er kan nog steeds niets de deur uit. Het staat er omdat de
 * PDF-generator een stukje WebAssembly als data-URL ophaalt voor de
 * letteropmaak; zonder deze regel mislukt Download PDF — en wel pas in de
 * gepubliceerde versie, want tijdens ontwikkelen staat het beleid losser.
 * 'wasm-unsafe-eval' hoort daarbij: dat staat WebAssembly toe en níet eval().
 */
export const STRIKT_BELEID = [
    ...gedeeld,
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
    "connect-src data:",
].join('; ');

/**
 * Tijdens ontwikkelen is het beleid losser, en alleen dan.
 *
 * React heeft in ontwikkelmodus eval() nodig voor zijn foutopsporing ("React
 * will never use eval() in production mode"), en Next praat met een websocket
 * om wijzigingen door te geven. Allebei bestaan niet in de gepubliceerde versie,
 * dus het strenge beleid hierboven is wat gebruikers krijgen.
 */
export const ONTWIKKEL_BELEID = [
    ...gedeeld,
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'",
    "connect-src 'self' data: ws: wss:",
].join('; ');

export const beleidVoorOmgeving = () =>
    process.env.NODE_ENV === 'production' ? STRIKT_BELEID : ONTWIKKEL_BELEID;
