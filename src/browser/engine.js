// ═══════════════════════════════════════════════════════════════════════════════
// BROWSER AUTOMATION ENGINE
// Playwright-based browser pool with stealth and fingerprint rotation
// ═══════════════════════════════════════════════════════════════════════════════

import { chromium, firefox } from 'playwright';
import { EventEmitter } from 'events';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const CONFIG = {
  POOL_SIZE: 5,
  CONTEXT_TIMEOUT: 300000, // 5 minutes
  PAGE_TIMEOUT: 30000,
  NAVIGATION_TIMEOUT: 15000,
  
  // Stealth settings
  STEALTH: {
    webdriver: false,
    chrome: true,
    permissions: ['geolocation'],
  },
  
  // Viewport presets (realistic device sizes)
  VIEWPORTS: [
    { width: 1920, height: 1080 },
    { width: 1536, height: 864 },
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1280, height: 720 },
  ],
  
  // User agent rotation
  USER_AGENTS: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// BROWSER POOL
// ═══════════════════════════════════════════════════════════════════════════════

export class BrowserPool extends EventEmitter {
  constructor(options = {}) {
    super();
    this.poolSize = options.poolSize || CONFIG.POOL_SIZE;
    this.browsers = [];
    this.contexts = new Map(); // profileId -> context
    this.available = [];
    this.waiting = [];
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;
    
    console.log(`[BrowserPool] Initializing pool with ${this.poolSize} browsers...`);
    
    for (let i = 0; i < this.poolSize; i++) {
      const browser = await this.launchBrowser();
      this.browsers.push(browser);
      this.available.push(browser);
    }
    
    this.isInitialized = true;
    this.emit('initialized', { count: this.poolSize });
    console.log(`[BrowserPool] Pool initialized`);
  }

