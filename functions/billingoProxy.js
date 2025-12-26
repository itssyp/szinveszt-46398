const express = require('express')
const axios = require('axios')
const cors = require('cors')
const admin = require('firebase-admin')

const BILLINGO_KEY = process.env.BILLINGO_KEY
const BILLINGO_BASE_URL = 'https://api.billingo.hu/v3'

const ALLOWED_ORIGINS = [
  'https://szinveszt-46398.web.app',
  'http://localhost:5173',
  'http://localhost:4173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4173',
  'http://127.0.0.1:3000',
]

function buildBillingoApp(requireFirebaseAuthOrAppCheck) {
  const app = express()

  app.use((req, res, next) => {
    const origin = req.headers.origin
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      res.set('Access-Control-Allow-Origin', origin)
    } else {
      res.set('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0])
    }
    res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Firebase-AppCheck')
    res.set('Vary', 'Origin')
    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }
    next()
  })
  app.use(cors({ origin: ALLOWED_ORIGINS }))
  app.options('*', cors({ origin: ALLOWED_ORIGINS }))
  app.use(express.json())
  app.use(requireFirebaseAuthOrAppCheck)

  // Optional logging
  app.use((req, _res, next) => {
    console.log('[proxy]', req.method, req.originalUrl, 'path=', req.path, 'query=', req.query)
    next()
  })

  app.all('*', async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }

    if (!BILLINGO_KEY) {
      res.status(500).send('Missing Billingo key (BILLINGO_KEY).')
      return
    }

    const targetPath = (req.path || '').replace(/^\/+/, '')
    if (!targetPath) {
      res.status(400).send('Missing Billingo path (e.g., partners or documents).')
      return
    }

    const method = (req.method || 'GET').toUpperCase()
    const hasBody = !['GET', 'HEAD'].includes(method)

    const url = `${BILLINGO_BASE_URL}/${targetPath}`
    console.log('[proxy] ->', method, url)

    try {
      const response = await axios({
        method,
        url,
        headers: {
          'X-API-KEY': BILLINGO_KEY,
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; Firebase-Cloud-Functions/1.0)',
        },
        params: req.query,
        ...(hasBody ? { data: req.body } : {}),
        validateStatus: () => true,
      })

      res.status(response.status).send(response.data)
    } catch (err) {
      console.error('Error proxying to Billingo:', err.message)
      const status = err.response?.status || 500
      res.status(status).send(err.response?.data || err.message || 'Billingo hiba')
    }
  })

  return app
}

module.exports = { buildBillingoApp, ALLOWED_ORIGINS }
