/**
 * DROPWATCH Engine Client v4.2
 * Full API coverage for: keywords, products, drops, accounts, discovery, batch import, alerts.
 *
 * Engine URL resolution order:
 *   1. VITE_ENGINE_URL env var (set in Vercel or .env.local)
 *   2. http://localhost:3001 if in dev mode
 *   3. Railway legacy URL (backward compat)
 */

const ENGINE_URL =
  import.meta.env.VITE_ENGINE_URL ||
  (import.meta.env.DEV ? 'http://localhost:3001' : 'https://dropwatch-production-b65d.up.railway.app');

async function request(path, method = 'GET', body = null) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    signal: ctrl.signal,
  };
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(`${ENGINE_URL}${path}`, opts);
    clearTimeout(timer);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API ${res.status}: ${text.substring(0, 200)}`);
    }
    return res.json();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ─── Engine / Health ─────────────────────────────────────────────────────

export async function getEngineHealth() { return request('/health'); }
export async function getEngineStatus() { return request('/health'); } // backward-compat alias
export async function pauseAll() { return request('/api/pause-all', 'POST'); }
export async function resumeAll() { return request('/api/resume-all', 'POST'); }
export async function getRetailers() { return request('/api/retailers'); }
export async function getAccounts() { return request('/api/accounts'); }
export async function getActivity(limit = 50, retailer = null) {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (retailer) qs.set('retailer', retailer);
  return request(`/api/activity?${qs}`);
}

// ─── Keywords ────────────────────────────────────────────────────────────

export async function listKeywords() { return request('/api/keywords'); }
export async function addKeyword(data) { return request('/api/keywords', 'POST', data); }
export async function updateKeyword(id, data) { return request(`/api/keywords/${id}`, 'PATCH', data); }
export async function deleteKeyword(id) { return request(`/api/keywords/${id}`, 'DELETE'); }

// ─── Discovery ───────────────────────────────────────────────────────────

export async function runDiscovery() { return request('/api/discovery/run', 'POST'); }
export async function getDiscoveryStatus() { return request('/api/discovery/status'); }

// ─── Batch Import ────────────────────────────────────────────────────────

export async function batchImport(data) {
  return request('/api/products/batch-import', 'POST', data);
}

// ─── Products (per retailer) ─────────────────────────────────────────────

export async function updateProduct(retailer, id, patch) {
  return request(`/api/${retailer}/products/${id}`, 'PATCH', patch);
}
export async function deleteProduct(retailer, id) {
  return request(`/api/${retailer}/products/${id}`, 'DELETE');
}
export async function checkProduct(retailer, id) {
  return request(`/api/${retailer}/check/${id}`);
}
export async function testPurchase(retailer, payload) {
  return request(`/api/${retailer}/test-purchase`, 'POST', payload);
}

// ─── Retailer Configs ────────────────────────────────────────────────────

export async function getRetailerConfig(retailer) {
  return request(`/api/${retailer}/config`);
}
export async function updateRetailerConfig(retailer, patch) {
  return request(`/api/${retailer}/config`, 'PATCH', patch);
}
export async function setDropMode(retailer, enabled) {
  return request(`/api/${retailer}/drop-mode`, 'POST', { enabled });
}

// ─── Accounts ────────────────────────────────────────────────────────────

export async function preLoginAll(retailer) {
  return request(`/api/${retailer}/pre-login`, 'POST');
}
export async function loginAccount(retailer, accountId) {
  return request(`/api/${retailer}/accounts/${accountId}/login`, 'POST');
}
export async function checkAccountSession(retailer, accountId) {
  return request(`/api/${retailer}/accounts/${accountId}/check-session`, 'POST');
}
export async function addAccount(payload) {
  return request(`/api/accounts`, 'POST', payload);
}

// Setup wizard — opens Chrome for manual login, auto-exports cookies
export async function startAccountSetup(accountId) {
  return request(`/api/accounts/${accountId}/setup-session`, 'POST');
}
export async function getSetupStatus(taskId) {
  return request(`/api/accounts/setup/${taskId}/status`);
}
export async function cancelSetup(taskId) {
  return request(`/api/accounts/setup/${taskId}/cancel`, 'POST');
}

// ─── Drops ───────────────────────────────────────────────────────────────

export async function listDrops() { return request('/api/drops'); }
export async function getDropStatus() { return request('/api/drops/status'); }
export async function createDrop(data) { return request('/api/drops', 'POST', data); }
export async function updateDrop(id, patch) { return request(`/api/drops/${id}`, 'PATCH', patch); }
export async function cancelDrop(id) { return request(`/api/drops/${id}/cancel`, 'POST'); }
export async function deleteDrop(id) { return request(`/api/drops/${id}`, 'DELETE'); }
export async function triggerDropPhase(id, phase) {
  return request(`/api/drops/${id}/trigger/${phase}`, 'POST');
}

// ─── Alerts ──────────────────────────────────────────────────────────────

export async function testAlert() { return request('/api/alerts/test', 'POST'); }

// ─── Search (per-retailer) ───────────────────────────────────────────────

export async function searchRetailer(retailer, term) {
  return request(`/api/${retailer}/search`, 'POST', { term });
}

// ─── Legacy compat ───────────────────────────────────────────────────────

export function pollEngineHealth(onData, intervalMs = 10000) {
  let active = true;
  const poll = async () => {
    if (!active) return;
    try {
      const data = await getEngineHealth();
      onData({ ...data, online: true, error: null });
    } catch (err) {
      onData({ online: false, error: err.message });
    }
    if (active) setTimeout(poll, intervalMs);
  };
  poll();
  return () => { active = false; };
}

// Engine convenience alias — matches old shape
export const engine = {
  // Health / state
  getEngineHealth, getEngineStatus, pollEngineHealth,
  pauseAll, resumeAll,
  getRetailers, getAccounts, getActivity,
  // Keywords
  listKeywords, addKeyword, updateKeyword, deleteKeyword,
  // Discovery
  runDiscovery, getDiscoveryStatus,
  discover: runDiscovery, // alias for older callers
  // Batch
  batchImport,
  // Products
  updateProduct, deleteProduct, checkProduct, testPurchase,
  // Retailer config
  getRetailerConfig, updateRetailerConfig, setDropMode,
  // Accounts
  preLoginAll, loginAccount, checkAccountSession, addAccount,
  startAccountSetup, getSetupStatus, cancelSetup,
  // Drops
  listDrops, getDropStatus, createDrop, updateDrop, cancelDrop, deleteDrop, triggerDropPhase,
  // Alerts
  testAlert,
  // Search
  searchRetailer,
  // Backward-compat status shape (some callers expect {status, stats})
  async getStatus() {
    try {
      const h = await getEngineHealth();
      return {
        status: h.workers?.length ? 'running' : 'stopped',
        stats: {
          totalChecks: 0,
          stockFound: 0,
          productsDiscovered: 0,
          uptime: h.uptime,
          memoryMB: h.memoryMB,
          workers: h.workers,
        },
      };
    } catch {
      return { status: 'stopped', stats: {} };
    }
  },
  async start() { return resumeAll(); },
  async stop() { return pauseAll(); },
  async reloadSettings() { /* no-op: config auto-reloads */ return { ok: true }; },
};

export default engine;

// Expose URL for debugging
export const ENGINE_BASE_URL = ENGINE_URL;

// ─── SKU Finder ──────────────────────────────────────────────────────────

// SKU finder calls go to Vercel serverless functions on the SAME origin as
// the dashboard (relative URLs), not the Railway engine. Self-contained.
async function vercelPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = '';
    try { msg = (await res.json())?.error || ''; } catch { msg = await res.text(); }
    throw new Error(`API ${res.status}: ${String(msg).slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Keyword search Target / Walmart for sealed sports + TCG product.
 * @param {{retailer:'target'|'walmart', keyword:string, maxResults?:number,
 *          minPrice?:number, maxPrice?:number, inStockOnly?:boolean}} body
 * @returns {Promise<{retailer,keyword,count,items:Array<{sku,title,price,inStock,url}>}>}
 */
export async function searchSkus(body) {
  return vercelPost('/api/search-skus', body);
}

/**
 * Lookup a single SKU (or product URL) — returns canonical title/price/in-stock.
 */
export async function lookupSku(body) {
  return vercelPost('/api/lookup-sku', body);
}
