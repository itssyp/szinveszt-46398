import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs } from 'firebase/firestore'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

function readEnvFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8')
  const env = {}

  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) return
    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    env[key] = value
  })

  return env
}

function normalize(value) {
  return String(value || '').trim()
}

function bumpCount(map, key) {
  if (!key) return
  map.set(key, (map.get(key) || 0) + 1)
}

function sortCounts(map) {
  return [...map.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1]
      return a[0].localeCompare(b[0], 'hu')
    })
    .map(([value, count]) => ({ value, count }))
}

function summarizeUsers(users) {
  return users
    .map((user) => ({
      id: user.id,
      username: normalize(user.username),
      email: normalize(user.email),
      themeColor: normalize(user.themeColor),
    }))
    .sort((a, b) =>
      (a.username || a.email || a.id).localeCompare(b.username || b.email || b.id, 'hu')
    )
}

function summarizeClients(clients) {
  const workTypes = new Map()
  const assignees = new Map()
  const szjaAssignees = new Map()
  const sharedIpa = new Map()

  let szjaCount = 0
  let highPriorityCount = 0
  let manualExceptionCount = 0

  clients.forEach((client) => {
    const workType = normalize(client.munkavegzesJellege)
    const assignee = normalize(client.hozzarendeltSzemely)
    const ipa = normalize(client.ipa)
    const szja = client.szja2025 || {}
    const szjaAssignee = normalize(szja.assignedTo)

    bumpCount(workTypes, workType)
    bumpCount(assignees, assignee)
    bumpCount(sharedIpa, ipa)

    if (Object.keys(szja).length) {
      szjaCount += 1
      bumpCount(szjaAssignees, szjaAssignee)
      if (szja.highPriority) highPriorityCount += 1
      if (szja.manualException) manualExceptionCount += 1
    }
  })

  return {
    totalClients: clients.length,
    clientsWithSzja: szjaCount,
    highPriorityCount,
    manualExceptionCount,
    workTypes: sortCounts(workTypes),
    clientAssignees: sortCounts(assignees),
    szjaAssignees: sortCounts(szjaAssignees),
    ipaValues: sortCounts(sharedIpa),
  }
}

async function main() {
  const envPath = path.join(repoRoot, '.env')
  const env = readEnvFile(envPath)

  const firebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  }

  const app = initializeApp(firebaseConfig)
  const db = getFirestore(app)

  const [usersSnap, clientsSnap] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'clients')),
  ])

  const users = usersSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
  const clients = clientsSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))

  const output = {
    projectId: firebaseConfig.projectId,
    readOnly: true,
    users: summarizeUsers(users),
    clientSummary: summarizeClients(clients),
  }

  console.log(JSON.stringify(output, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
