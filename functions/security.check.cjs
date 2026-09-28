const test = require('node:test')
const assert = require('node:assert/strict')
const { requireFirebaseAuthOrAppCheckFactory } = require('./utils')
const { buildBillingoApp, allowedOriginsForProject } = require('./billingoProxy')
const { buildTicketAttachmentApp } = require('./ticketAttachments')

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

test('proxy auth rejects requests without a user token, including App Check only', async () => {
  const middleware = requireFirebaseAuthOrAppCheckFactory({
    verifyIdToken: async () => ({ uid: 'staff', staff: true }),
    verifyAppCheckToken: async () => ({}),
  })
  const res = response()
  let nextCalled = false
  await middleware({ headers: { 'x-firebase-appcheck': 'valid' } }, res, () => { nextCalled = true })
  assert.equal(res.statusCode, 401)
  assert.equal(nextCalled, false)
})

test('proxy auth rejects signed-in users without staff claim', async () => {
  const middleware = requireFirebaseAuthOrAppCheckFactory({
    verifyIdToken: async () => ({ uid: 'other' }),
  })
  const res = response()
  await middleware({ headers: { authorization: 'Bearer valid' } }, res, () => assert.fail('must not continue'))
  assert.equal(res.statusCode, 403)
})

test('proxy auth allows staff with valid ID token', async () => {
  const middleware = requireFirebaseAuthOrAppCheckFactory({
    verifyIdToken: async () => ({ uid: 'staff', staff: true }),
  })
  const req = { headers: { authorization: 'Bearer valid' } }
  let nextCalled = false
  await middleware(req, response(), () => { nextCalled = true })
  assert.equal(nextCalled, true)
  assert.equal(req.user.uid, 'staff')
})

test('CORS origins follow the deployed Firebase project', () => {
  const stagingOrigins = allowedOriginsForProject('szinveszt-staging')
  assert.ok(stagingOrigins.includes('https://szinveszt-staging.web.app'))
  assert.ok(stagingOrigins.includes('http://localhost:3001'))
  assert.ok(!stagingOrigins.includes('https://szinveszt-46398.web.app'))
})

test('Billingo proxy only forwards supported GET paths', async () => {
  const forwarded = []
  const app = buildBillingoApp((_req, _res, next) => next(), {
    apiKey: 'test-key',
    request: async (options) => {
      forwarded.push(options.url)
      return { status: 200, data: { ok: true } }
    },
  })
  const server = app.listen(0)
  try {
    const base = `http://127.0.0.1:${server.address().port}`
    assert.equal((await fetch(`${base}/documents/123/payments`)).status, 200)
    assert.equal((await fetch(`${base}/partners`)).status, 404)
    assert.equal((await fetch(`${base}/documents`, { method: 'POST' })).status, 405)
    assert.deepEqual(forwarded, ['https://api.billingo.hu/v3/documents/123/payments'])
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('ticket download rejects invalid paths and serves a valid attachment', async () => {
  const readPaths = []
  const app = buildTicketAttachmentApp((_req, _res, next) => next(), {
    readFile: async (path) => {
      readPaths.push(path)
      return { bytes: Buffer.from('attachment'), contentType: 'text/plain' }
    },
  })
  const server = app.listen(0)
  try {
    const base = `http://127.0.0.1:${server.address().port}`
    assert.equal((await fetch(`${base}/?path=clients/secret`)).status, 400)
    assert.equal((await fetch(`${base}/?path=tickets/abc/file.txt`, { method: 'POST' })).status, 405)
    const result = await fetch(`${base}/?path=tickets/abc/file.txt`)
    assert.equal(result.status, 200)
    assert.equal(await result.text(), 'attachment')
    assert.deepEqual(readPaths, ['tickets/abc/file.txt'])
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
