// index.js (same file as your existing billingoProxy)

const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2/options');
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const crypto = require('crypto');

const REGION = 'europe-west3';
setGlobalOptions({ region: REGION });

/* =========================
   EXISTING BILLINGO PROXY
   ========================= */

const BILLINGO_KEY = process.env.BILLINGO_KEY;
const BILLINGO_BASE_URL = 'https://api.billingo.hu/v3';

const app = express();

// CORS first
app.use(cors({ origin: true }));
app.options('*', cors({ origin: true })); // handle preflight

app.use(express.json());

// Optional: log what you are actually forwarding
app.use((req, _res, next) => {
  console.log('[proxy]', req.method, req.originalUrl, 'path=', req.path, 'query=', req.query);
  next();
});

app.all('*', async (req, res) => {
  // Handle preflight locally (important)
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (!BILLINGO_KEY) {
    res.status(500).send('Missing Billingo key (BILLINGO_KEY).');
    return;
  }

  const targetPath = (req.path || '').replace(/^\/+/, '');
  if (!targetPath) {
    res.status(400).send('Missing Billingo path (e.g., partners or documents).');
    return;
  }

  // Only include data for body methods
  const method = (req.method || 'GET').toUpperCase();
  const hasBody = !['GET', 'HEAD'].includes(method);

  const url = `${BILLINGO_BASE_URL}/${targetPath}`;
  console.log('[proxy] ->', method, url);

  try {
    const response = await axios({
      method,
      url,
      headers: {
        'X-API-KEY': BILLINGO_KEY,
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; Firebase-Cloud-Functions/1.0)',
      },
      params: req.query,
      ...(hasBody ? { data: req.body } : {}),
      validateStatus: () => true,
    });

    res.status(response.status).send(response.data);
  } catch (err) {
    console.error('Error proxying to Billingo:', err.message);
    const status = err.response?.status || 500;
    res.status(status).send(err.response?.data || err.message || 'Billingo hiba');
  }
});

exports.billingoProxy = onRequest(app);

/* =========================
   NEW NAV PROXY / NAV TEST
   =========================
   Frontend calls: POST /navProxy/test-connection
   Body:
   {
     "nav": {
       "navOnlineUser": "...",
       "navOnlinePassword": "...",
       "navOnlineSignerKey": "...",
       "navOnlineExchangeKey": "...", // optional
       "taxNumber": "12345678",       // first 8 digits
       "navOnlineStartDate": "2025-01-01" // optional
     },
     "env": "prod" | "test" // optional override
   }
*/

const NAV_BASE_URL_PROD =
  process.env.NAV_BASE_URL_PROD || 'https://api.onlineszamla.nav.gov.hu/invoiceService/v3';

// You can set this to the official test base URL via env var without touching code:
const NAV_BASE_URL_TEST =
  process.env.NAV_BASE_URL_TEST || ''; // set in env if you use test

// Must be EXACTLY 18 chars, pattern: [0-9A-Z-]{18}
const NAV_SOFTWARE = {
  softwareId: process.env.NAV_SOFTWARE_ID || '12345678ABCDEFGH12',
  softwareName: process.env.NAV_SOFTWARE_NAME || 'NAV Proxy',
  softwareOperation: process.env.NAV_SOFTWARE_OPERATION || 'LOCAL_SOFTWARE',
  softwareMainVersion: process.env.NAV_SOFTWARE_MAIN_VERSION || '1.0',
  softwareDevName: process.env.NAV_SOFTWARE_DEV_NAME || 'Your Company',
  softwareDevContact: process.env.NAV_SOFTWARE_DEV_CONTACT || 'dev@example.com',
  softwareDevCountryCode: process.env.NAV_SOFTWARE_DEV_COUNTRY || 'HU',
  softwareDevTaxNumber: process.env.NAV_SOFTWARE_DEV_TAXNO || '12345678',
};

const navApp = express();

