import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiKey = env.VITE_BILLINGO_API_KEY

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
