import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Unique per build. Baked into the bundle and written to /version.json so open
// tabs can notice a new deploy and reload (see src/version.ts).
const BUILD_VERSION = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

function versionFile(): Plugin {
  return {
    name: "chronosnap-version-file",
    apply: "build",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ version: BUILD_VERSION }) });
    },
  };
}

export default defineConfig({
  plugins: [react(), versionFile()],
  define: { __APP_VERSION__: JSON.stringify(BUILD_VERSION) },
  server: { host: true, port: 5173 },
});
