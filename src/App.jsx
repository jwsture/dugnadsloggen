import { useState, useEffect } from "react";
import { storage } from "./storage.js";
import { supabase, erKonfigurert } from "./supabase.js";

// Gjør lagringslaget tilgjengelig som window.storage, slik resten av appen forventer
if (typeof window !== "undefined") window.storage = storage;

// ---------- Farger: tjære, naust, sjø ----------
const C = {
  hav: "#1B3A4B",
  tjaere: "#3E2F23",
  kritt: "#F7F5F0",
  sand: "#E8E2D6",
  signal: "#C0392B",
  sjogronn: "#5C8A8A",
  dempet: "#6B7A80",
};

// Bump dette tallet (og datoen) hver gang du får en ny App.jsx fra Claude.
// Vises i Admin-fanen, slik at du enkelt kan se om oppdateringen har slått gjennom.
const APP_VERSJON = "3.5.19";
const APP_OPPDATERT = "20.06.2026";

const AKT_STANDARD = [
  "Båtvedlikehold",
  "Naust og anlegg",
  "Arrangement",
  "Kystled",
  "Kurs og opplæring",
  "Administrasjon",
  "Annet",
];

const MND = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];

const K_META = "akl-meta";
const K_PROSJEKT = "akl-prosjekter";
const K_INNSLAG = "akl-innslag";
const K_DUGNAD = "akl-dugnader";
const K_AKT = "akl-aktiviteter";
const K_LOGO = "akl-logo";
const K_UTLEIE = "akl-utleie";
const K_BACKUPINFO = "akl-backupinfo";
const K_GAMMEL = "askoy-kystlag-dugnad";
const K_GRUPPER = "akl-grupper";
const K_KONTAKTER = "akl-kontakter";
const UTLEIE_STANDARD = {
  objekter: [
    { id: "lokale-a", navn: "Lokale 1", type: "lokale" },
    { id: "lokale-b", navn: "Lokale 2", type: "lokale" },
  ],
  bookinger: [],
  kassererId: null,
  alleSerUtleie: false,
  ledere: [], // utleieansvarlige — i tillegg til admin
};
const FOTO_ALLE = "akl-foto:";
function fotoPrefiks(pid) { return `akl-foto:${pid}:`; }

function nyId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function iDag() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
};
function fDato(iso) { return iso ? iso.split("-").reverse().join(".") : ""; }
function datoPluss(iso, dager) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + dager);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fMndAar(ym) { const [y, m] = ym.split("-"); return `${MND[parseInt(m, 10) - 1]} ${y}`; }
function tall(t) { return String(Math.round(t * 10) / 10).replace(".", ","); }
function fTid(d) { return d.tid ? ` kl. ${d.tid}${d.tidSlutt ? `–${d.tidSlutt}` : ""}` : ""; }
function fUtleiePeriode(b) {
  const flerDogn = b.datoSlutt && b.datoSlutt !== b.dato;
  if (flerDogn) {
    return `${fDato(b.dato)}${b.tid ? ` kl. ${b.tid}` : ""} – ${fDato(b.datoSlutt)}${b.tidSlutt ? ` kl. ${b.tidSlutt}` : ""}`;
  }
  return `${fDato(b.dato)}${b.tid ? ` kl. ${b.tid}${b.tidSlutt ? `–${b.tidSlutt}` : ""}` : ""}`;
}
function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function gyldigEpost(e) { return /^\S+@\S+\.\S+$/.test(e.trim()); }
function gyldigKode(k) { return /^\d{6}$/.test(k); }
function gyldigTelefon(t) { return /^[\d\s+]{8,15}$/.test(t.trim()); }
function ledereAv(p) { return Array.isArray(p.ledere) ? p.ledere : (p.lederId ? [p.lederId] : []); }

async function lesOgKomprimer(fil, maks = 900, kvalitet = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const img = new Image();
    reader.onload = () => { img.src = reader.result; };
    reader.onerror = () => reject(new Error("Kunne ikke lese filen"));
    img.onerror = () => reject(new Error("Filen er ikke et gyldig bilde"));
    img.onload = () => {
      const skala = Math.min(1, maks / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * skala);
      c.height = Math.round(img.height * skala);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", kvalitet));
    };
    reader.readAsDataURL(fil);
  });
}

