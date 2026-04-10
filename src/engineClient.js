// DROPWATCH Engine Client v3
// Connects frontend to Railway backend

const ENGINE_URL = import.meta.env.VITE_ENGINE_URL || 'https://dropwatch-production-b65d.up.railway.app';

async function request(path, method = 'GET', body = null) {
  try {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${ENGINE_URL}${path}`, opts);
    return await res.json();
  } catch (err) {
    console.error(`[Engine] ${method} ${path} failed:`, err);
    return { error: err.message };
  }
}

export const engine = {
  getStatus: () => request('/'),
  start: () => request('/start', 'POST'),
  stop: () => request('/stop', 'POST'),
  getStats: () => request('/stats'),
  discover: () => request('/discover', 'POST'),
  checkProduct: (id) => request(`/check/${id}`, 'POST'),
  getKeywords: () => request('/keywords'),
  addKeyword: (data) => request('/keywords', 'POST', data),
  deleteKeyword: (id) => request(`/keywords/${id}`, 'DELETE'),
  getActivity: (limit = 50) => request(`/activity?limit=${limit}`),
};