navApp.use(cors({ origin: true }));
navApp.options('*', cors({ origin: true }));
navApp.use(express.json());

// Keep logs safe (do NOT log secrets)
navApp.use((req, _res, next) => {
  console.log('[nav]', req.method, req.originalUrl);
  next();
});

/* ---------- NAV helpers ---------- */

function sha512Upper(str) {
  return crypto.createHash('sha512').update(str, 'utf8').digest('hex').toUpperCase();
}

function sha3_512Upper(str) {
  return crypto.createHash('sha3-512').update(str, 'utf8').digest('hex').toUpperCase();
}

function isoTimestamp() {
  return new Date().toISOString(); // 2025-12-20T13:58:55.794Z
}

// For requestSignature concatenation timestamp must be yyyyMMddHHmmss (UTC)
function maskTimestampToYYYYMMDDhhmmss(iso) {
  return iso.replace(/[-:TZ.]/g, '').slice(0, 14);
}

// requestId pattern: [+a-zA-Z0-9_]{1,30}
function makeRequestId() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ts =
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds());
  const rnd = crypto.randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
  return `REQ${ts}_${rnd}`; // ~24 chars
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Minimal XML error extraction
function extractNavError(xml) {
  const errorCode = xml.match(/<errorCode>([^<]+)<\/errorCode>/)?.[1] || null;
  const message = xml.match(/<message>([^<]+)<\/message>/)?.[1] || null;
  const funcCode = xml.match(/<funcCode>([^<]+)<\/funcCode>/)?.[1] || null;
  return { funcCode, errorCode, message };
}

function resolveNavBaseUrl(env) {
  if (env === 'test') {
    if (!NAV_BASE_URL_TEST) {
      throw new Error('NAV_BASE_URL_TEST is not configured in environment variables.');
    }
    return NAV_BASE_URL_TEST;
  }
  return NAV_BASE_URL_PROD;
}

function buildQueryInvoiceDigestXmlUsingInsDate({ nav, invoiceDirection = 'OUTBOUND', dateFrom, dateTo, page = 1 }) {
  const requestId = makeRequestId();
  const timestampIso = isoTimestamp();
  const tsMasked = maskTimestampToYYYYMMDDhhmmss(timestampIso);

  const passwordHash = sha512Upper(nav.navOnlinePassword);
  const requestSignature = sha3_512Upper(requestId + tsMasked + nav.navOnlineSignerKey);

  return `
<QueryInvoiceDigestRequest
  xmlns="http://schemas.nav.gov.hu/OSA/3.0/api"
  xmlns:common="http://schemas.nav.gov.hu/NTCA/1.0/common"
>
  <common:header>
    <common:requestId>${requestId}</common:requestId>
    <common:timestamp>${timestampIso}</common:timestamp>
    <common:requestVersion>3.0</common:requestVersion>
    <common:headerVersion>1.0</common:headerVersion>
  </common:header>

  <common:user>
    <common:login>${nav.navOnlineUser}</common:login>
    <common:passwordHash cryptoType="SHA-512">${passwordHash}</common:passwordHash>
    <common:taxNumber>${nav.taxNumber}</common:taxNumber>
    <common:requestSignature cryptoType="SHA3-512">${requestSignature}</common:requestSignature>
  </common:user>

  <software>
    <softwareId>${NAV_SOFTWARE.softwareId}</softwareId>
    <softwareName>${NAV_SOFTWARE.softwareName}</softwareName>
    <softwareOperation>${NAV_SOFTWARE.softwareOperation}</softwareOperation>
    <softwareMainVersion>${NAV_SOFTWARE.softwareMainVersion}</softwareMainVersion>
    <softwareDevName>${NAV_SOFTWARE.softwareDevName}</softwareDevName>
    <softwareDevContact>${NAV_SOFTWARE.softwareDevContact}</softwareDevContact>
    <softwareDevCountryCode>${NAV_SOFTWARE.softwareDevCountryCode}</softwareDevCountryCode>
    <softwareDevTaxNumber>${NAV_SOFTWARE.softwareDevTaxNumber}</softwareDevTaxNumber>
  </software>

  <page>${page}</page>
  <invoiceDirection>${invoiceDirection}</invoiceDirection>

  <invoiceQueryParams>
    <mandatoryQueryParams>
      <insDate>
        <dateTimeFrom>${dateFrom}T00:00:00.000Z</dateTimeFrom>
        <dateTimeTo>${dateTo}T23:59:59.999Z</dateTimeTo>
      </insDate>
    </mandatoryQueryParams>
  </invoiceQueryParams>
</QueryInvoiceDigestRequest>
`.trim();
}

