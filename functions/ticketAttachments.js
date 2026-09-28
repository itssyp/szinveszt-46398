const express = require('express')
const { admin } = require('./utils')
const { ALLOWED_ORIGINS } = require('./billingoProxy')

function buildTicketAttachmentApp(requireStaffAuth, {
  readFile = async (path) => {
    const bucketName = process.env.STORAGE_BUCKET || admin.app().options.storageBucket
    if (!bucketName) throw new Error('Storage bucket is not configured')
    const file = admin.storage().bucket(bucketName).file(path)
    const [[metadata], [bytes]] = await Promise.all([file.getMetadata(), file.download()])
    return { bytes, contentType: metadata.contentType }
  },
} = {}) {
  const app = express()
  app.use((req, res, next) => {
    const origin = req.headers.origin
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      res.set('Access-Control-Allow-Origin', origin)
    }
    res.set('Access-Control-Allow-Methods', 'GET,OPTIONS')
    res.set('Access-Control-Allow-Headers', 'Authorization')
    res.set('Vary', 'Origin')
    if (req.method === 'OPTIONS') return res.status(204).end()
    next()
  })
  app.use(requireStaffAuth)
  app.get('/', async (req, res) => {
    const path = req.query.path
    if (typeof path !== 'string' || !/^tickets\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/.test(path)) {
      return res.status(400).json({ error: 'Invalid attachment path' })
    }
    try {
      const { bytes, contentType } = await readFile(path)
      res.set('Content-Type', contentType || 'application/octet-stream')
      res.set('Cache-Control', 'private, no-store')
      return res.status(200).send(bytes)
    } catch (error) {
      console.error('Ticket attachment download failed:', error.message)
      return res.status(error.code === 404 ? 404 : 500).json({ error: 'Attachment unavailable' })
    }
  })
  app.all('*', (_req, res) => res.status(405).json({ error: 'Method not allowed' }))
  return app
}

module.exports = { buildTicketAttachmentApp }