function lastNedFil(innhold, filnavn, type) {
  const blob = new Blob([innhold], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filnavn; a.click();
  URL.revokeObjectURL(url);
}

function lastNedCSV(rader, filnavn) {
  lastNedFil("\uFEFF" + rader.map((r) => r.join(";")).join("\n"), filnavn, "text/csv;charset=utf-8");
}

// Lagets merke (placeholder til egen logo lastes opp i Admin)
// ============================================================
// Tidsvelger: kun hele timer + kvarter (00, 15, 30, 45) — for konsistens
// overalt hvor klokkeslett velges (dugnader, utleie m.m.)
// ============================================================
// Statiske arrays utenfor komponenten — Vite hoister disse uansett, bedre å gjøre det eksplisitt
const TIDVELGER_TIMER = ["00","01","02","03","04","05","06","07","08","09","10","11","12","13","14","15","16","17","18","19","20","21","22","23"];
const TIDVELGER_MIN = ["00", "15", "30", "45"];

function TidVelger({ value, onChange, style }) {
  const [time, minutt] = value ? value.split(":") : ["", ""];

  function settTime(nyTime) {
    onChange(`${nyTime}:${minutt || "00"}`);
  }
  function settMinutt(nyttMinutt) {
    onChange(`${time || "00"}:${nyttMinutt}`);
  }

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <select style={{ ...style, flex: 1 }} value={time} onChange={(e) => settTime(e.target.value)}>
        <option value="">Time</option>
        {TIDVELGER_TIMER.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <span style={{ fontWeight: 700, color: "#6B7A80" }}>:</span>
      <select style={{ ...style, flex: 1 }} value={minutt} onChange={(e) => settMinutt(e.target.value)}>
        <option value="">Min</option>
        {TIDVELGER_MIN.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
    </div>
  );
}

function Lagsmerke({ size = 64, lys = false }) {
  const farge = lys ? "#F7F5F0" : C.hav;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-label="Askøy Kystlag">
      <circle cx="50" cy="50" r="46" fill="none" stroke={farge} strokeWidth="4" />
      <path d="M22 62 Q30 56 38 62 Q46 68 54 62 Q62 56 70 62 Q76 66 80 63" fill="none" stroke={farge} strokeWidth="3.5" strokeLinecap="round" />
      <path d="M28 56 Q50 70 72 56 L66 47 L34 47 Z" fill={farge} />
      <line x1="50" y1="47" x2="50" y2="20" stroke={farge} strokeWidth="3.5" />
      <path d="M50 22 L50 44 L70 44 Z" fill={lys ? "rgba(247,245,240,0.55)" : C.sjogronn} />
    </svg>
  );
}

export default function Dugnadsloggen() {
  const [laster, setLaster] = useState(true);
  const [feil, setFeil] = useState("");
  const [info, setInfo] = useState("");

  const [medlemmer, setMedlemmer] = useState([]);
  const [prosjekter, setProsjekter] = useState([]);
  const [innslag, setInnslag] = useState([]);
  const [dugnader, setDugnader] = useState([]);
  const [aktiviteter, setAktiviteter] = useState(() => AKT_STANDARD);
  const [utleie, setUtleie] = useState(() => UTLEIE_STANDARD);
  const [logo, setLogo] = useState(null);
  const [sisteBackup, setSisteBackup] = useState(null);
  const [grupper, setGrupper] = useState([]);
  const [kontakter, setKontakter] = useState([]);
  const [fotoCache, setFotoCache] = useState({});

  const [bruker, setBruker] = useState(null);
  const [session, setSession] = useState(null);
  const [sjekkerSesjon, setSjekkerSesjon] = useState(true);
  const [fane, setFane] = useState("timer");
  const [aapent, setAapent] = useState(null);
  const [dialog, setDialog] = useState(null);

  // Egne dialogbokser — nettleserens innebygde popup-bokser er blokkert i appen
  const bekreft = (melding) => new Promise((res) => setDialog({ type: "bekreft", melding, resolve: res }));
  const sporsmaal = (melding, standard = "") => new Promise((res) => setDialog({ type: "sporsmaal", melding, standard, resolve: res }));
  const varsle = (melding) => new Promise((res) => setDialog({ type: "varsle", melding, resolve: res }));

  // Supabase-pålogging: følg med på innlogget økt
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session || null);
      setSjekkerSesjon(false);
    });
    const { data: lytter } = supabase.auth.onAuthStateChange((_evt, sesjon) => {
      setSession(sesjon || null);
    });
    return () => lytter.subscription.unsubscribe();
  }, []);

  // Henter alt innhold fra Supabase. Kjøres når brukeren er innlogget (session finnes),
  // og kan kalles på nytt for å hente oppdateringer andre har gjort (f.eks. nye medlemmer).
  async function hentAlt() {
    try {
      let meta = null;
      try {
        const r = await window.storage.get(K_META, true);
        if (r?.value) meta = JSON.parse(r.value);
      } catch (e) { /* finnes ikke ennå */ }

      if (!meta) {
        let gamle = { medlemmer: [], innslag: [] };
        try {
          const g = await window.storage.get(K_GAMMEL, true);
          if (g?.value) gamle = JSON.parse(g.value);
        } catch (e) { /* ingen gammel data */ }
        meta = {
          medlemmer: (gamle.medlemmer || []).map((m, idx) => ({ id: m.id, navn: m.navn, pin: null, admin: idx === 0, epost: "" })),
        };
        await window.storage.set(K_META, JSON.stringify(meta), true);
        if (gamle.innslag?.length) await window.storage.set(K_INNSLAG, JSON.stringify(gamle.innslag), true);
      }
      setMedlemmer(meta.medlemmer || []);

      for (const [nokkel, sett] of [[K_PROSJEKT, setProsjekter], [K_INNSLAG, setInnslag], [K_DUGNAD, setDugnader]]) {
        try {
          const r = await window.storage.get(nokkel, true);
          if (r?.value) sett(JSON.parse(r.value));
        } catch (e) { /* tomt */ }
      }
      try {
        const r = await window.storage.get(K_AKT, true);
        if (r?.value) {
          const liste = JSON.parse(r.value);
          if (Array.isArray(liste) && liste.length) setAktiviteter(liste);
        }
      } catch (e) { /* bruker standardliste */ }
      try {
        const r = await window.storage.get(K_UTLEIE, true);
        if (r?.value) {
          let u = JSON.parse(r.value);
          if (!u.objekter) {
            // Migrer fra v7-format (to faste lokaler) til fleksibel objektliste
            const objekter = (u.lokaler?.length ? u.lokaler : UTLEIE_STANDARD.objekter.map((o) => o.navn))
              .map((n, idx) => ({ id: idx === 0 ? "lokale-a" : idx === 1 ? "lokale-b" : nyId(), navn: n, type: "lokale" }));
            const bookinger = (u.bookinger || []).map((b) => {
              if (b.type === "lokale0") return { ...b, objektId: objekter[0]?.id || null, type: "lokale" };
              if (b.type === "lokale1") return { ...b, objektId: objekter[1]?.id || objekter[0]?.id || null, type: "lokale" };
              return b;
            });
            u = { objekter, bookinger, kassererId: null };
            await window.storage.set(K_UTLEIE, JSON.stringify(u), true);
          }
          setUtleie({ objekter: u.objekter || [], bookinger: u.bookinger || [], kassererId: u.kassererId || null, alleSerUtleie: !!u.alleSerUtleie, ledere: u.ledere || [] });
        }
      } catch (e) { /* ingen utleiedata ennå */ }
      try {
        const r = await window.storage.get(K_GRUPPER, true);
        if (r?.value) setGrupper(JSON.parse(r.value));
      } catch (e) { /* ingen grupper ennå */ }
      try {
        const r = await window.storage.get(K_KONTAKTER, true);
        if (r?.value) setKontakter(JSON.parse(r.value));
      } catch (e) { /* ingen kontakter ennå */ }

      try {
        const r = await window.storage.get(K_BACKUPINFO, true);
        if (r?.value) setSisteBackup(JSON.parse(r.value).dato || null);
      } catch (e) { /* ingen backup tatt ennå */ }
      try {
        const r = await window.storage.get(K_LOGO, true);
        if (r?.value) setLogo(JSON.parse(r.value).dataUrl);
      } catch (e) { /* ingen logo */ }
    } catch (e) {
      setFeil("Klarte ikke å hente loggboka. Last siden på nytt.");
    } finally {
      setLaster(false);
    }
  }

  // VIKTIG: data hentes først når sesjonen er bekreftet innlogget — Supabase
  // avviser forespørsler fra ikke-innloggede, så å hente før innlogging ga tom/feil data.
  useEffect(() => {
    if (sjekkerSesjon) return; // vent til vi vet om noen er innlogget
    if (!session) { setLaster(false); return; } // ingen innlogget ennå — vis innloggingssiden
    setLaster(true);
    hentAlt();
  }, [sjekkerSesjon, session?.user?.id]);

  // Hent data på nytt med jevne mellomrom mens noen er innlogget, slik at endringer
  // andre medlemmer gjør (nye registreringer, nye medlemmer, andres timer) dukker opp
  // uten at man må laste siden manuelt.
  useEffect(() => {
    if (!session) return;
    const id = setInterval(() => { hentAlt(); }, 30000);
    return () => clearInterval(id);
  }, [session?.user?.id]);


  const lagre = (nokkel, settState, feilmelding) => async (data) => {
    settState(data);
    try {
      await window.storage.set(nokkel, JSON.stringify(nokkel === K_META ? { medlemmer: data } : data), true);
    } catch (e) {
      // Ikke vis feil for aktivitetslisten og backupinfo — det er ikke kritisk
      if (nokkel !== K_AKT && nokkel !== K_BACKUPINFO) {
        console.error(feilmelding, e);
        setFeil(`${feilmelding} (${e?.message || "ukjent feil"})`);
      }
    }
  };
  const lagreMeta = lagre(K_META, setMedlemmer, "Kunne ikke lagre medlemsdata.");
  const lagreProsjekter = lagre(K_PROSJEKT, setProsjekter, "Kunne ikke lagre prosjektet.");
  const lagreInnslag = lagre(K_INNSLAG, setInnslag, "Kunne ikke lagre timene.");
  const lagreDugnader = lagre(K_DUGNAD, setDugnader, "Kunne ikke lagre dugnaden.");
  const lagreGrupper = lagre(K_GRUPPER, setGrupper, "Kunne ikke lagre grupper.");
  const lagreKontakter = lagre(K_KONTAKTER, setKontakter, "Kunne ikke lagre kontakter.");
  const lagreAktiviteter = lagre(K_AKT, setAktiviteter, "Kunne ikke lagre aktivitetslisten.");
  const lagreUtleie = lagre(K_UTLEIE, setUtleie, "Kunne ikke lagre utleiedataene.");

  async function nyAktivitet(navn) {
    const n = navn.trim();
    if (!n) return null;
    if (aktiviteter.some((a) => a.toLowerCase() === n.toLowerCase())) {
      return aktiviteter.find((a) => a.toLowerCase() === n.toLowerCase());
    }
    await lagreAktiviteter([...aktiviteter, n]);
    return n;
  }

  async function hentFoto(pid) {
    if (fotoCache[pid]) return;
    try {
      const liste = await window.storage.list(fotoPrefiks(pid), true);
      const bilder = [];
      for (const k of liste?.keys || []) {
        try {
          const r = await window.storage.get(typeof k === "string" ? k : k.key, true);
          if (r?.value) bilder.push({ nokkel: r.key, ...JSON.parse(r.value) });
        } catch (e) { /* hopper over */ }
      }
      bilder.sort((a, b) => (b.dato || "").localeCompare(a.dato || ""));
      setFotoCache((f) => ({ ...f, [pid]: bilder }));
    } catch (e) {
      setFotoCache((f) => ({ ...f, [pid]: [] }));
    }
  }

  // Koble innlogget Supabase-bruker til et medlem (via e-post).
  // Henter nyeste medlemsliste rett før vi eventuelt legger til et nytt medlem,
  // slik at to personer som registrerer seg samtidig ikke overskriver hverandre.
  useEffect(() => {
    if (laster || !session?.user?.email || bruker) return;
    const sesjonEpost = session.user.email.toLowerCase();
    const sesjonTelefon = (session.user.user_metadata?.telefon || "").replace(/\s+/g, "");

    const funnet = medlemmer.find((m) =>
      (m.epost || "").toLowerCase() === sesjonEpost ||
      (sesjonTelefon && m.telefon && m.telefon.replace(/\s+/g, "") === sesjonTelefon)
    );
    if (funnet) {
      if (funnet.blokkert) {
        supabase.auth.signOut();
        setFeil("Denne brukeren er blokkert av en administrator. Ta kontakt med laget hvis du tror dette er en feil.");
        return;
      }
      if (!funnet.epost && sesjonEpost) {
        lagreMeta(medlemmer.map((m) => (m.id === funnet.id ? { ...m, epost: sesjonEpost } : m)));
      }
      setBruker({ id: funnet.id, navn: funnet.navn });
      return;
    }
    // Første gang denne e-posten logger inn: hent ferskeste liste og legg til medlemmet trygt
    (async () => {
      const epost = sesjonEpost;
      let naavaerende = medlemmer;
      try {
        const r = await window.storage.get(K_META, true);
        if (r?.value) naavaerende = JSON.parse(r.value).medlemmer || medlemmer;
      } catch (e) { /* bruk det vi allerede har */ }
      const finnesAllerede = naavaerende.find((m) =>
        (m.epost || "").toLowerCase() === epost ||
        (sesjonTelefon && m.telefon && m.telefon.replace(/\s+/g, "") === sesjonTelefon)
      );
      if (finnesAllerede) {
        setMedlemmer(naavaerende);
        if (finnesAllerede.blokkert) {
          supabase.auth.signOut();
          setFeil("Denne brukeren er blokkert av en administrator. Ta kontakt med laget hvis du tror dette er en feil.");
          return;
        }
        // Oppdater e-post på admin-opprettet profil
        if (!finnesAllerede.epost && epost) {
          await lagreMeta(naavaerende.map((m) => (m.id === finnesAllerede.id ? { ...m, epost } : m)));
        }
        setBruker({ id: finnesAllerede.id, navn: finnesAllerede.navn });
        return;
      }
      const navn = session.user.user_metadata?.navn?.trim() || epost.split("@")[0];
      const nyTelefon = session.user.user_metadata?.telefon?.trim() || "";

      // Sjekk om personen finnes som ekstern kontakt — oppgrader i så fall automatisk
      const eksternKontakter = kontakter || [];
      const eksternMatch = eksternKontakter.find((k) =>
        (k.epost && k.epost.toLowerCase() === epost) ||
        (nyTelefon && k.telefon && k.telefon.replace(/\s+/g, "") === nyTelefon.replace(/\s+/g, ""))
      );
      if (eksternMatch) {
        // Konverter ekstern kontakt til fullverdig medlem
        const nyttMedlem = { ...eksternMatch, epost, admin: naavaerende.length === 0, pin: "" };
        await lagreMeta([...naavaerende, nyttMedlem]);
        // Fjern fra ekstern-listen (async, ikke blokkerende)
        lagreKontakter(eksternKontakter.filter((k) => k.id !== eksternMatch.id));
        setBruker({ id: eksternMatch.id, navn: eksternMatch.navn });
        return;
      }

      const ny = { id: nyId(), navn, epost, telefon: nyTelefon, pin: "", admin: naavaerende.length === 0 };
      await lagreMeta([...naavaerende, ny]);
      setBruker({ id: ny.id, navn: ny.navn });
    })();
  }, [laster, session, medlemmer, bruker]);

  // Hvis admin blokkerer den innloggede brukeren mens de sitter inne, logges de ut med en gang
  useEffect(() => {
    if (!bruker) return;
    const mitt = medlemmer.find((m) => m.id === bruker.id);
    if (mitt?.blokkert) {
      supabase.auth.signOut();
      setBruker(null);
      setFeil("Du er blokkert av en administrator.");
    }
  }, [medlemmer, bruker]);

  // ---------- Felles stil ----------
  const input = { width: "100%", padding: "10px 12px", border: `1px solid ${C.sand}`, borderRadius: 6, background: "#fff", color: C.tjaere, fontSize: 16, boxSizing: "border-box" };
  const etikett = { display: "block", fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: C.dempet, marginBottom: 6, fontWeight: 600 };
  const primKnapp = { background: C.signal, color: "#fff", border: "none", borderRadius: 6, padding: "12px 20px", fontSize: 16, fontWeight: 700, cursor: "pointer" };
  const sekKnapp = { background: "transparent", border: `1px solid ${C.hav}`, color: C.hav, borderRadius: 6, padding: "9px 14px", fontSize: 14, fontWeight: 600, cursor: "pointer" };
  const kort = { background: "#fff", border: `1px solid ${C.sand}`, borderRadius: 10, padding: 18 };
  const stil = { C, input, etikett, primKnapp, sekKnapp, kort, bekreft, sporsmaal, varsle };

  if (sjekkerSesjon) {
    return <div style={{ minHeight: "100vh", background: C.kritt, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Georgia, serif", color: C.hav }}>Laster …</div>;
  }

  if (!erKonfigurert()) {
    return (
      <div style={{ minHeight: "100vh", background: C.hav, color: C.kritt, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Helvetica Neue', Arial, sans-serif", textAlign: "center" }}>
        <div style={{ maxWidth: 420 }}>
          <h1 style={{ fontFamily: "Georgia, serif" }}>Nesten klar!</h1>
          <p style={{ lineHeight: 1.6 }}>Appen mangler Supabase-nøklene. Åpne <code>src/supabase.js</code> og lim inn URL og anon-nøkkel fra Supabase-prosjektet ditt. Se veiledningen «VEILEDNING.md».</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Innlogging logo={logo} stil={stil} />;
  }

  if (laster || !bruker) {
    return <div style={{ minHeight: "100vh", background: C.kritt, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Georgia, serif", color: C.hav }}>Henter loggboka …</div>;
  }

  const minProfil = medlemmer.find((m) => m.id === bruker.id);
  const erAdmin = !!minProfil?.admin;
  const kanOppretteProsjekt = erAdmin || !!minProfil?.kanProsjekt;
  const kanUtleie = erAdmin || !!minProfil?.kanUtleie || (utleie.ledere || []).includes(bruker.id);
  const serUtleie = kanUtleie || !!utleie.alleSerUtleie;
  const mineProsjekter = prosjekter.filter((p) => ledereAv(p).includes(bruker.id));
  const serRapport = erAdmin; // Logg og Rapport vises kun for admin
  const aktivt = prosjekter.find((p) => p.id === aapent);

  function Fane({ id, tekst }) {
    const a = fane === id;
    return (
      <button onClick={() => { setFane(id); setAapent(null); setFeil(""); setInfo(""); }}
        style={{ flex: "1 0 auto", padding: "10px 7px", background: "transparent", border: "none", borderBottom: a ? `3px solid ${C.signal}` : "3px solid transparent", color: a ? C.kritt : "rgba(247,245,240,0.6)", fontWeight: a ? 700 : 500, fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap" }}>
        {tekst}
      </button>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.kritt, fontFamily: "'Helvetica Neue', Arial, sans-serif", color: C.tjaere }}>
      <header style={{ background: C.hav, color: C.kritt, padding: "env(safe-area-inset-top, 16px) 12px 0", paddingTop: "max(16px, env(safe-area-inset-top))" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {logo
                ? <img src={logo} alt="Askøy Kystlag" style={{ height: 42, width: 42, objectFit: "contain", borderRadius: 8, background: "#fff", padding: 2 }} />
                : <Lagsmerke size={42} lys />}
              <div>
                <h1 style={{ margin: 0, fontFamily: "Georgia, serif", fontSize: 24, fontWeight: 700 }}>Askøy Kystlag</h1>
              </div>
            </div>
            <button onClick={async () => { await supabase.auth.signOut(); setBruker(null); setFane("timer"); setAapent(null); }}
              style={{ background: "none", border: "1px solid rgba(247,245,240,0.35)", color: "rgba(247,245,240,0.85)", borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: "pointer" }}>
              Logg ut
            </button>
          </div>
          <nav style={{ display: "flex", gap: 1, marginTop: 12, overflowX: "auto" }}>
            <Fane id="hjem" tekst="Hjem" />
            <Fane id="timer" tekst="Registrer" />
            <Fane id="kalender" tekst="Dugnadskalender" />
            <Fane id="prosjekter" tekst="Prosjekter" />
            <Fane id="medlemmer" tekst="Medlemmer" />
            {erAdmin && <Fane id="logg" tekst="Logg" />}
            {serRapport && <Fane id="rapport" tekst="Rapport" />}
            {serUtleie && <Fane id="utleie" tekst="Utleie" />}
            {erAdmin && <Fane id="admin" tekst="Admin" />}
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 760, margin: "0 auto", padding: "18px 14px 60px" }}>
        {feil && <div style={{ background: "#FBEAE8", border: `1px solid ${C.signal}`, color: C.signal, padding: "10px 14px", borderRadius: 6, marginBottom: 14, fontSize: 14 }}>{feil}</div>}
        {info && <div style={{ background: "#EAF3EC", border: "1px solid #4E7E5B", color: "#2F5A3C", padding: "10px 14px", borderRadius: 6, marginBottom: 14, fontSize: 14 }}>{info}</div>}

        {fane === "hjem" && (
          <Hjem
            bruker={bruker} medlemmer={medlemmer} prosjekter={prosjekter} innslag={innslag} dugnader={dugnader} logo={logo}
            erAdmin={erAdmin} sisteBackup={sisteBackup}
            gaaTil={(f, pid) => { setFane(f); if (pid) { setAapent(pid); hentFoto(pid); } }}
            stil={stil}
          />
        )}

        {fane === "timer" && (
          <TimeSkjema
            bruker={bruker} medlemmer={medlemmer} prosjekter={prosjekter} aktiviteter={aktiviteter}
            onNyAktivitet={nyAktivitet}
            onLagre={async (nyeInnslag, bilder) => {
              await lagreInnslag([...nyeInnslag, ...innslag]);
              const eier = nyeInnslag.find((i) => i.medlemId === bruker.id) || nyeInnslag[0];
              if (bilder && bilder.length && eier) {
                const prefix = eier.prosjektId ? fotoPrefiks(eier.prosjektId) : "akl-foto:logg:";
                for (const dataUrl of bilder) {
                  const foto = {
                    dataUrl, tekst: eier.notat || "", underId: eier.underId || null,
                    dato: eier.dato, avId: bruker.id, avNavn: bruker.navn, innslagId: eier.id,
                  };
                  try { await window.storage.set(`${prefix}${nyId()}`, JSON.stringify(foto), true); }
                  catch (e) { setFeil("Ett eller flere bilder kunne ikke lagres."); }
                }
                if (eier.prosjektId) {
                  setFotoCache((f) => { const c = { ...f }; delete c[eier.prosjektId]; return c; });
                }
              }
              const antall = nyeInnslag.length;
              setInfo(`Registrert ${tall(nyeInnslag[0].timer)} t på ${antall === 1 ? "deg" : `${antall} personer`}${bilder?.length ? ` med ${bilder.length} bilde${bilder.length === 1 ? "" : "r"}` : ""}. Godt jobba!`);
            }}
            stil={stil}
          />
        )}

        {fane === "kalender" && (
          <Kalender
            dugnader={dugnader} medlemmer={medlemmer} prosjekter={prosjekter} innslag={innslag} bruker={bruker} erAdmin={erAdmin} aktiviteter={aktiviteter}
            onLagre={lagreDugnader}
            onFoerTimer={async (nyeInnslag) => {
              await lagreInnslag([...nyeInnslag, ...innslag]);
              setInfo(`Førte ${nyeInnslag.length} timeregistrering${nyeInnslag.length === 1 ? "" : "er"} for de oppmøtte.`);
            }}
            stil={stil}
          />
        )}

        {fane === "prosjekter" && !aktivt && (
          <ProsjektListe
            prosjekter={prosjekter} innslag={innslag} medlemmer={medlemmer} bruker={bruker} kanOpprette={kanOppretteProsjekt}
            onAapne={(id) => { setAapent(id); hentFoto(id); }}
            onNytt={async (navn, beskrivelse) => {
              const p = { id: nyId(), navn, beskrivelse, status: "aktiv", opprettet: iDag(), avId: bruker.id, ledere: [bruker.id], under: [], notater: [] };
              await lagreProsjekter([p, ...prosjekter]);
              setInfo(`Prosjektet «${navn}» er opprettet — du er prosjektansvarlig.`);
            }}
            stil={stil}
          />
        )}

        {fane === "prosjekter" && aktivt && (
          <ProsjektDetalj
            prosjekt={aktivt} medlemmer={medlemmer} innslag={innslag} bruker={bruker} erAdmin={erAdmin} logo={logo}
            foto={fotoCache[aktivt.id]}
            onTilbake={() => setAapent(null)}
            onOppdater={async (oppdatert) => {
              await lagreProsjekter(prosjekter.map((p) => (p.id === oppdatert.id ? oppdatert : p)));
            }}
            onNyttFoto={async (dataUrl, tekst, underId) => {
              const id = nyId();
              const nokkel = `${fotoPrefiks(aktivt.id)}${id}`;
              const foto = { dataUrl, tekst, underId: underId || null, dato: iDag(), avId: bruker.id, avNavn: bruker.navn };
              try {
                await window.storage.set(nokkel, JSON.stringify(foto), true);
                setFotoCache((f) => ({ ...f, [aktivt.id]: [{ nokkel, ...foto }, ...(f[aktivt.id] || [])] }));
                setInfo("Bildet er lastet opp.");
              } catch (e) { setFeil("Kunne ikke laste opp bildet. Prøv et mindre bilde."); }
            }}
            onSlettFoto={async (nokkel) => {
              if (!(await bekreft("Slette dette bildet?"))) return;
              try {
                await window.storage.delete(nokkel, true);
                setFotoCache((f) => ({ ...f, [aktivt.id]: (f[aktivt.id] || []).filter((x) => x.nokkel !== nokkel) }));
              } catch (e) { setFeil("Kunne ikke slette bildet."); }
            }}
            stil={stil}
          />
        )}

        {fane === "medlemmer" && (
          <MedlemsRegister
            medlemmer={medlemmer} bruker={bruker} grupper={grupper} prosjekter={prosjekter} innslag={innslag}
            kontakter={kontakter}
            erAdmin={erAdmin}
            onLagreGrupper={lagreGrupper}
            onLagreKontakter={lagreKontakter}
            onLagreMeta={lagreMeta}
            onLagreEgetTelefon={(telefon) => lagreMeta(medlemmer.map((m) => (m.id === bruker.id ? { ...m, telefon } : m)))}
            stil={stil}
          />
        )}

        {fane === "logg" && erAdmin && (
          <Logg
            innslag={innslag} medlemmer={medlemmer} prosjekter={prosjekter} bruker={bruker} erAdmin={erAdmin}
            onSlett={async (id) => {
              if (!(await bekreft("Slette denne registreringen?"))) return;
              await lagreInnslag(innslag.filter((i) => i.id !== id));
            }}
            stil={stil}
          />
        )}

        {fane === "rapport" && serRapport && (
          <Rapport
            innslag={innslag} medlemmer={medlemmer} dugnader={dugnader}
            prosjekter={erAdmin ? prosjekter : mineProsjekter}
            altTilgang={erAdmin}
            stil={stil}
          />
        )}

        {fane === "utleie" && serUtleie && (
          <Utleie
            kanRedigere={kanUtleie}
            erAdmin={erAdmin}
            utleie={utleie} dugnader={dugnader} medlemmer={medlemmer} prosjekter={prosjekter} bruker={bruker}
            onLagreUtleie={lagreUtleie}
            onNyBooking={async (booking, dugnad) => {
              await lagreUtleie({ ...utleie, bookinger: [booking, ...utleie.bookinger] });
              if (dugnad) {
                await lagreDugnader([...dugnader, dugnad]);
                setInfo(`Booking lagret — dugnaden «${dugnad.tittel}» ligger nå i kalenderen, klar for påmelding.`);
              } else {
                setInfo("Booking lagret.");
              }
            }}
            onOppdaterBooking={async (oppdatert, nyDugnad = null) => {
              await lagreUtleie({ ...utleie, bookinger: utleie.bookinger.map((b) => (b.id === oppdatert.id ? oppdatert : b)) });
              if (nyDugnad) {
                await lagreDugnader([...dugnader, nyDugnad]);
                setInfo(`Booking oppdatert — dugnaden «${nyDugnad.tittel}» ligger nå i kalenderen.`);
              } else if (oppdatert.dugnadId) {
                const d = dugnader.find((x) => x.id === oppdatert.dugnadId);
                const nyTittel = `${oppdatert.type === "baat" ? "Mannskap" : "Dugnadshjelp"}: ${oppdatert.objekt}`;
                if (d && (d.dato !== oppdatert.dato || d.datoSlutt !== oppdatert.datoSlutt || d.tid !== oppdatert.tid || d.tidSlutt !== oppdatert.tidSlutt || d.tittel !== nyTittel)) {
                  await lagreDugnader(dugnader.map((x) => x.id === d.id
                    ? { ...x, dato: oppdatert.dato, datoSlutt: oppdatert.datoSlutt || "", tid: oppdatert.tid, tidSlutt: oppdatert.tidSlutt, tittel: nyTittel }
                    : x));
                  setInfo("Booking og mannskaps-dugnaden i kalenderen er oppdatert.");
                }
              }
            }}
            onSlettBooking={async (booking) => {
              const harDugnad = booking.dugnadId && dugnader.some((d) => d.id === booking.dugnadId);
              if (!(await bekreft(`Slette bookingen for ${booking.leietaker || "leietaker"}?${harDugnad ? "\n\nMannskaps-dugnaden i kalenderen slettes også." : ""}`))) return;
              await lagreUtleie({ ...utleie, bookinger: utleie.bookinger.filter((b) => b.id !== booking.id) });
              if (harDugnad) await lagreDugnader(dugnader.filter((d) => d.id !== booking.dugnadId));
            }}
            stil={stil}
          />
        )}

        {fane === "admin" && erAdmin && (
          <Admin
            medlemmer={medlemmer} prosjekter={prosjekter} innslag={innslag} dugnader={dugnader} aktiviteter={aktiviteter} utleie={utleie} bruker={bruker} logo={logo}
            grupper={grupper}
            onLagreGrupper={lagreGrupper}
            onLeggTilMedlem={async (nytt) => {
              await lagreMeta([...medlemmer, nytt]);
              setInfo(`${nytt.navn} er lagt til som medlem.`);
            }}
            sisteBackup={sisteBackup}
            onBackupTatt={async () => {
              const dato = iDag();
              setSisteBackup(dato);
              try { await window.storage.set(K_BACKUPINFO, JSON.stringify({ dato }), true); } catch (e) { /* uviktig */ }
            }}
            onLagreMeta={lagreMeta}
            onLagreUtleie={lagreUtleie}
            onNyAktivitet={nyAktivitet}
            onEndreAktivitet={async (gammel, ny) => {
              const n = ny.trim();
              if (!n || n === gammel) return;
              await lagreAktiviteter(aktiviteter.map((a) => (a === gammel ? n : a)));
              await lagreInnslag(innslag.map((i) => (i.aktivitet === gammel ? { ...i, aktivitet: n } : i)));
              setInfo(`Aktiviteten «${gammel}» heter nå «${n}» — også i gamle registreringer.`);
            }}
            onSlettAktivitet={async (navn) => {
              if (aktiviteter.length <= 1) { setFeil("Det må finnes minst én aktivitet."); return; }
              if (!(await bekreft(`Fjerne «${navn}» fra listen? Gamle registreringer beholder navnet.`))) return;
              await lagreAktiviteter(aktiviteter.filter((a) => a !== navn));
            }}
            onLagreLogo={async (dataUrl) => {
              try {
                await window.storage.set(K_LOGO, JSON.stringify({ dataUrl }), true);
                setLogo(dataUrl);
                setInfo("Logoen er lagret og vises nå i hele appen.");
              } catch (e) {
                console.error("Kunne ikke lagre logo:", e);
                setFeil(`Kunne ikke lagre logoen: ${e?.message || "ukjent feil"}.`);
              }
            }}
            onGjenopprett={async (data) => {
              try {
                if (data.medlemmer) { setMedlemmer(data.medlemmer); await window.storage.set(K_META, JSON.stringify({ medlemmer: data.medlemmer }), true); }
                if (data.prosjekter) { setProsjekter(data.prosjekter); await window.storage.set(K_PROSJEKT, JSON.stringify(data.prosjekter), true); }
                if (data.innslag) { setInnslag(data.innslag); await window.storage.set(K_INNSLAG, JSON.stringify(data.innslag), true); }
                if (data.dugnader) { setDugnader(data.dugnader); await window.storage.set(K_DUGNAD, JSON.stringify(data.dugnader), true); }
                if (data.aktiviteter) { setAktiviteter(data.aktiviteter); await window.storage.set(K_AKT, JSON.stringify(data.aktiviteter), true); }
                if (data.utleie) { setUtleie(data.utleie); await window.storage.set(K_UTLEIE, JSON.stringify(data.utleie), true); }
                if (data.logo) { setLogo(data.logo); await window.storage.set(K_LOGO, JSON.stringify({ dataUrl: data.logo }), true); }
                if (data.foto) {
                  for (const f of data.foto) {
                    try { await window.storage.set(f.nokkel, JSON.stringify(f.innhold), true); } catch (e) { /* fortsetter */ }
                  }
                  setFotoCache({});
                }
                setInfo(`Sikkerhetskopien fra ${data.dato || "ukjent dato"} er lest inn.`);
              } catch (e) {
                setFeil("Noe gikk galt under gjenopprettingen. Dataene kan være delvis gjenopprettet.");
              }
            }}
            onOppdaterProsjekt={async (oppdatert) => {
              await lagreProsjekter(prosjekter.map((p) => (p.id === oppdatert.id ? oppdatert : p)));
            }}
            onSlettDugnad={async (id) => {
              if (!(await bekreft("Slette denne dugnaden fra kalenderen?"))) return;
              await lagreDugnader(dugnader.filter((d) => d.id !== id));
            }}
            onSlettProsjekt={async (pid) => {
              if (!(await bekreft("Slette prosjektet? Timer beholdes, men mister prosjektkoblingen. Bilder slettes."))) return;
              try {
                const liste = await window.storage.list(fotoPrefiks(pid), true);
                for (const k of liste?.keys || []) {
                  try { await window.storage.delete(typeof k === "string" ? k : k.key, true); } catch (e) { /* fortsetter */ }
                }
              } catch (e) { /* ingen bilder */ }
              await lagreProsjekter(prosjekter.filter((p) => p.id !== pid));
              await lagreInnslag(innslag.map((i) => (i.prosjektId === pid ? { ...i, prosjektId: null, underId: null } : i)));
            }}
            stil={stil}
          />
        )}
      </main>

      {dialog && (
        <DialogBoks dialog={dialog} stil={stil}
          onLukk={(svar) => { dialog.resolve(svar); setDialog(null); }} />
      )}
    </div>
  );
}

// ============================================================
// Dialogboks (erstatter nettleserens blokkerte popup-bokser)
// ============================================================
function DialogBoks({ dialog, onLukk, stil }) {
  const { C, input, primKnapp, sekKnapp, kort } = stil;
  const [tekst, setTekst] = useState(dialog.standard || "");

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(18,40,51,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 }}>
      <div style={{ ...kort, width: "100%", maxWidth: 380, padding: 20 }}>
        <p style={{ margin: "0 0 14px", fontSize: 15, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{dialog.melding}</p>
        {dialog.type === "sporsmaal" && (
          <input
            style={{ ...input, marginBottom: 14 }}
            value={tekst}
            autoFocus
            onChange={(e) => setTekst(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onLukk(tekst)}
          />
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          {dialog.type !== "varsle" && (
            <button style={{ ...sekKnapp }} onClick={() => onLukk(dialog.type === "sporsmaal" ? null : false)}>
              Avbryt
            </button>
          )}
          <button style={{ ...primKnapp, padding: "9px 18px", fontSize: 15 }}
            onClick={() => onLukk(dialog.type === "sporsmaal" ? tekst : true)}>
            {dialog.type === "bekreft" ? "Ja" : "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Hjem
// ============================================================
// ============================================================
// Medlemsregister: navn, e-post, telefon — synlig for alle innloggede
// ============================================================
function MedlemsRegister({ medlemmer, bruker, grupper, prosjekter, innslag, kontakter, erAdmin, onLagreGrupper, onLagreKontakter, onLagreEgetTelefon, onLagreMeta, stil }) {
  const { C, input, etikett, primKnapp, kort, sekKnapp, bekreft, sporsmaal, varsle } = stil;
  const [sok, setSok] = useState("");
  const [redigerer, setRedigerer] = useState(false);
  const [nyttTelefon, setNyttTelefon] = useState("");
  const [feil, setFeil] = useState("");
  const [valgte, setValgte] = useState(new Set());
  const [smsModus, setSmsModus] = useState(false);
  const [visGrupper, setVisGrupper] = useState(false);
  const [nyGruppeNavn, setNyGruppeNavn] = useState("");
  const [apenGruppe, setApenGruppe] = useState(null);
  const [visAdminDel, setVisAdminDel] = useState(false);
  const [visUtskrift, setVisUtskrift] = useState(false);
  const [utskriftGruppe, setUtskriftGruppe] = useState("");
  const [visKontakter, setVisKontakter] = useState(false);
  const [nyttKontaktNavn, setNyttKontaktNavn] = useState("");
  const [nyttKontaktTelefon, setNyttKontaktTelefon] = useState("");
  const [nyttKontaktEpost, setNyttKontaktEpost] = useState("");
  const [visImport, setVisImport] = useState(false);
  const [importTekst, setImportTekst] = useState("");
  const [importGruppe, setImportGruppe] = useState("");
  const [importResultat, setImportResultat] = useState(null);

  const sortert = [...medlemmer].sort((a, b) => a.navn.localeCompare(b.navn, "nb"));
  const filtrert = sortert.filter((m) => m.navn.toLowerCase().includes(sok.toLowerCase()));
  const meg = medlemmer.find((m) => m.id === bruker.id);
  const medTelefon = sortert.filter((m) => m.telefon);

  const prosjektGrupper = prosjekter.map((p) => {
    const fraTimer = innslag.filter((i) => i.prosjektId === p.id).map((i) => i.medlemId);
    const ansvarlige = ledereAv(p);
    return { id: `prosjekt-${p.id}`, navn: `🔨 ${p.navn}`, medlemmer: [...new Set([...fraTimer, ...ansvarlige])], auto: true };
  }).filter((g) => g.medlemmer.length > 0);

  const alleGrupper = [...(grupper || []), ...prosjektGrupper];

  function toggleValgt(id) {
    setValgte((v) => { const ny = new Set(v); ny.has(id) ? ny.delete(id) : ny.add(id); return ny; });
  }

  function velgGruppe(gruppeId) {
    const g = alleGrupper.find((x) => x.id === gruppeId);
    if (!g) return;
    const medNummer = g.medlemmer.filter((mid) =>
      medlemmer.find((m) => m.id === mid)?.telefon ||
      (kontakter || []).find((k) => k.id === mid)?.telefon
    );
    setValgte(new Set(medNummer));
  }

  function velgAlle() { setValgte(new Set(filtrert.filter((m) => m.telefon).map((m) => m.id))); }
  function fjernAlle() { setValgte(new Set()); }

  function sendSms() {
    const alleKontakter = kontakter || [];
    const numre = [...valgte]
      .map((id) => {
        const m = medlemmer.find((x) => x.id === id);
        if (m) return m.telefon;
        return alleKontakter.find((k) => k.id === id)?.telefon;
      })
      .filter(Boolean).map((t) => t.replace(/\s+/g, ""));
    if (numre.length === 0) return;
    const a = document.createElement("a");
    a.href = `sms:${numre.join(";")}`;
    a.click();
  }

  return (
    <section style={{ display: "grid", gap: 14 }}>
      <div style={kort}>
        <h2 style={{ margin: "0 0 4px", fontFamily: "Georgia, serif", fontSize: 18 }}>Medlemsregister</h2>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: C.dempet }}>
          Kontaktinfo til alle medlemmer i laget — kjekt hvis du vil ringe eller sende en melding.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input style={{ ...input, flex: 1 }} value={sok} onChange={(e) => setSok(e.target.value)} placeholder="Søk etter navn …" />
          <button style={{ ...sekKnapp, padding: "8px 14px", fontSize: 13, background: smsModus ? C.hav : undefined, color: smsModus ? C.kritt : undefined, borderColor: smsModus ? C.hav : undefined }}
            onClick={() => { setSmsModus(!smsModus); setValgte(new Set()); }}>
            💬 {smsModus ? "Avbryt SMS" : "Send SMS"}
          </button>
        </div>
      </div>

      {smsModus && (
        <div style={{ ...kort, borderLeft: `4px solid ${C.hav}`, display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5 }}>💬 Velg hvem du vil sende SMS til</div>
          <p style={{ margin: 0, fontSize: 13, color: C.dempet }}>
            Huk av de du vil sende til, trykk «Åpne i SMS-appen», skriv meldingen og send.
            Bare medlemmer med registrert telefonnummer kan velges.
          </p>
          {alleGrupper.length > 0 && (
            <div>
              <label style={{ ...etikett, marginBottom: 4 }}>Velg fra gruppe</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {alleGrupper.map((g) => (
                  <button key={g.id} style={{ ...sekKnapp, padding: "5px 12px", fontSize: 13 }} onClick={() => velgGruppe(g.id)}>
                    {g.navn}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={{ ...sekKnapp, padding: "6px 12px", fontSize: 13 }} onClick={velgAlle}>
              Velg alle ({filtrert.filter((m) => m.telefon).length})
            </button>
            {valgte.size > 0 && (
              <button style={{ ...sekKnapp, padding: "6px 12px", fontSize: 13 }} onClick={fjernAlle}>Fjern alle</button>
            )}
          </div>
          {valgte.size > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button style={{ ...primKnapp, flex: 1 }} onClick={sendSms}>
                💬 Åpne i SMS-appen ({valgte.size} mottaker{valgte.size === 1 ? "" : "e"})
              </button>
              <button style={{ ...sekKnapp, padding: "9px 14px", fontSize: 14 }}
                title="Bruk denne på iPhone hvis SMS-appen bare åpner med én mottaker"
                onClick={async () => {
                  const alleKontakter = kontakter || [];
                  const numre = [...valgte]
                    .map((id) => {
                      const m = medlemmer.find((x) => x.id === id);
                      if (m) return m.telefon;
                      return alleKontakter.find((k) => k.id === id)?.telefon;
                    })
                    .filter(Boolean).map((t) => t.replace(/\s+/g, ""));
                  try {
                    await navigator.clipboard.writeText(numre.join("; "));
                    await varsle(`${numre.length} nummer kopiert!\n\nLim dem inn i mottaker-feltet i SMS-appen din (fungerer best på iPhone).`);
                  } catch (e) {
                    await varsle(`Numre (kopier manuelt):\n\n${numre.join("; ")}`);
                  }
                }}>
                📋 Kopier numre
              </button>
            </div>
          )}
          {medTelefon.length === 0 && (
            <p style={{ margin: 0, fontSize: 13, color: C.signal }}>Ingen medlemmer har registrert telefonnummer ennå.</p>
          )}
          {erAdmin && (
            <div style={{ borderTop: `1px solid ${C.sand}`, paddingTop: 10, marginTop: 4 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>➕ Legg til ekstern kontakt</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <input style={{ ...input, flex: 2, minWidth: 130 }} value={nyttKontaktNavn} onChange={(e) => setNyttKontaktNavn(e.target.value)} placeholder="Navn" />
                <input type="tel" style={{ ...input, flex: 2, minWidth: 120 }} value={nyttKontaktTelefon} onChange={(e) => setNyttKontaktTelefon(e.target.value)} placeholder="Telefon" />
                <button style={{ ...sekKnapp, padding: "8px 12px", fontSize: 13 }} onClick={() => {
                  const n = nyttKontaktNavn.trim();
                  const t = nyttKontaktTelefon.trim();
                  if (n.length < 2 || !t) return;
                  onLagreKontakter([...(kontakter || []), { id: nyId(), navn: n, telefon: t, epost: "", ekstern: true }]);
                  setNyttKontaktNavn(""); setNyttKontaktTelefon("");
                }}>Legg til</button>
              </div>
              <p style={{ margin: "5px 0 0", fontSize: 12, color: C.dempet }}>Eksterne kontakter kan legges til SMS-grupper men vises ikke i dugnadslisten.</p>
            </div>
          )}
        </div>
      )}

      {erAdmin && (
        <div style={kort}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div>
              <h3 style={{ margin: 0, fontFamily: "Georgia, serif", fontSize: 16 }}>Grupper</h3>
              <p style={{ margin: "3px 0 0", fontSize: 12.5, color: C.dempet }}>For rask SMS-utsendelse til et utvalg. Prosjektgrupper lages automatisk.</p>
            </div>
            <button style={{ ...sekKnapp, padding: "5px 12px", fontSize: 13 }} onClick={() => setVisGrupper(!visGrupper)}>
              {visGrupper ? "Lukk" : "Administrer grupper"}
            </button>
          </div>
          {visGrupper && (
            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
              {(grupper || []).length === 0 && <p style={{ fontSize: 13, color: C.dempet, margin: 0 }}>Ingen egne grupper ennå.</p>}
              {(grupper || []).map((g) => (
                <div key={g.id} style={{ background: C.kritt, borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600 }}>{g.navn}
                      {" "}<span style={{ fontSize: 12, color: C.dempet, fontWeight: 400 }}>({g.medlemmer.length} valgt)</span>
                      {g.medlemmer.length > 0 && g.medlemmer.every((id) => !medlemmer.find((m) => m.id === id)) && (
                        <span style={{ marginLeft: 8, fontSize: 11, background: "#E0A93E", color: "#fff", borderRadius: 4, padding: "2px 6px" }}>⚠ Trenger oppdatering</span>
                      )}
                    </span>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button style={{ ...sekKnapp, padding: "4px 10px", fontSize: 12 }} onClick={() => setApenGruppe(apenGruppe === g.id ? null : g.id)}>
                        {apenGruppe === g.id ? "Lukk" : "Velg medlemmer"}
                      </button>
                      <button style={{ ...sekKnapp, padding: "4px 10px", fontSize: 12, background: C.hav, color: C.kritt, borderColor: C.hav }}
                        onClick={async () => {
                          const numre = g.medlemmer.map((id) => medlemmer.find((m) => m.id === id)?.telefon).filter(Boolean).map((t) => t.replace(/\s+/g, ""));
                          if (numre.length === 0) {
                            await varsle("Ingen i denne gruppen har telefonnummer. Gruppen kan inneholde gamle medlems-IDer — åpne «Velg medlemmer» og huk av på nytt.");
                            return;
                          }
                          const a = document.createElement("a"); a.href = `sms:${numre.join(";")}`;  a.click();
                        }}>
                        💬 Send SMS{g.medlemmer.length > 0 ? ` (${g.medlemmer.length})` : ""}
                      </button>
                      <button style={{ ...sekKnapp, padding: "4px 10px", fontSize: 12, borderColor: C.signal, color: C.signal }}
                        onClick={async () => {
                          if (!(await bekreft(`Slette gruppen «${g.navn}»?`))) return;
                          onLagreGrupper((grupper || []).filter((x) => x.id !== g.id));
                        }}>Slett</button>
                    </div>
                  </div>
                  {apenGruppe === g.id && (
                    <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {sortert.map((m) => (
                        <label key={m.id} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, cursor: "pointer",
                          background: g.medlemmer.includes(m.id) ? C.hav : "#fff",
                          color: g.medlemmer.includes(m.id) ? C.kritt : C.tjaere,
                          borderRadius: 999, padding: "5px 12px", border: `1px solid ${g.medlemmer.includes(m.id) ? C.hav : C.sand}` }}>
                          <input type="checkbox" checked={g.medlemmer.includes(m.id)} style={{ display: "none" }}
                            onChange={() => {
                              const ny = g.medlemmer.includes(m.id) ? g.medlemmer.filter((x) => x !== m.id) : [...g.medlemmer, m.id];
                              onLagreGrupper((grupper || []).map((x) => (x.id === g.id ? { ...x, medlemmer: ny } : x)));
                            }} />
                          {m.navn}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <input style={{ ...input, flex: 1 }} value={nyGruppeNavn} onChange={(e) => setNyGruppeNavn(e.target.value)} placeholder="f.eks. Styret, Båtmannskap …"
                  onKeyDown={(e) => { if (e.key === "Enter" && nyGruppeNavn.trim().length >= 2) { onLagreGrupper([...(grupper || []), { id: nyId(), navn: nyGruppeNavn.trim(), medlemmer: [] }]); setNyGruppeNavn(""); }}} />
                <button style={{ ...sekKnapp, padding: "8px 14px" }} onClick={() => {
                  const n = nyGruppeNavn.trim();
                  if (n.length < 2) return;
                  onLagreGrupper([...(grupper || []), { id: nyId(), navn: n, medlemmer: [] }]);
                  setNyGruppeNavn("");
                }}>+ Ny gruppe</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={kort}>
        <h3 style={{ margin: "0 0 8px", fontFamily: "Georgia, serif", fontSize: 16 }}>Min kontaktinfo</h3>
        {!redigerer ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 14 }}>
              <div style={{ fontWeight: 600 }}>{meg?.navn}</div>
              <div style={{ color: C.dempet }}>{meg?.epost || "ingen e-post"} · {meg?.telefon || "ingen telefon registrert"}</div>
            </div>
            <button style={{ background: "none", border: `1px solid ${C.sand}`, borderRadius: 6, padding: "6px 12px", fontSize: 13, cursor: "pointer", color: C.hav }}
              onClick={() => { setNyttTelefon(meg?.telefon || ""); setRedigerer(true); setFeil(""); }}>
              Endre telefonnummer
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {feil && <div style={{ background: "#FBEAE8", border: `1px solid ${C.signal}`, color: C.signal, padding: "8px 12px", borderRadius: 6, fontSize: 13 }}>{feil}</div>}
            <div>
              <label style={etikett}>Telefonnummer</label>
              <input type="tel" style={input} value={nyttTelefon} onChange={(e) => setNyttTelefon(e.target.value)} placeholder="f.eks. 912 34 567" />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ ...primKnapp, padding: "8px 16px", fontSize: 14 }} onClick={async () => {
                if (!gyldigTelefon(nyttTelefon)) { setFeil("Skriv inn et gyldig telefonnummer."); return; }
                await onLagreEgetTelefon(nyttTelefon.trim());
                setRedigerer(false);
              }}>Lagre</button>
              <button style={{ background: "none", border: `1px solid ${C.sand}`, borderRadius: 6, padding: "8px 16px", fontSize: 14, cursor: "pointer", color: C.dempet }}
                onClick={() => setRedigerer(false)}>Avbryt</button>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {filtrert.length === 0 && <p style={{ color: C.dempet, textAlign: "center", padding: 18 }}>Ingen medlemmer funnet.</p>}
        {filtrert.map((m) => (
          <div key={m.id}
            onClick={() => smsModus && m.telefon && toggleValgt(m.id)}
            style={{ ...kort, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap",
              cursor: smsModus && m.telefon ? "pointer" : "default",
              borderColor: smsModus && valgte.has(m.id) ? C.hav : undefined,
              borderWidth: smsModus && valgte.has(m.id) ? 2 : 1,
              background: smsModus && valgte.has(m.id) ? "#EAF0F5" : undefined,
            }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {smsModus && (
                <input type="checkbox" checked={valgte.has(m.id)} disabled={!m.telefon}
                  onChange={() => m.telefon && toggleValgt(m.id)}
                  style={{ width: 18, height: 18, cursor: m.telefon ? "pointer" : "not-allowed", accentColor: C.hav }} />
              )}
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>
                  {m.navn}{m.id === bruker.id ? " (deg)" : ""}
                  {m.admin && <span style={{ marginLeft: 8, fontSize: 10.5, background: C.hav, color: C.kritt, borderRadius: 4, padding: "2px 6px", letterSpacing: "0.05em" }}>ADMIN</span>}
                </div>
                <div style={{ fontSize: 13, color: C.dempet, marginTop: 2 }}>{m.epost || "ingen e-post"}</div>
              </div>
            </div>
            {!smsModus && (
              m.telefon ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <a href={`tel:${m.telefon.replace(/\s+/g, "")}`}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, background: C.sjogronn, color: "#fff", borderRadius: 6, padding: "8px 12px", fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
                    📞 {m.telefon}
                  </a>
                  <a href={`sms:${m.telefon.replace(/\s+/g, "")}`}
                    style={{ display: "inline-flex", alignItems: "center", background: C.hav, color: "#fff", borderRadius: 6, padding: "8px 12px", fontSize: 16, textDecoration: "none" }}
                    title="Send SMS">
                    💬
                  </a>
                </div>
              ) : (
                <span style={{ fontSize: 13, color: C.dempet }}>Ingen telefon</span>
              )
            )}
            {smsModus && (
              <span style={{ fontSize: 13, color: m.telefon ? C.tjaere : C.dempet, fontWeight: m.telefon ? 600 : 400 }}>
                {m.telefon || "ingen telefon"}
              </span>
            )}
          </div>
        ))}

        {/* Eksterne kontakter vises nederst i SMS-modus */}
        {smsModus && (kontakter || []).filter((k) => k.telefon).map((k) => (
          <div key={k.id}
            onClick={() => toggleValgt(k.id)}
            style={{ ...kort, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap",
              cursor: "pointer",
              borderColor: valgte.has(k.id) ? C.hav : undefined,
              borderWidth: valgte.has(k.id) ? 2 : 1,
              background: valgte.has(k.id) ? "#EAF0F5" : undefined,
            }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input type="checkbox" checked={valgte.has(k.id)} onChange={() => toggleValgt(k.id)}
                style={{ width: 18, height: 18, cursor: "pointer", accentColor: C.hav }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{k.navn} <span style={{ fontSize: 11, color: C.dempet, fontWeight: 400 }}>📋 ekstern</span></div>
                <div style={{ fontSize: 13, color: C.dempet, marginTop: 2 }}>{k.epost || "ingen e-post"}</div>
              </div>
            </div>
            <span style={{ fontSize: 13, color: C.tjaere, fontWeight: 600 }}>{k.telefon}</span>
          </div>
        ))}
      </div>

      {/* Utskrift av kontaktliste */}
      <div style={kort}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div>
            <h3 style={{ margin: 0, fontFamily: "Georgia, serif", fontSize: 16 }}>🖨 Skriv ut kontaktliste</h3>
            <p style={{ margin: "3px 0 0", fontSize: 12.5, color: C.dempet }}>Navn og telefonnummer, klar til utskrift.</p>
          </div>
          <button style={{ ...sekKnapp, padding: "5px 12px", fontSize: 13 }} onClick={() => setVisUtskrift(!visUtskrift)}>
            {visUtskrift ? "Lukk" : "Velg og skriv ut"}
          </button>
        </div>
        {visUtskrift && (
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <div>
              <label style={etikett}>Filtrer på gruppe (valgfritt)</label>
              <select style={input} value={utskriftGruppe} onChange={(e) => setUtskriftGruppe(e.target.value)}>
                <option value="">Alle med telefonnummer</option>
                {alleGrupper.map((g) => (
                  <option key={g.id} value={g.id}>{g.navn}</option>
                ))}
              </select>
            </div>
            <button style={{ ...primKnapp, padding: "9px 16px" }} onClick={() => {
              const valgtGruppe = utskriftGruppe ? alleGrupper.find((g) => g.id === utskriftGruppe) : null;
              const utvalg = valgtGruppe
                ? sortert.filter((m) => valgtGruppe.medlemmer.includes(m.id) && m.telefon)
                : sortert.filter((m) => m.telefon);
              const datoStr = new Date().toLocaleDateString("nb-NO", {dateStyle: "long"});
              const rader = utvalg.map((m, i) => `<tr><td>${i + 1}</td><td>${m.navn}</td><td>${m.telefon}</td><td>${m.epost || ""}</td></tr>`).join("");
              const html = `<!DOCTYPE html><html lang="nb"><head><meta charset="UTF-8"><title>Kontaktliste</title><style>body{font-family:Georgia,serif;max-width:700px;margin:40px auto;color:#1B3A4B}h1{font-size:24px;margin-bottom:4px}.sub{color:#6B7A80;font-size:13px;margin:0 0 20px}table{width:100%;border-collapse:collapse}th{text-align:left;border-bottom:2px solid #C8BAA0;padding:6px 8px;font-size:13px;text-transform:uppercase}td{padding:8px;border-bottom:1px solid #EBE5DC;font-size:15px}tr:nth-child(even) td{background:#F7F5F0}</style></head><body><h1>Askøy Kystlag</h1><p class="sub">Kontaktliste${valgtGruppe ? ` \u2014 ${valgtGruppe.navn}` : ""} \u00b7 ${datoStr}</p><table><tr><th>#</th><th>Navn</th><th>Telefon</th><th>E-post</th></tr>${rader}</table></body></html>`;
              const w = window.open("", "_blank");
              if (w) { w.document.write(html); w.document.close(); w.print(); }
            }}>Åpne og skriv ut</button>
          </div>
        )}
      </div>

      {erAdmin && (
        <div style={kort}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div>
              <h3 style={{ margin: 0, fontFamily: "Georgia, serif", fontSize: 16 }}>📋 Eksterne kontakter</h3>
              <p style={{ margin: "3px 0 0", fontSize: 12.5, color: C.dempet }}>Kun for SMS-grupper — vises ikke i timer, logg eller rapport.</p>
            </div>
            <button style={{ ...sekKnapp, padding: "5px 12px", fontSize: 13 }} onClick={() => setVisKontakter(!visKontakter)}>
              {visKontakter ? "Lukk" : `Administrer (${(kontakter || []).length})`}
            </button>
          </div>
          {visKontakter && (
            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
              {(kontakter || []).length === 0 && <p style={{ margin: 0, fontSize: 13, color: C.dempet }}>Ingen eksterne kontakter ennå.</p>}
              {(kontakter || []).map((k) => (
                <div key={k.id} style={{ display: "grid", gap: 6, padding: "10px 0", borderBottom: `1px solid ${C.sand}` }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{k.navn}</div>
                    <div style={{ fontSize: 12.5, color: C.dempet }}>{k.telefon}{k.epost ? ` · ${k.epost}` : ""}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button style={{ ...sekKnapp, padding: "5px 10px", fontSize: 12, borderColor: "#4E7E5B", color: "#2F5A3C" }}
                      onClick={async () => {
                        if (!(await bekreft(`Gjøre ${k.navn} til fullverdig medlem?\n\nDe vil da dukke opp i dugnadslister, timer og rapporter. Kontakten fjernes fra ekstern-listen.`))) return;
                        const nyttMedlem = { id: k.id, navn: k.navn, telefon: k.telefon, epost: k.epost || "", pin: "", admin: false };
                        onLagreMeta([...medlemmer, nyttMedlem]);
                        onLagreKontakter((kontakter || []).filter((x) => x.id !== k.id));
                      }}>👤 Gjør til medlem</button>
                    <button style={{ ...sekKnapp, padding: "5px 10px", fontSize: 12, borderColor: C.signal, color: C.signal }}
                      onClick={async () => {
                        if (!(await bekreft(`Slette kontakten «${k.navn}»?`))) return;
                        onLagreKontakter((kontakter || []).filter((x) => x.id !== k.id));
                      }}>Slett</button>
                  </div>
                </div>
              ))}
              <div style={{ display: "grid", gap: 8, marginTop: 4, background: C.kritt, borderRadius: 8, padding: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Legg til ekstern kontakt</div>
                <input style={input} value={nyttKontaktNavn} onChange={(e) => setNyttKontaktNavn(e.target.value)} placeholder="Navn" />
                <input type="tel" style={input} value={nyttKontaktTelefon} onChange={(e) => setNyttKontaktTelefon(e.target.value)} placeholder="Telefonnummer" />
                <input type="email" style={input} value={nyttKontaktEpost} onChange={(e) => setNyttKontaktEpost(e.target.value)} placeholder="E-post (valgfritt)" />
                <button style={{ ...primKnapp, padding: "8px 16px" }} onClick={() => {
                  const n = nyttKontaktNavn.trim();
                  const t = nyttKontaktTelefon.trim();
                  if (n.length < 2 || !t) return;
                  onLagreKontakter([...(kontakter || []), { id: nyId(), navn: n, telefon: t, epost: nyttKontaktEpost.trim().toLowerCase(), ekstern: true }]);
                  setNyttKontaktNavn(""); setNyttKontaktTelefon(""); setNyttKontaktEpost("");
                }}>Legg til kontakt</button>
              </div>
            </div>
          )}
        </div>
      )}

      {erAdmin && (
        <div style={kort}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div>
              <h3 style={{ margin: 0, fontFamily: "Georgia, serif", fontSize: 16 }}>📥 Importer kontakter</h3>
              <p style={{ margin: "3px 0 0", fontSize: 12.5, color: C.dempet }}>Lim inn en liste med navn og telefon – én per linje.</p>
            </div>
            <button style={{ ...sekKnapp, padding: "5px 12px", fontSize: 13 }} onClick={() => { setVisImport(!visImport); setImportResultat(null); }}>
              {visImport ? "Lukk" : "Importer"}
            </button>
          </div>
          {visImport && (
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <div style={{ background: "#EAF0F5", borderRadius: 8, padding: "10px 12px", fontSize: 13 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Format (én kontakt per linje):</div>
                <div style={{ fontFamily: "monospace", lineHeight: 1.8, color: C.tjaere }}>
                  <div>Navn, telefonnummer</div>
                  <div>Navn; telefonnummer</div>
                  <div>Navn telefonnummer</div>
                </div>
                <div style={{ marginTop: 6, color: C.dempet }}>
                  Eksempel:<br />
                  <span style={{ fontFamily: "monospace" }}>
                    Kari Olsvik, 91234567<br />
                    Per Hansen; 98765432<br />
                    Anne Vik 41234567
                  </span>
                </div>
              </div>
              <div>
                <label style={etikett}>Lim inn liste</label>
                <textarea style={{ ...input, minHeight: 120, resize: "vertical", fontFamily: "monospace", fontSize: 13 }}
                  value={importTekst} onChange={(e) => { setImportTekst(e.target.value); setImportResultat(null); }}
                  placeholder={"Kari Olsvik, 91234567\nPer Hansen, 98765432\nAnne Vik, 41234567"} />
              </div>
              <div>
                <label style={etikett}>Legg til i gruppe (valgfritt)</label>
                <select style={input} value={importGruppe} onChange={(e) => setImportGruppe(e.target.value)}>
                  <option value="">Ikke legg til i gruppe</option>
                  {(grupper || []).map((g) => <option key={g.id} value={g.id}>{g.navn}</option>)}
                </select>
              </div>
              <button style={{ ...primKnapp, padding: "9px 16px" }} onClick={() => {
                const linjer = importTekst.split("\n").map((l) => l.trim()).filter((l) => l.length > 2);
                const nye = [];
                const feilet = [];
                for (const linje of linjer) {
                  // Prøv å parse: splitt på komma, semikolon eller siste mellomrom
                  let navn = "", telefon = "";
                  if (linje.includes(",")) {
                    const deler = linje.split(",").map((d) => d.trim());
                    navn = deler[0]; telefon = deler[1] || "";
                  } else if (linje.includes(";")) {
                    const deler = linje.split(";").map((d) => d.trim());
                    navn = deler[0]; telefon = deler[1] || "";
                  } else {
                    // Siste "ord" er telefonnummer (bare siffer/+)
                    const deler = linje.split(" ");
                    telefon = deler[deler.length - 1];
                    navn = deler.slice(0, -1).join(" ");
                  }
                  telefon = telefon.replace(/\s+/g, "");
                  if (navn.length >= 2 && /^[\d+]{8,}$/.test(telefon)) {
                    nye.push({ id: nyId(), navn: navn.trim(), telefon, epost: "", ekstern: true });
                  } else {
                    feilet.push(linje);
                  }
                }
                if (nye.length === 0) { setImportResultat({ ok: 0, feil: feilet }); return; }
                const oppdaterteKontakter = [...(kontakter || []), ...nye];
                onLagreKontakter(oppdaterteKontakter);
                if (importGruppe) {
                  const g = (grupper || []).find((x) => x.id === importGruppe);
                  if (g) {
                    const nyeIder = nye.map((k) => k.id);
                    onLagreGrupper((grupper || []).map((x) => x.id === importGruppe ? { ...x, medlemmer: [...x.medlemmer, ...nyeIder] } : x));
                  }
                }
                setImportResultat({ ok: nye.length, feil: feilet });
                setImportTekst("");
              }}>Importer kontakter</button>
              {importResultat && (
                <div style={{ background: importResultat.ok > 0 ? "#EAF3EC" : "#FBEAE8", borderRadius: 8, padding: "10px 12px", fontSize: 13 }}>
                  {importResultat.ok > 0 && <div style={{ color: "#2F5A3C", fontWeight: 700 }}>✓ {importResultat.ok} kontakt{importResultat.ok === 1 ? "" : "er"} importert{importGruppe ? " og lagt til i gruppen" : ""}.</div>}
                  {importResultat.feil.length > 0 && (
                    <div style={{ color: C.signal, marginTop: importResultat.ok > 0 ? 6 : 0 }}>
                      <div style={{ fontWeight: 700 }}>Kunne ikke tolke {importResultat.feil.length} linje{importResultat.feil.length === 1 ? "" : "r"}:</div>
                      {importResultat.feil.map((f, i) => <div key={i} style={{ fontFamily: "monospace", fontSize: 12 }}>{f}</div>)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {erAdmin && (
        <div style={kort}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div>
              <h3 style={{ margin: 0, fontFamily: "Georgia, serif", fontSize: 16 }}>⚙️ Administrer medlemmer</h3>
              <p style={{ margin: "3px 0 0", fontSize: 12.5, color: C.dempet }}>Roller og blokkering — kun synlig for admin.</p>
            </div>
            <button style={{ ...sekKnapp, padding: "5px 12px", fontSize: 13 }} onClick={() => setVisAdminDel(!visAdminDel)}>
              {visAdminDel ? "Lukk" : "Åpne"}
            </button>
          </div>
          {visAdminDel && (
            <div style={{ marginTop: 12 }}>
              <p style={{ margin: "0 0 10px", fontSize: 12.5, color: C.dempet }}>
                For fullstendig administrasjon (passord, utleierettigheter, prosjektrettigheter) bruk <strong>Admin-fanen</strong>.
              </p>
              {[...medlemmer].sort((a, b) => a.navn.localeCompare(b.navn, "nb")).map((m) => (
                <div key={m.id} style={{ padding: "10px 0", borderBottom: `1px solid ${C.sand}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
                    <div>
                      <span style={{ fontWeight: 600 }}>{m.navn}</span>
                      {m.admin && <span style={{ marginLeft: 6, fontSize: 10.5, background: C.hav, color: C.kritt, borderRadius: 4, padding: "2px 6px" }}>ADMIN</span>}
                      {m.blokkert && <span style={{ marginLeft: 6, fontSize: 10.5, background: C.signal, color: "#fff", borderRadius: 4, padding: "2px 6px" }}>BLOKKERT</span>}
                      <div style={{ fontSize: 12, color: C.dempet, marginTop: 2 }}>{m.epost || "ingen e-post"} · {m.telefon || "ingen telefon"}</div>
                    </div>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {m.id !== bruker.id && (
                        <button style={{ ...sekKnapp, padding: "4px 9px", fontSize: 11 }}
                          onClick={() => onLagreMeta(medlemmer.map((x) => x.id === m.id ? { ...x, admin: !x.admin } : x))}>
                          {m.admin ? "Fjern admin" : "Gjør til admin"}
                        </button>
                      )}
                      {m.id !== bruker.id && !m.admin && (
                        <button style={{ ...sekKnapp, padding: "4px 9px", fontSize: 11, borderColor: m.blokkert ? "#4E7E5B" : C.signal, color: m.blokkert ? "#2F5A3C" : C.signal }}
                          onClick={async () => {
                            if (!(await bekreft(m.blokkert ? `Gjenåpne tilgangen for ${m.navn}?` : `Blokkere ${m.navn}?`))) return;
                            onLagreMeta(medlemmer.map((x) => x.id === m.id ? { ...x, blokkert: !x.blokkert } : x));
                          }}>
                          {m.blokkert ? "Gjenåpne" : "Blokker"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </section>
  );
}

// ============================================================
function gjenkjennPlattform() {
  if (typeof navigator === "undefined") return "ukjent";
  const ua = navigator.userAgent || "";
  const erIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const erStandalone = window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
  if (erStandalone) return "installert";
  if (erIOS) return "ios";
  if (/Android/.test(ua)) return "android";
  return "pc";
}

function LeggTilHjemskjerm({ stil }) {
  const { C, kort } = stil;
  const [plattform] = useState(gjenkjennPlattform);
  const [apen, setApen] = useState(false);
  const [skjult, setSkjult] = useState(() => {
    try { return localStorage.getItem("akl-skjul-installtips") === "1"; }
    catch (e) { return false; }
  });

  function skjul() {
    setSkjult(true);
    try { localStorage.setItem("akl-skjul-installtips", "1"); } catch (e) { /* uviktig */ }
  }

  if (plattform === "installert" || skjult) return null;

  const STEG = {
    ios: {
      tittel: "Legg til på hjem-skjermen (iPhone/iPad)",
      steg: [
        "Trykk på Del-knappen nederst i Safari (firkant med pil opp).",
        "Bla ned og trykk «Legg til på Hjem-skjerm».",
        "Trykk «Legg til» øverst til høyre.",
      ],
      merk: "Må gjøres i Safari — fungerer ikke i Chrome eller andre apper på iPhone.",
    },
    android: {
      tittel: "Legg til på hjem-skjermen (Android)",
      steg: [
        "Trykk på de tre prikkene oppe til høyre i nettleseren.",
        "Velg «Legg til på startskjermen» (eller «Installer app»).",
        "Bekreft ved å trykke «Legg til» / «Installer».",
      ],
      merk: "I Chrome dukker det noen ganger opp et eget «Installer»-forslag automatisk nederst.",
    },
    pc: {
      tittel: "Legg til som app på PC-en",
      steg: [
        "Se etter et lite installer-ikon (skjerm med pil) i adressefeltet, helt til høyre.",
        "Klikk på det og velg «Installer».",
        "Appen åpnes nå i eget vindu, og legges til i startmenyen/dock.",
      ],
      merk: "Fungerer i Chrome og Edge. Ser du ikke ikonet, kan dette gjøres fra nettleserens meny i stedet.",
    },
    ukjent: {
      tittel: "Legg til på hjem-skjermen",
      steg: ["Se etter «Legg til på hjem-skjerm» eller «Installer app» i nettleserens meny."],
      merk: "",
    },
  };
  const info = STEG[plattform] || STEG.ukjent;

  return (
    <div style={{ ...kort, borderLeft: `4px solid ${C.sjogronn}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>📲</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14.5 }}>Legg appen på hjem-skjermen</div>
            <div style={{ fontSize: 12.5, color: C.dempet }}>Da åpnes den som en vanlig app, uten adressefelt.</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setApen(!apen)}
            style={{ background: C.sjogronn, color: "#fff", border: "none", borderRadius: 6, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            {apen ? "Lukk" : "Vis meg hvordan"}
          </button>
          <button onClick={skjul} aria-label="Skjul"
            style={{ background: "none", border: "none", color: C.dempet, fontSize: 18, cursor: "pointer", padding: "0 4px" }}>×</button>
        </div>
      </div>
      {apen && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.sand}` }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{info.tittel}</div>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.7 }}>
            {info.steg.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
          {info.merk && <p style={{ margin: "8px 0 0", fontSize: 12.5, color: C.dempet }}>{info.merk}</p>}
        </div>
      )}
    </div>
  );
}

function Hjem({ bruker, medlemmer, prosjekter, innslag, dugnader, logo, erAdmin, sisteBackup, gaaTil, stil }) {
  const { C, kort } = stil;
  function navnFor(id) { return medlemmer.find((m) => m.id === id)?.navn || "Ukjent"; }
  const aaret = iDag().slice(0, 4);

  // Påminnelse om sikkerhetskopi for admin (ikke tatt i dag)
  let backupPaaminnelse = false;
  if (erAdmin && innslag.length > 0) {
    backupPaaminnelse = sisteBackup !== iDag();
  }
  const iAar = innslag.filter((i) => i.dato.slice(0, 4) === aaret);
  const totaltIAar = iAar.reduce((s, i) => s + i.timer, 0);

  const topp3Medlemmer = medlemmer
    .map((m) => ({ navn: m.navn, t: iAar.filter((i) => i.medlemId === m.id).reduce((s, i) => s + i.timer, 0) }))
    .filter((x) => x.t > 0).sort((a, b) => b.t - a.t).slice(0, 3);

  const topp3Prosjekter = prosjekter
    .map((p) => ({ id: p.id, navn: p.navn, t: iAar.filter((i) => i.prosjektId === p.id).reduce((s, i) => s + i.timer, 0) }))
    .filter((x) => x.t > 0).sort((a, b) => b.t - a.t).slice(0, 3);

  const siste = [...innslag].sort((a, b) => b.dato.localeCompare(a.dato)).slice(0, 5);
  const nesteDugnad = dugnader.filter((d) => d.dato >= iDag()).sort((a, b) => a.dato.localeCompare(b.dato))[0];
  const medaljer = ["🥇", "🥈", "🥉"];

  return (
    <section style={{ display: "grid", gap: 14 }}>
      <div style={{ background: C.hav, borderRadius: 12, padding: "26px 20px", color: C.kritt, position: "relative", overflow: "hidden" }}>
        <svg style={{ position: "absolute", bottom: -4, left: 0, width: "100%", opacity: 0.16 }} viewBox="0 0 400 40" preserveAspectRatio="none">
          <path d="M0 25 Q25 12 50 25 Q75 38 100 25 Q125 12 150 25 Q175 38 200 25 Q225 12 250 25 Q275 38 300 25 Q325 12 350 25 Q375 38 400 25 L400 40 L0 40 Z" fill="#F7F5F0" />
        </svg>
        <div style={{ display: "flex", alignItems: "center", gap: 16, position: "relative" }}>
          {logo
            ? <img src={logo} alt="Askøy Kystlag" style={{ height: 64, width: 64, objectFit: "contain", borderRadius: 10, background: "#fff", padding: 4 }} />
            : <Lagsmerke size={64} lys />}
          <div>
            <div style={{ fontFamily: "Georgia, serif", fontSize: 22, fontWeight: 700 }}>Velkommen, {bruker.navn.split(" ")[0]}!</div>
            <div style={{ fontSize: 14, color: "rgba(247,245,240,0.8)", marginTop: 2 }}>
              Laget har lagt ned <strong style={{ color: C.kritt }}>{tall(totaltIAar)} dugnadstimer</strong> i {aaret}.
            </div>
          </div>
        </div>
      </div>

      <LeggTilHjemskjerm stil={stil} />

      {backupPaaminnelse && (
        <div style={{ ...kort, borderLeft: `4px solid ${C.signal}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13 }}>
            <strong>💾 Dagens sikkerhetskopi</strong>
            <div style={{ color: C.dempet, marginTop: 2 }}>
              {sisteBackup ? `Sist tatt ${fDato(sisteBackup)}.` : "Ingen sikkerhetskopi er tatt ennå."} Ta én i dag og last den opp til lagets Google Disk.
            </div>
          </div>
          <button onClick={() => gaaTil("admin")}
            style={{ background: C.signal, color: "#fff", border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Til Admin
          </button>
        </div>
      )}

      {nesteDugnad && (
        <button onClick={() => gaaTil("kalender")}
          style={{ ...kort, textAlign: "left", cursor: "pointer", borderLeft: `4px solid ${C.signal}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase", color: C.signal, fontWeight: 700 }}>Neste dugnad</div>
            <div style={{ fontWeight: 700, fontSize: 16, marginTop: 3 }}>{nesteDugnad.tittel}</div>
            <div style={{ fontSize: 13, color: C.dempet }}>
              {fDato(nesteDugnad.dato)}{fTid(nesteDugnad)}{nesteDugnad.sted ? ` · ${nesteDugnad.sted}` : ""} · {nesteDugnad.paameldte.length} påmeldte
              {nesteDugnad.paameldte.includes(bruker.id) ? " · Du er påmeldt ✓" : ""}
            </div>
          </div>
          <span style={{ color: C.sjogronn, fontSize: 20 }}>›</span>
        </button>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={kort}>
          <h3 style={{ margin: "0 0 10px", fontFamily: "Georgia, serif", fontSize: 16 }}>Årets ildsjeler</h3>
          {topp3Medlemmer.length === 0 && <p style={{ color: C.dempet, fontSize: 13, margin: 0 }}>Ingen timer ført i {aaret} ennå.</p>}
          {topp3Medlemmer.map((x, i) => (
            <div key={x.navn} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: i < topp3Medlemmer.length - 1 ? `1px solid ${C.sand}` : "none", fontSize: 14 }}>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{medaljer[i]} {x.navn}</span>
              <span style={{ fontWeight: 700, marginLeft: 6 }}>{tall(x.t)} t</span>
            </div>
          ))}
        </div>
        <div style={kort}>
          <h3 style={{ margin: "0 0 10px", fontFamily: "Georgia, serif", fontSize: 16 }}>Største prosjekter</h3>
          {topp3Prosjekter.length === 0 && <p style={{ color: C.dempet, fontSize: 13, margin: 0 }}>Ingen prosjekttimer i {aaret} ennå.</p>}
          {topp3Prosjekter.map((x, i) => (
            <button key={x.id} onClick={() => gaaTil("prosjekter", x.id)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: i < topp3Prosjekter.length - 1 ? `1px solid ${C.sand}` : "none", fontSize: 14, width: "100%", background: "none", border: "none", borderBottomStyle: "solid", cursor: "pointer", color: C.tjaere, textAlign: "left" }}>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i + 1}. {x.navn}</span>
              <span style={{ fontWeight: 700, marginLeft: 6 }}>{tall(x.t)} t</span>
            </button>
          ))}
        </div>
      </div>

      <div style={kort}>
        <h3 style={{ margin: "0 0 10px", fontFamily: "Georgia, serif", fontSize: 16 }}>Sist ført i loggen</h3>
        {siste.length === 0 && <p style={{ color: C.dempet, fontSize: 13, margin: 0 }}>Loggboka er tom — bli den første!</p>}
        {siste.map((i, idx) => {
          const p = prosjekter.find((x) => x.id === i.prosjektId);
          return (
            <div key={i.id} style={{ padding: "8px 0", borderBottom: idx < siste.length - 1 ? `1px solid ${C.sand}` : "none", fontSize: 14 }}>
              <span style={{ fontWeight: 600 }}>{navnFor(i.medlemId)}</span> førte {tall(i.timer)} t
              <div style={{ fontSize: 12.5, color: C.dempet }}>{fDato(i.dato)} · {i.aktivitet}{p ? ` · ${p.navn}` : ""}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ============================================================
// Innlogging: 6-sifret kode, e-post og «glemt koden»
// ============================================================
function Innlogging({ logo, stil }) {
  const { C, input, etikett, primKnapp, kort } = stil;
  const [modus, setModus] = useState("inn"); // inn | ny | glemt
  const [navn, setNavn] = useState("");
  const [epost, setEpost] = useState("");
  const [telefon, setTelefon] = useState("");
  const [passord, setPassord] = useState("");
  const [feil, setFeil] = useState("");
  const [info, setInfo] = useState("");
  const [jobber, setJobber] = useState(false);

  async function loggInn() {
    setFeil(""); setInfo("");
    if (!epost || !passord) { setFeil("Fyll inn e-post og passord."); return; }
    setJobber(true);
    const { error } = await supabase.auth.signInWithPassword({ email: epost.trim().toLowerCase(), password: passord });
    setJobber(false);
    if (error) setFeil("Feil e-post eller passord. Prøv igjen, eller bruk «Glemt passord».");
  }

  async function registrer() {
    setFeil(""); setInfo("");
    if (navn.trim().length < 2) { setFeil("Skriv inn fullt navn."); return; }
    if (!/^\S+@\S+\.\S+$/.test(epost)) { setFeil("Skriv inn en gyldig e-postadresse."); return; }
    if (!gyldigTelefon(telefon)) { setFeil("Skriv inn et gyldig telefonnummer (minst 8 siffer)."); return; }
    if (!passord) { setFeil("Velg et passord."); return; }
    setJobber(true);
    const { error } = await supabase.auth.signUp({
      email: epost.trim().toLowerCase(),
      password: passord,
      options: { data: { navn: navn.trim(), telefon: telefon.trim() } },
    });
    setJobber(false);
    if (error) {
      let melding = "Kunne ikke registrere. Prøv igjen.";
      if (error.message.includes("registered")) melding = "E-posten er allerede registrert. Logg inn i stedet.";
      else if (error.message.toLowerCase().includes("password") || error.message.toLowerCase().includes("passord")) melding = "Passordet er for kort for systemet vårt — prøv noen tegn til.";
      setFeil(melding);
      return;
    }
    setInfo("Konto opprettet! Hvis e-postbekreftelse er på, sjekk innboksen din. Ellers kan du logge inn nå.");
    setModus("inn");
  }

  async function glemtPassord() {
    setFeil(""); setInfo("");
    if (!/^\S+@\S+\.\S+$/.test(epost)) { setFeil("Skriv inn e-postadressen din først."); return; }
    setJobber(true);
    const { error } = await supabase.auth.resetPasswordForEmail(epost.trim().toLowerCase());
    setJobber(false);
    if (error) { setFeil("Kunne ikke sende e-post. Prøv igjen."); return; }
    setInfo("Vi har sendt en e-post med lenke for å lage nytt passord. Sjekk innboksen din.");
  }

  const lenke = { background: "none", border: "none", color: C.hav, textDecoration: "underline", cursor: "pointer", fontSize: 14 };

  return (
    <div style={{ minHeight: "100vh", background: C.hav, fontFamily: "'Helvetica Neue', Arial, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 20, color: C.kritt }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
            {logo
              ? <img src={logo} alt="Askøy Kystlag" style={{ height: 76, width: 76, objectFit: "contain", borderRadius: 12, background: "#fff", padding: 5 }} />
              : <Lagsmerke size={76} lys />}
          </div>
          <h1 style={{ margin: "4px 0 0", fontFamily: "Georgia, serif", fontSize: 36 }}>Askøy Kystlag</h1>
        </div>
        <div style={{ ...kort, padding: 22 }}>
          {feil && <div style={{ background: "#FBEAE8", border: `1px solid ${C.signal}`, color: C.signal, padding: "9px 12px", borderRadius: 6, marginBottom: 14, fontSize: 14 }}>{feil}</div>}
          {info && <div style={{ background: "#EAF3EC", border: "1px solid #4E7E5B", color: "#2F5A3C", padding: "9px 12px", borderRadius: 6, marginBottom: 14, fontSize: 14 }}>{info}</div>}

          {modus === "inn" && (
            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={etikett}>E-post</label>
                <input type="email" value={epost} onChange={(e) => setEpost(e.target.value)} style={input} placeholder="din@epost.no" />
              </div>
              <div>
                <label style={etikett}>Passord</label>
                <input type="password" value={passord} onChange={(e) => setPassord(e.target.value)} onKeyDown={(e) => e.key === "Enter" && loggInn()} style={input} placeholder="Passord" />
              </div>
              <button style={{ ...primKnapp, width: "100%", opacity: jobber ? 0.6 : 1 }} disabled={jobber} onClick={loggInn}>{jobber ? "Logger inn …" : "Logg inn"}</button>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                <button onClick={() => { setModus("glemt"); setFeil(""); setInfo(""); }} style={lenke}>Glemt passord?</button>
                <button onClick={() => { setModus("ny"); setFeil(""); setInfo(""); }} style={lenke}>Ny i laget? Registrer deg</button>
              </div>
            </div>
          )}

          {modus === "ny" && (
            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={etikett}>Fullt navn</label>
                <input type="text" value={navn} onChange={(e) => setNavn(e.target.value)} style={input} placeholder="f.eks. Kari Olsvik" />
              </div>
              <div>
                <label style={etikett}>E-post</label>
                <input type="email" value={epost} onChange={(e) => setEpost(e.target.value)} style={input} placeholder="din@epost.no" />
              </div>
              <div>
                <label style={etikett}>Telefonnummer</label>
                <input type="tel" value={telefon} onChange={(e) => setTelefon(e.target.value)} style={input} placeholder="f.eks. 912 34 567" />
                <p style={{ margin: "5px 0 0", fontSize: 12, color: C.dempet }}>Vises i medlemslisten, så andre kan ta kontakt.</p>
              </div>
              <div>
                <label style={etikett}>Velg passord</label>
                <input type="password" value={passord} onChange={(e) => setPassord(e.target.value)} style={input} placeholder="Du bestemmer selv" />
                <p style={{ margin: "5px 0 0", fontSize: 12, color: C.dempet, lineHeight: 1.5 }}>
                  Du velger fritt — men jo lengre, jo tryggere. Unngå rene gjentakelser som «123456». Et godt knep er en kort
                  setning bare du vet, f.eks. samme type som koden til Kystbua eller passordet ditt i StyreWeb — noe som
                  «Kystbua-1987!» eller «GrågåsRundtKlokka07».
                </p>
              </div>
              <button style={{ ...primKnapp, width: "100%", opacity: jobber ? 0.6 : 1 }} disabled={jobber} onClick={registrer}>{jobber ? "Oppretter …" : "Registrer og logg inn"}</button>
              <button onClick={() => { setModus("inn"); setFeil(""); setInfo(""); }} style={lenke}>Tilbake til innlogging</button>
            </div>
          )}

          {modus === "glemt" && (
            <div style={{ display: "grid", gap: 14 }}>
              <p style={{ margin: 0, fontSize: 14, color: C.dempet }}>Skriv inn e-postadressen din, så sender vi en lenke for å lage nytt passord.</p>
              <div>
                <label style={etikett}>E-post</label>
                <input type="email" value={epost} onChange={(e) => setEpost(e.target.value)} style={input} placeholder="din@epost.no" />
              </div>
              <button style={{ ...primKnapp, width: "100%", opacity: jobber ? 0.6 : 1 }} disabled={jobber} onClick={glemtPassord}>{jobber ? "Sender …" : "Send lenke for nytt passord"}</button>
              <button onClick={() => { setModus("inn"); setFeil(""); setInfo(""); }} style={lenke}>Tilbake til innlogging</button>
            </div>
          )}
        </div>
        <p style={{ color: "rgba(247,245,240,0.55)", fontSize: 12, textAlign: "center", marginTop: 14 }}>
          Pålogging og passord håndteres trygt av Supabase.
        </p>
        <p style={{ color: "rgba(247,245,240,0.35)", fontSize: 11, textAlign: "center", marginTop: 4 }}>
          v{APP_VERSJON} — {APP_OPPDATERT}
        </p>
      </div>
    </div>
  );
}

// ============================================================
// Kalender
// ============================================================
function Kalender({ dugnader, medlemmer, prosjekter, innslag, bruker, erAdmin, aktiviteter, onLagre, onFoerTimer, stil }) {
  const { C, input, etikett, primKnapp, sekKnapp, kort, bekreft, varsle } = stil;
  const [viserSkjema, setViserSkjema] = useState(false);
  const [tittel, setTittel] = useState("");
  const [dato, setDato] = useState("");
  const [tid, setTid] = useState("");
  const [tidSlutt, setTidSlutt] = useState("");
  const [sted, setSted] = useState("");
  const [beskrivelse, setBeskrivelse] = useState("");
  const [prosjektId, setProsjektId] = useState("");
  const [feil, setFeil] = useState("");
  const [aapenOppmoete, setAapenOppmoete] = useState(null);
  const [bulkTimer, setBulkTimer] = useState("");
  const [bulkAktivitet, setBulkAktivitet] = useState(aktiviteter[0] || "Annet");
  const [leggTilId, setLeggTilId] = useState("");
  const [viserTidligere, setViserTidligere] = useState(false);
  const [redigerId, setRedigerId] = useState(null);
  const [visUtforte, setVisUtforte] = useState(false);
  const [varselApent, setVarselApent] = useState(null); // dugnad-id som varselpanelet er åpent for
  const [varselMottakere, setVarselMottakere] = useState("alle"); // "alle" | "prosjekt"
  const [nettopOpprettetVarsel, setNettopOpprettetVarsel] = useState(null); // dugnad rett etter opprettelse

  function navnFor(id) { return medlemmer.find((m) => m.id === id)?.navn || "Ukjent"; }
  const idag = iDag();
  const planlagteAlle = dugnader.filter((d) => d.status !== "utfort");
  const utforteAlle = dugnader.filter((d) => d.status === "utfort");
  const kommende = planlagteAlle.filter((d) => d.dato >= idag).sort((a, b) => a.dato.localeCompare(b.dato));
  const tidligere = planlagteAlle.filter((d) => d.dato < idag).sort((a, b) => b.dato.localeCompare(a.dato));
  const utforte = [...utforteAlle].sort((a, b) => b.dato.localeCompare(a.dato));

  // Medlemmer "tilknyttet" et prosjekt: de som har ført timer på det, pluss prosjektansvarlige
  function medlemmerForProsjekt(prosjektId) {
    if (!prosjektId) return [];
    const p = prosjekter.find((x) => x.id === prosjektId);
    const fraTimer = innslag.filter((i) => i.prosjektId === prosjektId).map((i) => i.medlemId);
    const ansvarlige = p ? ledereAv(p) : [];
    return [...new Set([...fraTimer, ...ansvarlige])];
  }

  function epostMottakere(d, omfang) {
    const ider = omfang === "prosjekt" && d.prosjektId
      ? medlemmerForProsjekt(d.prosjektId)
      : medlemmer.map((m) => m.id);
    return medlemmer.filter((m) => ider.includes(m.id) && m.epost);
  }

  function dugnadVarselTekst(d) {
    const linjer = [
      `Hei!`,
      ``,
      `Det er planlagt dugnad: ${d.tittel}`,
      `Dato: ${fDato(d.dato)}${fTid(d)}`,
      d.sted ? `Sted: ${d.sted}` : null,
      d.beskrivelse ? `` : null,
      d.beskrivelse || null,
      ``,
      `Meld deg på i Dugnadsloggen.`,
      ``,
      `Hilsen ${bruker.navn}, Askøy Kystlag`,
    ].filter((x) => x !== null);
    return linjer.join("\n");
  }

  async function sendEpostVarsel(d, omfang) {
    const mottakere = epostMottakere(d, omfang);
    if (mottakere.length === 0) {
      await varsle("Fant ingen mottakere med registrert e-postadresse for dette utvalget.");
      return;
    }
    const bcc = mottakere.map((m) => m.epost).join(",");
    const emne = encodeURIComponent(`Dugnad: ${d.tittel} — ${fDato(d.dato)}`);
    const kropp = encodeURIComponent(dugnadVarselTekst(d));
    const a = document.createElement("a");
    a.href = `mailto:?bcc=${bcc}&subject=${emne}&body=${kropp}`;
    a.click();
  }

  function tomSkjema() {
    setTittel(""); setDato(""); setTid(""); setTidSlutt(""); setSted(""); setBeskrivelse(""); setProsjektId("");
    setRedigerId(null); setViserSkjema(false); setFeil("");
  }

  function startRedigering(d) {
    setRedigerId(d.id);
    setTittel(d.tittel); setDato(d.dato); setTid(d.tid || ""); setTidSlutt(d.tidSlutt || "");
    setSted(d.sted || ""); setBeskrivelse(d.beskrivelse || ""); setProsjektId(d.prosjektId || "");
    setFeil(""); setViserSkjema(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function slettDugnad(d) {
    if (!(await bekreft(`Slette dugnaden «${d.tittel}»? Dette kan ikke angres.`))) return;
    await onLagre(dugnader.filter((x) => x.id !== d.id));
  }

  async function settUtfort(d, utfort) {
    await onLagre(dugnader.map((x) => (x.id === d.id ? { ...x, status: utfort ? "utfort" : "planlagt" } : x)));
  }

  async function opprett() {
    setFeil("");
    if (tittel.trim().length < 2) { setFeil("Gi dugnaden et navn."); return; }
    if (!dato) { setFeil("Velg dato for dugnaden."); return; }
    if (tidSlutt && tid && tidSlutt <= tid) { setFeil("Sluttiden må være etter starttiden."); return; }

    if (redigerId) {
      const original = dugnader.find((x) => x.id === redigerId);
      if (!original) { tomSkjema(); return; }
      const oppdatert = {
        ...original,
        tittel: tittel.trim(), dato, tid: tid.trim(), tidSlutt: tidSlutt.trim(), sted: sted.trim(),
        beskrivelse: beskrivelse.trim(), prosjektId: prosjektId || null,
      };
      await onLagre(dugnader.map((x) => (x.id === redigerId ? oppdatert : x)));
      tomSkjema();
      return;
    }

    const d = {
      id: nyId(), tittel: tittel.trim(), dato, tid: tid.trim(), tidSlutt: tidSlutt.trim(), sted: sted.trim(),
      beskrivelse: beskrivelse.trim(), prosjektId: prosjektId || null, status: "planlagt",
      ansvarligId: bruker.id, paameldte: [bruker.id], oppmoette: [],
    };
    await onLagre([...dugnader, d]);
    setNettopOpprettetVarsel(d);
    tomSkjema();
  }

  async function togglePaamelding(d) {
    const er = d.paameldte.includes(bruker.id);
    const oppdatert = { ...d, paameldte: er ? d.paameldte.filter((x) => x !== bruker.id) : [...d.paameldte, bruker.id] };
    await onLagre(dugnader.map((x) => (x.id === d.id ? oppdatert : x)));
  }

  async function toggleOppmoete(d, mid) {
    const er = d.oppmoette.includes(mid);
    const oppdatert = { ...d, oppmoette: er ? d.oppmoette.filter((x) => x !== mid) : [...d.oppmoette, mid] };
    await onLagre(dugnader.map((x) => (x.id === d.id ? oppdatert : x)));
  }

  function DugnadKort({ d, erTidligere }) {
    const ansvarlig = navnFor(d.ansvarligId);
    const prosjekt = prosjekter.find((p) => p.id === d.prosjektId);
    const paameldt = d.paameldte.includes(bruker.id);
    const kanStyre = erAdmin || d.ansvarligId === bruker.id;
    const viserOppmoete = aapenOppmoete === d.id;
    const oppmoeteKandidater = [...new Set([...d.paameldte, ...d.oppmoette])];

    return (
      <div style={{ ...kort, borderLeft: `4px solid ${erTidligere ? C.sand : C.sjogronn}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 17, fontFamily: "Georgia, serif" }}>
              {d.tittel}
              {d.status === "utfort" && <span style={{ marginLeft: 8, fontSize: 10.5, fontFamily: "'Helvetica Neue', Arial, sans-serif", background: "#4E7E5B", color: "#fff", borderRadius: 4, padding: "2px 7px", letterSpacing: "0.06em", verticalAlign: "middle" }}>UTFØRT</span>}
              {d.utleie && <span style={{ marginLeft: 8, fontSize: 10.5, fontFamily: "'Helvetica Neue', Arial, sans-serif", background: C.signal, color: "#fff", borderRadius: 4, padding: "2px 7px", letterSpacing: "0.06em", verticalAlign: "middle" }}>UTLEIEOPPDRAG</span>}
            </div>
            <div style={{ fontSize: 13, color: C.dempet, marginTop: 3 }}>
              {fDato(d.dato)}{fTid(d)}{d.sted ? ` · ${d.sted}` : ""}
            </div>
            <div style={{ fontSize: 13, color: C.dempet }}>
              Ansvarlig: {ansvarlig}{prosjekt ? ` · Prosjekt: ${prosjekt.navn}` : ""}
            </div>
          </div>
          {!erTidligere && (
            <button onClick={() => togglePaamelding(d)}
              style={paameldt
                ? { ...sekKnapp, padding: "7px 12px", fontSize: 13 }
                : { ...primKnapp, padding: "8px 14px", fontSize: 14 }}>
              {paameldt ? "Meld meg av" : "Bli med!"}
            </button>
          )}
        </div>

        {d.beskrivelse && <p style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.5 }}>{d.beskrivelse}</p>}

        <div style={{ marginTop: 12, fontSize: 13 }}>
          <span style={{ fontWeight: 600 }}>{d.paameldte.length} påmeldt{d.paameldte.length === 1 ? "" : "e"}:</span>{" "}
          <span style={{ color: C.dempet }}>
            {d.paameldte.length ? d.paameldte.map((id) => `${navnFor(id)}${d.oppmoette.includes(id) ? " ✓" : ""}`).join(", ") : "ingen ennå"}
          </span>
          {d.oppmoette.length > 0 && (
            <div style={{ color: "#2F5A3C", marginTop: 3 }}>✓ = bekreftet oppmøte ({d.oppmoette.length} stk.)</div>
          )}
        </div>

        {kanStyre && (
          <div style={{ marginTop: 12, borderTop: `1px solid ${C.sand}`, paddingTop: 12 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button style={{ ...sekKnapp, padding: "7px 12px", fontSize: 13 }}
                onClick={() => { setAapenOppmoete(viserOppmoete ? null : d.id); setLeggTilId(""); setBulkTimer(""); }}>
                {viserOppmoete ? "Lukk oppmøteregistrering" : "Registrer oppmøte"}
              </button>
              <button style={{ ...sekKnapp, padding: "7px 12px", fontSize: 13 }}
                onClick={() => setVarselApent(varselApent === d.id ? null : d.id)}>
                📧 {varselApent === d.id ? "Lukk varsel" : "Send varsel"}
              </button>
              <button style={{ ...sekKnapp, padding: "7px 12px", fontSize: 13 }} onClick={() => startRedigering(d)}>
                ✏️ Endre
              </button>
              <button style={{ ...sekKnapp, padding: "7px 12px", fontSize: 13, borderColor: "#4E7E5B", color: "#2F5A3C" }}
                onClick={() => settUtfort(d, d.status !== "utfort")}>
                {d.status === "utfort" ? "↩ Sett som planlagt" : "✓ Marker utført"}
              </button>
              <button style={{ ...sekKnapp, padding: "7px 12px", fontSize: 13, borderColor: C.signal, color: C.signal }}
                onClick={() => slettDugnad(d)}>
                🗑 Slett
              </button>
            </div>

            {varselApent === d.id && (
              <div style={{ marginTop: 12, display: "grid", gap: 8, background: C.kritt, borderRadius: 8, padding: 12 }}>
                <select style={input} value={varselMottakere} onChange={(e) => setVarselMottakere(e.target.value)}>
                  <option value="alle">Alle medlemmer</option>
                  {d.prosjektId && <option value="prosjekt">Bare medlemmer tilknyttet prosjektet</option>}
                </select>
                <button style={{ ...primKnapp, padding: "9px 16px", fontSize: 14 }} onClick={() => { sendEpostVarsel(d, varselMottakere); setVarselApent(null); }}>
                  📧 Send varsel på e-post
                </button>
                <p style={{ margin: 0, fontSize: 12, color: C.dempet }}>Åpner e-postappen din med mottakerne ferdig fylt inn (skjult for hverandre).</p>
              </div>
            )}

            {viserOppmoete && (
              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                {oppmoeteKandidater.length === 0 && <p style={{ margin: 0, fontSize: 14, color: C.dempet }}>Ingen påmeldte å bekrefte. Legg til oppmøtte under.</p>}
                {oppmoeteKandidater.map((mid) => (
                  <label key={mid} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, cursor: "pointer" }}>
                    <input type="checkbox" checked={d.oppmoette.includes(mid)} onChange={() => toggleOppmoete(d, mid)} style={{ width: 18, height: 18 }} />
                    {navnFor(mid)}{!d.paameldte.includes(mid) && <span style={{ fontSize: 12, color: C.dempet }}>(ikke påmeldt)</span>}
                  </label>
                ))}
                <div style={{ display: "flex", gap: 8 }}>
                  <select style={{ ...input, flex: 1 }} value={leggTilId} onChange={(e) => setLeggTilId(e.target.value)}>
                    <option value="">Legg til oppmøtt som ikke var påmeldt …</option>
                    {medlemmer.filter((m) => !oppmoeteKandidater.includes(m.id))
                      .sort((a, b) => a.navn.localeCompare(b.navn, "nb"))
                      .map((m) => <option key={m.id} value={m.id}>{m.navn}</option>)}
                  </select>
                  <button style={{ ...sekKnapp, padding: "7px 12px" }} onClick={() => {
                    if (!leggTilId) return;
                    toggleOppmoete(d, leggTilId);
                    setLeggTilId("");
                  }}>Legg til</button>
                </div>

                {d.oppmoette.length > 0 && (
                  <div style={{ background: C.kritt, borderRadius: 8, padding: 12, display: "grid", gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Før timer for alle oppmøtte ({d.oppmoette.length} stk.)</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input style={{ ...input, flex: 1 }} type="text" inputMode="decimal" placeholder="Timer per person, f.eks. 3"
                        value={bulkTimer} onChange={(e) => setBulkTimer(e.target.value)} />
                      <select style={{ ...input, flex: 1.4 }} value={bulkAktivitet} onChange={(e) => setBulkAktivitet(e.target.value)}>
                        {aktiviteter.map((a) => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </div>
                    <button style={{ ...primKnapp, padding: "10px 16px", fontSize: 14 }} onClick={() => {
                      const t = parseFloat(String(bulkTimer).replace(",", "."));
                      if (!t || t <= 0) return;
                      const nye = d.oppmoette.map((mid) => ({
                        id: nyId(), medlemId: mid, dato: d.dato, aktivitet: bulkAktivitet,
                        timer: t, notat: d.tittel, prosjektId: d.prosjektId || null, underId: null,
                      }));
                      onFoerTimer(nye);
                      setBulkTimer("");
                      setAapenOppmoete(null);
                    }}>Før {bulkTimer || "…"} t på hver</button>
                    <p style={{ margin: 0, fontSize: 12, color: C.dempet }}>Lager én timeregistrering per oppmøtt, knyttet til dugnaden{d.prosjektId ? " og prosjektet" : ""}.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <section style={{ display: "grid", gap: 10 }}>
      {feil && <div style={{ background: "#FBEAE8", border: `1px solid ${C.signal}`, color: C.signal, padding: "9px 12px", borderRadius: 6, fontSize: 14 }}>{feil}</div>}

      {!viserSkjema ? (
        <button style={{ ...primKnapp, width: "100%" }} onClick={() => { tomSkjema(); setViserSkjema(true); }}>+ Planlegg ny dugnad</button>
      ) : (
        <div style={{ ...kort, display: "grid", gap: 12 }}>
          {redigerId && <div style={{ fontWeight: 700, fontFamily: "Georgia, serif", fontSize: 16 }}>Endre dugnad</div>}
          <div>
            <label style={etikett}>Hva skal gjøres?</label>
            <input style={input} value={tittel} onChange={(e) => setTittel(e.target.value)} placeholder="f.eks. Vårpuss på Oselvaren" />
          </div>
          <div>
            <label style={etikett}>Dato</label>
            <input type="date" style={input} value={dato} onChange={(e) => setDato(e.target.value)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={etikett}>Fra kl.</label>
              <TidVelger value={tid} onChange={setTid} style={input} />
            </div>
            <div>
              <label style={etikett}>Til kl. (valgfritt)</label>
              <TidVelger value={tidSlutt} onChange={setTidSlutt} style={input} />
            </div>
          </div>
          <div>
            <label style={etikett}>Sted</label>
            <input style={input} value={sted} onChange={(e) => setSted(e.target.value)} placeholder="f.eks. Naustet" />
          </div>
          <div>
            <label style={etikett}>Knytt til prosjekt (valgfritt)</label>
            <select style={input} value={prosjektId} onChange={(e) => setProsjektId(e.target.value)}>
              <option value="">Ikke knyttet til prosjekt</option>
              {prosjekter.filter((p) => p.status === "aktiv").map((p) => <option key={p.id} value={p.id}>{p.navn}</option>)}
            </select>
          </div>
          <div>
            <label style={etikett}>Beskrivelse (valgfritt)</label>
            <textarea style={{ ...input, minHeight: 60, resize: "vertical" }} value={beskrivelse} onChange={(e) => setBeskrivelse(e.target.value)} placeholder="Ta med arbeidsklær, vi stiller med kaffe …" />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button style={{ ...primKnapp, flex: 1 }} onClick={opprett}>{redigerId ? "Lagre endringer" : "Opprett dugnad"}</button>
            <button style={{ background: "none", border: `1px solid ${C.sand}`, borderRadius: 6, padding: "10px 16px", cursor: "pointer", color: C.dempet }} onClick={tomSkjema}>Avbryt</button>
          </div>
          {!redigerId && <p style={{ margin: 0, fontSize: 12, color: C.dempet }}>Du blir automatisk dugnadsansvarlig og påmeldt.</p>}
        </div>
      )}

      {nettopOpprettetVarsel && (
        <div style={{ ...kort, borderLeft: `4px solid ${C.sjogronn}`, display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 700 }}>✓ Dugnaden «{nettopOpprettetVarsel.tittel}» er opprettet — vil du varsle noen?</div>
          <select style={input} value={varselMottakere} onChange={(e) => setVarselMottakere(e.target.value)}>
            <option value="alle">Alle medlemmer</option>
            {nettopOpprettetVarsel.prosjektId && <option value="prosjekt">Bare medlemmer tilknyttet prosjektet</option>}
          </select>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={{ ...primKnapp, padding: "9px 16px", fontSize: 14 }} onClick={() => { sendEpostVarsel(nettopOpprettetVarsel, varselMottakere); setNettopOpprettetVarsel(null); }}>
              📧 Send varsel på e-post
            </button>
            <button style={{ ...sekKnapp, padding: "9px 16px", fontSize: 14 }} onClick={() => setNettopOpprettetVarsel(null)}>
              Hopp over
            </button>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: C.dempet }}>Åpner e-postappen din med mottakerne ferdig fylt inn (skjult for hverandre).</p>
        </div>
      )}

      {kommende.length === 0 && (
        <p style={{ color: C.dempet, textAlign: "center", padding: 18 }}>Ingen planlagte dugnader. Planlegg den neste!</p>
      )}
      {kommende.map((d) => <DugnadKort key={d.id} d={d} erTidligere={false} />)}

      {tidligere.length > 0 && (
        <>
          <button onClick={() => setViserTidligere(!viserTidligere)}
            style={{ background: "none", border: "none", color: C.hav, cursor: "pointer", fontSize: 14, textDecoration: "underline", padding: 6 }}>
            {viserTidligere ? "Skjul tidligere dugnader" : `Vis tidligere dugnader (${tidligere.length})`}
          </button>
          {viserTidligere && tidligere.map((d) => <DugnadKort key={d.id} d={d} erTidligere={true} />)}
        </>
      )}

      {utforte.length > 0 && (
        <>
          <button onClick={() => setVisUtforte(!visUtforte)}
            style={{ background: "none", border: "none", color: C.hav, cursor: "pointer", fontSize: 14, textDecoration: "underline", padding: 6 }}>
            {visUtforte ? "Skjul utførte dugnader" : `✓ Vis utførte dugnader (${utforte.length})`}
          </button>
          {visUtforte && utforte.map((d) => <DugnadKort key={d.id} d={d} erTidligere={d.dato < idag} />)}
        </>
      )}
    </section>
  );
}

// ============================================================
// Prosjektliste
// ============================================================
function ProsjektListe({ prosjekter, innslag, medlemmer, bruker, kanOpprette, onAapne, onNytt, stil }) {
  const { C, input, etikett, primKnapp, kort } = stil;
  const [viserSkjema, setViserSkjema] = useState(false);
  const [navn, setNavn] = useState("");
  const [beskrivelse, setBeskrivelse] = useState("");

  const timerFor = (pid) => innslag.filter((i) => i.prosjektId === pid).reduce((s, i) => s + i.timer, 0);
  function lederNavn(p) { return ledereAv(p).map((id) => medlemmer.find((m) => m.id === id)?.navn).filter(Boolean).join(", "); }
  const aktive = prosjekter.filter((p) => p.status === "aktiv");
  const fullforte = prosjekter.filter((p) => p.status !== "aktiv");

  function Rad({ p }) {
    return (
    <button onClick={() => onAapne(p.id)}
      style={{ ...kort, width: "100%", textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, borderLeft: `4px solid ${p.status === "aktiv" ? C.sjogronn : C.sand}` }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: C.tjaere }}>{p.navn}</div>
        <div style={{ fontSize: 13, color: C.dempet, marginTop: 2 }}>
          {lederNavn(p) ? `Ansvarlig: ${lederNavn(p)} · ` : ""}
          {p.under?.length ? `${p.under.length} underprosjekt · ` : ""}{tall(timerFor(p.id))} t ført
          {p.status !== "aktiv" ? " · Fullført" : ""}
        </div>
      </div>
      <span style={{ color: C.sjogronn, fontSize: 20 }}>›</span>
    </button>
  )
  }
  return (
    <section style={{ display: "grid", gap: 10 }}>
      {!kanOpprette && (
        <p style={{ margin: 0, fontSize: 13, color: C.dempet, background: "#fff", border: `1px solid ${C.sand}`, borderRadius: 8, padding: "9px 12px" }}>
          Nye prosjekter opprettes av admin eller medlemmer med prosjektrettigheter. Du kan bidra med underprosjekter, timer, notater og bilder inne på hvert prosjekt.
        </p>
      )}
      {kanOpprette && !viserSkjema && (
        <button style={{ ...primKnapp, width: "100%" }} onClick={() => setViserSkjema(true)}>+ Nytt dugnadsprosjekt</button>
      )}
      {kanOpprette && viserSkjema && (
        <div style={{ ...kort, display: "grid", gap: 12 }}>
          <div>
            <label style={etikett}>Prosjektnavn</label>
            <input style={input} value={navn} onChange={(e) => setNavn(e.target.value)} placeholder="f.eks. Restaurering av naustet" />
          </div>
          <div>
            <label style={etikett}>Beskrivelse (valgfritt)</label>
            <textarea style={{ ...input, minHeight: 70, resize: "vertical" }} value={beskrivelse} onChange={(e) => setBeskrivelse(e.target.value)} placeholder="Hva skal gjøres, og hvorfor?" />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button style={{ ...primKnapp, flex: 1 }} onClick={() => {
              if (navn.trim().length < 2) return;
              onNytt(navn.trim(), beskrivelse.trim());
              setNavn(""); setBeskrivelse(""); setViserSkjema(false);
            }}>Opprett</button>
            <button style={{ background: "none", border: `1px solid ${C.sand}`, borderRadius: 6, padding: "10px 16px", cursor: "pointer", color: C.dempet }} onClick={() => setViserSkjema(false)}>Avbryt</button>
          </div>
        </div>
      )}

      {aktive.length === 0 && fullforte.length === 0 && (
        <p style={{ color: C.dempet, textAlign: "center", padding: 24 }}>Ingen prosjekter ennå. Opprett det første — f.eks. vårpussen på båtene.</p>
      )}
      {aktive.map((p) => <Rad key={p.id} p={p} />)}
      {fullforte.length > 0 && (
        <>
          <div style={{ fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: C.dempet, marginTop: 8 }}>Fullførte</div>
          {fullforte.map((p) => <Rad key={p.id} p={p} />)}
        </>
      )}
    </section>
  );
}

// ============================================================
// Prosjektdetalj
// ============================================================
function ProsjektDetalj({ prosjekt, medlemmer, innslag, bruker, erAdmin, logo, foto, onTilbake, onOppdater, onNyttFoto, onSlettFoto, stil }) {
  const { C, input, etikett, primKnapp, sekKnapp, kort, bekreft } = stil;
  const [nyttUnder, setNyttUnder] = useState("");
  const [fotoTekst, setFotoTekst] = useState("");
  const [fotoUnder, setFotoUnder] = useState("");
  const [lasterOpp, setLasterOpp] = useState(false);
  const [stortBilde, setStortBilde] = useState(null);
  const [nyttNotat, setNyttNotat] = useState("");
  const [visRapport, setVisRapport] = useState(false);

  function navnFor(id) { return medlemmer.find((m) => m.id === id)?.navn || "Ukjent"; }
  const eier = navnFor(prosjekt.avId);
  const lederIder = ledereAv(prosjekt);
  const lederNavnListe = lederIder.map((id) => medlemmer.find((m) => m.id === id)?.navn).filter(Boolean);
  const erLeder = lederIder.includes(bruker.id);
  const kanRedigere = erAdmin || erLeder || prosjekt.avId === bruker.id;
  const prosjektInnslag = innslag.filter((i) => i.prosjektId === prosjekt.id);
  const timer = prosjektInnslag.reduce((s, i) => s + i.timer, 0);
  const timerUnder = (uid) => innslag.filter((i) => i.underId === uid).reduce((s, i) => s + i.timer, 0);
  const ferdigeUnder = (prosjekt.under || []).filter((u) => u.status === "fullført").length;
  const antallUnder = (prosjekt.under || []).length;
  const notater = prosjekt.notater || [];

  const hendelser = [
    ...prosjektInnslag.map((i) => ({
      type: "timer", dato: i.dato, id: i.id,
      tittel: `${navnFor(i.medlemId)} førte ${tall(i.timer)} t`,
      detalj: `${i.aktivitet}${i.notat ? ` — ${i.notat}` : ""}`,
    })),
    ...notater.map((n) => ({
      type: "notat", dato: n.dato, id: n.id,
      tittel: `Notat fra ${n.avNavn}`,
      detalj: n.tekst,
    })),
    ...(foto || []).map((b) => ({
      type: "foto", dato: b.dato, id: b.nokkel,
      tittel: `${b.avNavn} la til bilde`,
      detalj: b.tekst || "",
      bilde: b,
    })),
  ].sort((a, b) => b.dato.localeCompare(a.dato));

  async function velgBilde(e) {
    const filer = Array.from(e.target.files || []);
    e.target.value = "";
    if (!filer.length) return;
    setLasterOpp(true);
    for (const fil of filer) {
      try {
        const dataUrl = await lesOgKomprimer(fil);
        await onNyttFoto(dataUrl, fotoTekst.trim(), fotoUnder);
      } catch (err) { /* feilmelding settes i forelder */ }
    }
    setFotoTekst("");
    setLasterOpp(false);
  }

  function leggTilNotat() {
    const t = nyttNotat.trim();
    if (!t) return;
    const notat = { id: nyId(), tekst: t, dato: iDag(), avId: bruker.id, avNavn: bruker.navn };
    onOppdater({ ...prosjekt, notater: [notat, ...notater] });
    setNyttNotat("");
  }

  function eksporterRapport() {
    const ikoner = { timer: "⏱", notat: "📝", foto: "📷" };
    const html = `<!DOCTYPE html>
<html lang="nb">
<head>
<meta charset="utf-8">
<title>Prosjektrapport — ${esc(prosjekt.navn)}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #3E2F23; max-width: 800px; margin: 0 auto; padding: 32px 24px; }
  h1 { color: #1B3A4B; margin-bottom: 4px; }
  h2 { color: #1B3A4B; border-bottom: 2px solid #E8E2D6; padding-bottom: 6px; margin-top: 32px; }
  .meta { color: #6B7A80; font-size: 14px; }
  .stort { font-size: 38px; font-weight: bold; color: #1B3A4B; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid #E8E2D6; }
  th { background: #F7F5F0; text-transform: uppercase; font-size: 11px; letter-spacing: 0.08em; color: #6B7A80; }
  .galleri { display: flex; flex-wrap: wrap; gap: 12px; }
  .galleri figure { margin: 0; width: 220px; }
  .galleri img { width: 100%; border-radius: 8px; border: 1px solid #E8E2D6; }
  .galleri figcaption { font-size: 12px; color: #6B7A80; margin-top: 4px; }
  .logg li { margin-bottom: 8px; font-size: 14px; }
  .skriv { background: #C0392B; color: #fff; border: none; border-radius: 6px; padding: 12px 22px; font-size: 15px; cursor: pointer; }
  @media print { .skriv { display: none; } }
</style>
</head>
<body>
<div style="display:flex;justify-content:space-between;align-items:center;">
  <div>
    <div style="font-size:11px;letter-spacing:0.25em;text-transform:uppercase;color:#5C8A8A;">Askøy Kystlag — Dugnadsloggen</div>
    <h1>${esc(prosjekt.navn)}</h1>
    <div class="meta">
      Prosjektrapport per ${fDato(iDag())} ·
      Opprettet ${fDato(prosjekt.opprettet)} av ${esc(eier)} ·
      Ansvarlig: ${esc(lederNavnListe.join(", ") || "ikke valgt")} ·
      Status: ${esc(prosjekt.status)}
    </div>
  </div>
  ${logo ? `<img src="${logo}" alt="Logo" style="height:72px;width:72px;object-fit:contain;">` : ""}
</div>

<button class="skriv" style="margin-top:16px" onclick="window.print()">🖨 Skriv ut / lagre som PDF</button>

${prosjekt.beskrivelse ? `<p style="margin-top:20px;line-height:1.6">${esc(prosjekt.beskrivelse)}</p>` : ""}

<h2>Nøkkeltall</h2>
<p><span class="stort">${tall(timer)}</span> dugnadstimer ført på prosjektet${antallUnder ? ` · ${ferdigeUnder} av ${antallUnder} deler ferdig` : ""}.</p>

${antallUnder ? `<h2>Underprosjekter</h2>
<table><tr><th>Del</th><th>Status</th><th>Timer</th></tr>
${(prosjekt.under || []).map((u) => `<tr><td>${esc(u.navn)}</td><td>${u.status === "fullført" ? "✔ Ferdig" : "Pågår"}</td><td>${tall(timerUnder(u.id))} t</td></tr>`).join("")}
</table>` : ""}

${notater.length ? `<h2>Notater</h2>
<ul class="logg">
${notater.map((n) => `<li><strong>${fDato(n.dato)} — ${esc(n.avNavn)}:</strong> ${esc(n.tekst)}</li>`).join("")}
</ul>` : ""}

${prosjektInnslag.length ? `<h2>Timeliste</h2>
<table><tr><th>Dato</th><th>Navn</th><th>Aktivitet</th><th>Timer</th><th>Notat</th></tr>
${[...prosjektInnslag].sort((a, b) => a.dato.localeCompare(b.dato)).map((i) =>
  `<tr><td>${fDato(i.dato)}</td><td>${esc(navnFor(i.medlemId))}</td><td>${esc(i.aktivitet)}</td><td>${tall(i.timer)}</td><td>${esc(i.notat || "")}</td></tr>`).join("")}
</table>` : ""}

${(foto || []).length ? `<h2>Bilder</h2>
<div class="galleri">
${(foto || []).map((b) => `<figure><img src="${b.dataUrl}" alt="${esc(b.tekst || "Dugnadsbilde")}"><figcaption>${esc(b.tekst ? b.tekst + " · " : "")}${fDato(b.dato)} · ${esc(b.avNavn)}</figcaption></figure>`).join("")}
</div>` : ""}

<h2>Prosjektlogg</h2>
<ul class="logg">
${hendelser.map((h) => `<li>${ikoner[h.type]} <strong>${fDato(h.dato)}:</strong> ${esc(h.tittel)}${h.detalj ? ` — ${esc(h.detalj)}` : ""}</li>`).join("")}
</ul>

<p class="meta" style="margin-top:32px">Generert av Dugnadsloggen, Askøy Kystlag. Åpne filen i nettleseren og bruk knappen øverst (eller Ctrl/Cmd+P) for å lagre som PDF.</p>
</body>
</html>`;
    const trygtNavn = prosjekt.navn.toLowerCase().replace(/[^a-z0-9æøå]+/gi, "-").replace(/^-|-$/g, "") || "prosjekt";
    lastNedFil(html, `prosjektrapport-${trygtNavn}-${iDag()}.html`, "text/html;charset=utf-8");
  }

  return (
    <section style={{ display: "grid", gap: 14 }}>
      <button onClick={onTilbake} style={{ background: "none", border: "none", color: C.hav, cursor: "pointer", textAlign: "left", fontSize: 14, padding: 0 }}>‹ Alle prosjekter</button>

      <div style={kort}>
        <div>
          <h2 style={{ margin: 0, fontFamily: "Georgia, serif", fontSize: 22 }}>{prosjekt.navn}</h2>
          <div style={{ fontSize: 13, color: C.dempet, marginTop: 4 }}>
            Opprettet {fDato(prosjekt.opprettet)} av {eier} · {tall(timer)} t ført
            {prosjekt.status !== "aktiv" && <span style={{ color: "#2F5A3C", fontWeight: 700 }}> · ✓ Fullført</span>}
          </div>
        </div>

        {antallUnder > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.dempet, marginBottom: 4 }}>
              <span>Framdrift</span><span>{ferdigeUnder} av {antallUnder} deler ferdig</span>
            </div>
            <div style={{ background: C.sand, borderRadius: 5, height: 10 }}>
              <div style={{ width: `${(ferdigeUnder / antallUnder) * 100}%`, background: ferdigeUnder === antallUnder ? "#4E7E5B" : C.sjogronn, height: 10, borderRadius: 5, transition: "width 0.3s" }} />
            </div>
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, color: C.dempet, marginBottom: 6 }}>Prosjektansvarlige:</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {lederIder.length === 0 && <span style={{ fontSize: 14, color: C.dempet }}>Ingen valgt</span>}
            {lederIder.map((id) => (
              <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.kritt, border: `1px solid ${C.sand}`, borderRadius: 999, padding: "5px 11px", fontSize: 13.5, fontWeight: 600 }}>
                {medlemmer.find((m) => m.id === id)?.navn || "Ukjent"}{id === bruker.id ? " (deg)" : ""}
                {(erAdmin || prosjekt.avId === bruker.id) && (
                  <button onClick={() => onOppdater({ ...prosjekt, ledere: lederIder.filter((x) => x !== id), lederId: undefined })}
                    aria-label="Fjern ansvarlig" style={{ background: "none", border: "none", color: C.signal, cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
                )}
              </span>
            ))}
          </div>
          {(erAdmin || prosjekt.avId === bruker.id) && (
            <select style={{ ...input, marginTop: 8 }} value="" onChange={(e) => {
              if (!e.target.value) return;
              onOppdater({ ...prosjekt, ledere: [...lederIder, e.target.value], lederId: undefined });
            }}>
              <option value="">+ Legg til ansvarlig …</option>
              {[...medlemmer].filter((m) => !lederIder.includes(m.id)).sort((a, b) => a.navn.localeCompare(b.navn, "nb")).map((m) => (
                <option key={m.id} value={m.id}>{m.navn}</option>
              ))}
            </select>
          )}
        </div>

        {prosjekt.beskrivelse && <p style={{ margin: "12px 0 0", fontSize: 15, lineHeight: 1.5 }}>{prosjekt.beskrivelse}</p>}
      </div>

      {kanRedigere && (
        <div style={kort}>
          <h3 style={{ margin: "0 0 4px", fontFamily: "Georgia, serif", fontSize: 17 }}>Skriv notat</h3>
          <p style={{ margin: "0 0 10px", fontSize: 13, color: C.dempet }}>
            Noter hva som er gjort eller avtalt — uten å føre timer. Notatet havner i prosjektloggen og i rapporten.
          </p>
          <textarea style={{ ...input, minHeight: 60, resize: "vertical" }} value={nyttNotat}
            onChange={(e) => setNyttNotat(e.target.value)} placeholder="f.eks. Skrudd av alle beslag, bestilt ny mastefisk fra smeden." />
          <button style={{ ...primKnapp, width: "100%", marginTop: 10 }} onClick={leggTilNotat}>Lagre notat</button>
        </div>
      )}

      <div style={kort}>
        <h3 style={{ margin: "0 0 10px", fontFamily: "Georgia, serif", fontSize: 17 }}>Underprosjekter</h3>
        {(prosjekt.under || []).length === 0 && (
          <p style={{ color: C.dempet, fontSize: 14, margin: "0 0 10px" }}>Del gjerne opp prosjektet — f.eks. «Skrog», «Rigg», «Maling».</p>
        )}
        {(prosjekt.under || []).map((u) => (
          <div key={u.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${C.sand}` }}>
            <div>
              <span style={{ fontWeight: 600, textDecoration: u.status === "fullført" ? "line-through" : "none", color: u.status === "fullført" ? C.dempet : C.tjaere }}>{u.navn}</span>
              <span style={{ fontSize: 13, color: C.dempet, marginLeft: 8 }}>{tall(timerUnder(u.id))} t</span>
            </div>
            {kanRedigere && (
              <button
                onClick={() => onOppdater({ ...prosjekt, under: prosjekt.under.map((x) => x.id === u.id ? { ...x, status: x.status === "fullført" ? "aktiv" : "fullført" } : x) })}
                style={{ background: "none", border: `1px solid ${C.sand}`, borderRadius: 6, padding: "3px 10px", fontSize: 12, cursor: "pointer", color: C.hav }}>
                {u.status === "fullført" ? "Gjenåpne" : "Ferdig"}
              </button>
            )}
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input style={{ ...input, flex: 1 }} value={nyttUnder} onChange={(e) => setNyttUnder(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && nyttUnder.trim() && (onOppdater({ ...prosjekt, under: [...(prosjekt.under || []), { id: nyId(), navn: nyttUnder.trim(), status: "aktiv" }] }), setNyttUnder(""))}
            placeholder="Nytt underprosjekt" />
          <button style={{ ...primKnapp, padding: "10px 16px" }} onClick={() => {
            if (!nyttUnder.trim()) return;
            onOppdater({ ...prosjekt, under: [...(prosjekt.under || []), { id: nyId(), navn: nyttUnder.trim(), status: "aktiv" }] });
            setNyttUnder("");
          }}>Legg til</button>
        </div>
      </div>

      <div style={kort}>
        <h3 style={{ margin: "0 0 10px", fontFamily: "Georgia, serif", fontSize: 17 }}>Bilder underveis</h3>
        <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
          <input style={input} value={fotoTekst} onChange={(e) => setFotoTekst(e.target.value)} placeholder="Bildetekst (valgfritt)" />
          {(prosjekt.under || []).length > 0 && (
            <select style={input} value={fotoUnder} onChange={(e) => setFotoUnder(e.target.value)}>
              <option value="">Gjelder hele prosjektet</option>
              {prosjekt.under.map((u) => <option key={u.id} value={u.id}>{u.navn}</option>)}
            </select>
          )}
          <label style={{ ...primKnapp, textAlign: "center", opacity: lasterOpp ? 0.6 : 1 }}>
            {lasterOpp ? "Laster opp …" : "📷 Velg eller ta bilder (flere er mulig)"}
            <input type="file" accept="image/*" multiple onChange={velgBilde} disabled={lasterOpp} style={{ display: "none" }} />
          </label>
        </div>

        {foto === undefined && <p style={{ color: C.dempet, fontSize: 14 }}>Henter bilder …</p>}
        {foto && foto.length === 0 && <p style={{ color: C.dempet, fontSize: 14 }}>Ingen bilder ennå. Ta et «før»-bilde!</p>}
        {foto && foto.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
            {foto.map((b) => {
              const u = (prosjekt.under || []).find((x) => x.id === b.underId);
              return (
                <figure key={b.nokkel} style={{ margin: 0 }}>
                  <img src={b.dataUrl} alt={b.tekst || "Dugnadsbilde"} onClick={() => setStortBilde(b)}
                    style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", borderRadius: 8, border: `1px solid ${C.sand}`, cursor: "pointer" }} />
                  <figcaption style={{ fontSize: 12, color: C.dempet, marginTop: 4, lineHeight: 1.35 }}>
                    {b.tekst && <span style={{ color: C.tjaere, fontWeight: 600 }}>{b.tekst}<br /></span>}
                    {fDato(b.dato)} · {b.avNavn}{u ? ` · ${u.navn}` : ""}
                    {(erAdmin || b.avId === bruker.id) && (
                      <button onClick={async () => { if (!(await bekreft("Slette dette bildet?"))) return; onSlettFoto(b.nokkel); }} style={{ background: "none", border: "none", color: C.signal, cursor: "pointer", fontSize: 12, padding: "0 0 0 6px", textDecoration: "underline" }}>slett</button>
                    )}
                  </figcaption>
                </figure>
              );
            })}
          </div>
        )}
      </div>

      <div style={kort}>
        <h3 style={{ margin: "0 0 10px", fontFamily: "Georgia, serif", fontSize: 17 }}>Prosjektlogg</h3>
        {hendelser.length === 0 && <p style={{ color: C.dempet, fontSize: 14, margin: 0 }}>Ingenting i loggen ennå — timer, notater og bilder dukker opp her.</p>}
        {hendelser.map((h, idx) => (
          <div key={h.type + h.id} style={{ display: "flex", gap: 10, padding: "9px 0", borderBottom: idx < hendelser.length - 1 ? `1px solid ${C.sand}` : "none" }}>
            <span style={{ fontSize: 17 }}>{h.type === "timer" ? "⏱" : h.type === "notat" ? "📝" : "📷"}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14 }}>
                <span style={{ fontWeight: 600 }}>{h.tittel}</span>
                <span style={{ color: C.dempet, marginLeft: 6, fontSize: 12.5 }}>{fDato(h.dato)}</span>
              </div>
              {h.detalj && <div style={{ fontSize: 13, color: C.dempet, lineHeight: 1.4 }}>{h.detalj}</div>}
              {h.bilde && (
                <img src={h.bilde.dataUrl} alt={h.detalj || "Dugnadsbilde"} onClick={() => setStortBilde(h.bilde)}
                  style={{ marginTop: 6, height: 70, borderRadius: 6, border: `1px solid ${C.sand}`, cursor: "pointer" }} />
              )}
            </div>
            {h.type === "notat" && (erAdmin || erLeder || notater.find((n) => n.id === h.id)?.avId === bruker.id) && (
              <button onClick={async () => {
                if (!(await bekreft("Slette dette notatet?"))) return;
                onOppdater({ ...prosjekt, notater: notater.filter((n) => n.id !== h.id) });
              }} style={{ background: "none", border: "none", color: C.dempet, cursor: "pointer", fontSize: 16, padding: 2 }}>×</button>
            )}
          </div>
        ))}
      </div>

      {kanRedigere && (
        <div style={{ ...kort, display: "grid", gap: 8 }}>
          <h3 style={{ margin: "0 0 2px", fontFamily: "Georgia, serif", fontSize: 17 }}>Handlinger</h3>
          <button style={{ ...sekKnapp, width: "100%" }} onClick={() => setVisRapport(true)}>
            📄 Gjør om til PDF (vis prosjektrapport)
          </button>
          <button style={{ ...sekKnapp, width: "100%", borderColor: prosjekt.status === "aktiv" ? "#4E7E5B" : C.hav, color: prosjekt.status === "aktiv" ? "#2F5A3C" : C.hav }}
            onClick={() => onOppdater({ ...prosjekt, status: prosjekt.status === "aktiv" ? "fullført" : "aktiv" })}>
            {prosjekt.status === "aktiv" ? "✓ Merk prosjektet som fullført" : "Gjenåpne prosjektet"}
          </button>
        </div>
      )}

      {visRapport && (
        <div style={{ position: "fixed", inset: 0, background: "#fff", zIndex: 80, overflowY: "auto" }}>
          <style>{`@media print {
            body * { visibility: hidden !important; }
            #rapport-utskrift, #rapport-utskrift * { visibility: visible !important; }
            #rapport-utskrift { position: absolute !important; left: 0; top: 0; width: 100%; }
            .ikke-print { display: none !important; }
          }`}</style>
          <div className="ikke-print" style={{ position: "sticky", top: 0, background: C.hav, padding: "10px 14px", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", zIndex: 81 }}>
            <button style={{ ...primKnapp, padding: "9px 14px", fontSize: 14 }} onClick={() => { try { window.print(); } catch (e) { /* fallback under */ } }}>
              🖨 Skriv ut / lagre som PDF
            </button>
            <button style={{ ...sekKnapp, background: "#fff", padding: "9px 14px", fontSize: 14 }} onClick={eksporterRapport}>
              Last ned som fil
            </button>
            <button style={{ ...sekKnapp, background: "#fff", padding: "9px 14px", fontSize: 14, marginLeft: "auto" }} onClick={() => setVisRapport(false)}>
              ✕ Lukk
            </button>
          </div>
          <div id="rapport-utskrift" style={{ maxWidth: 800, margin: "0 auto", padding: "24px 20px 60px", fontFamily: "Georgia, 'Times New Roman', serif", color: C.tjaere }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, letterSpacing: "0.25em", textTransform: "uppercase", color: C.sjogronn }}>Askøy Kystlag — Dugnadsloggen</div>
                <h1 style={{ margin: "2px 0 4px", color: C.hav, fontSize: 28 }}>{prosjekt.navn}</h1>
                <div style={{ fontSize: 13, color: C.dempet }}>
                  Prosjektrapport per {fDato(iDag())} · Opprettet {fDato(prosjekt.opprettet)} av {eier} · Ansvarlig: {lederNavnListe.join(", ") || "ikke valgt"} · Status: {prosjekt.status}
                </div>
              </div>
              {logo && <img src={logo} alt="Logo" style={{ height: 64, width: 64, objectFit: "contain" }} />}
            </div>

            {prosjekt.beskrivelse && <p style={{ marginTop: 18, lineHeight: 1.6, fontSize: 15 }}>{prosjekt.beskrivelse}</p>}

            <h2 style={{ color: C.hav, borderBottom: `2px solid ${C.sand}`, paddingBottom: 5, marginTop: 26, fontSize: 19 }}>Nøkkeltall</h2>
            <p style={{ fontSize: 15 }}>
              <span style={{ fontSize: 36, fontWeight: 700, color: C.hav }}>{tall(timer)}</span> dugnadstimer ført på prosjektet
              {antallUnder ? ` · ${ferdigeUnder} av ${antallUnder} deler ferdig` : ""}.
            </p>

            {antallUnder > 0 && (
              <>
                <h2 style={{ color: C.hav, borderBottom: `2px solid ${C.sand}`, paddingBottom: 5, marginTop: 26, fontSize: 19 }}>Underprosjekter</h2>
                {(prosjekt.under || []).map((u) => (
                  <div key={u.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.sand}`, fontSize: 14 }}>
                    <span>{u.navn}</span>
                    <span>{u.status === "fullført" ? "✔ Ferdig" : "Pågår"} · {tall(timerUnder(u.id))} t</span>
                  </div>
                ))}
              </>
            )}

            {notater.length > 0 && (
              <>
                <h2 style={{ color: C.hav, borderBottom: `2px solid ${C.sand}`, paddingBottom: 5, marginTop: 26, fontSize: 19 }}>Notater</h2>
                {notater.map((n) => (
                  <p key={n.id} style={{ fontSize: 14, margin: "6px 0" }}>
                    <strong>{fDato(n.dato)} — {n.avNavn}:</strong> {n.tekst}
                  </p>
                ))}
              </>
            )}

            {prosjektInnslag.length > 0 && (
              <>
                <h2 style={{ color: C.hav, borderBottom: `2px solid ${C.sand}`, paddingBottom: 5, marginTop: 26, fontSize: 19 }}>Timeliste</h2>
                {[...prosjektInnslag].sort((a, b) => a.dato.localeCompare(b.dato)).map((i) => (
                  <div key={i.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "5px 0", borderBottom: `1px solid ${C.sand}`, fontSize: 13.5 }}>
                    <span>{fDato(i.dato)} · {navnFor(i.medlemId)} · {i.aktivitet}{i.notat ? ` · ${i.notat}` : ""}</span>
                    <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{tall(i.timer)} t</span>
                  </div>
                ))}
              </>
            )}

            {(foto || []).length > 0 && (
              <>
                <h2 style={{ color: C.hav, borderBottom: `2px solid ${C.sand}`, paddingBottom: 5, marginTop: 26, fontSize: 19 }}>Bilder</h2>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                  {(foto || []).map((b) => (
                    <figure key={b.nokkel} style={{ margin: 0, width: 220 }}>
                      <img src={b.dataUrl} alt={b.tekst || "Dugnadsbilde"} style={{ width: "100%", borderRadius: 8, border: `1px solid ${C.sand}` }} />
                      <figcaption style={{ fontSize: 12, color: C.dempet, marginTop: 3 }}>
                        {b.tekst ? `${b.tekst} · ` : ""}{fDato(b.dato)} · {b.avNavn}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </>
            )}

            <h2 style={{ color: C.hav, borderBottom: `2px solid ${C.sand}`, paddingBottom: 5, marginTop: 26, fontSize: 19 }}>Prosjektlogg</h2>
            {hendelser.map((h, idx) => (
              <p key={h.type + h.id + idx} style={{ fontSize: 13.5, margin: "5px 0" }}>
                {h.type === "timer" ? "⏱" : h.type === "notat" ? "📝" : "📷"} <strong>{fDato(h.dato)}:</strong> {h.tittel}{h.detalj ? ` — ${h.detalj}` : ""}
              </p>
            ))}

            <p style={{ fontSize: 12, color: C.dempet, marginTop: 30 }}>
              Generert av Dugnadsloggen, Askøy Kystlag. Tips: «Skriv ut»-knappen øverst har «Lagre som PDF» som mål på både mobil og PC.
            </p>
          </div>
        </div>
      )}

      {stortBilde && (
        <div onClick={() => setStortBilde(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(18,40,51,0.92)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50, cursor: "pointer" }}>
          <div style={{ maxWidth: 700, width: "100%" }}>
            <img src={stortBilde.dataUrl} alt={stortBilde.tekst || ""} style={{ width: "100%", borderRadius: 10 }} />
            <p style={{ color: C.kritt, fontSize: 14, textAlign: "center" }}>
              {stortBilde.tekst ? `${stortBilde.tekst} · ` : ""}{fDato(stortBilde.dato)} · {stortBilde.avNavn}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

// ============================================================
// Føring av timer
// ============================================================
function TimeSkjema({ bruker, medlemmer, prosjekter, aktiviteter, onNyAktivitet, onLagre, stil }) {
  const { C, input, etikett, primKnapp, sekKnapp, kort } = stil;
  const [dato, setDato] = useState(() => iDag());
  const [timer, setTimer] = useState("");
  const [aktivitet, setAktivitet] = useState(aktiviteter[0] || "");
  const [nyAkt, setNyAkt] = useState("");
  const [viserNyAkt, setViserNyAkt] = useState(false);
  const [prosjektId, setProsjektId] = useState("");
  const [underId, setUnderId] = useState("");
  const [notat, setNotat] = useState("");
  const [bilder, setBilder] = useState([]);
  const [lasterBilde, setLasterBilde] = useState(false);
  const [mottakere, setMottakere] = useState([bruker.id]);
  const [leggTilId, setLeggTilId] = useState("");
  const [feil, setFeil] = useState("");

  function navnFor(id) { return medlemmer.find((m) => m.id === id)?.navn || "Ukjent"; }

  const valgt = prosjekter.find((p) => p.id === prosjektId);

  async function velgBilder(e) {
    const filer = Array.from(e.target.files || []);
    e.target.value = "";
    if (!filer.length) return;
    setLasterBilde(true);
    const nye = [];
    for (const fil of filer) {
      try { nye.push(await lesOgKomprimer(fil)); }
      catch (err) { /* hopper over ugyldig fil */ }
    }
    setBilder((b) => [...b, ...nye]);
    setLasterBilde(false);
  }

  return (
    <section style={{ ...kort, display: "grid", gap: 14 }}>
      {feil && <div style={{ background: "#FBEAE8", border: `1px solid ${C.signal}`, color: C.signal, padding: "9px 12px", borderRadius: 6, fontSize: 14 }}>{feil}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={etikett}>Dato</label>
          <input type="date" value={dato} onChange={(e) => setDato(e.target.value)} style={input} />
        </div>
        <div>
          <label style={etikett}>Timer</label>
          <input type="text" inputMode="decimal" placeholder="f.eks. 2,5" value={timer} onChange={(e) => setTimer(e.target.value)} style={input} />
        </div>
      </div>
      <div>
        <label style={etikett}>Aktivitet</label>
        <select value={viserNyAkt ? "__ny__" : aktivitet} onChange={(e) => {
          if (e.target.value === "__ny__") { setViserNyAkt(true); }
          else { setViserNyAkt(false); setAktivitet(e.target.value); }
        }} style={input}>
          {aktiviteter.map((a) => <option key={a} value={a}>{a}</option>)}
          <option value="__ny__">➕ Legg til ny aktivitet …</option>
        </select>
        {viserNyAkt && (
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input style={{ ...input, flex: 1 }} value={nyAkt} onChange={(e) => setNyAkt(e.target.value)}
              placeholder="Navn på ny aktivitet, f.eks. Seilsying" />
            <button style={{ ...sekKnapp, padding: "8px 12px" }} onClick={async () => {
              const lagret = await onNyAktivitet(nyAkt);
              if (lagret) { setAktivitet(lagret); setViserNyAkt(false); setNyAkt(""); }
            }}>Lagre</button>
          </div>
        )}
      </div>
      <div>
        <label style={etikett}>Prosjekt (valgfritt)</label>
        <select value={prosjektId} onChange={(e) => { setProsjektId(e.target.value); setUnderId(""); }} style={input}>
          <option value="">Ikke knyttet til prosjekt</option>
          {prosjekter.filter((p) => p.status === "aktiv").map((p) => <option key={p.id} value={p.id}>{p.navn}</option>)}
        </select>
      </div>
      {valgt && (valgt.under || []).length > 0 && (
        <div>
          <label style={etikett}>Underprosjekt (valgfritt)</label>
          <select value={underId} onChange={(e) => setUnderId(e.target.value)} style={input}>
            <option value="">Hele prosjektet</option>
            {valgt.under.map((u) => <option key={u.id} value={u.id}>{u.navn}</option>)}
          </select>
        </div>
      )}
      <div>
        <label style={etikett}>Notat (valgfritt)</label>
        <input type="text" value={notat} onChange={(e) => setNotat(e.target.value)} style={input} placeholder="Kort om hva som ble gjort" />
      </div>
      <div>
        <label style={etikett}>Bilder (valgfritt)</label>
        <label style={{ ...sekKnapp, display: "block", textAlign: "center", boxSizing: "border-box", opacity: lasterBilde ? 0.6 : 1, cursor: "pointer" }}>
          {lasterBilde ? "Behandler bilder …" : "📷 Velg eller ta bilder (flere er mulig)"}
          <input type="file" accept="image/*" multiple onChange={velgBilder} disabled={lasterBilde} style={{ display: "none" }} />
        </label>
        {bilder.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            {bilder.map((b, idx) => (
              <div key={idx} style={{ position: "relative" }}>
                <img src={b} alt={`Bilde ${idx + 1}`} style={{ width: 72, height: 54, objectFit: "cover", borderRadius: 6, border: `1px solid ${C.sand}` }} />
                <button onClick={() => setBilder(bilder.filter((_, i) => i !== idx))} aria-label="Fjern bilde"
                  style={{ position: "absolute", top: -7, right: -7, background: C.signal, color: "#fff", border: "none", borderRadius: "50%", width: 20, height: 20, fontSize: 12, lineHeight: 1, cursor: "pointer" }}>×</button>
              </div>
            ))}
          </div>
        )}
        {bilder.length > 0 && !prosjektId && (
          <p style={{ margin: "6px 0 0", fontSize: 12, color: C.dempet }}>Tips: velger du et prosjekt over, havner bildene også i prosjektets bildegalleri.</p>
        )}
      </div>
      <button style={{ ...primKnapp, width: "100%" }} onClick={() => {
        const t = parseFloat(String(timer).replace(",", "."));
        if (!dato) { setFeil("Velg dato."); return; }
        if (!t || t <= 0) { setFeil("Skriv inn antall timer (f.eks. 2,5)."); return; }
        if (viserNyAkt) { setFeil("Lagre den nye aktiviteten først, eller velg en fra listen."); return; }
        if (mottakere.length === 0) { setFeil("Velg minst én person timene skal føres på."); return; }
        setFeil("");
        const fellesEierId = mottakere.includes(bruker.id) ? bruker.id : mottakere[0];
        const nyeInnslag = mottakere.map((mid) => ({
          id: nyId(), medlemId: mid, dato, aktivitet, timer: t, notat: notat.trim(),
          prosjektId: prosjektId || null, underId: underId || null,
          antallBilder: mid === fellesEierId ? bilder.length : 0,
        }));
        onLagre(nyeInnslag, bilder);
        setTimer(""); setNotat(""); setBilder([]); setMottakere([bruker.id]);
      }}>Før i loggen{mottakere.length > 1 ? ` (${mottakere.length} personer)` : ""}</button>
      <div>
        <label style={etikett}>Timene føres på</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: mottakere.length ? 8 : 0 }}>
          {mottakere.map((id) => (
            <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.kritt, border: `1px solid ${C.sand}`, borderRadius: 999, padding: "5px 11px", fontSize: 13.5, fontWeight: 600 }}>
              {navnFor(id)}{id === bruker.id ? " (deg)" : ""}
              <button onClick={() => setMottakere(mottakere.filter((x) => x !== id))} aria-label={`Fjern ${navnFor(id)}`}
                style={{ background: "none", border: "none", color: C.signal, cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select style={{ ...input, flex: 1 }} value={leggTilId} onChange={(e) => setLeggTilId(e.target.value)}>
            <option value="">Hjelp andre — legg til flere …</option>
            {[...medlemmer]
              .filter((m) => !mottakere.includes(m.id))
              .sort((a, b) => a.navn.localeCompare(b.navn, "nb"))
              .map((m) => <option key={m.id} value={m.id}>{m.navn}</option>)}
          </select>
          <button style={{ ...sekKnapp, padding: "8px 14px" }} onClick={() => {
            if (!leggTilId) return;
            setMottakere([...mottakere, leggTilId]);
            setLeggTilId("");
          }}>Legg til</button>
        </div>
        <p style={{ margin: "6px 0 0", fontSize: 12, color: C.dempet }}>
          Alle valgte får hver sin registrering med samme dato, timer og aktivitet — kjekt når du fører for hele dugnadsgjengen.
        </p>
      </div>
    </section>
  );
}

// ============================================================
// Bilder knyttet til en timeregistrering (lastes ved behov)
// ============================================================
function InnslagBilder({ innslag, C }) {
  const [bilder, setBilder] = useState(null);
  const [aapen, setAapen] = useState(false);
  const [stort, setStort] = useState(null);

  async function lastBilder() {
    const nyAapen = !aapen;
    setAapen(nyAapen);
    if (!nyAapen || bilder !== null) return;
    const prefix = innslag.prosjektId ? fotoPrefiks(innslag.prosjektId) : "akl-foto:logg:";
    try {
      const liste = await window.storage.list(prefix, true);
      const res = [];
      for (const k of liste?.keys || []) {
        try {
          const r = await window.storage.get(typeof k === "string" ? k : k.key, true);
          if (r?.value) {
            const f = JSON.parse(r.value);
            if (f.innslagId === innslag.id) res.push(f);
          }
        } catch (e) { /* hopper over */ }
      }
      setBilder(res);
    } catch (e) {
      setBilder([]);
    }
  }

  return (
    <div style={{ marginTop: 6 }}>
      <button onClick={lastBilder}
        style={{ background: "none", border: "none", color: C.hav, cursor: "pointer", fontSize: 13, padding: 0, textDecoration: "underline" }}>
        📷 {aapen ? "Skjul bilder" : `Vis bilder (${innslag.antallBilder})`}
      </button>
      {aapen && bilder === null && <div style={{ fontSize: 12.5, color: C.dempet, marginTop: 4 }}>Henter bilder …</div>}
      {aapen && bilder && bilder.length === 0 && <div style={{ fontSize: 12.5, color: C.dempet, marginTop: 4 }}>Fant ikke bildene (de kan være slettet).</div>}
      {aapen && bilder && bilder.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
          {bilder.map((b, idx) => (
            <img key={idx} src={b.dataUrl} alt={b.tekst || `Bilde ${idx + 1}`}
              onClick={() => setStort(stort === idx ? null : idx)}
              style={{ width: 72, height: 54, objectFit: "cover", borderRadius: 6, border: `1px solid ${C.sand}`, cursor: "pointer" }} />
          ))}
        </div>
      )}
      {aapen && bilder && stort !== null && bilder[stort] && (
        <img src={bilder[stort].dataUrl} alt={bilder[stort].tekst || "Bilde"}
          onClick={() => setStort(null)}
          style={{ width: "100%", borderRadius: 8, marginTop: 8, cursor: "pointer" }} />
      )}
    </div>
  );
}

// ============================================================
// Logg
// ============================================================
function Logg({ innslag, medlemmer, prosjekter, bruker, erAdmin, onSlett, stil }) {
  const { C, input, sekKnapp } = stil;
  const [fMedlem, setFMedlem] = useState("alle");
  const [fAar, setFAar] = useState("alle");

  const aar = [...new Set(innslag.map((i) => i.dato.slice(0, 4)))].sort().reverse();
  const filtrert = innslag.filter((i) =>
    (fMedlem === "alle" || i.medlemId === fMedlem) && (fAar === "alle" || i.dato.slice(0, 4) === fAar)
  );

  function eksporterCSV() {
    const rader = [["Dato", "Navn", "Aktivitet", "Prosjekt", "Underprosjekt", "Timer", "Notat"]];
    [...filtrert].sort((a, b) => a.dato.localeCompare(b.dato)).forEach((i) => {
      const p = prosjekter.find((x) => x.id === i.prosjektId);
      const u = p?.under?.find((x) => x.id === i.underId);
      rader.push([
        fDato(i.dato),
        medlemmer.find((m) => m.id === i.medlemId)?.navn || "Ukjent",
        i.aktivitet, p?.navn || "", u?.navn || "",
        String(i.timer).replace(".", ","),
        (i.notat || "").replace(/;/g, ","),
      ]);
    });
    lastNedCSV(rader, "dugnadstimer-askoy-kystlag.csv");
  }

  return (
    <section>
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <select value={fMedlem} onChange={(e) => setFMedlem(e.target.value)} style={{ ...input, width: "auto", flex: 1, minWidth: 140 }}>
          <option value="alle">Alle medlemmer</option>
          {[...medlemmer].sort((a, b) => a.navn.localeCompare(b.navn, "nb")).map((m) => <option key={m.id} value={m.id}>{m.navn}</option>)}
        </select>
        <select value={fAar} onChange={(e) => setFAar(e.target.value)} style={{ ...input, width: "auto", minWidth: 105 }}>
          <option value="alle">Alle år</option>
          {aar.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {filtrert.length === 0 ? (
        <p style={{ color: C.dempet, textAlign: "center", padding: 28 }}>Ingen registreringer her ennå.</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {[...filtrert].sort((a, b) => b.dato.localeCompare(a.dato)).map((i) => {
            const navn = medlemmer.find((m) => m.id === i.medlemId)?.navn || "Ukjent";
            const p = prosjekter.find((x) => x.id === i.prosjektId);
            const u = p?.under?.find((x) => x.id === i.underId);
            return (
              <div key={i.id} style={{ background: "#fff", border: `1px solid ${C.sand}`, borderLeft: `4px solid ${C.sjogronn}`, borderRadius: 8, padding: "11px 14px", display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{navn} — {String(i.timer).replace(".", ",")} t</div>
                  <div style={{ fontSize: 13, color: C.dempet }}>
                    {fDato(i.dato)} · {i.aktivitet}
                    {p ? ` · ${p.navn}${u ? ` / ${u.navn}` : ""}` : ""}
                    {i.notat ? ` · ${i.notat}` : ""}
                  </div>
                  {i.antallBilder > 0 && <InnslagBilder innslag={i} C={C} />}
                </div>
                {(erAdmin || i.medlemId === bruker.id) && (
                  <button onClick={() => onSlett(i.id)} aria-label="Slett registrering"
                    style={{ background: "none", border: "none", color: C.dempet, cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 4 }}>×</button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {filtrert.length > 0 && (
        <button onClick={eksporterCSV} style={{ ...sekKnapp, width: "100%", marginTop: 16 }}>Last ned som regneark (CSV)</button>
      )}
    </section>
  );
}

// ============================================================
// Rapport
// ============================================================

function Rapport({ innslag, medlemmer, prosjekter, dugnader, altTilgang, stil }) {
  const FORHAANDSVALG = [
    { id: "topp", navn: "Topp medlemmer", gruppe: "medlem", topp: "10", visning: "stolper" },
    { id: "mnd", navn: "Timer per måned", gruppe: "maaned", topp: "alle", visning: "stolper" },
    { id: "prosjekt", navn: "Timer per prosjekt", gruppe: "prosjekt", topp: "alle", visning: "stolper" },
    { id: "aktivitet", navn: "Timer per aktivitet", gruppe: "aktivitet", topp: "alle", visning: "tabell" },
    { id: "oppmoete", navn: "Dugnadsoppmøte", gruppe: "oppmoete", topp: "alle", visning: "stolper" },
  ];
  const { C, input, etikett, sekKnapp, kort } = stil;
  const [valgtPreset, setValgtPreset] = useState("topp");
  const [gruppe, setGruppe] = useState("medlem");
  const [fAar, setFAar] = useState("alle");
  const [fProsjekt, setFProsjekt] = useState("alle");
  const [fMedlem, setFMedlem] = useState("alle");
  const [topp, setTopp] = useState("10");
  const [visning, setVisning] = useState("stolper");

  const tillatteIder = prosjekter.map((p) => p.id);
  const grunnlag = altTilgang ? innslag : innslag.filter((i) => tillatteIder.includes(i.prosjektId));
  const dugnadGrunnlag = altTilgang ? dugnader : dugnader.filter((d) => tillatteIder.includes(d.prosjektId));

  const aar = [...new Set([...grunnlag.map((i) => i.dato.slice(0, 4)), ...dugnadGrunnlag.map((d) => d.dato.slice(0, 4))])].sort().reverse();
  function navnFor(id) { return medlemmer.find((m) => m.id === id)?.navn || "Ukjent"; }

  function velgPreset(p) {
    setValgtPreset(p.id);
    setGruppe(p.gruppe);
    setTopp(p.topp);
    setVisning(p.visning);
  }

  let rader = [];
  let enhet = "t";

  if (gruppe === "oppmoete") {
    enhet = "dugnader";
    const filtrerteDugnader = dugnadGrunnlag.filter((d) =>
      (fAar === "alle" || d.dato.slice(0, 4) === fAar) &&
      (fProsjekt === "alle" || d.prosjektId === fProsjekt)
    );
    const telling = {};
    filtrerteDugnader.forEach((d) => (d.oppmoette || []).forEach((mid) => { telling[mid] = (telling[mid] || 0) + 1; }));
    rader = Object.entries(telling)
      .filter(([mid]) => fMedlem === "alle" || mid === fMedlem)
      .map(([mid, antall]) => ({ navn: navnFor(mid), verdi: antall }));
  } else {
    const filtrert = grunnlag.filter((i) =>
      (fAar === "alle" || i.dato.slice(0, 4) === fAar) &&
      (fProsjekt === "alle" || i.prosjektId === fProsjekt) &&
      (fMedlem === "alle" || i.medlemId === fMedlem)
    );
    const grupper = {};
    const nokkelFor = (i) => {
      if (gruppe === "medlem") return navnFor(i.medlemId);
      if (gruppe === "prosjekt") return prosjekter.find((p) => p.id === i.prosjektId)?.navn || "Uten prosjekt";
      if (gruppe === "aktivitet") return i.aktivitet;
      if (gruppe === "maaned") return i.dato.slice(0, 7);
      if (gruppe === "aar") return i.dato.slice(0, 4);
      return "Alle";
    };
    filtrert.forEach((i) => {
      const k = nokkelFor(i);
      grupper[k] = (grupper[k] || 0) + i.timer;
    });
    rader = Object.entries(grupper).map(([k, v]) => ({
      navn: gruppe === "maaned" ? fMndAar(k) : k,
      sorteringsnokkel: k,
      verdi: v,
    }));
  }

  if (gruppe === "maaned" || gruppe === "aar") {
    rader.sort((a, b) => (a.sorteringsnokkel || a.navn).localeCompare(b.sorteringsnokkel || b.navn));
  } else {
    rader.sort((a, b) => b.verdi - a.verdi);
  }
  if (topp !== "alle") rader = rader.slice(0, parseInt(topp, 10));

  const totalt = rader.reduce((s, r) => s + r.verdi, 0);
  const maks = Math.max(1, ...rader.map((r) => r.verdi));
  const GRUPPENAVN = { medlem: "Medlem", prosjekt: "Prosjekt", aktivitet: "Aktivitet", maaned: "Måned", aar: "År", oppmoete: "Medlem" };

  return (
    <section style={{ display: "grid", gap: 14 }}>
      {!altTilgang && (
        <p style={{ margin: 0, fontSize: 13, color: C.dempet, background: "#fff", border: `1px solid ${C.sand}`, borderRadius: 8, padding: "9px 12px" }}>
          Du ser rapporter for prosjektene du er ansvarlig for: {prosjekter.map((p) => p.navn).join(", ") || "ingen"}.
        </p>
      )}

      <div>
        <label style={etikett}>Ferdige rapporter</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {FORHAANDSVALG.map((p) => (
            <button key={p.id} onClick={() => velgPreset(p)}
              style={{
                border: `1px solid ${valgtPreset === p.id ? C.signal : C.sand}`,
                background: valgtPreset === p.id ? C.signal : "#fff",
                color: valgtPreset === p.id ? "#fff" : C.tjaere,
                borderRadius: 999, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}>
              {p.navn}
            </button>
          ))}
        </div>
      </div>

      <div style={{ ...kort, display: "grid", gap: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "Georgia, serif" }}>Still opp rapporten selv</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={etikett}>Vis per</label>
            <select style={input} value={gruppe} onChange={(e) => { setGruppe(e.target.value); setValgtPreset(""); }}>
              <option value="medlem">Medlem</option>
              <option value="prosjekt">Prosjekt</option>
              <option value="aktivitet">Aktivitet</option>
              <option value="maaned">Måned</option>
              <option value="aar">År</option>
              <option value="oppmoete">Dugnadsoppmøte</option>
            </select>
          </div>
          <div>
            <label style={etikett}>Antall</label>
            <select style={input} value={topp} onChange={(e) => { setTopp(e.target.value); setValgtPreset(""); }}>
              <option value="alle">Alle</option>
              <option value="5">Topp 5</option>
              <option value="10">Topp 10</option>
            </select>
          </div>
          <div>
            <label style={etikett}>År</label>
            <select style={input} value={fAar} onChange={(e) => { setFAar(e.target.value); setValgtPreset(""); }}>
              <option value="alle">Alle år</option>
              {aar.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label style={etikett}>Prosjekt</label>
            <select style={input} value={fProsjekt} onChange={(e) => { setFProsjekt(e.target.value); setValgtPreset(""); }}>
              <option value="alle">{altTilgang ? "Alle prosjekter" : "Alle mine prosjekter"}</option>
              {prosjekter.map((p) => <option key={p.id} value={p.id}>{p.navn}</option>)}
            </select>
          </div>
          <div>
            <label style={etikett}>Medlem</label>
            <select style={input} value={fMedlem} onChange={(e) => { setFMedlem(e.target.value); setValgtPreset(""); }}>
              <option value="alle">Alle medlemmer</option>
              {[...medlemmer].sort((a, b) => a.navn.localeCompare(b.navn, "nb")).map((m) => <option key={m.id} value={m.id}>{m.navn}</option>)}
            </select>
          </div>
          <div>
            <label style={etikett}>Visning</label>
            <select style={input} value={visning} onChange={(e) => setVisning(e.target.value)}>
              <option value="stolper">Stolper</option>
              <option value="tabell">Tabell</option>
            </select>
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: C.dempet }}>
          Tips: velg «Måned» og et prosjekt i filteret for å se når innsatsen på prosjektet ble lagt ned.
        </p>
      </div>

      <div style={kort}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontFamily: "Georgia, serif", fontSize: 18 }}>
            {gruppe === "oppmoete" ? "Bekreftet dugnadsoppmøte" : `Timer per ${GRUPPENAVN[gruppe].toLowerCase()}`}
          </h2>
          <span style={{ fontSize: 13, color: C.dempet }}>{tall(totalt)} {enhet === "t" ? "t totalt" : "totalt"}</span>
        </div>

        {rader.length === 0 && <p style={{ color: C.dempet, fontSize: 14 }}>Ingen data for dette utvalget ennå.</p>}

        {visning === "stolper" && rader.length > 0 && (
          <div style={{ display: "grid", gap: 10 }}>
            {rader.map((r, idx) => (
              <div key={r.navn + idx}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 3 }}>
                  <span style={{ fontWeight: 600 }}>
                    {gruppe === "medlem" || gruppe === "oppmoete" ? `${idx + 1}. ` : ""}{r.navn}
                  </span>
                  <span>{tall(r.verdi)} {enhet === "t" ? "t" : ""}</span>
                </div>
                <div style={{ background: C.sand, borderRadius: 4, height: 8 }}>
                  <div style={{ width: `${(r.verdi / maks) * 100}%`, background: idx === 0 && (gruppe === "medlem" || gruppe === "oppmoete") ? C.signal : C.sjogronn, height: 8, borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {visning === "tabell" && rader.length > 0 && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `2px solid ${C.tjaere}`, fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", color: C.dempet, fontWeight: 700 }}>
              <span>{GRUPPENAVN[gruppe]}</span><span>{enhet === "t" ? "Timer" : "Dugnader"}</span>
            </div>
            {rader.map((r, idx) => (
              <div key={r.navn + idx} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.sand}`, fontSize: 14 }}>
                <span>{r.navn}</span><span style={{ fontWeight: 700 }}>{tall(r.verdi)}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: 14, fontWeight: 700 }}>
              <span>Sum</span><span>{tall(totalt)}</span>
            </div>
          </div>
        )}

        {rader.length > 0 && (
          <button style={{ ...sekKnapp, width: "100%", marginTop: 14 }} onClick={() => {
            const csv = [[GRUPPENAVN[gruppe], enhet === "t" ? "Timer" : "Dugnader"]];
            rader.forEach((r) => csv.push([r.navn, String(r.verdi).replace(".", ",")]));
            csv.push(["Sum", String(totalt).replace(".", ",")]);
            lastNedCSV(csv, "rapport-askoy-kystlag.csv");
          }}>Last ned rapporten (CSV)</button>
        )}
      </div>
    </section>
  );
}

// ============================================================
// Adminpanel
// ============================================================
function Admin({ medlemmer, prosjekter, innslag, dugnader, aktiviteter, utleie, bruker, logo, grupper, onLagreGrupper, onLeggTilMedlem, sisteBackup, onBackupTatt, onLagreMeta, onLagreUtleie, onNyAktivitet, onEndreAktivitet, onSlettAktivitet, onLagreLogo, onGjenopprett, onSlettDugnad, onSlettProsjekt, onOppdaterProsjekt, stil }) {
  const { C, sekKnapp, kort, primKnapp, input, etikett, bekreft, sporsmaal, varsle } = stil;
  const [jobber, setJobber] = useState(false);
  const [nyAkt, setNyAkt] = useState("");
  const [nyttObjektNavn, setNyttObjektNavn] = useState("");
  const [nyttObjektType, setNyttObjektType] = useState("lokale");
  const [lagring, setLagring] = useState(null);
  const [regnerLagring, setRegnerLagring] = useState(false);
  // Nytt medlem
  const [nyttMedlemNavn, setNyttMedlemNavn] = useState("");
  const [nyttMedlemEpost, setNyttMedlemEpost] = useState("");
  const [nyttMedlemTelefon, setNyttMedlemTelefon] = useState("");
  const [nyttMedlemFeil, setNyttMedlemFeil] = useState("");
  const [viserNyttMedlem, setViserNyttMedlem] = useState(false);
  const [autoBackuper, setAutoBackuper] = useState(null);
  const [henterAutoBackuper, setHenterAutoBackuper] = useState(false);
  const timerFor = (mid) => innslag.filter((i) => i.medlemId === mid).reduce((s, i) => s + i.timer, 0);
  const backupIDag = sisteBackup === iDag();

  function visStorrelse(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function beregnLagring() {
    setRegnerLagring(true);
    try {
      let antallBilder = 0;
      let bildeBytes = 0;
      try {
        const liste = await window.storage.list(FOTO_ALLE, true);
        for (const k of liste?.keys || []) {
          const nokkel = typeof k === "string" ? k : k.key;
          try {
            const rr = await window.storage.get(nokkel, true);
            if (rr?.value) { antallBilder += 1; bildeBytes += rr.value.length; }
          } catch (e) { /* hopper over */ }
        }
      } catch (e) { /* ingen bilder */ }
      const annetBytes = JSON.stringify({ medlemmer, prosjekter, innslag, dugnader, aktiviteter, utleie, logo }).length;
      setLagring({ antallBilder, bildeBytes, annetBytes, total: bildeBytes + annetBytes });
    } finally {
      setRegnerLagring(false);
    }
  }

  async function lastNedBackup(medBilder) {
    setJobber(true);
    try {
      const data = {
        app: "Dugnadsloggen Askøy Kystlag",
        versjon: 20,
        dato: iDag(),
        medlemmer, prosjekter, innslag, dugnader, aktiviteter, utleie,
        logo: logo || null,
      };
      if (medBilder) {
        const foto = [];
        try {
          const liste = await window.storage.list(FOTO_ALLE, true);
          for (const k of liste?.keys || []) {
            const nokkel = typeof k === "string" ? k : k.key;
            try {
              const r = await window.storage.get(nokkel, true);
              if (r?.value) foto.push({ nokkel, innhold: JSON.parse(r.value) });
            } catch (e) { /* hopper over */ }
          }
        } catch (e) { /* ingen bilder */ }
        data.foto = foto;
      }
      lastNedFil(JSON.stringify(data), `sikkerhetskopi-dugnadsloggen-${iDag()}${medBilder ? "-med-bilder" : ""}.json`, "application/json");
      await onBackupTatt();
    } finally {
      setJobber(false);
    }
  }

  async function hentAutoBackuper() {
    setHenterAutoBackuper(true);
    try {
      const { data, error } = await supabase
        .from("sikkerhetskopier")
        .select("id, laget")
        .order("laget", { ascending: false })
        .limit(7);
      if (error) throw error;
      setAutoBackuper(data || []);
    } catch (e) {
      console.error("Kunne ikke hente automatiske sikkerhetskopier:", e);
      await varsle(`Kunne ikke hente automatiske sikkerhetskopier: ${e?.message || "ukjent feil"}. Er supabase-automatisk-backup.sql kjørt i Supabase?`);
      setAutoBackuper([]);
    } finally {
      setHenterAutoBackuper(false);
    }
  }

  async function lastNedAutoBackup(id, laget, medBilder) {
    try {
      const { data, error } = await supabase
        .from("sikkerhetskopier")
        .select("innhold")
        .eq("id", id)
        .single();
      if (error) throw error;
      const dato = new Date(laget).toISOString().slice(0, 10);
      const pakke = {
        app: "Dugnadsloggen Askøy Kystlag (automatisk nattlig kopi)",
        laget,
        ...data.innhold,
      };

      if (medBilder) {
        // Finn bildene fra samme natt (nærmeste kjøring_id til samme klokkeslett)
        const { data: bilder, error: feilBilder } = await supabase
          .from("sikkerhetskopier_bilder")
          .select("nokkel, innhold, laget")
          .gte("laget", new Date(new Date(laget).getTime() - 6 * 3600 * 1000).toISOString())
          .lte("laget", new Date(new Date(laget).getTime() + 6 * 3600 * 1000).toISOString());
        if (feilBilder) {
          await varsle(`Fant ikke bildebackup for denne natten: ${feilBilder.message}. Er supabase-automatisk-backup-bilder.sql kjørt? Laster ned uten bilder.`);
        } else {
          pakke.foto = (bilder || []).map((b) => ({ nokkel: b.nokkel, innhold: JSON.parse(b.innhold) }));
        }
      }

      lastNedFil(JSON.stringify(pakke), `auto-sikkerhetskopi-${dato}${medBilder ? "-med-bilder" : ""}.json`, "application/json");
    } catch (e) {
      await varsle(`Kunne ikke laste ned denne kopien: ${e?.message || "ukjent feil"}.`);
    }
  }

  async function lesBackup(e) {
    const fil = e.target.files?.[0];
    e.target.value = "";
    if (!fil) return;
    try {
      const tekst = await fil.text();
      const data = JSON.parse(tekst);
      if (!data.medlemmer && !data.innslag) {
        await varsle("Dette ser ikke ut som en sikkerhetskopi fra Dugnadsloggen.");
        return;
      }
      const antall = `${data.medlemmer?.length || 0} medlemmer, ${data.innslag?.length || 0} timeregistreringer, ${data.prosjekter?.length || 0} prosjekter, ${data.dugnader?.length || 0} dugnader${data.foto ? `, ${data.foto.length} bilder` : ""}`;
      if (!(await bekreft(`Gjenopprette sikkerhetskopi fra ${data.dato || "ukjent dato"}?\n\nInneholder: ${antall}.\n\nDette OVERSKRIVER dagens data i appen!`))) return;
      setJobber(true);
      await onGjenopprett(data);
    } catch (err) {
      await varsle("Kunne ikke lese filen. Er det riktig sikkerhetskopi-fil (.json)?");
    } finally {
      setJobber(false);
    }
  }

  async function velgLogo(e) {
    const fil = e.target.files?.[0];
    e.target.value = "";
    if (!fil) return;
    try {
      const dataUrl = await lesOgKomprimer(fil, 280, 0.8);
      await onLagreLogo(dataUrl);
    } catch (err) {
      console.error("Logo-feil:", err);
      await varsle(`Kunne ikke laste opp logoen: ${err?.message || "ukjent feil"}. Prøv et mindre bilde (under 2 MB) i JPG eller PNG-format.`);
    }
  }

  async function endreEpost(m) {
    const ny = await sporsmaal(`E-postadresse for ${m.navn}:`, m.epost || "");
    if (ny === null) return;
    const trimmet = ny.trim().toLowerCase();
    if (trimmet && !gyldigEpost(trimmet)) {
      await varsle("Det ser ikke ut som en gyldig e-postadresse.");
      return;
    }
    onLagreMeta(medlemmer.map((x) => (x.id === m.id ? { ...x, epost: trimmet } : x)));
  }

  async function endreTelefon(m) {
    const ny = await sporsmaal(`Telefonnummer for ${m.navn}:`, m.telefon || "");
    if (ny === null) return;
    const trimmet = ny.trim();
    if (trimmet && !gyldigTelefon(trimmet)) {
      await varsle("Det ser ikke ut som et gyldig telefonnummer.");
      return;
    }
    onLagreMeta(medlemmer.map((x) => (x.id === m.id ? { ...x, telefon: trimmet } : x)));
  }

  return (
    <section style={{ display: "grid", gap: 14 }}>
      {/* Versjon — gjør det enkelt å se om en oppdatering har slått gjennom */}
      <div style={{ ...kort, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, background: C.kritt }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: C.dempet, fontWeight: 700 }}>App-versjon</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.tjaere }}>v{APP_VERSJON} <span style={{ fontWeight: 400, color: C.dempet, fontSize: 13 }}>— oppdatert {APP_OPPDATERT}</span></div>
        </div>
        <span style={{ fontSize: 11, color: C.dempet }}>Ser du dette tallet endre seg etter «npm run deploy», har oppdateringen slått gjennom.</span>
      </div>

      {/* Sikkerhetskopi */}
      <div style={{ ...kort, borderLeft: `4px solid ${C.signal}` }}>
        <h2 style={{ margin: "0 0 4px", fontFamily: "Georgia, serif", fontSize: 18 }}>Sikkerhetskopi</h2>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: C.dempet }}>
          Last ned alt innhold som én fil og last den opp til lagets Google Disk eller filarkivet på StyreWeb. Gjenopprett leser filen inn igjen og overskriver dagens data.
          {" "}<strong style={{ color: C.tjaere }}>{sisteBackup ? `Sist tatt: ${fDato(sisteBackup)}.` : "Ingen sikkerhetskopi tatt ennå."}</strong>
        </p>
        {!backupIDag && (
          <div style={{ background: "#FFF6E9", border: "1px solid #E0A93E", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 12 }}>
            📅 <strong>Dagens sikkerhetskopi er ikke tatt.</strong> Trykk «med bilder» under, så lastes hele dagens kopi ned — klar til å legges i Google Disk.
          </div>
        )}
        <div style={{ display: "grid", gap: 8 }}>
          <button style={{ ...primKnapp, width: "100%", opacity: jobber ? 0.6 : 1 }} disabled={jobber} onClick={() => lastNedBackup(false)}>
            {jobber ? "Jobber …" : "⬇ Last ned sikkerhetskopi (uten bilder)"}
          </button>
          <button style={{ ...sekKnapp, width: "100%", opacity: jobber ? 0.6 : 1 }} disabled={jobber} onClick={() => lastNedBackup(true)}>
            ⬇ Last ned med bilder (kan bli stor fil)
          </button>
          <label style={{ ...sekKnapp, width: "100%", textAlign: "center", boxSizing: "border-box", opacity: jobber ? 0.6 : 1 }}>
            ⬆ Gjenopprett fra fil …
            <input type="file" accept=".json,application/json" onChange={lesBackup} disabled={jobber} style={{ display: "none" }} />
          </label>
        </div>

        <div style={{ marginTop: 14, borderTop: `1px solid ${C.sand}`, paddingTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Lagringsbruk</span>
            <button style={{ ...sekKnapp, padding: "5px 12px", fontSize: 12 }} disabled={regnerLagring} onClick={beregnLagring}>
              {regnerLagring ? "Regner …" : lagring ? "Oppdater" : "Vis lagringsbruk"}
            </button>
          </div>
          {lagring && (
            <div style={{ marginTop: 8, fontSize: 13, color: C.tjaere, display: "grid", gap: 3 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>📷 Bilder ({lagring.antallBilder} stk.)</span><span style={{ fontWeight: 600 }}>{visStorrelse(lagring.bildeBytes)}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>📋 Timer, prosjekter, utleie m.m.</span><span style={{ fontWeight: 600 }}>{visStorrelse(lagring.annetBytes)}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${C.sand}`, paddingTop: 3, marginTop: 2 }}><span style={{ fontWeight: 700 }}>Totalt</span><span style={{ fontWeight: 700 }}>{visStorrelse(lagring.total)}</span></div>
              <p style={{ margin: "4px 0 0", fontSize: 11.5, color: C.dempet }}>Bildene komprimeres automatisk for å spare plass. Last ned «med bilder» for en full kopi.</p>
            </div>
          )}
        </div>
      </div>

      {/* Automatisk nattlig sikkerhetskopi */}
      <div style={kort}>
        <h2 style={{ margin: "0 0 4px", fontFamily: "Georgia, serif", fontSize: 18 }}>Automatisk sikkerhetskopi</h2>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: C.dempet }}>
          Databasen tar selv en full kopi av alt innhold hver natt — inkludert bilder — og beholder de siste 7 dagene
          automatisk. Ingen trenger å huske på noe. Vil dere ha en kopi liggende utenfor databasen (f.eks. på Google
          Disk), last ned en av kopiene under og legg den i mappa deres.
        </p>
        <button style={{ ...sekKnapp, padding: "7px 14px", fontSize: 13 }} disabled={henterAutoBackuper} onClick={hentAutoBackuper}>
          {henterAutoBackuper ? "Henter …" : autoBackuper ? "Oppdater listen" : "Vis automatiske kopier"}
        </button>
        {autoBackuper && autoBackuper.length === 0 && (
          <p style={{ marginTop: 10, fontSize: 13, color: C.dempet }}>
            Ingen automatiske kopier funnet ennå. Er <code>supabase-automatisk-backup.sql</code> kjørt i Supabase? Den første kopien tas neste natt — eller med en gang hvis dere kjørte den siste linja i skriptet.
          </p>
        )}
        {autoBackuper && autoBackuper.length > 0 && (
          <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
            {autoBackuper.map((b) => (
              <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", background: C.kritt, borderRadius: 6, fontSize: 13, flexWrap: "wrap", gap: 6 }}>
                <span>{new Date(b.laget).toLocaleString("nb-NO", { dateStyle: "long", timeStyle: "short" })}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={{ ...sekKnapp, padding: "4px 10px", fontSize: 12 }} onClick={() => lastNedAutoBackup(b.id, b.laget, false)}>
                    ⬇ Uten bilder
                  </button>
                  <button style={{ ...sekKnapp, padding: "4px 10px", fontSize: 12 }} onClick={() => lastNedAutoBackup(b.id, b.laget, true)}>
                    ⬇ Med bilder
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Aktiviteter */}
      <div style={kort}>
        <h2 style={{ margin: "0 0 4px", fontFamily: "Georgia, serif", fontSize: 18 }}>Aktiviteter</h2>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: C.dempet }}>
          Endre navn oppdaterer også gamle registreringer. Fjerning tar bare aktiviteten ut av valglisten — historikken beholdes.
        </p>
        {aktiviteter.map((a) => (
          <div key={a} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.sand}` }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{a}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={{ ...sekKnapp, padding: "4px 10px", fontSize: 12 }} onClick={async () => {
                const ny = await sporsmaal(`Nytt navn for «${a}»:`, a);
                if (ny && ny.trim() && ny.trim() !== a) onEndreAktivitet(a, ny);
              }}>Endre navn</button>
              <button style={{ ...sekKnapp, padding: "4px 10px", fontSize: 12, borderColor: C.signal, color: C.signal }}
                onClick={async () => { if (!(await bekreft(`Fjerne aktiviteten «${a}»? Historikken beholdes.`))) return; onSlettAktivitet(a); }}>Fjern</button>
            </div>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input style={{ ...input, flex: 1 }} value={nyAkt} onChange={(e) => setNyAkt(e.target.value)} placeholder="Ny aktivitet" />
          <button style={{ ...sekKnapp, padding: "8px 14px" }} onClick={async () => {
            if (await onNyAktivitet(nyAkt)) setNyAkt("");
          }}>Legg til</button>
        </div>
      </div>

      {/* Utleieobjekter og kasserer */}
      <div style={kort}>
        <h2 style={{ margin: "0 0 4px", fontFamily: "Georgia, serif", fontSize: 18 }}>Utleieobjekter og kasserer</h2>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: C.dempet }}>
          Lokalene og båtene dere leier ut. Fjernes et objekt, beholdes eksisterende bookinger med navnet. Gi medlemmer «utleierettigheter» under Medlemmer for at de skal kunne legge inn utleie.
        </p>
        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, cursor: "pointer", marginBottom: 14, background: C.kritt, borderRadius: 8, padding: "10px 12px" }}>
          <input type="checkbox" checked={!!utleie.alleSerUtleie}
            onChange={(e) => onLagreUtleie({ ...utleie, alleSerUtleie: e.target.checked })}
            style={{ width: 18, height: 18 }} />
          La alle medlemmer <strong>se</strong> utleiekalenderen (de kan fortsatt ikke legge inn eller endre)
        </label>
        {(utleie.objekter || []).length === 0 && <p style={{ color: C.dempet, fontSize: 13, margin: "0 0 8px" }}>Ingen utleieobjekter ennå — legg til under.</p>}
        {(utleie.objekter || []).map((o) => (
          <div key={o.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${C.sand}` }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{o.type === "baat" ? "⛵" : "🏠"} {o.navn}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={{ ...sekKnapp, padding: "4px 10px", fontSize: 12 }} onClick={async () => {
                const ny = await sporsmaal(`Nytt navn for «${o.navn}»:`, o.navn);
                if (!ny || !ny.trim() || ny.trim() === o.navn) return;
                onLagreUtleie({ ...utleie, objekter: utleie.objekter.map((x) => (x.id === o.id ? { ...x, navn: ny.trim() } : x)) });
              }}>Endre navn</button>
              <button style={{ ...sekKnapp, padding: "4px 10px", fontSize: 12, borderColor: C.signal, color: C.signal }} onClick={async () => {
                const harBookinger = (utleie.bookinger || []).some((b) => b.objektId === o.id);
                if (!(await bekreft(`Fjerne «${o.navn}» fra utleielisten?${harBookinger ? " Eksisterende bookinger beholdes med navnet." : ""}`))) return;
                onLagreUtleie({ ...utleie, objekter: utleie.objekter.filter((x) => x.id !== o.id) });
              }}>Fjern</button>
            </div>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <input style={{ ...input, flex: 2, minWidth: 150 }} value={nyttObjektNavn} onChange={(e) => setNyttObjektNavn(e.target.value)} placeholder="Navn, f.eks. Sjøhuset eller «Havfruen»" />
          <select style={{ ...input, flex: 1, minWidth: 110 }} value={nyttObjektType} onChange={(e) => setNyttObjektType(e.target.value)}>
            <option value="lokale">🏠 Lokale</option>
            <option value="baat">⛵ Båt</option>
          </select>
          <button style={{ ...sekKnapp, padding: "8px 14px" }} onClick={() => {
            const n = nyttObjektNavn.trim();
            if (n.length < 2) return;
            onLagreUtleie({ ...utleie, objekter: [...(utleie.objekter || []), { id: nyId(), navn: n, type: nyttObjektType }] });
            setNyttObjektNavn("");
          }}>Legg til</button>
        </div>

        <div style={{ marginTop: 16 }}>
          <label style={{ display: "block", fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: C.dempet, marginBottom: 6, fontWeight: 600 }}>Kasserer (mottar faktureringsgrunnlag)</label>
          <select style={input} value={utleie.kassererId || ""} onChange={(e) => onLagreUtleie({ ...utleie, kassererId: e.target.value || null })}>
            <option value="">Velg kasserer …</option>
            {[...medlemmer].sort((a, b) => a.navn.localeCompare(b.navn, "nb")).map((m) => (
              <option key={m.id} value={m.id}>{m.navn}{m.epost ? ` (${m.epost})` : " — mangler e-post!"}</option>
            ))}
          </select>
          {utleie.kassererId && !medlemmer.find((m) => m.id === utleie.kassererId)?.epost && (
            <p style={{ margin: "6px 0 0", fontSize: 12.5, color: C.signal, fontWeight: 600 }}>
              ⚠ Kassereren mangler e-post — legg den inn under Medlemmer lenger ned.
            </p>
          )}
        </div>
      </div>

      {/* Logo */}
      <div style={kort}>
        <h2 style={{ margin: "0 0 4px", fontFamily: "Georgia, serif", fontSize: 18 }}>Lagets logo</h2>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: C.dempet }}>
          Last opp Askøy Kystlags logo (PNG/JPG), så vises den på innloggingssiden, forsiden og i toppfeltet.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {logo
            ? <img src={logo} alt="Lagets logo" style={{ height: 64, width: 64, objectFit: "contain", borderRadius: 10, border: `1px solid ${C.sand}`, padding: 4 }} />
            : <Lagsmerke size={64} />}
          <label style={{ ...sekKnapp, cursor: "pointer" }}>
            {logo ? "Bytt logo …" : "Last opp logo …"}
            <input type="file" accept="image/*" onChange={velgLogo} style={{ display: "none" }} />
          </label>
        </div>
      </div>

      {/* Medlemmer */}
      <div style={kort}>
        <h2 style={{ margin: "0 0 4px", fontFamily: "Georgia, serif", fontSize: 18 }}>Medlemmer</h2>
        <p style={{ margin: "0 0 10px", fontSize: 13, color: C.dempet }}>
          Dere kan ha så mange admin dere vil. «Prosjektrettigheter» lar et medlem opprette prosjekter, «utleierettigheter» lar dem legge inn utleie — uten å være admin. «Send nytt passord» sender medlemmet en e-post for å lage nytt passord. «Blokker» stenger noen ute fra å logge inn, men timer, prosjekter og bilder de har lagt inn blir værende i loggen og rapportene.
        </p>

        {/* Legg til nytt medlem manuelt */}
        {!viserNyttMedlem ? (
          <button style={{ ...sekKnapp, marginBottom: 14 }} onClick={() => setViserNyttMedlem(true)}>
            + Legg til medlem manuelt
          </button>
        ) : (
          <div style={{ background: C.kritt, borderRadius: 8, padding: 14, marginBottom: 14, display: "grid", gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Legg til nytt medlem</div>
            {nyttMedlemFeil && <div style={{ background: "#FBEAE8", color: C.signal, padding: "7px 10px", borderRadius: 6, fontSize: 13 }}>{nyttMedlemFeil}</div>}
            <div>
              <label style={etikett}>Fullt navn</label>
              <input style={input} value={nyttMedlemNavn} onChange={(e) => setNyttMedlemNavn(e.target.value)} placeholder="f.eks. Kari Olsvik" />
            </div>
            <div>
              <label style={etikett}>Telefonnummer</label>
              <input type="tel" style={input} value={nyttMedlemTelefon} onChange={(e) => setNyttMedlemTelefon(e.target.value)} placeholder="f.eks. 912 34 567" />
            </div>
            <div>
              <label style={etikett}>E-post (valgfritt)</label>
              <input type="email" style={input} value={nyttMedlemEpost} onChange={(e) => setNyttMedlemEpost(e.target.value)} placeholder="din@epost.no" />
              <p style={{ margin: "4px 0 0", fontSize: 12, color: C.dempet }}>
                Når personen registrerer seg i appen med samme e-post eller telefon, kobles de automatisk til denne profilen.
              </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ ...primKnapp, padding: "8px 16px" }} onClick={async () => {
                setNyttMedlemFeil("");
                if (nyttMedlemNavn.trim().length < 2) { setNyttMedlemFeil("Skriv inn et navn."); return; }
                if (!gyldigTelefon(nyttMedlemTelefon) && !nyttMedlemTelefon.trim()) { setNyttMedlemFeil("Skriv inn telefonnummer."); return; }
                if (nyttMedlemEpost.trim() && !gyldigEpost(nyttMedlemEpost)) { setNyttMedlemFeil("Ugyldig e-postadresse."); return; }
                const ny = { id: nyId(), navn: nyttMedlemNavn.trim(), telefon: nyttMedlemTelefon.trim(), epost: nyttMedlemEpost.trim().toLowerCase(), admin: false, pin: "" };
                await onLeggTilMedlem(ny);
                setNyttMedlemNavn(""); setNyttMedlemTelefon(""); setNyttMedlemEpost(""); setViserNyttMedlem(false);
              }}>Legg til</button>
              <button style={{ ...sekKnapp, padding: "8px 16px" }} onClick={() => { setViserNyttMedlem(false); setNyttMedlemFeil(""); }}>Avbryt</button>
            </div>
          </div>
        )}
        {[...medlemmer].sort((a, b) => a.navn.localeCompare(b.navn, "nb")).map((m) => (
          <div key={m.id} style={{ padding: "10px 0", borderBottom: `1px solid ${C.sand}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div>
                <span style={{ fontWeight: 600 }}>{m.navn}</span>
                {m.admin && <span style={{ marginLeft: 8, fontSize: 11, background: C.hav, color: C.kritt, borderRadius: 4, padding: "2px 6px", letterSpacing: "0.05em" }}>ADMIN</span>}
                {!m.admin && m.kanProsjekt && <span style={{ marginLeft: 8, fontSize: 11, background: C.sjogronn, color: "#fff", borderRadius: 4, padding: "2px 6px", letterSpacing: "0.05em" }}>PROSJEKT</span>}
                {!m.admin && (m.kanUtleie || (utleie.ledere || []).includes(m.id)) && <span style={{ marginLeft: 8, fontSize: 11, background: "#7A5C3E", color: "#fff", borderRadius: 4, padding: "2px 6px", letterSpacing: "0.05em" }}>UTLEIE</span>}
                {m.blokkert && <span style={{ marginLeft: 8, fontSize: 11, background: C.signal, color: "#fff", borderRadius: 4, padding: "2px 6px", letterSpacing: "0.05em" }}>BLOKKERT</span>}
                <div style={{ fontSize: 12, color: C.dempet }}>
                  {tall(timerFor(m.id))} t · {m.epost || "ingen e-post"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button style={{ ...sekKnapp, padding: "5px 10px", fontSize: 12 }} onClick={() => endreEpost(m)}>
                  E-post
                </button>
                <button style={{ ...sekKnapp, padding: "5px 10px", fontSize: 12 }} onClick={() => endreTelefon(m)}>
                  Telefon
                </button>
                <button style={{ ...sekKnapp, padding: "5px 10px", fontSize: 12 }}
                  onClick={async () => {
                    if (!m.epost) { await varsle("Medlemmet mangler e-postadresse."); return; }
                    if (!(await bekreft(`Sende e-post til ${m.navn} med lenke for å lage nytt passord?`))) return;
                    const { error } = await supabase.auth.resetPasswordForEmail(m.epost);
                    await varsle(error ? "Kunne ikke sende e-post." : `Sendt til ${m.epost}.`);
                  }}>
                  Send nytt passord
                </button>
                {!m.admin && (
                  <button style={{ ...sekKnapp, padding: "5px 10px", fontSize: 12 }}
                    onClick={() => onLagreMeta(medlemmer.map((x) => x.id === m.id ? { ...x, kanProsjekt: !x.kanProsjekt } : x))}>
                    {m.kanProsjekt ? "Fjern prosjektrettigheter" : "Gi prosjektrettigheter"}
                  </button>
                )}
                {!m.admin && (
                  <button style={{ ...sekKnapp, padding: "5px 10px", fontSize: 12 }}
                    onClick={() => onLagreMeta(medlemmer.map((x) => x.id === m.id ? { ...x, kanUtleie: !x.kanUtleie } : x))}>
                    {m.kanUtleie ? "Fjern utleierettigheter" : "Gi utleierettigheter"}
                  </button>
                )}
                {m.id !== bruker.id && (
                  <button style={{ ...sekKnapp, padding: "5px 10px", fontSize: 12 }}
                    onClick={() => onLagreMeta(medlemmer.map((x) => x.id === m.id ? { ...x, admin: !x.admin } : x))}>
                    {m.admin ? "Fjern admin" : "Gjør til admin"}
                  </button>
                )}
                {m.id !== bruker.id && !m.admin && (
                  <button style={{ ...sekKnapp, padding: "5px 10px", fontSize: 12, borderColor: m.blokkert ? "#4E7E5B" : C.signal, color: m.blokkert ? "#2F5A3C" : C.signal }}
                    onClick={async () => {
                      const melding = m.blokkert
                        ? `Gjenåpne tilgangen for ${m.navn}?`
                        : `Blokkere ${m.navn}? De får ikke logge inn igjen, men timer, prosjekter og bilder de har lagt inn beholdes i loggen og rapportene.`;
                      if (!(await bekreft(melding))) return;
                      onLagreMeta(medlemmer.map((x) => x.id === m.id ? { ...x, blokkert: !x.blokkert } : x));
                    }}>
                    {m.blokkert ? "Gjenåpne tilgang" : "Blokker"}
                  </button>
                )}
                {m.id !== bruker.id && (
                  <button style={{ ...sekKnapp, padding: "5px 10px", fontSize: 12, borderColor: C.signal, color: C.signal }}
                    onClick={async () => {
                      if (!(await bekreft(`Fjerne ${m.navn}? Timene deres beholdes i loggen.`))) return;
                      onLagreMeta(medlemmer.filter((x) => x.id !== m.id));
                    }}>
                    Fjern
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Dugnader */}
      <div style={kort}>
        <h2 style={{ margin: "0 0 12px", fontFamily: "Georgia, serif", fontSize: 18 }}>Dugnader i kalenderen</h2>
        {dugnader.length === 0 && <p style={{ color: C.dempet, fontSize: 14, margin: 0 }}>Ingen dugnader planlagt.</p>}
        {[...dugnader].sort((a, b) => b.dato.localeCompare(a.dato)).map((d) => (
          <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${C.sand}` }}>
            <div>
              <span style={{ fontWeight: 600 }}>{d.tittel}</span>
              <span style={{ fontSize: 12, color: C.dempet, marginLeft: 8 }}>{fDato(d.dato)} · {d.paameldte.length} påmeldte</span>
            </div>
            <button style={{ ...sekKnapp, padding: "5px 10px", fontSize: 12, borderColor: C.signal, color: C.signal }}
              onClick={async () => { if (!(await bekreft(`Slette dugnaden «${d.tittel}»?`))) return; onSlettDugnad(d.id); }}>
              Slett
            </button>
          </div>
        ))}
      </div>

      {/* Prosjekter */}
      <div style={kort}>
        <h2 style={{ margin: "0 0 4px", fontFamily: "Georgia, serif", fontSize: 18 }}>Prosjekter</h2>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: C.dempet }}>
          Velg én eller flere prosjektansvarlige. Ansvarlige kan oppdatere framdrift, skrive notater og se rapport for prosjektet.
        </p>
        {prosjekter.length === 0 && <p style={{ color: C.dempet, fontSize: 14, margin: 0 }}>Ingen prosjekter å vedlikeholde.</p>}
        {prosjekter.map((p) => {
          const ider = ledereAv(p);
          return (
            <div key={p.id} style={{ padding: "12px 0", borderBottom: `1px solid ${C.sand}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div>
                  <span style={{ fontWeight: 600 }}>{p.navn}</span>
                  <span style={{ fontSize: 12, color: C.dempet, marginLeft: 8 }}>{p.status}</span>
                </div>
                <button style={{ ...sekKnapp, padding: "5px 10px", fontSize: 12, borderColor: C.signal, color: C.signal }}
                  onClick={async () => { if (!(await bekreft(`Slette prosjektet «${p.navn}»? Timer beholdes, men mister prosjektkoblingen.`))) return; onSlettProsjekt(p.id); }}>
                  Slett
                </button>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
                {ider.length === 0 && <span style={{ fontSize: 12.5, color: C.dempet }}>Ingen ansvarlig</span>}
                {ider.map((id) => (
                  <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.kritt, border: `1px solid ${C.sand}`, borderRadius: 999, padding: "4px 10px", fontSize: 12.5, fontWeight: 600 }}>
                    {medlemmer.find((m) => m.id === id)?.navn || "Ukjent"}
                    <button onClick={() => onOppdaterProsjekt({ ...p, ledere: ider.filter((x) => x !== id), lederId: undefined })}
                      aria-label="Fjern" style={{ background: "none", border: "none", color: C.signal, cursor: "pointer", fontSize: 13, padding: 0, lineHeight: 1 }}>×</button>
                  </span>
                ))}
                <select style={{ ...input, width: "auto", padding: "5px 8px", fontSize: 12.5 }} value="" onChange={(e) => {
                  if (!e.target.value) return;
                  onOppdaterProsjekt({ ...p, ledere: [...ider, e.target.value], lederId: undefined });
                }}>
                  <option value="">+ Legg til ansvarlig …</option>
                  {[...medlemmer].filter((m) => !ider.includes(m.id)).sort((a, b) => a.navn.localeCompare(b.navn, "nb")).map((m) => (
                    <option key={m.id} value={m.id}>{m.navn}</option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: 12, color: C.dempet, margin: 0 }}>
        Merk: Dette er en enkel felleslogg uten kryptert pålogging. Ikke lagre sensitive opplysninger her.
      </p>
    </section>
  );
}

// ============================================================
// Utleie (kun admin): valgfritt antall lokaler og båter
// ============================================================
function Utleie({ utleie, dugnader, medlemmer, prosjekter, bruker, kanRedigere, erAdmin, onLagreUtleie, onNyBooking, onOppdaterBooking, onSlettBooking, stil }) {
  const { C, input, etikett, primKnapp, sekKnapp, kort, bekreft, sporsmaal, varsle } = stil;
  const [viserSkjema, setViserSkjema] = useState(false);
  const [viserTidligere, setViserTidligere] = useState(false);
  const [redigerId, setRedigerId] = useState(null);
  const [viserInnstillinger, setViserInnstillinger] = useState(false);
  const [nyttObjektNavn, setNyttObjektNavn] = useState("");
  const [nyttObjektType, setNyttObjektType] = useState("lokale");

  // Skjemafelter for ny/redigert booking
  const [objektId, setObjektId] = useState("");
  const [trengerMannskap, setTrengerMannskap] = useState(true);
  const [mannskapNotat, setMannskapNotat] = useState("");
  const [dato, setDato] = useState(() => iDag());
  const [datoSlutt, setDatoSlutt] = useState(() => datoPluss(iDag(), 1));
  const [tid, setTid] = useState("12:00");
  const [tidSlutt, setTidSlutt] = useState("12:00");
  const [leietaker, setLeietaker] = useState("");
  const [kontakt, setKontakt] = useState("");
  const [pris, setPris] = useState("");
  const [notat, setNotat] = useState("");
  const [fakturaStatus, setFakturaStatus] = useState("ikke-sendt");

  function navnFor(id) { return medlemmer.find((m) => m.id === id)?.navn || "Ukjent"; }
  const idag = iDag();
  const objekter = utleie.objekter || [];
  const bookinger = utleie.bookinger || [];
  const kommende = bookinger.filter((b) => b.dato >= idag).sort((a, b) => a.dato.localeCompare(b.dato));
  const tidligere = bookinger.filter((b) => b.dato < idag).sort((a, b) => b.dato.localeCompare(a.dato));
  const valgtObjekt = objekter.find((o) => o.id === objektId);
  const kasserer = medlemmer.find((m) => m.id === utleie.kassererId);

  function ikon(type) { return (type === "baat" ? "⛵" : "🏠"); }
  const objektNavn = (b) => {
    const o = objekter.find((x) => x.id === b.objektId);
    if (o) return `${ikon(o.type)} ${o.navn}`;
    return `${ikon(b.type)} ${b.objekt || "Ukjent objekt"}`; // eldre bookinger
  };

  const aaret = idag.slice(0, 4);
  const inntektIAar = bookinger
    .filter((b) => b.dato.slice(0, 4) === aaret && b.pris)
    .reduce((s, b) => s + (parseFloat(String(b.pris).replace(",", ".")) || 0), 0);

  function tomSkjema() {
    setObjektId(""); setDato(iDag()); setDatoSlutt(datoPluss(iDag(), 1)); setTid("12:00"); setTidSlutt("12:00"); setLeietaker(""); setKontakt(""); setPris(""); setNotat(""); setMannskapNotat("");
    setFakturaStatus("ikke-sendt");
    setRedigerId(null); setViserSkjema(false); setFeil("");
  }

  function startRedigering(b) {
    setRedigerId(b.id);
    setObjektId(b.objektId || "");
    setDato(b.dato); setDatoSlutt(b.datoSlutt && b.datoSlutt !== b.dato ? b.datoSlutt : ""); setTid(b.tid || ""); setTidSlutt(b.tidSlutt || "");
    setLeietaker(b.leietaker || ""); setKontakt(b.kontakt || "");
    setPris(b.pris || ""); setNotat(b.notat || "");
    setFakturaStatus(b.fakturaStatus || "ikke-sendt");
    setTrengerMannskap(false); setMannskapNotat("");
    setFeil(""); setViserSkjema(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function byggMannskapsDugnad(navn, leier, type) {
    const erBaat = type === "baat";
    return {
      id: nyId(),
      tittel: `${erBaat ? "Mannskap" : "Dugnadshjelp"}: ${navn}`,
      dato, datoSlutt: datoSlutt.trim() || "", tid: tid.trim(), tidSlutt: tidSlutt.trim(),
      sted: erBaat ? "" : navn,
      beskrivelse: erBaat
        ? `Utleieoppdrag — vi trenger mannskap fra dugnadsgjengen! «${navn}» er leid ut til ${leier}.${mannskapNotat.trim() ? ` ${mannskapNotat.trim()}` : ""} Meld deg på her, så ser utleieansvarlig hvem som blir med.`
        : `Utleieoppdrag — vi trenger dugnadshjelp! «${navn}» er leid ut til ${leier}, og vi trenger folk til f.eks. rigging, vertskap eller rydding.${mannskapNotat.trim() ? ` ${mannskapNotat.trim()}` : ""} Meld deg på her, så ser utleieansvarlig hvem som blir med.`,
      prosjektId: null,
      ansvarligId: bruker.id,
      paameldte: [],
      oppmoette: [],
      utleie: true,
      status: "planlagt",
    };
  }

  // ---- Dobbeltbooking-sjekk (håndterer flere døgn) ----
  // Gjør om en booking til et [start, slutt]-intervall som tall (YYYYMMDD * 10000 + HHMM)
  function intervall(b) {
    const dStart = b.dato;
    const dSlutt = (b.datoSlutt && b.datoSlutt >= b.dato) ? b.datoSlutt : b.dato;
    const tStart = b.tid || "00:00";
    const tSlutt = b.tidSlutt || (dSlutt > dStart ? "23:59" : "23:59");
    const num = (d, t) => parseInt(d.replace(/-/g, ""), 10) * 10000 + parseInt(t.replace(":", ""), 10);
    return [num(dStart, tStart), num(dSlutt, tSlutt)];
  }
  function overlapper(a, b) {
    const [aS, aE] = intervall(a);
    const [bS, bE] = intervall(b);
    return aS < bE && bS < aE;
  }

  // Avtaler som overlapper datospennet til det dere holder på å booke
  const utkast = { dato, datoSlutt: datoSlutt.trim(), tid: tid.trim(), tidSlutt: tidSlutt.trim() };
  const berorteAvtaler = (valgtObjekt && dato)
    ? bookinger
        .filter((b) => b.objektId === valgtObjekt.id && b.id !== redigerId && overlapper(utkast, b))
        .sort((a, b) => (a.dato + (a.tid || "")).localeCompare(b.dato + (b.tid || "")))
    : [];
  // Andre avtaler på samme objekt i nær framtid (vises som info selv uten overlapp)
  const avtalerSammeDag = (valgtObjekt && dato)
    ? bookinger
        .filter((b) => b.objektId === valgtObjekt.id && b.id !== redigerId &&
          ((b.datoSlutt || b.dato) >= dato && b.dato <= (datoSlutt.trim() || dato)))
        .sort((a, b) => (a.dato + (a.tid || "")).localeCompare(b.dato + (b.tid || "")))
    : [];

  function avtaleLinje(b) {
    return `${fUtleiePeriode(b)} — ${b.leietaker}${b.status === "bekreftet" ? " (bekreftet)" : b.status === "gjennomfoert" ? " (gjennomført)" : ""}`;
  }

  // ---- Ny eller redigert booking ----
  async function opprett() {
    setFeil("");
    if (!valgtObjekt) { setFeil("Velg hva som leies ut."); return; }
    if (!dato) { setFeil("Velg startdato for utleien."); return; }
    if (datoSlutt.trim() && datoSlutt.trim() < dato) { setFeil("Sluttdato kan ikke være før startdato."); return; }
    if (leietaker.trim().length < 2) { setFeil("Skriv inn hvem som leier."); return; }
    const flerDogn = datoSlutt.trim() && datoSlutt.trim() !== dato;
    if (!flerDogn && tidSlutt && tid && tidSlutt <= tid) { setFeil("Sluttiden må være etter starttiden samme dag."); return; }

    if (berorteAvtaler.length > 0) {
      const liste = berorteAvtaler.map((e) => `• ${avtaleLinje(e)}`).join("\n");
      if (!(await bekreft(`⚠ DOBBELTBOOKING!\n\nPerioden din overlapper med eksisterende avtale på ${valgtObjekt.navn}:\n\n${liste}\n\nVil du lagre likevel?`))) return;
    } else if (avtalerSammeDag.length > 0) {
      const liste = avtalerSammeDag.map((e) => `• ${avtaleLinje(e)}`).join("\n");
      if (!(await bekreft(`Det finnes andre avtaler på ${valgtObjekt.navn} i denne perioden:\n\n${liste}\n\nDin periode går klar av disse. Lagre?`))) return;
    }

    if (redigerId) {
      const original = bookinger.find((b) => b.id === redigerId);
      if (!original) { tomSkjema(); return; }
      const oppdatert = {
        ...original,
        objektId: valgtObjekt.id,
        objekt: valgtObjekt.navn,
        type: valgtObjekt.type,
        dato, datoSlutt: datoSlutt.trim() || "", tid: tid.trim(), tidSlutt: tidSlutt.trim(),
        leietaker: leietaker.trim(), kontakt: kontakt.trim(),
        pris: pris.trim(), notat: notat.trim(),
        fakturaStatus,
      };
      let nyDugnad = null;
      if (!original.dugnadId && trengerMannskap) {
        nyDugnad = byggMannskapsDugnad(valgtObjekt.navn, leietaker.trim(), valgtObjekt.type);
        oppdatert.dugnadId = nyDugnad.id;
      }
      await onOppdaterBooking(oppdatert, nyDugnad);
      tomSkjema();
      return;
    }

    const booking = {
      id: nyId(),
      objektId: valgtObjekt.id,
      objekt: valgtObjekt.navn,
      type: valgtObjekt.type,
      dato, datoSlutt: datoSlutt.trim() || "", tid: tid.trim(), tidSlutt: tidSlutt.trim(),
      leietaker: leietaker.trim(), kontakt: kontakt.trim(),
      pris: pris.trim(), notat: notat.trim(),
      fakturaStatus,
      status: "forespurt",
      opprettetAv: bruker.id,
      dugnadId: null,
    };

    let dugnad = null;
    if (trengerMannskap) {
      dugnad = byggMannskapsDugnad(valgtObjekt.navn, leietaker.trim(), valgtObjekt.type);
      booking.dugnadId = dugnad.id;
    }

    await onNyBooking(booking, dugnad);
    tomSkjema();
  }

  // ---- Fakturering ----
  function fakturaTekst(b) {
    const o = objekter.find((x) => x.id === b.objektId);
    const linjer = [
      "FAKTURERINGSGRUNNLAG — UTLEIE",
      "Askøy Kystlag, Dugnadsloggen",
      "",
      `Utleieobjekt: ${o?.navn || b.objekt || "Ukjent"}`,
      `Periode: ${fUtleiePeriode(b)}`,
      `Leietaker: ${b.leietaker}`,
      b.kontakt ? `Kontakt: ${b.kontakt}` : null,
      b.pris ? `Avtalt pris: ${b.pris} kr` : "Avtalt pris: (ikke registrert)",
      b.notat ? `Notat: ${b.notat}` : null,
      "",
      `Markert gjennomført av ${bruker.navn} ${fDato(iDag())}.`,
    ].filter(Boolean);
    return linjer.join("\n");
  }

  async function sendTilKasserer(b) {
    if (!kasserer?.epost) {
      await varsle("Velg en kasserer med registrert e-postadresse i Admin-fanen først (under «Utleieobjekter og kasserer»).");
      return;
    }
    const emne = encodeURIComponent(`Fakturering: utleie ${b.objekt || ""} ${fDato(b.dato)} — ${b.leietaker}`);
    const kropp = encodeURIComponent(fakturaTekst(b));
    const a = document.createElement("a");
    a.href = `mailto:${kasserer.epost}?subject=${emne}&body=${kropp}`;
    a.click();
  }

  async function kopierFakturaInfo(b) {
    const tekst = fakturaTekst(b);
    try {
      await navigator.clipboard.writeText(tekst);
      await varsle("Faktureringsinfo kopiert — lim inn i e-post eller melding til kassereren.");
    } catch (e) {
      await sporsmaal("Kopiering ble blokkert — marker og kopier teksten under:", tekst);
    }
  }

  function BookingKort({ b, erTidligere }) {
    const konflikt = bookinger.some((x) =>
      x.id !== b.id && x.objektId && b.objektId && x.objektId === b.objektId &&
      overlapper(x, b)
    );
    const dugnad = b.dugnadId ? dugnader.find((d) => d.id === b.dugnadId) : null;
    const bekreftet = b.status === "bekreftet";
    const gjennomfoert = b.status === "gjennomfoert";

    return (
      <div style={{ ...kort, borderLeft: `4px solid ${gjennomfoert ? C.hav : erTidligere ? C.sand : bekreftet ? "#4E7E5B" : C.signal}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 16, fontFamily: "Georgia, serif" }}>{objektNavn(b)}</div>
            <div style={{ fontSize: 13, color: C.dempet, marginTop: 3 }}>
              {fUtleiePeriode(b)} · {b.leietaker}
              {b.kontakt ? ` · ${b.kontakt}` : ""}
            </div>
            <div style={{ fontSize: 13, color: C.dempet }}>
              <span style={{ color: gjennomfoert ? C.hav : bekreftet ? "#2F5A3C" : C.signal, fontWeight: 600 }}>
                {gjennomfoert ? "✓ Gjennomført — klar for fakturering" : bekreftet ? "✓ Bekreftet" : "Forespørsel"}
              </span>
              {b.pris ? ` · ${b.pris} kr` : ""}
              {(erAdmin || bruker.id === utleie.kassererId) && (
                <span style={{ marginLeft: 8, fontSize: 11.5, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                  background: b.fakturaStatus === "betalt" ? "#4E7E5B" : b.fakturaStatus === "sendt" ? "#E0A93E" : C.signal,
                  color: "#fff" }}>
                  {b.fakturaStatus === "betalt" ? "✅ Betalt" : b.fakturaStatus === "sendt" ? "📬 Sendt" : "📄 Ikke sendt"}
                </span>
              )}
            </div>
            {b.notat && <div style={{ fontSize: 13, marginTop: 4 }}>{b.notat}</div>}
            {konflikt && (
              <div style={{ fontSize: 12.5, color: C.signal, fontWeight: 600, marginTop: 4 }}>
                ⚠ Obs: dobbeltbooking — samme objekt er booket denne dagen.
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {kanRedigere && !gjennomfoert && (
              <>
                <button style={{ ...sekKnapp, padding: "5px 10px", fontSize: 12 }}
                  onClick={() => startRedigering(b)}>
                  Endre
                </button>
                <button style={{ ...sekKnapp, padding: "5px 10px", fontSize: 12 }}
                  onClick={() => onOppdaterBooking({ ...b, status: bekreftet ? "forespurt" : "bekreftet" })}>
                  {bekreftet ? "Sett som forespørsel" : "Bekreft"}
                </button>
                <button style={{ ...sekKnapp, padding: "5px 10px", fontSize: 12, borderColor: "#4E7E5B", color: "#2F5A3C" }}
                  onClick={() => onOppdaterBooking({ ...b, status: "gjennomfoert" })}>
                  Marker gjennomført
                </button>
              </>
            )}
            {kanRedigere && (
              <button style={{ ...sekKnapp, padding: "5px 10px", fontSize: 12, borderColor: C.signal, color: C.signal }}
                onClick={async () => { if (!(await bekreft(`Slette bookingen for ${b.leietaker || "leietaker"}?`))) return; onSlettBooking(b); }}>
                Slett
              </button>
            )}
          </div>
        </div>

        {kanRedigere && gjennomfoert && (
          <div style={{ marginTop: 10, background: C.kritt, borderRadius: 8, padding: "10px 12px", display: "grid", gap: 8 }}>
            <div style={{ fontSize: 13 }}>
              Send faktureringsgrunnlaget til kassereren{kasserer ? ` (${kasserer.navn})` : ""}:
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button style={{ ...primKnapp, padding: "8px 14px", fontSize: 13 }} onClick={() => sendTilKasserer(b)}>
                📧 Send e-post til kasserer
              </button>
              <button style={{ ...sekKnapp, padding: "8px 14px", fontSize: 13 }} onClick={() => kopierFakturaInfo(b)}>
                Kopier info
              </button>
            </div>
          </div>
        )}

        {dugnad && (
          <div style={{ marginTop: 10, background: C.kritt, borderRadius: 8, padding: "10px 12px", fontSize: 13 }}>
            <span style={{ fontWeight: 700 }}>{b.type === "baat" ? "⚓ Mannskap" : "🤝 Dugnadshjelp"} ({dugnad.paameldte.length} påmeldt{dugnad.paameldte.length === 1 ? "" : "e"}):</span>{" "}
            <span style={{ color: C.dempet }}>
              {dugnad.paameldte.length ? dugnad.paameldte.map((id) => navnFor(id)).join(", ") : "ingen ennå — dugnaden ligger i kalenderen"}
            </span>
          </div>
        )}
        {!dugnad && b.dugnadId && (
          <div style={{ marginTop: 10, fontSize: 12.5, color: C.dempet }}>Den tilknyttede dugnaden er slettet fra kalenderen.</div>
        )}
      </div>
    );
  }

  return (
    <section style={{ display: "grid", gap: 10 }}>
      {feil && <div style={{ background: "#FBEAE8", border: `1px solid ${C.signal}`, color: C.signal, padding: "9px 12px", borderRadius: 6, fontSize: 14 }}>{feil}</div>}

      {/* Toppstripe */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: C.dempet }}>
          {inntektIAar > 0
            ? <>Leieinntekter i {aaret}: <strong style={{ color: C.tjaere }}>{tall(inntektIAar)} kr</strong> (av bookinger med pris)</>
            : `Utleiekalender for lokaler og båter (${objekter.length} objekter).`}
        </span>
        {kanRedigere ? (
          <button onClick={() => setViserInnstillinger(!viserInnstillinger)} style={{ background: "none", border: "none", color: C.hav, textDecoration: "underline", cursor: "pointer", fontSize: 13 }}>
            {viserInnstillinger ? "Lukk innstillinger" : "Objekter og kasserer"}
          </button>
        ) : (
          <span style={{ fontSize: 12, color: C.dempet }}>Objekter og kasserer styres av admin og utleieansvarlige</span>
        )}
      </div>

      {kanRedigere && viserInnstillinger && (
        <div style={{ ...kort, display: "grid", gap: 14 }}>
          <div>
            <h3 style={{ margin: "0 0 8px", fontFamily: "Georgia, serif", fontSize: 16 }}>Utleieobjekter</h3>
            {objekter.length === 0 && <p style={{ color: C.dempet, fontSize: 13, margin: "0 0 8px" }}>Ingen objekter ennå — legg til lokaler og båter under.</p>}
            {objekter.map((o) => (
              <div key={o.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${C.sand}` }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{ikon(o.type)} {o.navn}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={{ ...sekKnapp, padding: "4px 10px", fontSize: 12 }} onClick={async () => {
                    const ny = await sporsmaal(`Nytt navn for «${o.navn}»:`, o.navn);
                    if (!ny || !ny.trim() || ny.trim() === o.navn) return;
                    onLagreUtleie({ ...utleie, objekter: objekter.map((x) => (x.id === o.id ? { ...x, navn: ny.trim() } : x)) });
                  }}>Endre navn</button>
                  <button style={{ ...sekKnapp, padding: "4px 10px", fontSize: 12, borderColor: C.signal, color: C.signal }} onClick={async () => {
                    const harBookinger = bookinger.some((b) => b.objektId === o.id);
                    if (!(await bekreft(`Fjerne «${o.navn}» fra utleielisten?${harBookinger ? " Eksisterende bookinger beholdes med navnet." : ""}`))) return;
                    onLagreUtleie({ ...utleie, objekter: objekter.filter((x) => x.id !== o.id) });
                  }}>Fjern</button>
                </div>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <input style={{ ...input, flex: 2, minWidth: 150 }} value={nyttObjektNavn} onChange={(e) => setNyttObjektNavn(e.target.value)} placeholder="Navn, f.eks. Sjøhuset eller «Havfruen»" />
              <select style={{ ...input, flex: 1, minWidth: 110 }} value={nyttObjektType} onChange={(e) => setNyttObjektType(e.target.value)}>
                <option value="lokale">🏠 Lokale</option>
                <option value="baat">⛵ Båt</option>
              </select>
              <button style={{ ...sekKnapp, padding: "8px 14px" }} onClick={() => {
                const n = nyttObjektNavn.trim();
                if (n.length < 2) return;
                onLagreUtleie({ ...utleie, objekter: [...objekter, { id: nyId(), navn: n, type: nyttObjektType }] });
                setNyttObjektNavn("");
              }}>Legg til</button>
            </div>
          </div>

          <div>
            <h3 style={{ margin: "0 0 4px", fontFamily: "Georgia, serif", fontSize: 16 }}>Utleieansvarlige</h3>
            <p style={{ margin: "0 0 8px", fontSize: 13, color: C.dempet }}>
              Velg én eller flere som skal kunne legge inn og endre utleie, i tillegg til admin.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
              {(utleie.ledere || []).length === 0 && <span style={{ fontSize: 13, color: C.dempet }}>Ingen valgt ennå — bare admin styrer utleie.</span>}
              {(utleie.ledere || []).map((id) => {
                const m = medlemmer.find((x) => x.id === id);
                return (
                  <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.kritt, border: `1px solid ${C.sand}`, borderRadius: 999, padding: "5px 11px", fontSize: 13.5, fontWeight: 600 }}>
                    {m?.navn || "Ukjent"}
                    <button onClick={() => onLagreUtleie({ ...utleie, ledere: (utleie.ledere || []).filter((x) => x !== id) })}
                      aria-label="Fjern" style={{ background: "none", border: "none", color: C.signal, cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
                  </span>
                );
              })}
            </div>
            <select style={input} value="" onChange={(e) => {
              if (!e.target.value) return;
              onLagreUtleie({ ...utleie, ledere: [...(utleie.ledere || []), e.target.value] });
            }}>
              <option value="">+ Legg til utleieansvarlig …</option>
              {[...medlemmer].filter((m) => !(utleie.ledere || []).includes(m.id)).sort((a, b) => a.navn.localeCompare(b.navn, "nb")).map((m) => (
                <option key={m.id} value={m.id}>{m.navn}</option>
              ))}
            </select>
          </div>

          <div>
            <h3 style={{ margin: "0 0 4px", fontFamily: "Georgia, serif", fontSize: 16 }}>Kasserer</h3>
            <p style={{ margin: "0 0 8px", fontSize: 13, color: C.dempet }}>
              Faktureringsgrunnlaget sendes på e-post hit når en utleie markeres gjennomført.
            </p>
            <select style={input} value={utleie.kassererId || ""} onChange={(e) => onLagreUtleie({ ...utleie, kassererId: e.target.value || null })}>
              <option value="">Velg kasserer …</option>
              {[...medlemmer].sort((a, b) => a.navn.localeCompare(b.navn, "nb")).map((m) => (
                <option key={m.id} value={m.id}>{m.navn}{m.epost ? ` (${m.epost})` : " — mangler e-post!"}</option>
              ))}
            </select>
            {kasserer && !kasserer.epost && (
              <p style={{ margin: "6px 0 0", fontSize: 12.5, color: C.signal, fontWeight: 600 }}>
                ⚠ {kasserer.navn} har ikke registrert e-post.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Ny booking */}
      {!kanRedigere && (
        <p style={{ margin: 0, fontSize: 13, color: C.dempet, background: "#fff", border: `1px solid ${C.sand}`, borderRadius: 8, padding: "9px 12px" }}>
          Du kan se utleiekalenderen, men ikke legge inn eller endre. Ta kontakt med en utleieansvarlig ved behov.
        </p>
      )}
      {kanRedigere && !viserSkjema && (
        <button style={{ ...primKnapp, width: "100%" }} onClick={() => {
          setRedigerId(null);
          setDato(iDag()); setDatoSlutt(datoPluss(iDag(), 1)); setTid("12:00"); setTidSlutt("12:00");
          setObjektId(""); setLeietaker(""); setKontakt(""); setPris(""); setNotat(""); setMannskapNotat("");
          setViserSkjema(true);
        }}>+ Ny utleie</button>
      )}
      {kanRedigere && viserSkjema && (
        <div style={{ ...kort, display: "grid", gap: 12 }}>
          <div>
            <label style={etikett}>Hva leies ut?</label>
            <select style={input} value={objektId} onChange={(e) => {
              setObjektId(e.target.value);
              const o = objekter.find((x) => x.id === e.target.value);
              if (!redigerId) setTrengerMannskap(o?.type === "baat");
            }}>
              <option value="">Velg lokale eller båt …</option>
              {objekter.map((o) => <option key={o.id} value={o.id}>{ikon(o.type)} {o.navn}</option>)}
            </select>
            {objekter.length === 0 && <p style={{ margin: "6px 0 0", fontSize: 12.5, color: C.signal }}>Legg først til utleieobjekter i Admin-fanen.</p>}
          </div>

          {valgtObjekt && !(redigerId && bookinger.find((b) => b.id === redigerId)?.dugnadId) && (
            <>
              <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, cursor: "pointer" }}>
                <input type="checkbox" checked={trengerMannskap} onChange={(e) => setTrengerMannskap(e.target.checked)} style={{ width: 18, height: 18 }} />
                {valgtObjekt.type === "baat"
                  ? "Trenger mannskap — opprett dugnad i kalenderen for påmelding"
                  : "Trenger dugnadshjelp (rigging, vertskap, rydding) — opprett dugnad for påmelding"}
              </label>
              {trengerMannskap && (
                <div>
                  <label style={etikett}>Melding til de som melder seg (valgfritt)</label>
                  <input style={input} value={mannskapNotat} onChange={(e) => setMannskapNotat(e.target.value)} placeholder={valgtObjekt.type === "baat" ? "f.eks. Trenger 3 stk., oppmøte ved naustet kl. 09." : "f.eks. Trenger 2 til rigging fredag og 2 til rydding søndag."} />
                </div>
              )}
            </>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={etikett}>Fra dato</label>
              <input type="date" style={input} value={dato} onChange={(e) => {
                const ny = e.target.value;
                setDato(ny);
                if (ny) setDatoSlutt(datoPluss(ny, 1));
              }} />
            </div>
            <div>
              <label style={etikett}>Til dato (valgfritt)</label>
              <input type="date" style={input} value={datoSlutt} min={dato || undefined} onChange={(e) => setDatoSlutt(e.target.value)} />
            </div>
          </div>
          {avtalerSammeDag.length > 0 && (
            <div style={{ background: "#FFF6E9", border: "1px solid #E0A93E", borderRadius: 8, padding: "10px 12px", fontSize: 13 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>📅 Allerede avtalt på {valgtObjekt?.navn} i denne perioden:</div>
              {avtalerSammeDag.map((b) => (
                <div key={b.id} style={{ color: C.tjaere, padding: "2px 0" }}>• {avtaleLinje(b)}</div>
              ))}
              <div style={{ color: C.dempet, marginTop: 4 }}>Velg tider/datoer som går klar av disse — appen varsler hvis de kolliderer.</div>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={etikett}>Fra kl.{datoSlutt && datoSlutt !== dato ? " (startdag)" : ""}</label>
              <TidVelger value={tid} onChange={setTid} style={input} />
            </div>
            <div>
              <label style={etikett}>Til kl.{datoSlutt && datoSlutt !== dato ? " (sluttdag)" : " (valgfritt)"}</label>
              <TidVelger value={tidSlutt} onChange={setTidSlutt} style={input} />
            </div>
          </div>
          <div>
            <label style={etikett}>Hvem leier?</label>
            <input style={input} value={leietaker} onChange={(e) => setLeietaker(e.target.value)} placeholder="Navn på person eller firma" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 10 }}>
            <div>
              <label style={etikett}>Kontakt (valgfritt)</label>
              <input style={input} value={kontakt} onChange={(e) => setKontakt(e.target.value)} placeholder="Telefon eller e-post" />
            </div>
            <div>
              <label style={etikett}>Pris kr (valgfritt)</label>
              <input style={input} type="text" inputMode="decimal" value={pris} onChange={(e) => setPris(e.target.value)} placeholder="f.eks. 2500" />
            </div>
          </div>
          {(erAdmin || bruker.id === utleie.kassererId) && (
            <div>
              <label style={etikett}>Fakturastatus</label>
              <select style={input} value={fakturaStatus} onChange={(e) => setFakturaStatus(e.target.value)}>
                <option value="ikke-sendt">📄 Ikke sendt</option>
                <option value="sendt">📬 Sendt</option>
                <option value="betalt">✅ Betalt</option>
              </select>
            </div>
          )}
          <div>
            <label style={etikett}>Notat (valgfritt)</label>
            <input style={input} value={notat} onChange={(e) => setNotat(e.target.value)} placeholder="f.eks. Nøkkel hentes hos formannen" />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button style={{ ...primKnapp, flex: 1 }} onClick={opprett}>{redigerId ? "Lagre endringer" : "Lagre utleie"}</button>
            <button style={{ background: "none", border: `1px solid ${C.sand}`, borderRadius: 6, padding: "10px 16px", cursor: "pointer", color: C.dempet }} onClick={tomSkjema}>Avbryt</button>
          </div>
          {redigerId && bookinger.find((b) => b.id === redigerId)?.dugnadId && (
            <p style={{ margin: 0, fontSize: 12, color: C.dempet }}>
              Dato og tid oppdateres automatisk på den tilknyttede dugnaden i kalenderen.
            </p>
          )}
          {!redigerId && (
            <p style={{ margin: 0, fontSize: 12, color: C.dempet }}>
              Nye bookinger starter som «forespørsel». Når utleien er over: «Marker gjennomført» → send faktureringsgrunnlag til kassereren.
            </p>
          )}
        </div>
      )}

      {kommende.length === 0 && tidligere.length === 0 && (
        <p style={{ color: C.dempet, textAlign: "center", padding: 18 }}>Ingen utleie registrert ennå.</p>
      )}
      {redigerId && viserSkjema && (
        <p style={{ margin: 0, fontSize: 12.5, color: C.dempet, textAlign: "center" }}>Du redigerer en eksisterende booking — lagre eller avbryt i skjemaet over.</p>
      )}
      {kommende.map((b) => <BookingKort key={b.id} b={b} erTidligere={false} />)}

      {tidligere.length > 0 && (
        <>
          <button onClick={() => setViserTidligere(!viserTidligere)}
            style={{ background: "none", border: "none", color: C.hav, cursor: "pointer", fontSize: 14, textDecoration: "underline", padding: 6 }}>
            {viserTidligere ? "Skjul tidligere utleie" : `Vis tidligere utleie (${tidligere.length})`}
          </button>
          {viserTidligere && tidligere.map((b) => <BookingKort key={b.id} b={b} erTidligere={true} />)}
        </>
      )}
    </section>
  );
}
