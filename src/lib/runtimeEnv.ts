// Runtime resolution of the public (VITE_*) configuration.
//
// Vite normally inlines `import.meta.env.VITE_*` at BUILD time. In container
// platforms (e.g. Dokploy) the build often runs without those values as build
// args, which would bake in `undefined` and crash the server on boot. To stay
// robust we resolve config at RUNTIME instead:
//   - server (Node/Nitro): read from `process.env`
//   - browser: read from `window.__ENV__`, injected into the SSR HTML by the
//     root document (see src/routes/__root.tsx)
// Build-time inlined values are still preferred when present, so nothing breaks
// if the build args ARE supplied.
//
// Only PUBLIC values live here. Never put SUPABASE_SERVICE_ROLE_KEY, ADMIN_PASSWORD,
// or any secret in this file — everything here is shipped to the browser.

export interface PublicRuntimeEnv {
  VITE_SUPABASE_URL: string
  VITE_SUPABASE_ANON_KEY: string
  VITE_ADMIN_PIN: string
}

declare global {
  interface Window {
    __ENV__?: PublicRuntimeEnv
  }
}

const EMPTY: PublicRuntimeEnv = {
  VITE_SUPABASE_URL: '',
  VITE_SUPABASE_ANON_KEY: '',
  VITE_ADMIN_PIN: '',
}

function resolve(key: keyof PublicRuntimeEnv): string {
  // 1) Build-time inlined value (static access so Vite can replace it).
  const inlined =
    key === 'VITE_SUPABASE_URL'
      ? import.meta.env.VITE_SUPABASE_URL
      : key === 'VITE_SUPABASE_ANON_KEY'
        ? import.meta.env.VITE_SUPABASE_ANON_KEY
        : import.meta.env.VITE_ADMIN_PIN
  if (inlined) return inlined as string

  // 2) Browser: value injected by the SSR document.
  if (typeof window !== 'undefined') return window.__ENV__?.[key] ?? ''

  // 3) Server: runtime process.env.
  return process.env[key] ?? ''
}

/** Public config resolved once at module load from the best available source. */
export const PUBLIC_ENV: PublicRuntimeEnv = {
  VITE_SUPABASE_URL: resolve('VITE_SUPABASE_URL'),
  VITE_SUPABASE_ANON_KEY: resolve('VITE_SUPABASE_ANON_KEY'),
  VITE_ADMIN_PIN: resolve('VITE_ADMIN_PIN'),
}

/**
 * Server-only: build the inline `<script>` body that publishes the public env to
 * the browser as `window.__ENV__`. `<` is escaped to prevent `</script>` breakout.
 */
export function getPublicEnvScript(): string {
  const env: PublicRuntimeEnv =
    typeof window === 'undefined'
      ? {
          VITE_SUPABASE_URL:
            process.env.VITE_SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL ?? '',
          VITE_SUPABASE_ANON_KEY:
            process.env.VITE_SUPABASE_ANON_KEY ??
            import.meta.env.VITE_SUPABASE_ANON_KEY ??
            '',
          VITE_ADMIN_PIN:
            process.env.VITE_ADMIN_PIN ?? import.meta.env.VITE_ADMIN_PIN ?? '',
        }
      : (window.__ENV__ ?? EMPTY)
  return `window.__ENV__=${JSON.stringify(env).replace(/</g, '\\u003c')}`
}
