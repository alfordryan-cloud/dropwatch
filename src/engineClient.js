/**
 * DROPWATCH Engine Client v2.0
 * Connects React frontend to Railway backend engine
 */

const ENGINE_URL = import.meta.env.VITE_ENGINE_URL || 'https://dropwatch-production-b65d.up.railway.app';

async function request(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${ENGINE_URL}${path}`, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Engine API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function getEngineHealth() {
  return request('/health');
}

export async function getEngineStatus() {
  return request('/status');
}

export async function pauseEngine() {
  return request('/pause', 'POST');
}

export async function resumeEngine() {
  return request('/resume', 'POST');
}

export async function reloadSettings() {
  return request('/reload-settings', 'POST');
}

export async function checkKeyword(keywordId) {
  return request(`/check/${keywordId}`, 'POST');
}

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

export default {
  getEngineHealth,
  getEngineStatus,
  pauseEngine,
  resumeEngine,
  reloadSettings,
  checkKeyword,
  pollEngineHealth,
};

// Backward-compatible named export for existing imports
// e.g. import { engine } from './engineClient'
export const engine = {
  getEngineHealth,
  getEngineStatus,
  pauseEngine,
  resumeEngine,
  reloadSettings,
  checkKeyword,
  pollEngineHealth,
};
