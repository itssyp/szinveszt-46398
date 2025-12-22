const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2/options');
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const REGION = 'europe-west3';
setGlobalOptions({ region: REGION });

const BILLINGO_KEY = process.env.BILLINGO_KEY;
const BASE_URL = 'https://api.billingo.hu/v3';

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

  const url = `${BASE_URL}/${targetPath}`;
  console.log('[proxy] ->', method, url);

  try {
    const response = await axios({
      method,
      url,
      headers: {
        'X-API-KEY': BILLINGO_KEY,
        'Accept': 'application/json',
        // keep UA if you want, but it's usually not the key issue
        'User-Agent': 'Mozilla/5.0 (compatible; Firebase-Cloud-Functions/1.0)',
      },
      params: req.query,
      ...(hasBody ? { data: req.body } : {}),
      // helpful when debugging, so you can see body even on non-2xx:
      validateStatus: () => true,
    });

    // pass through
    res.status(response.status).send(response.data);
  } catch (err) {
    console.error('Error proxying to Billingo:', err.message);
    const status = err.response?.status || 500;
    res.status(status).send(err.response?.data || err.message || 'Billingo hiba');
  }
});

exports.billingoProxy = onRequest(app);
