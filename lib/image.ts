/**
 * Verkleint een gekozen afbeelding tot een data-URL die in localStorage past.
 *
 * Een logo gaat als data-URL de opslag in, en daar is ruwweg 5 MB voor. Een
 * foto rechtstreeks uit een telefoon is al snel groter, en base64 maakt hem nog
 * een derde zwaarder. Op een factuur staat het logo hooguit een paar centimeter
 * breed, dus een paar honderd pixels is ruim voldoende.
 *
 * Kleiner maken we alleen, en dat geldt voor twee dingen tegelijk: voor de
 * afmetingen én voor het aantal bytes. Tot nu toe alleen voor het eerste, en
 * daardoor kon "verkleinen" een bestand gróter maken. Dat is geen theorie:
 * opgemeten ging een logo van 126 kB er als 151 kB uit. De oorzaak is dat er
 * altijd opnieuw als PNG werd opgeslagen, en PNG is verliesloos en daarmee
 * slecht in foto's — precies het soort bestand dat de opmerking hierboven
 * verwacht ("een foto van een telefoon").
 *
 * Nu wint wat kleiner is. Blijft het origineel staan, dan is dat per saldo
 * zuiniger voor de opslag én voor de PDF, ook al is hij in pixels breder.
 */

/** Hoeveel bytes een data-URL werkelijk draagt; base64 is ongeveer 4/3. */
export const dataUrlBytes = (dataUrl: string): number => {
    const komma = dataUrl.indexOf(',');
    if (komma === -1) return 0;
    const payload = dataUrl.length - komma - 1;
    const vulling = dataUrl.endsWith('==') ? 2 : dataUrl.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((payload * 3) / 4) - vulling);
};
export const downscaleImage = (file: File, maxWidth: number): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('bestand onleesbaar'));
        reader.onload = () => {
            const source = reader.result as string;
            const image = new Image();
            image.onerror = () => reject(new Error('geen afbeelding'));
            image.onload = () => {
                if (image.width <= maxWidth) {
                    resolve(source);
                    return;
                }
                const canvas = document.createElement('canvas');
                canvas.width = maxWidth;
                canvas.height = Math.round((image.height / image.width) * maxWidth);
                const context = canvas.getContext('2d');
                if (!context) {
                    resolve(source);
                    return;
                }
                context.drawImage(image, 0, 0, canvas.width, canvas.height);
                // PNG houdt transparantie heel; een logo heeft die vaak.
                const verkleind = canvas.toDataURL('image/png');
                // En dan pas kiezen. Een smaller plaatje dat meer bytes kost is
                // geen winst: niet voor de 5 MB aan opslag en niet voor de PDF.
                resolve(verkleind.length < source.length ? verkleind : source);
            };
            image.src = source;
        };
        reader.readAsDataURL(file);
    });
