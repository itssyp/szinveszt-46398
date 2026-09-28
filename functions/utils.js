const admin = require('firebase-admin')

if (!admin.apps.length) {
  admin.initializeApp()
}

function requireFirebaseAuthOrAppCheckFactory({
  verifyIdToken = (token) => admin.auth().verifyIdToken(token),
  verifyAppCheckToken = (token) => admin.appCheck().verifyToken(token),
} = {}) {
  return async function requireStaffAuth(req, res, next) {
    try {
      const authHeader = req.headers.authorization || ''
      const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
      const appCheckToken = req.headers['x-firebase-appcheck'] || null

      if (!idToken) {
        res.status(401).json({ error: 'Authentication required' })
        return
      }
      const decodedIdToken = await verifyIdToken(idToken)
      if (decodedIdToken.staff !== true) {
        res.status(403).json({ error: 'Staff access required' })
        return
      }
      let decodedAppCheck = null
      if (appCheckToken) {
        decodedAppCheck = await verifyAppCheckToken(appCheckToken)
      }
      req.user = decodedIdToken
      req.appCheck = decodedAppCheck
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
