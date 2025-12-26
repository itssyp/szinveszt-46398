const functionsCompat = require('firebase-functions');
const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2/options');
const { buildBillingoApp, ALLOWED_ORIGINS } = require('./billingoProxy');
const { buildNavApp } = require('./navProxy');
const { buildEvnyApp } = require('./evnyLookup');
const { requireFirebaseAuthOrAppCheckFactory } = require('./utils');

// Fingerprint to verify the active entrypoint and harden against stray functions.config() calls.
console.log('[functions-entry]', __filename, 'loaded at', new Date().toISOString());
if (typeof functionsCompat.config === 'function') {
  try {
    functionsCompat.config = () => ({});
  } catch (err) {
    console.warn('functions.config shim failed:', err?.message || err);
  }
} 

const REGION = 'europe-west3';
setGlobalOptions({ region: REGION });

const requireFirebaseAuthOrAppCheck = requireFirebaseAuthOrAppCheckFactory();

/* =========================
   BILLINGO PROXY (modular)
   ========================= */

const billingoApp = buildBillingoApp(requireFirebaseAuthOrAppCheck);
exports.billingoProxy = onRequest(billingoApp);

/* =========================
   NAV PROXY (modular)
   ========================= */

const navApp = buildNavApp(requireFirebaseAuthOrAppCheck);
exports.navProxy = onRequest(navApp); 

/* =========================
   EVNY PUBLIC LOOKUP (BEST-EFFORT)
   ========================= */

// const evnyApp = buildEvnyApp(requireFirebaseAuthOrAppCheck, ALLOWED_ORIGINS);
// exports.evnyLookup = onRequest(evnyApp);
