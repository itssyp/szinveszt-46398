const admin = require('firebase-admin')

const projectId = process.argv[2]
if (!projectId) {
  console.error('Usage: node scripts/listStaff.js PROJECT_ID')
  process.exit(1)
}

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId })

async function main() {
  let pageToken
  do {
    const result = await admin.auth().listUsers(1000, pageToken)
    for (const user of result.users) {
      console.log(JSON.stringify({ uid: user.uid, email: user.email || null, staff: user.customClaims?.staff === true, role: user.customClaims?.role || null }))
    }
    pageToken = result.pageToken
  } while (pageToken)
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
