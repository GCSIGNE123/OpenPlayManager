// -----------------------------------------------------------------------
// window.storage shim
// -----------------------------------------------------------------------
// The app was originally built as a Claude.ai artifact, where `window.storage`
// is provided by the host environment and backed by a real server-side
// key/value store shared across every browser/device viewing the artifact.
// That is what makes "everyone sees the same live scores" possible there.
//
// Outside of Claude.ai there is no such host API, so this file provides a
// drop-in replacement with the exact same method signatures
// (get/set/delete/list, each with a `shared` flag) backed by the browser's
// localStorage instead.
//
// IMPORTANT LIMITATION: localStorage is per-browser, per-device. Using this
// shim, "shared" sessions will only sync between tabs on the SAME browser on
// the SAME device — not across phones/laptops like the original Claude.ai
// version. To get real multi-device sync, replace the four functions below
// with calls to a real backend (see /backend/README.md for pointers) while
// keeping the same function signatures, and nothing else in the app needs
// to change.
// -----------------------------------------------------------------------

const NAMESPACE = "opl:";

function storageKey(key, shared) {
  return `${NAMESPACE}${shared ? "shared" : "local"}:${key}`;
}

async function get(key, shared = false) {
  const raw = window.localStorage.getItem(storageKey(key, shared));
  if (raw === null) {
    // matches the real API: accessing a missing key throws rather than
    // returning null
    throw new Error(`storage.get: key not found: ${key}`);
  }
  return { key, value: raw, shared };
}

async function set(key, value, shared = false) {
  window.localStorage.setItem(storageKey(key, shared), value);
  return { key, value, shared };
}

async function del(key, shared = false) {
  const k = storageKey(key, shared);
  const existed = window.localStorage.getItem(k) !== null;
  window.localStorage.removeItem(k);
  return { key, deleted: existed, shared };
}

async function list(prefix = "", shared = false) {
  const scopePrefix = `${NAMESPACE}${shared ? "shared" : "local"}:`;
  const keys = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const fullKey = window.localStorage.key(i);
    if (fullKey && fullKey.startsWith(scopePrefix)) {
      const strippedKey = fullKey.slice(scopePrefix.length);
      if (strippedKey.startsWith(prefix)) keys.push(strippedKey);
    }
  }
  return { keys, prefix, shared };
}

const storage = { get, set, delete: del, list };

if (typeof window !== "undefined") {
  window.storage = storage;
}

export default storage;
