import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

const config = defineConfig({
  // Recharts (and its dep decimal.js-light) expose a CJS `main` whose file Nitro does
  // not copy when externalizing for SSR, causing ERR_MODULE_NOT_FOUND for
  // 'decimal.js-light/decimal' at runtime when the dashboard charts are server-rendered.
  // Bundling them into the server build resolves the import at build time.
  ssr: {
    noExternal: ['recharts', 'decimal.js-light'],
  },
  plugins: [
    devtools(),
    nitro(),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
