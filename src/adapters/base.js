// ═══════════════════════════════════════════════════════════════════════════════
// BASE RETAILER ADAPTER
// Abstract class for retailer-specific implementations
// ═══════════════════════════════════════════════════════════════════════════════

import { PageUtils } from '../browser/engine.js';
import { EventEmitter } from 'events';

// ═══════════════════════════════════════════════════════════════════════════════
// ADAPTER TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export const CheckoutFlowType = {
  STANDARD: 'standard',     // Traditional multi-step checkout
  QUEUE: 'queue',           // Queue/waiting room before checkout
  ONE_CLICK: 'one-click',   // Single-click purchase
  EXPRESS: 'express',       // Express/fast checkout
};

export const InventoryStatus = {
  IN_STOCK: 'IN_STOCK',
  LIMITED: 'LIMITED',
  REGIONAL: 'REGIONAL',
  BACKORDER: 'BACKORDER',
  OOS: 'OOS',
  UNKNOWN: 'UNKNOWN',
};

export const ProductStatus = {
  COMING_SOON: 'COMING_SOON',
  SOFT_LAUNCH: 'SOFT_LAUNCH',
  LIVE: 'LIVE',
  SOLD_OUT: 'SOLD_OUT',
  DISCONTINUED: 'DISCONTINUED',
};

export const CheckoutResult = {
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  OOS_DURING_CHECKOUT: 'OOS_DURING_CHECKOUT',
  PAYMENT_DECLINED: 'PAYMENT_DECLINED',
  QUEUE_TIMEOUT: 'QUEUE_TIMEOUT',
  CAPTCHA_REQUIRED: 'CAPTCHA_REQUIRED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  RATE_LIMITED: 'RATE_LIMITED',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
};