// Optional: TokenExchange test to validate exchangeKey (only meaningful if you plan submissions)
// NOTE: this only validates exchangeKey path; it does NOT “submit an invoice”.
function buildTokenExchangeXml({ nav }) {
  const requestId = makeRequestId();
  const timestampIso = isoTimestamp();
  const tsMasked = maskTimestampToYYYYMMDDhhmmss(timestampIso);

  const passwordHash = sha512Upper(nav.navOnlinePassword);
  const requestSignature = sha3_512Upper(requestId + tsMasked + nav.navOnlineSignerKey);

  return `
<TokenExchangeRequest
  xmlns="http://schemas.nav.gov.hu/OSA/3.0/api"
  xmlns:common="http://schemas.nav.gov.hu/NTCA/1.0/common"
>
  <common:header>
    <common:requestId>${requestId}</common:requestId>
    <common:timestamp>${timestampIso}</common:timestamp>
    <common:requestVersion>3.0</common:requestVersion>
    <common:headerVersion>1.0</common:headerVersion>
  </common:header>

  <common:user>
    <common:login>${nav.navOnlineUser}</common:login>
    <common:passwordHash cryptoType="SHA-512">${passwordHash}</common:passwordHash>
    <common:taxNumber>${nav.taxNumber}</common:taxNumber>
    <common:requestSignature cryptoType="SHA3-512">${requestSignature}</common:requestSignature>
  </common:user>

  <software>
    <softwareId>${NAV_SOFTWARE.softwareId}</softwareId>
    <softwareName>${NAV_SOFTWARE.softwareName}</softwareName>
    <softwareOperation>${NAV_SOFTWARE.softwareOperation}</softwareOperation>
    <softwareMainVersion>${NAV_SOFTWARE.softwareMainVersion}</softwareMainVersion>
    <softwareDevName>${NAV_SOFTWARE.softwareDevName}</softwareDevName>
    <softwareDevContact>${NAV_SOFTWARE.softwareDevContact}</softwareDevContact>
    <softwareDevCountryCode>${NAV_SOFTWARE.softwareDevCountryCode}</softwareDevCountryCode>
    <softwareDevTaxNumber>${NAV_SOFTWARE.softwareDevTaxNumber}</softwareDevTaxNumber>
  </software>

  <!-- In NAV v3, tokenExchange uses the exchangeKey to encrypt/decrypt the token exchange data.
       The exact token exchange payload structure can vary by version; many integrations
       only run tokenExchange as part of manageInvoice pipeline.
       If your tokenExchange schema requires additional elements beyond this,
       paste your schema error and I’ll adjust the XML exactly. -->
</TokenExchangeRequest>
`.trim();
}

async function navPostXml(baseUrl, path, xml) {
  const url = `${baseUrl}${path}`;
  const response = await axios({
    method: 'POST',
    url,
    headers: {
      'Content-Type': 'application/xml; charset=UTF-8',
      'Accept': 'application/xml',
      'User-Agent': 'Mozilla/5.0 (compatible; Firebase-Cloud-Functions/1.0)',
    },
    data: xml,
    timeout: 30000,
    validateStatus: () => true,
  });
  return response;
}

