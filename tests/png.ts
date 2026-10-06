import { crc32, deflateSync } from 'node:zlib';

/**
 * Maakt een echte PNG, zonder afhankelijkheid.
 *
 * Nodig om het logo te kunnen testen: de app verkleint een geüpload bestand
 * met een canvas, en dat valt alleen na te gaan met een plaatje dat echt groter
 * is dan de doelbreedte. Een nepbestand van een paar bytes wordt door de
 * browser niet als afbeelding gelezen, en dan test je het foutpad in plaats van
 * het goede.
 *
 * Node heeft zlib en crc32 aan boord, dus het schrijven van de chunks is het
 * enige werk.
 */
const chunk = (type: string, data: Buffer): Buffer => {
    const lengte = Buffer.alloc(4);
    lengte.writeUInt32BE(data.length);
    const naamEnData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const controle = Buffer.alloc(4);
    controle.writeUInt32BE(crc32(naamEnData));
    return Buffer.concat([lengte, naamEnData, controle]);
};

/**
 * Een effen PNG van de gevraagde maat.
 *
 * Kleurtype 2 (RGB) en 8 bits per kanaal: de eenvoudigste vorm die elke browser
 * leest. Elke scanlijn begint met een filterbyte 0, dus geen filtering.
 */
export const makePng = (
    width: number,
    height: number,
    kleur: [number, number, number] = [0, 70, 160],
): Buffer => {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;   // bits per kanaal
    ihdr[9] = 2;   // kleurtype RGB
    // 10, 11, 12 blijven 0: deflate, geen filtering, niet interlaced.

    const scanlijn = Buffer.concat([
        Buffer.from([0]),
        Buffer.concat(Array.from({ length: width }, () => Buffer.from(kleur))),
    ]);
    const ruw = Buffer.concat(Array.from({ length: height }, () => scanlijn));

    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(ruw)),
        chunk('IEND', Buffer.alloc(0)),
    ]);
};
