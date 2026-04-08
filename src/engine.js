// ═══════════════════════════════════════════════════════════════════════════════
// DROPWATCH PURCHASING ENGINE
// Core service layer for automated retail monitoring and checkout
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * SYSTEM ARCHITECTURE OVERVIEW
 * 
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │                           DROPWATCH ARCHITECTURE                            │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │                                                                             │
 * │  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
 * │  │   MONITOR    │───▶│   CONFIRM    │───▶│   EXECUTE    │                  │
 * │  │   SERVICE    │    │   SERVICE    │    │   SERVICE    │                  │
 * │  └──────────────┘    └──────────────┘    └──────────────┘                  │
 * │         │                   │                   │                          │
 * │         ▼                   ▼                   ▼                          │
 * │  ┌──────────────────────────────────────────────────────┐                  │
 * │  │                   STATE MANAGER                       │                  │
 * │  │  • SKU Registry    • Profile Pool    • Action Queue  │                  │
 * │  └──────────────────────────────────────────────────────┘                  │
 * │                              │                                              │
 * │         ┌────────────────────┼────────────────────┐                        │
 * │         ▼                    ▼                    ▼                        │
 * │  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
 * │  │   ALERTING   │    │   LOGGING    │    │   METRICS    │                  │
 * │  └──────────────┘    └──────────────┘    └──────────────┘                  │
 * │                                                                             │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

