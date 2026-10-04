/**
 * Zet "pagina 1 van 2" onderaan elke pagina van een afgeronde PDF.
 *
 * Waarom achteraf en niet in het document zelf: react-pdf roept de render-prop
 * waarmee je normaal paginanummers zet (<Text fixed render={...} />) in versie
 * 4.9.0 niet aan, en het alternatief (Page.layout) schakelt het hele document
 * over op een experimentele pagineermotor die van een factuur van twee pagina's
 * er vijf maakte, met een verkeerd totaal. De opmaak die er nu staat is
 * gecontroleerd en werkt; die willen we niet op het spel zetten voor een
 * regeltje tekst. Stempelen raakt de bestaande opmaak niet aan.
 *
 * Eén pagina krijgt geen nummer: "pagina 1 van 1" is ruis.
 */
export const stampPageNumbers = async (pdfBytes: ArrayBuffer): Promise<Uint8Array> => {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');

    const document = await PDFDocument.load(pdfBytes);
    const pages = document.getPages();
    if (pages.length < 2) return new Uint8Array(pdfBytes);

    const font = await document.embedFont(StandardFonts.Helvetica);
    const grootte = 8;
    // Dezelfde grijstint als de rest van de voettekst (#64748b).
    const kleur = rgb(100 / 255, 116 / 255, 139 / 255);

    pages.forEach((page, index) => {
        const tekst = `pagina ${index + 1} van ${pages.length}`;
        const breedte = font.widthOfTextAtSize(tekst, grootte);
        page.drawText(tekst, {
            // Rechts uitgelijnd op dezelfde marge als het document (48pt),
            // onder de vaste voettekst die op 36pt begint.
            x: page.getWidth() - 48 - breedte,
            y: 20,
            size: grootte,
            font,
            color: kleur,
        });
    });

    return document.save();
};
