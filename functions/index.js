const functionsCompat = require('firebase-functions');
const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2/options');
const { buildBillingoApp, ALLOWED_ORIGINS } = require('./billingoProxy');
const { buildNavApp } = require('./navProxy');
const { buildTicketAttachmentApp } = require('./ticketAttachments');
const { buildEvnyApp } = require('./evnyLookup');
const { requireFirebaseAuthOrAppCheckFactory } = require('./utils');
const { generateBevallas58, getBevallasJob } = require('./bevallas/generate58');
const { onCall, HttpsError } = require('firebase-functions/v2/https');

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
exports.billingoProxy = onRequest({ cors: true }, billingoApp);

/* =========================
   NAV PROXY (modular)
   ========================= */

const navApp = buildNavApp(requireFirebaseAuthOrAppCheck);
exports.navProxy = onRequest(navApp); 

exports.ticketAttachmentDownload = onRequest(buildTicketAttachmentApp(requireFirebaseAuthOrAppCheck));

/* =========================
   EVNY PUBLIC LOOKUP (BEST-EFFORT)
   ========================= */

// const evnyApp = buildEvnyApp(requireFirebaseAuthOrAppCheck, ALLOWED_ORIGINS);
// exports.evnyLookup = onRequest(evnyApp);

/* =========================
   BEVALLAS 58 (CALLABLE)
   ========================= */

exports.generateBevallas58 = onCall(async (request) => {
  try { 
    return await generateBevallas58({
      period: request.data?.period,
      clientIds: request.data?.clientIds,
      auth: request.auth,
    });
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    throw new HttpsError('internal', err.message || 'Ismeretlen hiba.');
  }
});

exports.getBevallasJob = onCall(async (request) => {
  try {
    return await getBevallasJob({
      jobId: request.data?.jobId,
      auth: request.auth,
    });
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    throw new HttpsError('internal', err.message || 'Ismeretlen hiba.');
  }
});
