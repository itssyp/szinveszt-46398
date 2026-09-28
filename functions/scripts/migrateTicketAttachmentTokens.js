const admin = require('firebase-admin')
const { randomUUID } = require('node:crypto')

const args = process.argv.slice(2)
const valueAfter = (flag) => {
  const index = args.indexOf(flag)
  return index < 0 ? '' : args[index + 1] || ''
}
const projectId = valueAfter('--project')
const bucketName = valueAfter('--bucket')
const apply = args.includes('--apply')

if (!projectId || !bucketName || (apply && !args.includes('--backup-confirmed'))) {
  console.error('Usage: node scripts/migrateTicketAttachmentTokens.js --project PROJECT_ID --bucket BUCKET [--apply --backup-confirmed]')
  process.exit(1)
}

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId, storageBucket: bucketName })

async function main() {
  const tickets = await admin.firestore().collection('tickets').get()
  const paths = new Set()
  const changes = []
  let missingPath = 0

  for (const ticket of tickets.docs) {
    const attachments = ticket.get('attachments')
    if (!Array.isArray(attachments)) continue
    let changed = false
    const cleaned = attachments.map((attachment) => {
      if (!attachment?.url) return attachment
      if (!attachment.storagePath?.startsWith(`tickets/${ticket.id}/`)) {
        missingPath += 1
        return attachment
      }
      paths.add(attachment.storagePath)
      changed = true
      const { url: _url, ...withoutPublicUrl } = attachment
      return withoutPublicUrl
    })
    if (changed) changes.push({ ref: ticket.ref, attachments: cleaned })
  }

  console.log(`Tickets to update: ${changes.length}; download tokens to rotate: ${paths.size}; attachments without a safe path: ${missingPath}`)
  if (!apply) {
    console.log('Dry run only. Back up Firestore and confirm the bucket before using --apply --backup-confirmed.')
    return
  }

  const bucket = admin.storage().bucket(bucketName)
  for (const path of paths) {
    const file = bucket.file(path)
    const [metadata] = await file.getMetadata()
    await file.setMetadata({
      metadata: { ...metadata.metadata, firebaseStorageDownloadTokens: randomUUID() },
    })
  }
  for (const change of changes) {
    await change.ref.update({ attachments: change.attachments })
  }
  console.log('Legacy URLs removed from ticket documents and old download tokens invalidated.')
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
