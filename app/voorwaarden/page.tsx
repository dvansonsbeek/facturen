import type { Metadata } from "next";
/** Zie app/page.tsx: gewone verwijzingen, want het strikte beleid blokkeert de
 *  fetch waarmee next/link navigeert. Het basispad dus zelf ervoor. */
import { NAAM, BASISPAD } from "@/lib/site";

export const metadata: Metadata = {
  title: `Gebruiksvoorwaarden en privacy — ${NAAM}`,
  description:
    "Waar deze app wel en niet voor bedoeld is, wie verantwoordelijk blijft voor je "
    + "facturen, en wat er met je gegevens gebeurt.",
  alternates: { canonical: '/voorwaarden' },
};

/**
 * De gebruiksvoorwaarden, met de privacyverklaring erin.
 *
 * Eén pagina en niet twee: er valt zo weinig te melden — geen account, geen
 * server, één bezoekersteller — dat splitsen beide helften leger laat lijken dan
 * eerlijk is.
 *
 * Met opzet kort. Elke zin die niemand leest verdunt de zinnen die er wél toe
 * doen, en dat zijn hier de eerste twee: dit is geen boekhoudpakket en geen
 * belastingadvies. De app noemt wetsartikelen bij naam — de KOR van artikel 25,
 * de nummering van artikel 35a, de e-factuur langs de Schematron van de
 * Nederlandse Peppolautoriteit — en juist die precisie kan de indruk wekken dat
 * wat eruit komt gegarandeerd klopt. Dat is het niet, en dat hoort ergens te
 * staan waar een gebruiker het kan vinden.
 */

/**
 * Wanneer deze tekst voor het laatst inhoudelijk veranderde.
 *
 * Met de hand, en dat is een keuze. Afleiden uit het bouwmoment zou hem bij elke
 * publicatie opschuiven — ook bij een wijziging die hier niets mee te maken heeft
 * — en dan beweert de pagina dat de voorwaarden veranderd zijn terwijl er niets
 * aan gewijzigd is. Een datum die liegt is erger dan een datum die oud is.
 *
 * Bijwerken dus zodra de tekst hieronder inhoudelijk wijzigt. Een spelfout is
 * dat niet. tests/voorwaarden.spec.ts houdt een vingerafdruk van de tekst bij en
 * gaat rood zodra die verandert, juist om deze regel niet te laten vergeten.
 */
const BIJGEWERKT = '9 oktober 2026';

const STIJL_KOP = { fontSize: '1.1rem', marginTop: '2rem', marginBottom: '0.5rem' };
/** globals.css zet alle marges op nul, dus alinea's hebben hier hun eigen ruimte
 *  nodig; zonder dit plakken ze binnen een paragraaf aan elkaar vast. */
const STIJL_P = { margin: '0 0 0.9rem' };

