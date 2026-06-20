# Oppdatering — runde 1 av feilrettinger

## Hva som er fikset

1. **Hovedfeilen:** Appen hentet data fra databasen FØR innlogging var bekreftet.
   Det gjorde at data noen ganger ikke lastet riktig, og at nye medlemmer ikke
   dukket opp hos andre uten omlasting. Nå hentes data først når noen er
   innlogget, og oppdateres automatisk hvert 30. sekund mens appen er åpen.
2. Nye medlemmer kan ikke lenger "kollidere" når to registrerer seg samtidig.
3. Lagringsfeilen ved registrering av timer (onConflict-feilen).
4. **Ny funksjon:** Admin kan blokkere medlemmer. Blokkerte medlemmer kan ikke
   logge inn, men alle timer, prosjekter og bilder de har lagt inn før blir
   liggende i loggen og rapportene som før.
5. Medlemmer med "utleierettigheter" kan nå selv legge til/endre utleieobjekter
   og velge kasserer — direkte inne i Utleie-fanen, uten å trenge full
   admin-tilgang.
6. Logo-opplasting: viser nå den faktiske feilmeldingen hvis noe går galt, så
   vi kan se nøyaktig hva som stopper den neste gang.

## Slik oppdaterer du nettsiden

1. Last ned de to filene: `App.jsx` og `storage.js`
2. Legg dem i prosjektmappa di (husk: på **C:\**, ikke Google Disk):
   - `App.jsx` → `dugnadsloggen-github\src\App.jsx`
   - `storage.js` → `dugnadsloggen-github\src\storage.js`
   - Bekreft overskriving når du blir spurt.
3. Åpne terminal i prosjektmappa og kjør:
   ```
   git add .
   git commit -m "fiks: datahenting, blokkering, utleierettigheter, logo"
   git push
   npm run deploy
   ```
4. Vent 1–2 minutter, last siden på nytt i nettleseren.

Dataene dine ligger urørt i Supabase — denne oppdateringen påvirker bare
hvordan appen oppfører seg, ikke selve innholdet.

## Verdt å teste etterpå
- Logg inn med to forskjellige kontoer (f.eks. vanlig nettleser + privat
  vindu) og sjekk at begge ser hverandres registreringer etter et halvt
  minutt eller en omlasting.
- Prøv å blokkere en testbruker fra Admin, og bekreft at vedkommende ikke
  kommer inn igjen, men at timene fortsatt vises i Logg og Rapport.
- Prøv logo-opplasting på nytt. Funker det fortsatt ikke, send meg
  skjermbilde av feilmeldingen som nå dukker opp — den forteller nøyaktig
  hva som er galt.
