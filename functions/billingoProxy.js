const express = require('express')
const axios = require('axios')

const BILLINGO_KEY = process.env.BILLINGO_KEY
const BILLINGO_BASE_URL = 'https://api.billingo.hu/v3'

const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || process.env.FIREBASE_PROJECT_ID
function allowedOriginsForProject(projectId) {
  return [
    ...(projectId ? [`https://${projectId}.web.app`, `https://${projectId}.firebaseapp.com`] : []),
    'http://localhost:5173',
    'http://localhost:4173',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:4173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
  ]
}
const ALLOWED_ORIGINS = allowedOriginsForProject(PROJECT_ID)

function buildBillingoApp(requireFirebaseAuthOrAppCheck, { apiKey = BILLINGO_KEY, request = axios } = {}) {
  const app = express()

  app.use((req, res, next) => {
    const origin = req.headers.origin
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      res.set('Access-Control-Allow-Origin', origin)
    }
    res.set('Access-Control-Allow-Methods', 'GET,OPTIONS')
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Firebase-AppCheck')
    res.set('Vary', 'Origin')
    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }
    next()
  })
  app.use(requireFirebaseAuthOrAppCheck)

  // Optional logging
  app.use((req, _res, next) => {
    console.log('[proxy]', req.method, req.originalUrl, 'path=', req.path, 'query=', req.query)
    next()
  })

  app.get('*', async (req, res) => {
    if (!apiKey) {
      res.status(500).send('Missing Billingo key (BILLINGO_KEY).')
      return
    }

    const targetPath = (req.path || '').replace(/^\/+/, '')
    if (!/^documents(?:\/\d+(?:\/payments)?)?$/.test(targetPath)) {
      res.status(404).json({ error: 'Unsupported Billingo path' })
      return
    }

    const url = `${BILLINGO_BASE_URL}/${targetPath}`
    console.log('[proxy] -> GET', url)

    try {
      const response = await request({
        method: 'GET',
        url,
        headers: {
          'X-API-KEY': apiKey,
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; Firebase-Cloud-Functions/1.0)',
        },
        params: req.query,
        validateStatus: () => true,
      })

      res.status(response.status).send(response.data)
    } catch (err) {
      console.error('Error proxying to Billingo:', err.message)
      const status = err.response?.status || 500
      res.status(status).send(err.response?.data || err.message || 'Billingo hiba')
    }
  })

  app.all('*', (_req, res) => res.status(405).json({ error: 'Method not allowed' }))

  return app
}

module.exports = { buildBillingoApp, ALLOWED_ORIGINS, allowedOriginsForProject }
