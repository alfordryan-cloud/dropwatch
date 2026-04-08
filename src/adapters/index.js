// ═══════════════════════════════════════════════════════════════════════════════
// RETAILER ADAPTERS INDEX
// Export all adapter implementations
// ═══════════════════════════════════════════════════════════════════════════════

export * from './base.js';
export { default as TargetAdapter } from './target.js';
export { default as WalmartAdapter } from './walmart.js';
export { default as PokemonCenterAdapter } from './pokemon-center.js';

// Import all adapters to ensure they're registered
import './target.js';
import './walmart.js';
import './pokemon-center.js';

import { adapterRegistry } from './base.js';

// Helper function to get adapter for a retailer
export function getAdapter(retailerName) {
  return adapterRegistry.get(retailerName);
}

// List all available adapters
export function listAdapters() {
  return adapterRegistry.list();
}

export default adapterRegistry;
