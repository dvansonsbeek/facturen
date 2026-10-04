/**
 * Haalt de tekstlaag uit een PDF.
 *
 * Dat dit uberhaupt iets oplevert is zelf de assertie: de oude export
 * rasteriseerde het voorbeeld tot een PNG, en daar valt geen tekst uit te
 * halen. Alles wat hier terugkomt, kan een ontvanger ook selecteren en zoeken.
 */
/** Een stukje tekst met zijn plek op de pagina, in PDF-punten. */
export interface PdfTextItem {
    text: string;
    /** Linkerkant. */
    x: number;
    /** Onderkant. In een PDF ligt de oorsprong linksonder: hoger y is hoger op de pagina. */
    y: number;
    width: number;
    height: number;
}

export interface PdfPageLayout {
    width: number;
    height: number;
    items: PdfTextItem[];
}

/**
 * De tekst mét coordinaten.
 *
 * Alleen de tekst uitlezen zegt niets over de opmaak: een voettekst die dwars
 * door de regels heen loopt levert exact dezelfde tekst op als een nette. Met
 * de posities erbij kun je wél nagaan dat niets elkaar overlapt en dat er niets
 * buiten de marges valt. Dat is preciezer dan afbeeldingen vergelijken, en het
 * verschilt niet per machine zoals het uittekenen van letters dat wel doet.
 */
export const extractPdfLayout = async (data: Buffer): Promise<PdfPageLayout[]> => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({
        data: new Uint8Array(data),
        useSystemFonts: true,
    }).promise;

    const pages: PdfPageLayout[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();

        const items: PdfTextItem[] = [];
        for (const item of content.items) {
            if (!('str' in item) || !item.str.trim()) continue;
            // transform = [a, b, c, d, e, f]; e en f zijn x en y.
            const [, , , , x, y] = item.transform;
            items.push({ text: item.str, x, y, width: item.width, height: item.height });
        }
        pages.push({ width: viewport.width, height: viewport.height, items });
    }
    return pages;
};

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
