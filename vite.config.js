import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// VIKTIG: Bytt ut "dugnadsloggen" under med navnet på GitHub-repoet ditt.
// Eksempel: heter repoet "kystlag-app", skal det stå base: "/kystlag-app/"
export default defineConfig({
  plugins: [react()],
  base: "/dugnadsloggen/",
});
