/**
 * Haalt de tekstlaag uit een PDF.
 *
 * Dat dit uberhaupt iets oplevert is zelf de assertie: de oude export
 * rasteriseerde het voorbeeld tot een PNG, en daar valt geen tekst uit te
 * halen. Alles wat hier terugkomt, kan een ontvanger ook selecteren en zoeken.
 */
/** De tekstlaag per pagina, zodat je kunt zien wat op welke pagina staat. */
export const extractPdfPages = async (data: Buffer): Promise<string[]> => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({
        data: new Uint8Array(data),
        useSystemFonts: true,
    }).promise;

    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        pages.push(
            content.items
                .map((item) => ('str' in item ? item.str : ''))
                .join(' ')
                .replace(/ /g, ' ')
                .replace(/\s+/g, ' ')
                .trim(),
        );
    }
    return pages;
};

export const extractPdfText = async (data: Buffer): Promise<string> => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({
        data: new Uint8Array(data),
        useSystemFonts: true,
    }).promise;

    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        pages.push(
            content.items
                .map((item) => ('str' in item ? item.str : ''))
                .join(' '),
        );
    }

    // Normaliseer de spaties: pdf.js levert losse stukjes tekst aan.
    return pages.join('\n').replace(/ /g, ' ').replace(/\s+/g, ' ');
};
