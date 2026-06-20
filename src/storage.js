import { supabase } from "./supabase.js";

// Lagringslag: samme API som window.storage, men bruker Supabase.
// Alt lagres i tabellen "lagring" (nokkel/verdi).

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
    // onConflict: "nokkel" sørger for at upsert alltid virker
    const { error } = await supabase
      .from("lagring")
      .upsert({ nokkel: key, verdi: value }, { onConflict: "nokkel" });
    if (error) throw error;
    return { key, value, shared: true };
  },

  async delete(key) {
    const { error } = await supabase
      .from("lagring")
      .delete()
      .eq("nokkel", key);
    if (error) throw error;
    return { key, deleted: true, shared: true };
  },

  async list(prefix = "") {
    let q = supabase.from("lagring").select("nokkel");
    if (prefix) q = q.like("nokkel", `${prefix}%`);
    const { data, error } = await q;
    if (error) throw error;
    return {
      keys: (data || []).map((r) => ({ key: r.nokkel })),
      prefix,
      shared: true,
    };
  },
};
