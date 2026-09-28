import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiKey = env.VITE_BILLINGO_API_KEY

  if (mode === 'staging' && env.VITE_FIREBASE_PROJECT_ID !== 'szinveszt-staging') {
    throw new Error('Staging mode must use the szinveszt-staging Firebase project')
  }
  if (mode === 'staging' && [
    'VITE_BILLINGO_API_KEY',
    'VITE_BILLINGO_BASE_URL',
    'VITE_NAV_PROXY_BASE_URL',
    'VITE_EVNY_LOOKUP_URL',
  ].some((key) => env[key])) {
    throw new Error('Staging mode cannot inherit integration keys or endpoint overrides')
  }

  return {
    server: {
      proxy: {
        // Proxy Billingo to avoid browser CORS and keep API key on the server side during dev.
        '/billingo': {
          target: 'https://api.billingo.hu',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/billingo/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (apiKey) {
                proxyReq.setHeader('X-API-KEY', apiKey)
              }
            })
          },
        },
      },
    },
  }
})