  async launchBrowser() {
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-site-isolation-trials',
        '--disable-web-security',
        '--disable-features=BlockInsecurePrivateNetworkRequests',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
      ],
    });
    
    browser.on('disconnected', () => {
      this.handleBrowserDisconnect(browser);
    });
    
    return browser;
  }

  async handleBrowserDisconnect(browser) {
    console.log('[BrowserPool] Browser disconnected, replacing...');
    
    const index = this.browsers.indexOf(browser);
    if (index > -1) {
      this.browsers.splice(index, 1);
    }
    
    const availIndex = this.available.indexOf(browser);
    if (availIndex > -1) {
      this.available.splice(availIndex, 1);
    }
    
    // Launch replacement
    try {
      const newBrowser = await this.launchBrowser();
      this.browsers.push(newBrowser);
      this.available.push(newBrowser);
      this.emit('browserReplaced');
    } catch (error) {
      console.error('[BrowserPool] Failed to replace browser:', error);
      this.emit('error', error);
    }
  }

  async acquireContext(profileId, profileConfig = {}) {
    // Check if context already exists for this profile
    if (this.contexts.has(profileId)) {
      const existing = this.contexts.get(profileId);
      if (existing.context && !existing.context.isClosed?.()) {
        return existing;
      }
    }
    
    // Get available browser
    let browser;
    if (this.available.length > 0) {
      browser = this.available.shift();
    } else {
      // Wait for available browser
      browser = await new Promise((resolve) => {
        this.waiting.push(resolve);
      });
    }
    
    // Create isolated context with fingerprint
    const context = await this.createStealthContext(browser, profileConfig);
    
    const contextWrapper = {
      browser,
      context,
      profileId,
      createdAt: Date.now(),
    };
    
    this.contexts.set(profileId, contextWrapper);
    
    return contextWrapper;
  }

  async createStealthContext(browser, profileConfig) {
    const viewport = profileConfig.viewport || 
      CONFIG.VIEWPORTS[Math.floor(Math.random() * CONFIG.VIEWPORTS.length)];
    
    const userAgent = profileConfig.userAgent ||
      CONFIG.USER_AGENTS[Math.floor(Math.random() * CONFIG.USER_AGENTS.length)];
    
    const context = await browser.newContext({
      viewport,
      userAgent,
      locale: profileConfig.locale || 'en-US',
      timezoneId: profileConfig.timezone || 'America/New_York',
      geolocation: profileConfig.geolocation || { latitude: 34.7465, longitude: -82.2566 }, // Easley, SC
      permissions: ['geolocation'],
      
      // Load saved state if available
      storageState: profileConfig.storageState || undefined,
      
      // Additional stealth
      bypassCSP: true,
      ignoreHTTPSErrors: true,
      
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
      },
    });
    
    // Apply stealth scripts to every page
    await context.addInitScript(() => {
      // Override webdriver detection
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
      
      // Override plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
          { name: 'Native Client', filename: 'internal-nacl-plugin' },
        ],
      });
      
      // Override languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
      
      // Override permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(parameters)
      );
      
      // Fake chrome runtime
      window.chrome = {
        runtime: {},
        loadTimes: () => {},
        csi: () => {},
        app: {},
      };
    });
    
    return context;
  }

  async releaseContext(profileId, keepState = true) {
    const wrapper = this.contexts.get(profileId);
    if (!wrapper) return;
    
    // Save storage state if requested
    if (keepState && wrapper.context) {
      try {
        wrapper.storageState = await wrapper.context.storageState();
      } catch (e) {
        console.warn('[BrowserPool] Failed to save storage state:', e.message);
      }
    }
    
    // Close context
    try {
      await wrapper.context?.close();
    } catch (e) {
      // Context may already be closed
    }
    
    // Return browser to pool
    if (wrapper.browser && !wrapper.browser.isConnected?.()) {
      this.available.push(wrapper.browser);
      
      // Fulfill waiting requests
      if (this.waiting.length > 0) {
        const resolve = this.waiting.shift();
        resolve(this.available.shift());
      }
    }
    
    this.contexts.delete(profileId);
  }

  async getPage(profileId) {
    const wrapper = this.contexts.get(profileId);
    if (!wrapper?.context) {
      throw new Error(`No context for profile: ${profileId}`);
    }
    
    const pages = wrapper.context.pages();
    if (pages.length > 0) {
      return pages[0];
    }
    
    return await wrapper.context.newPage();
  }

  async shutdown() {
    console.log('[BrowserPool] Shutting down...');
    
    // Close all contexts
    for (const [profileId, wrapper] of this.contexts) {
      await this.releaseContext(profileId, false);
    }
    
    // Close all browsers
    for (const browser of this.browsers) {
      try {
        await browser.close();
      } catch (e) {
        // Browser may already be closed
      }
    }
    
    this.browsers = [];
    this.available = [];
    this.contexts.clear();
    this.isInitialized = false;
    
    this.emit('shutdown');
    console.log('[BrowserPool] Shutdown complete');
  }

  getStats() {
    return {
      totalBrowsers: this.browsers.length,
      availableBrowsers: this.available.length,
      activeContexts: this.contexts.size,
      waitingRequests: this.waiting.length,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

export class PageUtils {
  constructor(page) {
    this.page = page;
  }

  async waitAndClick(selector, options = {}) {
    const { timeout = CONFIG.PAGE_TIMEOUT, force = false } = options;
    
    await this.page.waitForSelector(selector, { 
      state: 'visible', 
      timeout 
    });
    
    // Small random delay to appear human
    await this.humanDelay(100, 300);
    
    await this.page.click(selector, { force });
  }

  async waitAndFill(selector, value, options = {}) {
    const { timeout = CONFIG.PAGE_TIMEOUT, clear = true } = options;
    
    await this.page.waitForSelector(selector, { 
      state: 'visible', 
      timeout 
    });
    
    if (clear) {
      await this.page.fill(selector, '');
    }
    
    // Type with human-like delays
    await this.page.type(selector, value, { 
      delay: this.randomInt(30, 80) 
    });
  }

  async waitForNavigation(options = {}) {
    const { timeout = CONFIG.NAVIGATION_TIMEOUT } = options;
    
    await this.page.waitForLoadState('domcontentloaded', { timeout });
  }

  async waitForNetworkIdle(options = {}) {
    const { timeout = CONFIG.PAGE_TIMEOUT } = options;
    
    await this.page.waitForLoadState('networkidle', { timeout });
  }

  async humanDelay(min = 500, max = 1500) {
    const delay = this.randomInt(min, max);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  async scrollToElement(selector) {
    await this.page.evaluate((sel) => {
      const element = document.querySelector(sel);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, selector);
    
    await this.humanDelay(200, 500);
  }

  async isVisible(selector, timeout = 3000) {
    try {
      await this.page.waitForSelector(selector, { 
        state: 'visible', 
        timeout 
      });
      return true;
    } catch {
      return false;
    }
  }

  async getText(selector) {
    try {
      return await this.page.textContent(selector);
    } catch {
      return null;
    }
  }

  async getAttribute(selector, attribute) {
    try {
      return await this.page.getAttribute(selector, attribute);
    } catch {
      return null;
    }
  }

  async screenshot(path) {
    await this.page.screenshot({ path, fullPage: true });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export const browserPool = new BrowserPool();

export default {
  BrowserPool,
  PageUtils,
  browserPool,
  CONFIG,
};
