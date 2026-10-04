/**
 * Verkleint een gekozen afbeelding tot een data-URL die in localStorage past.
 *
 * Een logo gaat als data-URL de opslag in, en daar is ruwweg 5 MB voor. Een
 * foto rechtstreeks uit een telefoon is al snel groter, en base64 maakt hem nog
 * een derde zwaarder. Op een factuur staat het logo hooguit een paar centimeter
 * breed, dus een paar honderd pixels is ruim voldoende.
 *
 * Kleiner maken we alleen: is de afbeelding al smaller dan het maximum, dan
 * blijft hij zoals hij is.
 */
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
                resolve(canvas.toDataURL('image/png'));
            };
            image.src = source;
        };
        reader.readAsDataURL(file);
    });