/* ---------- NAV routes ---------- */

// POST /navProxy/test-connection
navApp.post('/test-connection', async (req, res) => {
  try {
    const nav = req.body?.nav || {};
    const env = (req.body?.env || 'prod').toLowerCase();

    // Basic input validation
    if (!nav.navOnlineUser || !nav.navOnlinePassword || !nav.navOnlineSignerKey) {
      res.status(400).json({
        ok: false,
        errorCode: 'MISSING_FIELDS',
        message: 'Hiányzó NAV adatok: felhasználónév, jelszó, aláírókulcs kötelező.',
      });
      return;
    }
    if (!nav.taxNumber || !/^\d{8}$/.test(String(nav.taxNumber))) {
      res.status(400).json({
        ok: false,
        errorCode: 'INVALID_TAXNUMBER',
        message: 'A taxNumber mezőnek pontosan 8 számjegynek kell lennie (adószám első 8 jegye).',
      });
      return;
    }

    const baseUrl = resolveNavBaseUrl(env);

    // Use a tiny insDate window (last 2 days) to test query path
    const today = new Date().toISOString().slice(0, 10);
    const twoDaysAgo = addDays(today, -2);

    const checks = {
      query: { ok: false },
      tokenExchange: { ok: null }, // null = not attempted
    };

    // Try OUTBOUND first, then INBOUND (some users only see one direction)
    const directions = ['OUTBOUND', 'INBOUND'];

    let queryOk = false;
    let lastQueryErr = null;

    for (const dir of directions) {
      const xml = buildQueryInvoiceDigestXmlUsingInsDate({
        nav,
        invoiceDirection: dir,
        dateFrom: twoDaysAgo,
        dateTo: today,
        page: 1,
      });

      const r = await navPostXml(baseUrl, '/queryInvoiceDigest', xml);

      if (r.status === 200) {
        checks.query = { ok: true, direction: dir };
        queryOk = true;
        break;
      } else {
        const err = extractNavError(typeof r.data === 'string' ? r.data : JSON.stringify(r.data));
        lastQueryErr = { status: r.status, ...err, direction: dir };
      }
    }

    if (!queryOk) {
      res.status(200).json({
        ok: false,
        errorCode: lastQueryErr?.errorCode || 'NAV_QUERY_TEST_FAILED',
        message: lastQueryErr?.message || 'NAV lekérdezési teszt sikertelen.',
        details: lastQueryErr,
        checks,
      });
      return;
    }

    // OPTIONAL: test exchange key via tokenExchange only if provided
    // (If you need a *schema-correct* TokenExchangeRequest for your exact use,
    // paste your tokenExchange schema requirements / errors and I’ll adjust.)
    if (nav.navOnlineExchangeKey) {
      // Many integrations only validate exchangeKey as part of manageInvoice.
      // Here we attempt tokenExchange; if schema differs, this will return a useful error.
      try {
        const tokenXml = buildTokenExchangeXml({ nav });
        const tr = await navPostXml(baseUrl, '/tokenExchange', tokenXml);

        if (tr.status === 200) {
          checks.tokenExchange = { ok: true };
        } else {
          const err = extractNavError(typeof tr.data === 'string' ? tr.data : JSON.stringify(tr.data));
          checks.tokenExchange = { ok: false, status: tr.status, ...err };
        }
      } catch (e) {
        checks.tokenExchange = { ok: false, message: e.message || 'TokenExchange teszt hiba.' };
      }
    }

    res.status(200).json({
      ok: true,
      checks,
    });
  } catch (err) {
    console.error('[nav] test-connection error:', err?.message || err);
    res.status(500).json({
      ok: false,
      errorCode: 'NAV_PROXY_ERROR',
      message: err?.message || 'NAV proxy hiba',
    });
  }
});

exports.navProxy = onRequest(navApp);
