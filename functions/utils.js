const admin = require('firebase-admin')

if (!admin.apps.length) {
  admin.initializeApp()
}

function requireFirebaseAuthOrAppCheckFactory() {
  return async function requireFirebaseAuthOrAppCheck(req, res, next) {
    const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true'
    const allowUnauthenticated = isEmulator

    try {
      const authHeader = req.headers.authorization || ''
      const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
      const appCheckToken = req.headers['x-firebase-appcheck'] || null

      let decodedIdToken = null
      let decodedAppCheck = null

      if (idToken) {
        decodedIdToken = await admin.auth().verifyIdToken(idToken)
      }

      if (appCheckToken) {
        decodedAppCheck = await admin.appCheck().verifyToken(appCheckToken)
      }

      if (!decodedIdToken && !decodedAppCheck) {
        if (allowUnauthenticated) {
          return next()
        }
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      req.user = decodedIdToken || null
      req.appCheck = decodedAppCheck || null
      next()
    } catch (err) {
      console.error('Auth/App Check failed:', err.message)
      res.status(401).json({ error: 'Unauthorized' })
    }
  }
}

module.exports = {
  admin,
  requireFirebaseAuthOrAppCheckFactory,
}
