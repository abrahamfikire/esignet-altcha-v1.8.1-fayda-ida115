import { validAuthFactors } from '../constants/clientConstants';

const MEDIAPIPE_VERSION = '0.10.14';
const CDN_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}`;
const WASM_BASE = `${CDN_BASE}/wasm`;

export const SBI_LIVENESS_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export const SBI_LIVENESS_WASM_BASE = WASM_BASE;
export const SBI_LIVENESS_MEDIAPIPE_CDN = CDN_BASE;

const PRELOAD_FLAG = '__sbiLivenessPreloadStarted';

const parseErshaClientIds = (raw) => {
  if (Array.isArray(raw)) {
    return raw.map((id) => String(id).trim()).filter(Boolean);
  }

  const text = String(raw ?? '').trim();
  if (!text) {
    return [];
  }

  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.map((id) => String(id).trim()).filter(Boolean);
      }
    } catch {
      // fall through to comma-separated parsing
    }
  }

  return text
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
};

const getErshaClientIds = () => {
  const runtime = window._env_?.ERSHA_CLIENT_IDS;
  if (runtime !== undefined && runtime !== null && runtime !== '') {
    return parseErshaClientIds(runtime);
  }
  const value = parseErshaClientIds(
    process.env.REACT_APP_ERSHA_CLIENT_IDS ?? ''
  );
  return value;
};

export const isErshaClientId = (clientId) => {
  if (!clientId) {
    return false;
  }
  const allowedClientIds = getErshaClientIds();
  if (allowedClientIds.length === 0) {
    return false;
  }
  const value = allowedClientIds.includes(String(clientId).trim());
  return value;
};

const preloadAssets = [
  { href: SBI_LIVENESS_MODEL_URL, as: 'fetch' },
  { href: `${WASM_BASE}/vision_wasm_internal.wasm`, as: 'fetch' },
  { href: `${WASM_BASE}/vision_wasm_internal.js`, as: 'script' },
];

const hasPreloadLink = (href) =>
  Boolean(document.querySelector(`link[data-sbi-preload="${href}"]`));

const appendPreloadLink = ({ href, as }) => {
  if (hasPreloadLink(href)) {
    return;
  }

  const link = document.createElement('link');
  link.rel = 'preload';
  link.href = href;
  link.as = as;
  link.crossOrigin = 'anonymous';
  link.setAttribute('data-sbi-preload', href);
  document.head.appendChild(link);
};

const warmCache = (url) =>
  fetch(url, { mode: 'cors', credentials: 'omit', cache: 'force-cache' }).catch(
    () => {}
  );

/**
 * Hint the browser to download MediaPipe assets used by internal-sbi-liveness.html.
 * Safe to call multiple times.
 */
export function preloadSbiLivenessAssets() {
  if (typeof window === 'undefined' || window[PRELOAD_FLAG]) {
    return;
  }

  window[PRELOAD_FLAG] = true;

  for (const asset of preloadAssets) {
    appendPreloadLink(asset);
    warmCache(asset.href);
  }
}

/**
 * Start preloading as soon as login loads for Ersha clients that offer biometrics.
 */
export function preloadSbiLivenessForLogin(openIDConnectService, authService) {
  const clientId = authService?.getClientId?.();
  if (!isErshaClientId(clientId)) {
    return;
  }

  const authFactors = openIDConnectService?.getAuthFactorList?.() ?? [];
  const hasBio = authFactors.some(
    (factor) => factor.type === validAuthFactors.BIO
  );

  if (authFactors.length > 0 && !hasBio) {
    return;
  }

  preloadSbiLivenessAssets();
}
