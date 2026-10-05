/**
 * Het beveiligingsbeleid dat de pagina meestuurt.
 *
 * De app belooft dat alles in je eigen browser blijft. Een Content-Security-
 * Policy maakt daar meer van dan een belofte: `connect-src 'none'` betekent dat
 * deze pagina geen enkel verzoek naar buiten kán doen, afgedwongen door de
 * browser zelf. Wat je invult kan er dus niet uit, ook niet als er ooit code in
 * zou sluipen die dat wel zou willen.
 *
 * Meegegeven via een meta-tag, want een statische export op GitHub Pages kan
 * geen HTTP-headers zetten. Let op: frame-ancestors en sandbox werken niet via
 * meta, alleen via een header.
 */
const gedeeld = [
    "default-src 'self'",
    "style-src 'self' 'unsafe-inline'",   // React zet stijlen rechtstreeks op elementen
    "font-src 'self'",
    "img-src 'self' data: blob:",         // geüpload logo is een data-URL, PDF-voorbeeld een blob
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