export const CONFIG = {
  // Polling intervals (ms)
  MONITOR_INTERVAL: 5000,
  HEALTH_CHECK_INTERVAL: 60000,
  
  // Throttle settings
  MAX_CONCURRENCY: 3,
  REQUEST_DELAY_MS: 500,
  AUTO_THROTTLE_THRESHOLD: 0.85,
  
  // Safety limits
  MAX_FAILURES_BEFORE_ABORT: 3,
  PROFILE_COOLDOWN_MS: 300000, // 5 minutes
  FLAP_DETECTION_WINDOW_MS: 60000,
  FLAP_THRESHOLD: 3,
  
  // Retry settings
  MAX_CHECKOUT_RETRIES: 2,
  RETRY_DELAY_MS: 1000,
  
  // Retailers
  RETAILERS: {
    TARGET: {
      name: 'Target',
      baseUrl: 'https://www.target.com',
      checkoutFlow: 'standard',
      requiresLogin: true,
      supportedFulfillment: ['shipping', 'pickup'],
    },
    WALMART: {
      name: 'Walmart',
      baseUrl: 'https://www.walmart.com',
      checkoutFlow: 'standard',
      requiresLogin: true,
      supportedFulfillment: ['shipping', 'pickup'],
    },
    BESTBUY: {
      name: 'Best Buy',
      baseUrl: 'https://www.bestbuy.com',
      checkoutFlow: 'queue',
      requiresLogin: true,
      supportedFulfillment: ['shipping', 'pickup'],
    },
    POKEMON_CENTER: {
      name: 'Pokemon Center',
      baseUrl: 'https://www.pokemoncenter.com',
      checkoutFlow: 'queue',
      requiresLogin: true,
      supportedFulfillment: ['shipping'],
    },
    GAMESTOP: {
      name: 'GameStop',
      baseUrl: 'https://www.gamestop.com',
      checkoutFlow: 'standard',
      requiresLogin: true,
      supportedFulfillment: ['shipping', 'pickup'],
    },
    AMAZON: {
      name: 'Amazon',
      baseUrl: 'https://www.amazon.com',
      checkoutFlow: 'one-click',
      requiresLogin: true,
      supportedFulfillment: ['shipping'],
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} SKU
 * @property {string} id - Unique SKU identifier
 * @property {string} name - Product name
 * @property {string} retailer - Retailer key
 * @property {string} url - Product page URL
 * @property {number} msrp - Manufacturer suggested retail price
 * @property {number} price - Current price
 * @property {string} status - COMING_SOON | SOFT_LAUNCH | LIVE | OOS
 * @property {string} stock - IN_STOCK | LIMITED | REGIONAL | OOS
 * @property {number} priority - 1 (high) | 2 (medium) | 3 (low)
 * @property {number} lastCheck - Timestamp of last check
 * @property {Object} history - State change history
 */

/**
 * @typedef {Object} Profile
 * @property {string} id - Unique profile identifier
 * @property {string} name - Display name
 * @property {Object} shipping - Shipping address details
 * @property {Object} payment - Payment method reference
 * @property {Object} credentials - Encrypted retailer credentials
 * @property {number} health - Health score 0-100
 * @property {number} successRate - Success rate 0-1
 * @property {string} status - READY | COOLING | BANNED | VIRGIN
 * @property {number} lastUsed - Timestamp of last use
 * @property {number} failures - Consecutive failure count
 * @property {number} successes - Total success count
 */

/**
 * @typedef {Object} Action
 * @property {string} id - Unique action identifier
 * @property {string} skuId - Target SKU
 * @property {string} profileId - Profile to use
 * @property {string} type - CHECKOUT | ADD_TO_CART | MONITOR
 * @property {string} status - PENDING | EXECUTING | SUCCESS | FAILED | ABORTED
 * @property {number} created - Creation timestamp
 * @property {number} executed - Execution timestamp
 * @property {Object} result - Action result details
 */

// ═══════════════════════════════════════════════════════════════════════════════
// STATE MANAGER
// ═══════════════════════════════════════════════════════════════════════════════

class StateManager {
  constructor() {
    this.skus = new Map();
    this.profiles = new Map();
    this.actionQueue = [];
    this.logs = [];
    this.metrics = {
      totalAttempts: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      byRetailer: {},
      bySKU: {},
    };
    this.systemStatus = {
      mode: 'STANDBY', // STANDBY | ARMED | PAUSED
      throttle: 0.5,
      activeTasks: 0,
      lastDrop: null,
    };
  }

  // SKU Management
  addSKU(sku) {
    this.skus.set(sku.id, {
      ...sku,
      history: [],
      lastCheck: Date.now(),
    });
    this.log('INFO', `SKU added: ${sku.name}`, { skuId: sku.id });
  }

  updateSKU(id, updates) {
    const sku = this.skus.get(id);
    if (!sku) return null;

    const oldStatus = sku.status;
    const oldStock = sku.stock;
    
    const updated = { ...sku, ...updates, lastCheck: Date.now() };
    
    // Track state changes
    if (oldStatus !== updates.status || oldStock !== updates.stock) {
      updated.history.push({
        timestamp: Date.now(),
        oldStatus,
        newStatus: updates.status,
        oldStock,
        newStock: updates.stock,
      });
      
      // Detect flapping
      const recentChanges = updated.history.filter(
        h => Date.now() - h.timestamp < CONFIG.FLAP_DETECTION_WINDOW_MS
      );
      if (recentChanges.length >= CONFIG.FLAP_THRESHOLD) {
        updated.status = 'FLAPPING';
        this.log('WARN', `Inventory flapping detected`, { skuId: id, changes: recentChanges.length });
      }
    }
    
    this.skus.set(id, updated);
    return updated;
  }

  getSKU(id) {
    return this.skus.get(id);
  }

  getAllSKUs() {
    return Array.from(this.skus.values());
  }

  // Profile Management
  addProfile(profile) {
    this.profiles.set(profile.id, {
      ...profile,
      health: 100,
      successRate: 1,
      status: 'VIRGIN',
      lastUsed: null,
      failures: 0,
      successes: 0,
    });
    this.log('INFO', `Profile added: ${profile.name}`, { profileId: profile.id });
  }

  updateProfile(id, updates) {
    const profile = this.profiles.get(id);
    if (!profile) return null;
    
    const updated = { ...profile, ...updates };
    
    // Recalculate health score
    if (updates.failures !== undefined || updates.successes !== undefined) {
      const total = updated.successes + updated.failures;
      updated.successRate = total > 0 ? updated.successes / total : 1;
      updated.health = Math.max(0, Math.min(100, 
        100 - (updated.failures * 5) + (updated.successes * 2)
      ));
      
      // Auto-cooling
      if (updated.failures >= CONFIG.MAX_FAILURES_BEFORE_ABORT) {
        updated.status = 'COOLING';
        this.log('WARN', `Profile marked COOLING after ${updated.failures} failures`, { profileId: id });
      }
    }
    
    this.profiles.set(id, updated);
    return updated;
  }

  getProfile(id) {
    return this.profiles.get(id);
  }

  getAllProfiles() {
    return Array.from(this.profiles.values());
  }

  getBestProfile() {
    const available = this.getAllProfiles()
      .filter(p => p.status === 'READY' || p.status === 'VIRGIN')
      .sort((a, b) => b.health - a.health);
    return available[0] || null;
  }

  // Action Queue
  enqueueAction(action) {
    const newAction = {
      ...action,
      id: `ACT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      status: 'PENDING',
      created: Date.now(),
    };
    this.actionQueue.push(newAction);
    return newAction;
  }

  dequeueAction() {
    const pending = this.actionQueue.filter(a => a.status === 'PENDING');
    if (pending.length === 0) return null;
    
    // Prioritize by SKU priority and creation time
    pending.sort((a, b) => {
      const skuA = this.getSKU(a.skuId);
      const skuB = this.getSKU(b.skuId);
      const priorityDiff = (skuA?.priority || 3) - (skuB?.priority || 3);
      if (priorityDiff !== 0) return priorityDiff;
      return a.created - b.created;
    });
    
    const action = pending[0];
    action.status = 'EXECUTING';
    return action;
  }

  updateAction(id, updates) {
    const index = this.actionQueue.findIndex(a => a.id === id);
    if (index === -1) return null;
    
    this.actionQueue[index] = { ...this.actionQueue[index], ...updates };
    return this.actionQueue[index];
  }

  // Logging
  log(type, message, meta = {}) {
    const entry = {
      id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      type, // INFO | WARN | DETECT | SUCCESS | FAIL
      message,
      ...meta,
    };
    this.logs.unshift(entry);
    
    // Keep only last 1000 logs
    if (this.logs.length > 1000) {
      this.logs = this.logs.slice(0, 1000);
    }
    
    return entry;
  }

  getLogs(filter = {}) {
    let logs = this.logs;
    
    if (filter.type) {
      logs = logs.filter(l => l.type === filter.type);
    }
    if (filter.skuId) {
      logs = logs.filter(l => l.skuId === filter.skuId);
    }
    if (filter.retailer) {
      logs = logs.filter(l => l.retailer === filter.retailer);
    }
    if (filter.limit) {
      logs = logs.slice(0, filter.limit);
    }
    
    return logs;
  }

  // Metrics
  recordAttempt(success, skuId, retailer) {
    this.metrics.totalAttempts++;
    if (success) {
      this.metrics.totalSuccesses++;
    } else {
      this.metrics.totalFailures++;
    }
    
    // By retailer
    if (!this.metrics.byRetailer[retailer]) {
      this.metrics.byRetailer[retailer] = { attempts: 0, successes: 0 };
    }
    this.metrics.byRetailer[retailer].attempts++;
    if (success) this.metrics.byRetailer[retailer].successes++;
    
    // By SKU
    if (!this.metrics.bySKU[skuId]) {
      this.metrics.bySKU[skuId] = { attempts: 0, successes: 0 };
    }
    this.metrics.bySKU[skuId].attempts++;
    if (success) this.metrics.bySKU[skuId].successes++;
  }

  // System Status
  setMode(mode) {
    this.systemStatus.mode = mode;
    this.log('INFO', `System mode changed to ${mode}`);
  }

  updateThrottle(factor) {
    this.systemStatus.throttle = Math.max(0.1, Math.min(1, factor));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MONITOR SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

class MonitorService {
  constructor(stateManager) {
    this.state = stateManager;
    this.isRunning = false;
    this.intervalId = null;
  }

  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.state.log('INFO', 'Monitor service started');
    
    this.intervalId = setInterval(() => {
      this.checkAllSKUs();
    }, CONFIG.MONITOR_INTERVAL);
    
    // Initial check
    this.checkAllSKUs();
  }

  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.state.log('INFO', 'Monitor service stopped');
  }

  async checkAllSKUs() {
    const skus = this.state.getAllSKUs();
    const batchSize = Math.ceil(CONFIG.MAX_CONCURRENCY * this.state.systemStatus.throttle);
    
    for (let i = 0; i < skus.length; i += batchSize) {
      const batch = skus.slice(i, i + batchSize);
      await Promise.all(batch.map(sku => this.checkSKU(sku)));
      
      // Delay between batches
      if (i + batchSize < skus.length) {
        await this.delay(CONFIG.REQUEST_DELAY_MS);
      }
    }
  }

  async checkSKU(sku) {
    try {
      // This would be replaced with actual retailer-specific API calls
      const result = await this.fetchProductState(sku);
      
      const oldStatus = sku.status;
      const updated = this.state.updateSKU(sku.id, result);
      
      // Detect state transitions
      if (oldStatus !== result.status) {
        this.handleStateTransition(sku, oldStatus, result.status);
      }
      
      return updated;
    } catch (error) {
      this.state.log('WARN', `Failed to check SKU: ${error.message}`, { skuId: sku.id });
      return null;
    }
  }

  async fetchProductState(sku) {
    // Placeholder for actual implementation
    // Would use Puppeteer/Playwright or retailer APIs
    return {
      status: sku.status,
      stock: sku.stock,
      price: sku.price,
    };
  }

  handleStateTransition(sku, oldStatus, newStatus) {
    this.state.log('DETECT', `State change: ${oldStatus} → ${newStatus}`, {
      skuId: sku.id,
      retailer: sku.retailer,
    });
    
    // Check if this triggers an action
    if (this.state.systemStatus.mode === 'ARMED') {
      if (
        (newStatus === 'LIVE' || newStatus === 'SOFT_LAUNCH') &&
        (sku.stock === 'IN_STOCK' || sku.stock === 'LIMITED')
      ) {
        this.state.log('DETECT', `Drop detected - queueing action`, { skuId: sku.id });
        this.state.systemStatus.lastDrop = Date.now();
        
        // Queue checkout action
        const profile = this.state.getBestProfile();
        if (profile) {
          this.state.enqueueAction({
            skuId: sku.id,
            profileId: profile.id,
            type: 'CHECKOUT',
          });
        } else {
          this.state.log('WARN', `No available profiles for checkout`, { skuId: sku.id });
        }
      }
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIRMATION SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

class ConfirmationService {
  constructor(stateManager) {
    this.state = stateManager;
  }

  async confirmAvailability(sku) {
    const checks = await Promise.all([
      this.checkPageElements(sku),
      this.checkAddToCart(sku),
      this.checkFulfillment(sku),
    ]);
    
    const allPassed = checks.every(c => c.passed);
    
    this.state.log(
      allPassed ? 'INFO' : 'WARN',
      `Availability confirmation: ${allPassed ? 'PASSED' : 'FAILED'}`,
      { skuId: sku.id, checks }
    );
    
    return {
      confirmed: allPassed,
      checks,
    };
  }

  async checkPageElements(sku) {
    // Check multiple page elements for consistency
    // Would check: price display, stock indicator, buy button state
    return { name: 'pageElements', passed: true, details: {} };
  }

  async checkAddToCart(sku) {
    // Verify add-to-cart is actually clickable
    // Some retailers show button but disable it
    return { name: 'addToCart', passed: true, details: {} };
  }

  async checkFulfillment(sku) {
    // Check shipping vs pickup availability
    // May vary by region
    return { 
      name: 'fulfillment', 
      passed: true, 
      details: { 
        shipping: true, 
        pickup: false 
      } 
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTION SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

class ExecutionService {
  constructor(stateManager, confirmationService) {
    this.state = stateManager;
    this.confirmation = confirmationService;
    this.isRunning = false;
    this.activeTasks = 0;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.processQueue();
    this.state.log('INFO', 'Execution service started');
  }

  stop() {
    this.isRunning = false;
    this.state.log('INFO', 'Execution service stopped');
  }

  async processQueue() {
    while (this.isRunning) {
      const maxConcurrent = Math.ceil(
        CONFIG.MAX_CONCURRENCY * this.state.systemStatus.throttle
      );
      
      if (this.activeTasks < maxConcurrent) {
        const action = this.state.dequeueAction();
        if (action) {
          this.executeAction(action);
        }
      }
      
      await this.delay(100);
    }
  }

  async executeAction(action) {
    this.activeTasks++;
    this.state.systemStatus.activeTasks = this.activeTasks;
    
    try {
      const sku = this.state.getSKU(action.skuId);
      const profile = this.state.getProfile(action.profileId);
      
      if (!sku || !profile) {
        throw new Error('Invalid SKU or profile');
      }
      
      // Confirm availability
      const confirmation = await this.confirmation.confirmAvailability(sku);
      if (!confirmation.confirmed) {
        throw new Error('Availability confirmation failed');
      }
      
      // Execute checkout
      const result = await this.executeCheckout(sku, profile);
      
      // Update states
      this.state.updateAction(action.id, {
        status: 'SUCCESS',
        executed: Date.now(),
        result,
      });
      
      this.state.updateProfile(profile.id, {
        lastUsed: Date.now(),
        successes: profile.successes + 1,
        failures: 0, // Reset consecutive failures
        status: 'READY',
      });
      
      this.state.recordAttempt(true, sku.id, sku.retailer);
      this.state.log('SUCCESS', `Checkout complete`, {
        skuId: sku.id,
        profileId: profile.id,
        orderId: result.orderId,
      });
      
    } catch (error) {
      const profile = this.state.getProfile(action.profileId);
      const sku = this.state.getSKU(action.skuId);
      
      this.state.updateAction(action.id, {
        status: 'FAILED',
        executed: Date.now(),
        result: { error: error.message },
      });
      
      if (profile) {
        this.state.updateProfile(profile.id, {
          lastUsed: Date.now(),
          failures: profile.failures + 1,
        });
      }
      
      if (sku) {
        this.state.recordAttempt(false, sku.id, sku.retailer);
      }
      
      this.state.log('FAIL', `Checkout failed: ${error.message}`, {
        skuId: action.skuId,
        profileId: action.profileId,
      });
      
      // Retry logic
      if (action.retries === undefined) action.retries = 0;
      if (action.retries < CONFIG.MAX_CHECKOUT_RETRIES) {
        await this.delay(CONFIG.RETRY_DELAY_MS);
        this.state.enqueueAction({
          ...action,
          retries: action.retries + 1,
        });
      }
    } finally {
      this.activeTasks--;
      this.state.systemStatus.activeTasks = this.activeTasks;
    }
  }

  async executeCheckout(sku, profile) {
    // This would be replaced with actual checkout automation
    // Using Puppeteer/Playwright with the retailer-specific flow
    
    const retailerConfig = CONFIG.RETAILERS[sku.retailer.toUpperCase().replace(' ', '_')];
    
    switch (retailerConfig?.checkoutFlow) {
      case 'one-click':
        return this.oneClickCheckout(sku, profile);
      case 'queue':
        return this.queueCheckout(sku, profile);
      case 'standard':
      default:
        return this.standardCheckout(sku, profile);
    }
  }

  async standardCheckout(sku, profile) {
    // Standard checkout flow:
    // 1. Add to cart
    // 2. Go to cart
    // 3. Proceed to checkout
    // 4. Enter/confirm shipping
    // 5. Enter/confirm payment
    // 6. Place order
    return { orderId: `ORD-${Date.now()}` };
  }

  async oneClickCheckout(sku, profile) {
    // One-click flow (Amazon-style):
    // 1. Click buy now
    // 2. Confirm
    return { orderId: `ORD-${Date.now()}` };
  }

  async queueCheckout(sku, profile) {
    // Queue-based flow (Pokemon Center-style):
    // 1. Enter queue
    // 2. Wait for turn
    // 3. Complete checkout within time limit
    return { orderId: `ORD-${Date.now()}` };
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ALERT SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

class AlertService {
  constructor(stateManager) {
    this.state = stateManager;
    this.handlers = {
      push: [],
      sms: [],
      email: [],
      slack: [],
    };
  }

  registerHandler(type, handler) {
    if (this.handlers[type]) {
      this.handlers[type].push(handler);
    }
  }

  async alert(type, message, data = {}) {
    const alert = {
      type, // SUCCESS | FAIL | DROP | WARN | INFO
      message,
      data,
      timestamp: Date.now(),
    };
    
    // Determine channels based on alert type
    const channels = this.getChannels(type);
    
    await Promise.all(
      channels.map(channel => this.sendToChannel(channel, alert))
    );
  }

  getChannels(alertType) {
    switch (alertType) {
      case 'SUCCESS':
        return ['push', 'slack'];
      case 'FAIL':
        return ['push'];
      case 'DROP':
        return ['push', 'sms', 'slack'];
      case 'WARN':
        return ['push'];
      default:
        return ['push'];
    }
  }

  async sendToChannel(channel, alert) {
    for (const handler of this.handlers[channel]) {
      try {
        await handler(alert);
      } catch (error) {
        this.state.log('WARN', `Alert handler failed: ${channel}`, { error: error.message });
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

export class PurchasingEngine {
  constructor() {
    this.state = new StateManager();
    this.monitor = new MonitorService(this.state);
    this.confirmation = new ConfirmationService(this.state);
    this.execution = new ExecutionService(this.state, this.confirmation);
    this.alerts = new AlertService(this.state);
    
    // Wire up alerts
    this.setupAlerts();
  }

  setupAlerts() {
    // Listen for state changes and trigger alerts
    const originalLog = this.state.log.bind(this.state);
    this.state.log = (type, message, meta = {}) => {
      const entry = originalLog(type, message, meta);
      
      // Trigger alerts for important events
      if (type === 'SUCCESS') {
        this.alerts.alert('SUCCESS', message, meta);
      } else if (type === 'DETECT' && message.includes('Drop detected')) {
        this.alerts.alert('DROP', message, meta);
      } else if (type === 'FAIL') {
        this.alerts.alert('FAIL', message, meta);
      }
      
      return entry;
    };
  }

  // Public API
  arm() {
    this.state.setMode('ARMED');
    this.monitor.start();
    this.execution.start();
  }

  disarm() {
    this.state.setMode('STANDBY');
    this.monitor.stop();
    this.execution.stop();
  }

  addSKU(sku) {
    return this.state.addSKU(sku);
  }

  removeSKU(id) {
    return this.state.skus.delete(id);
  }

  addProfile(profile) {
    return this.state.addProfile(profile);
  }

  removeProfile(id) {
    return this.state.profiles.delete(id);
  }

  getStatus() {
    return {
      system: this.state.systemStatus,
      skus: this.state.getAllSKUs(),
      profiles: this.state.getAllProfiles(),
      queue: this.state.actionQueue,
      metrics: this.state.metrics,
    };
  }

  getLogs(filter) {
    return this.state.getLogs(filter);
  }

  registerAlertHandler(channel, handler) {
    this.alerts.registerHandler(channel, handler);
  }
}

// Export singleton instance
export const engine = new PurchasingEngine();
