// DROPWATCH ENGINE CLIENT
// Connects frontend to the Railway backend engine

const ENGINE_URL = import.meta.env.VITE_ENGINE_URL || 'https://dropwatch-production-b65d.up.railway.app';

export const engine = {
  // Health check & status
  async getStatus() {
    try {
      const res = await fetch(`${ENGINE_URL}/`);
      return await res.json();
    } catch (err) {
      console.error('[Engine] Status check failed:', err);
      return { service: 'DROPWATCH Engine', status: 'unreachable', stats: {} };
    }
  },

  // Start monitoring engine
  async start() {
    try {
      const res = await fetch(`${ENGINE_URL}/start`, { method: 'POST' });
      return await res.json();
    } catch (err) {
      console.error('[Engine] Start failed:', err);
      return { error: err.message };
    }
  },

  // Stop monitoring engine
  async stop() {
    try {
      const res = await fetch(`${ENGINE_URL}/stop`, { method: 'POST' });
      return await res.json();
    } catch (err) {
      console.error('[Engine] Stop failed:', err);
      return { error: err.message };
    }
  },

  // Get purchase statistics
  async getStats() {
    try {
      const res = await fetch(`${ENGINE_URL}/stats`);
      return await res.json();
    } catch (err) {
      console.error('[Engine] Stats failed:', err);
      return { totalChecks: 0, stockFound: 0, purchaseAttempts: 0, successfulPurchases: 0, errors: 0 };
    }
  },

  // Manually check a specific product
  async checkProduct(productId) {
    try {
      const res = await fetch(`${ENGINE_URL}/check/${productId}`, { method: 'POST' });
      return await res.json();
    } catch (err) {
      console.error('[Engine] Check product failed:', err);
      return { error: err.message };
    }
  }
};
