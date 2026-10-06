"use client";

/**
 * Tekent een QR-rooster als SVG.
 *
 * Eén pad met alle vakjes erin in plaats van een vierkantje per module: een
 * code van 37×37 is al bijna zevenhonderd elementen, en dat is zonde van de
 * DOM in een voorbeeld dat bij elke toetsaanslag opnieuw tekent.
 *
 * De rand hoort erbij: zonder de stille marge van vier modules eromheen vinden
 * veel scanners de code niet.
 */
const STILLE_MARGE = 4;

interface QrCodeProps {
    matrix: boolean[][];
    /** De zijde in pixels. */
    size: number;
}

export const qrPath = (matrix: boolean[][]): string =>
    matrix.flatMap((rij, y) =>
        rij.map((aan, x) => (aan ? `M${x + STILLE_MARGE} ${y + STILLE_MARGE}h1v1h-1z` : '')))
        .filter(Boolean)
        .join('');

export default function QrCode({ matrix, size }: QrCodeProps) {
    const zijde = matrix.length + STILLE_MARGE * 2;
    return (
        <svg
            width={size}
            height={size}
            viewBox={`0 0 ${zijde} ${zijde}`}
            role="img"
            aria-label="Betaal-QR volgens EPC069-12"
            style={{ display: 'block', flexShrink: 0 }}
        >
            <rect width={zijde} height={zijde} fill="#ffffff" />
            <path d={qrPath(matrix)} fill="#000000" />
        </svg>
    );
}
