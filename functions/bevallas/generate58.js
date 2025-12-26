const { HttpsError } = require('firebase-functions/v2/https')
const { admin } = require('../utils')
const { parsePeriod } = require('./period')
const { getForm } = require('./forms')
const { buildZip } = require('./zip')

function serverTimestamp() {
  const fv = admin.firestore && admin.firestore.FieldValue
  if (fv && typeof fv.serverTimestamp === 'function') return fv.serverTimestamp()
  if (admin.firestore && admin.firestore.Timestamp && typeof admin.firestore.Timestamp.now === 'function') {
    return admin.firestore.Timestamp.now()
  }
  return new Date()
}

function normalizeString(value) {
  return (value || '').toString().trim()
}

function sanitizeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_')
}

async function generateBevallas58({ period, clientIds, auth }) {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'Authentication required.')
  if (!period) throw new HttpsError('invalid-argument', 'Period is required.')
  if (!Array.isArray(clientIds) || !clientIds.length) {
    throw new HttpsError('invalid-argument', 'At least one clientId is required.')
  }

  const form = getForm('58')
  if (!form) throw new HttpsError('failed-precondition', 'Form 58 is not configured.')

  let parsedPeriod
  try {
    parsedPeriod = parsePeriod(period)
  } catch (err) {
    throw new HttpsError('invalid-argument', err.message || 'Invalid period.')
  }

  const db = admin.firestore()
  const jobRef = db.collection('bevallasJobs').doc()
  const jobData = {
    formCode: '58',
    period,
    clientIds,
    status: 'running',
    createdAt: serverTimestamp(),
    createdBy: {
      uid: auth.uid,
      email: auth.token?.email || null,
    },
    results: [],
    successCount: 0,
    failCount: 0,
    storagePath: null,
    downloadUrl: null,
  }

  await jobRef.set(jobData)

  const zipFiles = []
  const results = []

  for (const clientId of clientIds) {
    const result = { clientId, status: 'failed', messages: [] }
    try {
      const clientSnap = await db.collection('clients').doc(clientId).get()
      if (!clientSnap.exists) {
        result.messages.push('Ügyfél nem található.')
        results.push(result)
        continue
      }
      const client = { id: clientId, ...clientSnap.data() }
      result.clientName = normalizeString(client.nev || client.name || '')
      result.taxNumber = normalizeString(client.adoszam || client.taxNumber || '')

      const clientValidation = form.validateClient(client)
      if (!clientValidation.ok) {
        result.messages.push(...clientValidation.messages)
        results.push(result)
        continue
      }

      const incomesSnap = await db
        .collection(`clients/${clientId}/incomes`)
        .where('date', '>=', parsedPeriod.start)
        .where('date', '<', parsedPeriod.end)
        .get()

      let incomes = incomesSnap.docs.map((docSnap) => {
        const data = docSnap.data()
        return {
          id: docSnap.id,
          amount: Number(data.amount || 0),
          currency: data.currency || 'HUF',
          date: data.date?.toDate ? data.date.toDate().toISOString().slice(0, 10) : data.date || '',
          rawDate: data.date,
        }
      })

      // Fallback: use monthlyIncomes array if no subcollection data exists.
      if (!incomes.length && Array.isArray(client.monthlyIncomes)) {
        incomes = client.monthlyIncomes
          .filter((inc) => inc?.month === period)
          .map((inc) => ({
            amount: Number(inc.amount || 0),
            currency: 'HUF',
            date: `${period}-01`,
          }))
      }

      const incomeValidation = form.validateIncomes(incomes)
      if (!incomeValidation.ok) {
        result.messages.push(...incomeValidation.messages)
        results.push(result)
        continue
      }

      const aggregates = form.computeAggregates(incomes)
      const xml = form.buildXml({
        client,
        period,
        aggregates,
        incomes,
      })
      console.log('[bevallas58][xml]', {
        clientId,
        tax: result.taxNumber || client.adoszam || '',
        period,
        bytes: Buffer.byteLength(xml, 'utf8'),
      })
      const filename = sanitizeFileName(`${result.taxNumber || clientId}_${result.clientName || 'client'}_58_${period}.xml`)
      zipFiles.push({ name: filename, content: xml })
      result.status = 'ok'
      result.messages.push('XML generálva.')
      results.push(result)
    } catch (err) {
      result.messages.push(err.message || 'Ismeretlen hiba.')
      results.push(result)
    }
  }

  const successCount = results.filter((r) => r.status === 'ok').length
  const failCount = results.length - successCount
  let storagePath = null
  let downloadUrl = null

  try {
    if (zipFiles.length) {
      const zipBuffer = buildZip(zipFiles)
      storagePath = `bevallas/58/${period}/${jobRef.id}.zip`
      const bucket = getBucket()
      const file = bucket.file(storagePath)
      await file.save(zipBuffer, { contentType: 'application/zip' })
      try {
        const [signedUrl] = await file.getSignedUrl({
          action: 'read',
          expires: Date.now() + 1000 * 60 * 60 * 24, // 24h
        })
        downloadUrl = signedUrl
      } catch (err) {
        if (process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
          downloadUrl = buildEmulatorDownloadUrl(bucket.name, storagePath)
        } else {
          console.warn('[bevallas58] signed URL generation failed:', err?.message || err)
          downloadUrl = null
        }
      }
    }
  } catch (err) {
    // zip errors are fatal for delivery, mark failure
    throw new HttpsError('internal', err.message || 'ZIP létrehozása sikertelen.')
  } finally {
    await jobRef.set(
      {
        status: 'done',
        finishedAt: serverTimestamp(),
        results,
        successCount,
        failCount,
        storagePath,
        downloadUrl,
      },
      { merge: true }
    )
  }

  return {
    jobId: jobRef.id,
    downloadUrl,
    successCount,
    failCount,
  }
}

async function getBevallasJob({ jobId, auth }) {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'Authentication required.')
  if (!jobId) throw new HttpsError('invalid-argument', 'jobId is required.')
  const snap = await admin.firestore().collection('bevallasJobs').doc(jobId).get()
  if (!snap.exists) throw new HttpsError('not-found', 'Job not found.')
  return { id: snap.id, ...snap.data() }
}

module.exports = {
  generateBevallas58,
  getBevallasJob,
}
function getBucket() {
  const explicit =
    process.env.STORAGE_BUCKET ||
    process.env.APP_STORAGE_BUCKET ||
    process.env.GCLOUD_STORAGE_BUCKET ||
    process.env.FIREBASE_STORAGE_BUCKET
  const appBucket = admin.app().options?.storageBucket
  const bucketName = explicit || appBucket
  if (!bucketName) {
    throw new HttpsError('failed-precondition', 'Storage bucket is not configured. Set storageBucket in Firebase config.')
  }
  return admin.storage().bucket(bucketName)
}

function buildEmulatorDownloadUrl(bucketName, storagePath) {
  const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1:9199'
  const base = host.startsWith('http') ? host : `http://${host}`
  return `${base}/v0/b/${bucketName}/o/${encodeURIComponent(storagePath)}?alt=media`
}