export default function Voorwaarden() {
  return (
    <main className="min-h-screen" style={{ padding: '2rem 1rem 4rem' }}>
      <article style={{ maxWidth: '70ch', margin: '0 auto', lineHeight: 1.65 }}>
        <p style={{ fontSize: '0.9rem' }}>
          <a href={`${BASISPAD}/`}>← Terug naar de app</a>
        </p>

        <h1 style={{ fontSize: 'clamp(1.5rem, 4vw, 2rem)' }}>Gebruiksvoorwaarden en privacy</h1>
        <p style={{ ...STIJL_P, color: 'var(--secondary)' }}>
          Door deze app te gebruiken ga je hiermee akkoord. Laatst bijgewerkt op {BIJGEWERKT}.
        </p>

        <h2 style={STIJL_KOP}>Wat dit is, en wat niet</h2>
        <p style={STIJL_P}>
          Dit is een hulpmiddel om facturen en offertes mee op te maken. Het is
          <strong> geen boekhoudpakket</strong> en <strong>geen belastingadvies</strong>. Er
          ontstaat geen relatie van adviseur en klant, en er is niemand die meekijkt of wat je
          maakt klopt.
        </p>
        <p style={STIJL_P}>
          De app noemt Nederlandse regels bij naam en controleert de e-factuur tegen de
          officiële validator van de Nederlandse Peppolautoriteit. Dat helpt, maar het is iets
          anders dan een garantie dat jouw factuur juist is. Geen programma kan voor je
          beoordelen of een regeling op jouw situatie van toepassing is: de
          kleineondernemersregeling, btw verleggen, een intracommunautaire levering.
        </p>

        <h2 style={STIJL_KOP}>Jij blijft verantwoordelijk voor je facturen</h2>
        <p style={STIJL_P}>
          Als ondernemer ben en blijf je zelf verantwoordelijk voor je facturen en je
          administratie, en voor het bewaren daarvan. Dat volgt uit de wet (onder meer artikel
          52 van de Algemene wet inzake rijksbelastingen en de Wet op de omzetbelasting 1968)
          en daar verandert het gebruik van deze app niets aan. Controleer wat je verstuurt, en
          vraag het bij twijfel aan je boekhouder of de Belastingdienst.
        </p>
        <p style={STIJL_P}>
          Die bewaarplicht duurt <strong>zeven jaar</strong>; voor sommige gegevens, zoals die
          over onroerende zaken, geldt een langere termijn. Reken daar de opslag van een browser
          niet voor: die kan door een herinstallatie of het wissen van je browsergegevens leeg
          raken, en er is geen server die het terughaalt. Gebruik <strong>Export</strong> en
          bewaar dat bestand op een plek waar het die jaren wél doorkomt.
        </p>

        <h2 style={STIJL_KOP}>Geen garanties</h2>
        <p style={STIJL_P}>
          De app wordt geleverd zoals hij is, zonder enige garantie: niet op juistheid, niet op
          geschiktheid voor een bepaald doel, en niet op beschikbaarheid. De broncode staat
          onder de MIT-licentie, die hetzelfde zegt.
        </p>

        <h2 style={STIJL_KOP}>Aansprakelijkheid</h2>
        <p style={STIJL_P}>
          Voor schade die ontstaat door het gebruik van deze app (gemiste inkomsten, boetes of
          naheffingen, of verloren gegevens) zijn de auteurs en rechthebbenden niet
          aansprakelijk, voor zover de wet dat toelaat. Dat is dezelfde beperking als in de
          MIT-licentie waaronder de broncode staat; wie het betreft staat in het
          LICENSE-bestand daarbij.
        </p>

        <h2 style={STIJL_KOP}>Je gegevens staan in je browser</h2>
        <p style={STIJL_P}>
          Wat je invult gaat niet naar een server. Er is geen account, geen database en geen
          back-up buiten je eigen apparaat. Je bedrijfsgegevens, je klantenboek en je bewaarde
          documenten staan in de opslag van deze browser, op dit apparaat.
        </p>
        <p style={STIJL_P}>
          Dat heeft een keerzijde die je moet kennen: <strong>je raakt alles kwijt</strong> als
          je de gegevens van deze site wist, je browser opnieuw installeert, in een privévenster
          werkt, of je wachtwoordzin vergeet als je er een hebt ingesteld. Die zin is nergens
          anders opgeslagen en kan niet worden hersteld. Gebruik <strong>Export</strong> om een
          reservekopie te maken en bewaar die ergens anders. Wat de versleuteling wel en niet
          beschermt, staat in de app zelf onder <em>Beveiliging en privacy</em>.
        </p>

        <h2 style={STIJL_KOP}>De bezoekersteller</h2>
        <p style={STIJL_P}>
          Er wordt geteld hoe vaak deze pagina wordt geopend, met GoatCounter. Dat gebeurt met
          één afbeeldingsverzoek en niet met een script van buiten, juist omdat er op deze
          pagina gegevens van jou en je klanten staan.
        </p>
        <p style={STIJL_P}>
          Meegestuurd worden: welke pagina je opent, van welke website je kwam (alleen die
          naam, niet de volledige adresregel) en je schermformaat. GoatCounter leidt daar het
          land uit je IP-adres bij af, maar bewaart dat IP-adres niet, zet niets in je browser
          (geen cookies, geen opslag) en houdt verder alleen aantallen per dag bij.
          <strong> Niets van wat je invult gaat mee</strong>: geen namen, geen bedragen, geen
          factuurgegevens. Dat kan ook niet: de functie die de telling opbouwt krijgt het
          document niet te zien. Heb je <em>Do Not Track</em> of{' '}
          <em>Global Privacy Control</em> aanstaan, dan wordt er niets geteld.
        </p>

        <h2 style={STIJL_KOP}>Er is geen betaalde versie</h2>
        <p style={STIJL_P}>
          Geen proefperiode die afloopt, geen functie die later achter een abonnement
          verdwijnt, en niets dat je eerst gratis mag gebruiken om er daarna aan vast te
          zitten. Dat is geen belofte maar een gevolg: de code staat onder de
          MIT-licentie op GitHub, dus mocht dit ooit veranderen, dan kan iedereen de
          laatste vrije versie blijven gebruiken, of hem zelf ergens neerzetten.
        </p>
        <p style={STIJL_P}>
          Er wordt ook niets aan je verdiend langs een andere weg. Er zijn geen
          advertenties, er worden geen gegevens doorverkocht en er is geen partij die
          meekijkt; dat kan ook niet, want wat je invult verlaat deze browser niet.
        </p>
        <p style={STIJL_P}>
          Je kunt vrijwillig een bijdrage doen. Dat <strong>levert je niets extra&apos;s
          op</strong>, want er is geen uitgebreidere versie om naartoe te gaan, en dat is
          precies het punt. Het verandert ook niets aan deze voorwaarden of aan wat de
          app doet. Klik je erop, dan ga je naar een andere website; pas dáár gelden
          hun voorwaarden en hun privacybeleid.
        </p>

        <h2 style={STIJL_KOP}>Wijzigingen, en waar de code staat</h2>
        <p style={STIJL_P}>
          Deze voorwaarden kunnen veranderen; bovenaan staat wanneer ze voor het laatst zijn
          bijgewerkt. De app is open source en de volledige broncode, inclusief de geschiedenis
          van elke wijziging, staat op{' '}
          <a href="https://github.com/dvansonsbeek/facturen">GitHub</a>.
        </p>
        {/* Naar /issues/new en niet naar /issues: dat tweede is de lijst, en met
            een leeg project is dat een kale pagina waar je niets kunt melden —
            terwijl er "meld hem" boven staat.

            En de eis erbij, want hij is echt: /issues/new stuurt je zonder
            account door naar de inlogpagina van GitHub. De meeste zzp'ers hebben
            er geen. Dat is een bewuste beperking — er komt geen e-mailadres op
            deze pagina — maar dan hoort het er wel bij te staan in plaats van
            iemand op een inlogmuur te laten lopen. */}
        <p style={STIJL_P}>
          Zit er een fout in? Meld hem{' '}
          <a href="https://github.com/dvansonsbeek/facturen/issues/new">op GitHub</a>; daarvoor
          heb je wel een GitHub-account nodig. Er staat met opzet geen e-mailadres op deze
          pagina.
        </p>

        <p style={{ marginTop: '2.5rem', fontSize: '0.9rem' }}>
          <a href={`${BASISPAD}/`}>← Terug naar de app</a>
        </p>
      </article>
    </main>
  );
}
