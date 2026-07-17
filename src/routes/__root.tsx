import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import appCss from '../styles.css?url'
import { AuthProvider } from '../components/AuthProvider'
import { AuthGate } from '../components/AuthGate'
import { getPublicEnvScript } from '../lib/runtimeEnv'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Quest Laguna Directory',
      },
      {
        name: 'description',
        content:
          'Church directory and member management system for Quest Laguna',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
      {
        rel: 'icon',
        href: '/questlogo.ico',
        type: 'image/x-icon',
      },
    ],
  }),

  component: RootComponent,
})

function RootComponent() {
  return (
    <html lang="en">
      <head>
        {/* Publish public runtime config to the browser BEFORE the app bundle
            runs, so Supabase config works even when VITE_* were not baked in at
            build time (e.g. Dokploy runtime-only env). See src/lib/runtimeEnv.ts. */}
        <script dangerouslySetInnerHTML={{ __html: getPublicEnvScript() }} />
        <HeadContent />
      </head>
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <AuthProvider>
          <AuthGate>
            <Outlet />
          </AuthGate>
        </AuthProvider>
        {process.env.NODE_ENV === 'development' && (
          <TanStackDevtools
            config={{
              position: 'bottom-right',
            }}
            plugins={[
              {
                name: 'Tanstack Router',
                render: <TanStackRouterDevtoolsPanel />,
              },
            ]}
          />
        )}
        <Scripts />
      </body>
    </html>
  )
}
