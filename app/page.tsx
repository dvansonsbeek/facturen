import InvoiceForm from "@/components/InvoiceForm";
import VersieMelding from "@/components/VersieMelding";
import { ReceiptEuro } from "lucide-react";
import { NAAM, BASISPAD } from "@/lib/site";

/**
 * Een gewone <a> en geen next/link, met het basispad er zelf voor.
 *
 * next/link navigeert binnen de pagina en haalt de volgende route met fetch op.
 * Het strikte beveiligingsbeleid staat onder `connect-src` geen enkele herkomst
 * toe (zie lib/csp.ts) — dat is daar geen slordigheid maar het hele punt — dus
 * die fetch wordt geweigerd en de verwijzing doet niets in de gepubliceerde
 * versie. Een volledige paginawissel heeft die fetch niet nodig.
 *
 * Het basispad moet er dan wel met de hand voor (BASISPAD uit lib/site.ts): dat
 * regelt next/link anders. Gevonden door check:publicatie, niet door de
 * testsuite — op de ontwikkelserver staat het beleid losser en werkt next/link
 * gewoon.
 */

/**
 * Een vrijwillige bijdrage, als er een Ko-fi-naam is ingesteld.
 *
 * Een gewone verwijzing en nadrukkelijk niet hun knopscript. Ko-fi en Buy Me a
 * Coffee bieden allebei een <script> aan, en dat is precies wat lib/analytics.ts
 * al weigerde voor de bezoekersteller: deze pagina houdt ontsleutelde
 * klantgegevens vast en, zolang het archief open staat, de sleutel in het
 * geheugen. Daar hoort geen code van buiten bij. Een verwijzing stuurt niets en
 * draait niets; hij doet pas iets als jij erop klikt.
 *
 * Uit zonder NEXT_PUBLIC_KOFI, net als de teller. Geen naam, geen verwijzing.
 */
const KOFI = (process.env.NEXT_PUBLIC_KOFI ?? '').trim();

export default function Home() {
  return (
    <main className="min-h-screen">
      <header style={{ padding: '2rem 1rem 1rem', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <div style={{ background: 'var(--primary)', padding: '0.5rem', borderRadius: '10px' }}>
            <ReceiptEuro color="white" size={24} />
          </div>
          {/* De naam, en niet meer de omschrijving: die staat eronder in de
              ondertitel. Zo lees je bij elk bezoek hoe de app heet, want anders
              onthoud je hem niet en zoek je hem later op "facturen" — waarmee je
              hem nooit terugvindt. */}
          <h1 style={{ fontSize: 'clamp(1.8rem, 5vw, 2.5rem)', margin: 0 }}>{NAAM}</h1>
        </div>
        {/* Breedtelimiet in ch, niet in px: die schaalt mee met de lettergrootte
            hierboven en houdt een regel leesbaar kort. Ruim genoeg voor deze zin,
            zodat hij op één regel past zodra het scherm dat toelaat; op smalle
            schermen breekt hij vanzelf af.

            Er stond "razendsnel": het enige oncontroleerbare woord op een pagina
            die het verder van precisie moet hebben. Daarvoor in de plaats staat
            er nu wat het kost en dat de e-factuur erin zit.

            Twee elementen en niet één lange zin. Alles in één alinea proppen
            maakt hem langer dan 83 tekens, en dan breekt hij ook op een normale
            laptop af — precies wat de tests hieronder in tests/page.spec.ts
            tegenhouden, want dat is hier een keer misgegaan. Opgemeten, niet
            geschat. */}
        <p style={{ color: 'var(--secondary)', fontSize: 'clamp(0.9rem, 3vw, 1.1rem)', maxWidth: 'min(100%, 90ch)', margin: '0 auto' }}>
          Gratis facturen, offertes en e-facturen met de Nederlandse btw-tarieven en de KOR.
        </p>
        {/* De sterkste belofte die deze app heeft, en hij stond alleen in de
            voettekst — waar niemand komt voordat hij al besloten heeft te
            blijven. Kleiner gezet: het is de onderbouwing, niet de kop. */}
        <p style={{ color: 'var(--muted)', fontSize: 'clamp(0.8rem, 2.5vw, 0.95rem)', maxWidth: 'min(100%, 90ch)', margin: '0.4rem auto 0' }}>
          Geen account en geen server: alles blijft in je eigen browser.
        </p>
        {/* Eenmalig, als de app sinds je vorige bezoek is bijgewerkt. Online
            gebeurt dat vanzelf — zo bereikt een herstelde fout iedereen — maar
            dan hoort het wel gezegd te worden. */}
        <VersieMelding />
      </header>

      <InvoiceForm />

      <footer style={{ padding: '4rem 1rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.9rem' }}>
        {/* Geen auteursrechtregel: toeschrijving staat in LICENSE en README,
            waar de MIT-licentie die ook vraagt. Dit is productinterface. */}
        <p>Geen opslag op servers, alles in jouw browser.</p>
        {/* De twee ontkenningen staan vóór de verwijzing, en niet erin. Deze app
            noemt wetsartikelen bij naam en toetst de e-factuur tegen de officiële
            validator; juist dat kan de indruk wekken dat wat eruit komt
            gegarandeerd klopt. Wie de voorwaarden nooit opent, hoort dat hier al
            gelezen te hebben. */}
        <p style={{ marginTop: '0.5rem' }}>
          Geen boekhoudpakket en geen belastingadvies. Door deze app te gebruiken ga je akkoord
          met de <a href={`${BASISPAD}/voorwaarden`}>gebruiksvoorwaarden</a>.
        </p>
        {KOFI && (
          <p style={{ marginTop: '0.5rem' }}>
            Gratis, en dat blijft zo.{' '}
            <a href={`https://ko-fi.com/${KOFI}`} rel="noopener noreferrer" target="_blank">
              Een kopje koffie
            </a>{' '}
            mag, maar levert je niets extra&apos;s op — er is geen uitgebreidere versie.
          </p>
        )}
      </footer>
    </main>
  );
}
