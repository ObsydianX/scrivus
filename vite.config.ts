import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import license from 'rollup-plugin-license'

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// The tabler CSS declares woff2 + woff + ttf fallbacks; the webview always
// picks woff2, so dropping the fallbacks keeps ~3.4 MB of fonts out of the bundle.
const tablerWoff2Only = {
  name: "tabler-woff2-only",
  enforce: "pre" as const,
  transform(code: string, id: string) {
    if (!id.includes("tabler-icons") || !id.endsWith(".css")) return null
    return code.replace(
      /src:url\("([^"]*\.woff2[^"]*)"\) format\("woff2"\)[^;}]*/,
      'src:url("$1") format("woff2")',
    )
  },
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [
    tablerWoff2Only,
    react(),
    license({
      thirdParty: {
        output: {
          file: 'dist/THIRD_PARTY_LICENSES.txt',
        },
      },
    }),
  ],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
