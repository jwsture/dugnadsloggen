import { supabase } from "./supabase.js";

// Dette laget gir samme API som den gamle window.storage (get/set/delete/list),
// men lagrer alt i Supabase-tabellen "lagring" (nøkkel/verdi).
// Bilder lagres som tekst (base64) i samme tabell — enkelt og pålitelig.
// Tabellen tåler store tekstverdier, og appen komprimerer bildene før lagring.

export const storage = {
  async get(key) {
    const { data, error } = await supabase
      .from("lagring")
      .select("verdi")
      .eq("nokkel", key)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("ikke funnet");
    return { key, value: data.verdi, shared: true };
  },

  async set(key, value) {
    const { error } = await supabase.from("lagring").upsert({ nokkel: key, verdi: value });
    if (error) throw error;
    return { key, value, shared: true };
  },

  async delete(key) {
    const { error } = await supabase.from("lagring").delete().eq("nokkel", key);
    if (error) throw error;
    return { key, deleted: true, shared: true };
  },

  async list(prefix = "") {
    let q = supabase.from("lagring").select("nokkel");
    if (prefix) q = q.like("nokkel", `${prefix}%`);
    const { data, error } = await q;
    if (error) throw error;
    return { keys: (data || []).map((r) => ({ key: r.nokkel })), prefix, shared: true };
  },
};
