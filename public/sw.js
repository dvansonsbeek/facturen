/**
 * De service worker: maakt van deze app een versie die je hébt.
 *
 * Zonder hem is elke start een rondje langs GitHub. Dat is raar, want al je
 * gegevens staan al op dit apparaat — alleen het programma om ze te lezen kwam
 * nog van het netwerk. Met hem erbij werkt de app in de trein, bij een klant
 * zonder gastwifi, en op de dag dat GitHub Pages plat ligt.
 *
 * Voor de meeste sites is offline een halve app: de schil laadt en de gegevens
 * ontbreken, want die staan op een server. Hier is er geen server. De schil ís
 * het product — archief, voorbeeld, PDF en e-factuur draaien allemaal in de
 * browser. Cache je de bestanden, dan heb je het hele programma.
 *
 * ## Hoe hij vers blijft
 *
 * Er is bewust geen "nieuwe versie beschikbaar"-knop, want die is hier niet
 * nodig:
 *
 * - Het HTML-document gaat **eerst naar het netwerk**. Ben je online, dan krijg
 *   je altijd de nieuwste versie. Lukt dat niet, dan pas uit de cache.
 * - De bestanden onder /_next/static/ dragen een hash in hun naam. Een nieuwe
 *   build geeft dus nieuwe namen, en die worden vanzelf opgehaald. De oude
 *   blijven liggen maar worden nooit meer gevraagd; ze zijn klein en eindig.
 *
 * Wat we juist níet doen is skipWaiting() met een automatische herlaadbeurt. Het
 * concept waar je op dat moment aan werkt staat in useState en niet in de
 * opslag, dus een herlading die jij niet vroeg gooit een half getypte factuur
 * weg. Een versie die blijft staan tot jij hem vervangt — dat is precies wat
 * "je hebt deze versie" hoort te betekenen.
 *
 * ## De keerzijde, en waarom de bouwdatum in beeld staat
 *
 * Een tekstverwerker van 1995 veroudert niet; een factuurprogramma wel. Btw-
 * tarieven schuiven, de KOR-grens schuift, EN 16931 heeft een jaartal, en vanaf
 * 1 juli 2030 is e-factureren verplicht. Daarom toont de app welke versie je
 * hebt (zie NEXT_PUBLIC_BOUWDATUM): offline werken is prima, offline blijven
 * hangen niet.
 */

/** Ophogen wist alles en begint opnieuw. Alleen nodig als de opzet hieronder
 *  verandert; voor gewone uitgaves is dat niet nodig, zie de uitleg hierboven. */
const VERSIE = 'facturen-v1';

/** Waar deze app staat, inclusief een eventueel basispad zoals /facturen/. */
const WORTEL = new URL('./', self.registration.scope).pathname;

/**
 * De gehashte bestanden waar een pagina naar verwijst, uit de HTML gevist.
 *
 * Nodig omdat alleen de pagina bewaren niet genoeg is: zonder javascript
 * hydrateert React niet en kijk je offline naar een dood scherm.
 *
 * En die bestanden komen niet vanzelf binnen tijdens dat eerste bezoek. Een
 * service worker begint pas te luisteren als hij actief is, en tegen die tijd
 * zijn de verzoeken voor de bundel allang gedaan — die gingen rechtstreeks naar
 * het netwerk, langs deze cache heen. Zonder deze stap zou offline dus pas
 * werken vanaf je tweede bezoek, en dat is precies niet wat beloofd wordt.
 *
 * Een regex op de HTML en geen lijst die bij het bouwen wordt gemaakt: dat
 * laatste zou een extra stap in de build betekenen voor iets wat hier in drie
 * regels kan.
 */
const bestandenIn = (html) => {
    const uit = new Set();
    for (const treffer of html.matchAll(/["'(]([^"'()\s]*\/_next\/static\/[^"'()\s]+)["')]/g)) {
        uit.add(treffer[1]);
    }
    return [...uit];
};

self.addEventListener('install', (event) => {
    // Allebei de pagina's binnenhalen plus waar ze naar verwijzen, zodat één
    // bezoek genoeg is om daarna offline te kunnen beginnen.
    event.waitUntil((async () => {
        const cache = await caches.open(VERSIE);
        const bestanden = new Set();

        for (const pagina of [WORTEL, `${WORTEL}voorwaarden`]) {
            try {
                // cache: 'reload' om langs de gewone browsercache te gaan; we
                // willen hier de versie die nú gepubliceerd staat.
                const antwoord = await fetch(pagina, { cache: 'reload' });
                if (!antwoord.ok) continue;
                const kopie = antwoord.clone();
                for (const bestand of bestandenIn(await antwoord.text())) bestanden.add(bestand);
                await cache.put(pagina, kopie);
            } catch {
                // Offline bij de allereerste keer. Dan installeren we alsnog en
                // vult de cache zich bij een volgend bezoek.
            }
        }

        // Eén mislukt bestand mag de rest niet meeslepen, dus niet addAll().
        await Promise.all([...bestanden].map((bestand) => cache.add(bestand).catch(() => undefined)));
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((namen) => Promise.all(
                namen.filter((naam) => naam !== VERSIE).map((naam) => caches.delete(naam)),
            ))
            .then(() => self.clients.claim()),
    );
});

/** Alles met een hash in de naam verandert nooit meer van inhoud. */
const isOnveranderlijk = (url) => url.pathname.includes('/_next/static/');

self.addEventListener('fetch', (event) => {
    const { request } = event;

    // Alleen gewone ophaalacties van deze site. Een POST hoort hier niet thuis
    // (en komt in deze app ook niet voor), en een andere herkomst gaat ons niet
    // aan — de telpixel moet gewoon zijn gang kunnen gaan of niet, zonder dat
    // wij ertussen zitten.
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    // Het document: eerst het netwerk, zodat een nieuwe versie altijd wint
    // zodra je verbinding hebt. Pas bij een mislukking de cache, en dan nog
    // liever de hoofdpagina dan een foutscherm.
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((antwoord) => {
                    const kopie = antwoord.clone();
                    caches.open(VERSIE).then((cache) => cache.put(request, kopie));
                    return antwoord;
                })
                .catch(() => caches.match(request).then((uit) => uit || caches.match(WORTEL))),
        );
        return;
    }

    // Gehashte bestanden: uit de cache als het kan, want hun inhoud ligt vast.
    if (isOnveranderlijk(url)) {
        event.respondWith(
            caches.match(request).then((uit) => uit || fetch(request).then((antwoord) => {
                const kopie = antwoord.clone();
                caches.open(VERSIE).then((cache) => cache.put(request, kopie));
                return antwoord;
            })),
        );
        return;
    }

    // De rest: proberen op te halen en onderweg bewaren; lukt dat niet, dan
    // alsnog uit de cache.
    event.respondWith(
        fetch(request)
            .then((antwoord) => {
                if (antwoord.ok) {
                    const kopie = antwoord.clone();
                    caches.open(VERSIE).then((cache) => cache.put(request, kopie));
                }
                return antwoord;
            })
            .catch(() => caches.match(request)),
    );
});
