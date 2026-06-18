# Dugnadsloggen på GitHub + Supabase — komplett veiledning

Denne mappa er en ferdig versjon av Dugnadsloggen som kjører gratis på GitHub, med
Supabase som database og innlogging. Alle medlemmer logger inn med **e-post og passord**
(med ekte «glemt passord» på e-post), og **ingen trenger Claude-konto**.

Følg stegene i rekkefølge. Sett av ca. 1 time første gang. Du trenger ingen
programmeringserfaring — bare følg punktene nøyaktig.

---

## Du trenger
- En PC (ikke mobil) for selve oppsettet.
- En gratis konto på **github.com** og en gratis konto på **supabase.com**.
- Programmet **Node.js** (gratis) installert: last ned fra https://nodejs.org (velg «LTS»).

---

## DEL 1 — Lag databasen i Supabase

1. Gå til https://supabase.com og logg inn. Trykk **New project**.
2. Gi prosjektet et navn (f.eks. «dugnadsloggen»), velg et passord (skriv det ned),
   og region **Europe (Frankfurt eller Stockholm)**. Trykk **Create new project** og vent ~2 min.
3. I venstremenyen: trykk **SQL Editor** → **New query**.
4. Åpne fila `supabase-oppsett.sql` (ligger i denne mappa), kopier ALT innholdet,
   lim inn i SQL-editoren, og trykk **Run**. Du skal få «Success».
5. Slå på e-post/passord-innlogging: venstremeny → **Authentication** → **Providers**
   → sjekk at **Email** er på.
   - Tips for et lag: under **Authentication → Providers → Email** kan du skru AV
     «Confirm email» hvis dere vil at folk skal kunne logge inn med en gang uten å
     bekrefte e-post. (Litt mindre sikkert, men enklere for et lag.)
6. Hent de to nøklene: venstremeny → **Project Settings** (tannhjul) → **API**.
   Noter:
   - **Project URL** (ser ut som `https://abcxyz.supabase.co`)
   - **anon public**-nøkkelen (en lang tekst)

---

## DEL 2 — Legg nøklene inn i koden

1. Åpne fila `src/supabase.js` i en teksteditor (f.eks. Notisblokk eller VS Code).
2. Bytt ut de to linjene:
   ```
   export const SUPABASE_URL = "DIN_SUPABASE_URL_HER";
   export const SUPABASE_ANON_KEY = "DIN_SUPABASE_ANON_KEY_HER";
   ```
   med dine egne verdier fra steg 6 over. Behold anførselstegnene. Lagre fila.

> Dette er trygt å dele offentlig — anon-nøkkelen er laget for å ligge i nettsider.
> Det er reglene vi satte opp i SQL-en som beskytter dataene (kun innloggede slipper til).

---

## DEL 3 — Test på egen PC (anbefalt før publisering)

Åpne en terminal/ledetekst i denne mappa og kjør:
```
npm install
npm run dev
```
Åpne adressen som vises (vanligvis http://localhost:5173). Registrer deg som første
bruker — du blir automatisk admin. Legg inn litt testdata og sjekk at alt virker.
Trykk Ctrl+C i terminalen for å stoppe.

---

## DEL 4 — Legg appen på GitHub

1. Lag et nytt, tomt repository på github.com (trykk **New**). Gi det et navn,
   f.eks. `dugnadsloggen`. La det være **Public**. Ikke huk av for noe annet. Trykk **Create**.
2. Åpne fila `vite.config.js` og sjekk at `base` matcher repo-navnet ditt:
   ```
   base: "/dugnadsloggen/",
   ```
   Heter repoet noe annet, bytt ut «dugnadsloggen» (behold skråstrekene). Lagre.
3. I terminalen i denne mappa, kjør (bytt ut DITT-BRUKERNAVN og repo-navn):
   ```
   git init
   git add .
   git commit -m "Dugnadsloggen"
   git branch -M main
   git remote add origin https://github.com/DITT-BRUKERNAVN/dugnadsloggen.git
   git push -u origin main
   ```
   (Første gang ber GitHub deg logge inn.)

---

## DEL 5 — Publiser nettsiden (GitHub Pages)

1. I terminalen:
   ```
   npm run deploy
   ```
   Dette bygger appen og legger den ut på en egen «gh-pages»-gren.
2. På GitHub: gå til repoet → **Settings** → **Pages**.
   Under «Build and deployment» velg **Source: Deploy from a branch**,
   **Branch: gh-pages /(root)**, trykk **Save**.
3. Vent 1–2 minutter. Adressen vises øverst på Pages-siden, og blir:
   ```
   https://DITT-BRUKERNAVN.github.io/dugnadsloggen/
   ```
4. Åpne adressen — appen skal kjøre! Del lenken med laget, eller legg den inn
   på StyreWeb-siden som en knapp/lenke.

---

## DEL 6 — Si fra til Supabase hvor appen bor

Slik at innlogging og «glemt passord»-lenker virker:
1. Supabase → **Authentication** → **URL Configuration**.
2. **Site URL**: lim inn `https://DITT-BRUKERNAVN.github.io/dugnadsloggen/`
3. Under **Redirect URLs**, legg til samme adresse. Trykk **Save**.

---

## Senere: oppdatere appen
Gjør endringer (eller få en ny versjon fra Claude), så kjør:
```
git add .
git commit -m "oppdatering"
git push
npm run deploy
```
Lenken til laget er den samme — ingen ny lenke å dele.

---

## Vanlige spørsmål

**Må medlemmene ha Claude-konto?** Nei. Helt vanlig e-post og passord.

**Er det gratis?** Ja. GitHub Pages er gratis. Supabase har en gratis plan som holder
godt for et lag (databasen og innlogging er inkludert).

**Hvor lagres bildene?** I databasen i Supabase (komprimert). Den gratis planen har rikelig
plass for et lag. Ta likevel sikkerhetskopi fra Admin-fanen innimellom — den fungerer som før.

**Hvordan blir noen admin?** Den aller første som registrerer seg blir admin automatisk.
Den kan så gjøre andre til admin inne i appen.

**Automatisk daglig backup:** Nå som dere har Supabase, kan dette faktisk settes opp
(med en «scheduled function»). Spør Claude om en egen oppskrift hvis dere vil ha det.

Lykke til! ⚓
