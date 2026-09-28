const admin = require('firebase-admin')

const args = process.argv.slice(2)
const projectIndex = args.indexOf('--project')
const uidsIndex = args.indexOf('--uids')
const projectId = projectIndex >= 0 ? args[projectIndex + 1] : ''
const uids = uidsIndex >= 0 ? args[uidsIndex + 1]?.split(',').map((uid) => uid.trim()).filter(Boolean) : []
const adminIndex = args.indexOf('--admin-uid')
const adminUid = adminIndex >= 0 ? args[adminIndex + 1] : ''
const apply = args.includes('--apply')

if (!projectId || !uids.length || !/^[a-z0-9-]+$/.test(projectId) || !adminUid || !uids.includes(adminUid)) {
  console.error('Usage: node scripts/bootstrapStaff.js --project PROJECT_ID --uids UID[,UID...] --admin-uid UID [--apply]')
  process.exit(1)
}

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId })

async function main() {
  const users = await Promise.all(uids.map((uid) => admin.auth().getUser(uid)))
  for (const user of users) {
    const role = user.uid === adminUid ? 'admin' : 'staff'
    console.log(`${apply ? 'Granting' : 'Would grant'} ${role}: ${user.email || '(no email)'} (${user.uid})`)
    if (apply) {
      await admin.auth().setCustomUserClaims(user.uid, { ...user.customClaims, staff: true, role })
    }
  }
  if (!apply) console.log('Dry run only. Re-run with --apply after reviewing every user.')
  else console.log('Users must refresh their ID token or sign in again before restricted rules take effect.')
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