// ═══════════════════════════════════════════════════════════════════════════════
// BASE ADAPTER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class BaseRetailerAdapter extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.name = 'Base';
    this.baseUrl = '';
    this.checkoutFlowType = CheckoutFlowType.STANDARD;
    
    // Timeouts
    this.pageTimeout = config.pageTimeout || 30000;
    this.checkoutTimeout = config.checkoutTimeout || 60000;
    this.queueTimeout = config.queueTimeout || 300000; // 5 minutes
    
    // Selectors (to be overridden)
    this.selectors = {
      // Product page
      productTitle: '',
      productPrice: '',
      addToCartButton: '',
      outOfStockIndicator: '',
      
      // Cart
      cartIcon: '',
      cartCount: '',
      cartItems: '',
      cartTotal: '',
      checkoutButton: '',
      
      // Checkout
      shippingForm: '',
      paymentForm: '',
      placeOrderButton: '',
      orderConfirmation: '',
      
      // Auth
      loginForm: '',
      emailInput: '',
      passwordInput: '',
      loginButton: '',
    };
    
    // Page utilities (set when page is attached)
    this.page = null;
    this.utils = null;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // LIFECYCLE
  // ─────────────────────────────────────────────────────────────────────────────

  attachPage(page) {
    this.page = page;
    this.utils = new PageUtils(page);
  }

  detachPage() {
    this.page = null;
    this.utils = null;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // AUTHENTICATION (Override in subclasses)
  // ─────────────────────────────────────────────────────────────────────────────

  async login(credentials) {
    throw new Error('login() must be implemented by subclass');
  }

  async isLoggedIn() {
    throw new Error('isLoggedIn() must be implemented by subclass');
  }

  async logout() {
    throw new Error('logout() must be implemented by subclass');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PRODUCT MONITORING (Override in subclasses)
  // ─────────────────────────────────────────────────────────────────────────────

  async checkProduct(productUrl) {
    throw new Error('checkProduct() must be implemented by subclass');
  }

  async getProductDetails(productUrl) {
    throw new Error('getProductDetails() must be implemented by subclass');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CART OPERATIONS (Override in subclasses)
  // ─────────────────────────────────────────────────────────────────────────────

  async addToCart(productUrl, quantity = 1) {
    throw new Error('addToCart() must be implemented by subclass');
  }

  async getCartContents() {
    throw new Error('getCartContents() must be implemented by subclass');
  }

  async clearCart() {
    throw new Error('clearCart() must be implemented by subclass');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CHECKOUT (Override in subclasses)
  // ─────────────────────────────────────────────────────────────────────────────

  async checkout(profile) {
    throw new Error('checkout() must be implemented by subclass');
  }

  async enterShipping(shippingInfo) {
    throw new Error('enterShipping() must be implemented by subclass');
  }

  async enterPayment(paymentInfo) {
    throw new Error('enterPayment() must be implemented by subclass');
  }

  async placeOrder() {
    throw new Error('placeOrder() must be implemented by subclass');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // UTILITY METHODS (Shared implementations)
  // ─────────────────────────────────────────────────────────────────────────────

  async navigateTo(url) {
    this.emit('navigating', { url });
    
    await this.page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: this.pageTimeout,
    });
    
    await this.utils.humanDelay(500, 1000);
    this.emit('navigated', { url });
  }

  async waitForSelector(selector, options = {}) {
    const { timeout = this.pageTimeout, state = 'visible' } = options;
    
    return await this.page.waitForSelector(selector, { timeout, state });
  }

  async extractPrice(text) {
    if (!text) return null;
    
    // Extract numeric price from text like "$49.99" or "49.99 USD"
    const match = text.match(/[\d,]+\.?\d*/);
    if (match) {
      return parseFloat(match[0].replace(/,/g, ''));
    }
    return null;
  }

  async handleCaptcha() {
    // Base implementation - override for specific captcha handling
    this.emit('captchaDetected');
    throw new Error('Captcha detected - manual intervention required');
  }

  async handleQueue(timeout = this.queueTimeout) {
    // Base implementation for queue/waiting room
    this.emit('queueEntered');
    
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      // Check if still in queue
      const inQueue = await this.isInQueue();
      if (!inQueue) {
        this.emit('queuePassed');
        return true;
      }
      
      // Wait and check again
      await this.utils.humanDelay(2000, 5000);
    }
    
    this.emit('queueTimeout');
    throw new Error('Queue timeout exceeded');
  }

  async isInQueue() {
    // Override in subclasses that use queue systems
    return false;
  }

  async screenshot(name) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `screenshots/${this.name}_${name}_${timestamp}.png`;
    await this.page.screenshot({ path: filename, fullPage: true });
    return filename;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ERROR HANDLING
  // ─────────────────────────────────────────────────────────────────────────────

  classifyError(error) {
    const message = error.message?.toLowerCase() || '';
    
    if (message.includes('timeout')) {
      return CheckoutResult.QUEUE_TIMEOUT;
    }
    if (message.includes('captcha')) {
      return CheckoutResult.CAPTCHA_REQUIRED;
    }
    if (message.includes('out of stock') || message.includes('oos') || message.includes('sold out')) {
      return CheckoutResult.OOS_DURING_CHECKOUT;
    }
    if (message.includes('payment') || message.includes('declined') || message.includes('card')) {
      return CheckoutResult.PAYMENT_DECLINED;
    }
    if (message.includes('session') || message.includes('expired') || message.includes('login')) {
      return CheckoutResult.SESSION_EXPIRED;
    }
    if (message.includes('rate') || message.includes('limit') || message.includes('blocked')) {
      return CheckoutResult.RATE_LIMITED;
    }
    
    return CheckoutResult.UNKNOWN_ERROR;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADAPTER REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

class AdapterRegistry {
  constructor() {
    this.adapters = new Map();
  }

  register(name, AdapterClass) {
    this.adapters.set(name.toLowerCase(), AdapterClass);
  }

  get(name) {
    const AdapterClass = this.adapters.get(name.toLowerCase());
    if (!AdapterClass) {
      throw new Error(`No adapter registered for retailer: ${name}`);
    }
    return new AdapterClass();
  }

  has(name) {
    return this.adapters.has(name.toLowerCase());
  }

  list() {
    return Array.from(this.adapters.keys());
  }
}

export const adapterRegistry = new AdapterRegistry();

export default {
  BaseRetailerAdapter,
  CheckoutFlowType,
  InventoryStatus,
  ProductStatus,
  CheckoutResult,
  adapterRegistry,
};
