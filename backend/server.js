/**
 * DROPWATCH Engine v2.2
 * Phase 2: Stealth Layer + Always-On Monitoring
 *
 * Features:
 * - playwright-extra + stealth plugin (anti-bot detection)
 * - Residential proxy rotation from Supabase settings
 * - Browser fingerprint randomization
 * - Priority-based check intervals (critical=10s, high=30s, normal=60s, low=5min)
 * - Always-on watchdog loop (never sleeps)
 * - Full activity logging to Supabase activity_log
 * - Settings hot-reload from Supabase every 5 minutes
 * - Auto-starts on Railway deploy
 */

const express = require('express');
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createClient } = require('@supabase/supabase-js');

// ─── Stealth Plugin ───────────────────────────────────────────────────────────
chromium.use(StealthPlugin());

// ─── Supabase ─────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── Express App ──────────────────────────────────────────────────────────────
const app = express();

// CORS — allow Vercel frontend to reach Railway backend
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());
const PORT = process.env.PORT || 3001;

// ─── Engine State ─────────────────────────────────────────────────────────────
let engineState = {
  running: false,
  paused: false,
  startedAt: null,
  checksCompleted: 0,
  purchasesCompleted: 0,
  errors: 0,
  currentProduct: null,
  browser: null,
  settings: {},
  lastSettingsLoad: null,
};

const PRIORITY_INTERVALS = {
  critical: 10_000,
  high:     30_000,
  normal:   60_000,
  low:     300_000,
};

// ─── Fingerprint Randomization ────────────────────────────────────────────────
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
];

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
  { width: 2560, height: 1440 },
];

const LOCALES   = ['en-US', 'en-US', 'en-US', 'en-GB', 'en-CA'];
const TIMEZONES = ['America/New_York', 'America/Chicago', 'America/Los_Angeles', 'America/Denver'];

function randomFingerprint() {
  return {
    userAgent:        USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
    viewport:         VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)],
    locale:           LOCALES[Math.floor(Math.random() * LOCALES.length)],
    timezoneId:       TIMEZONES[Math.floor(Math.random() * TIMEZONES.length)],
    deviceScaleFactor: [1, 1, 1, 2][Math.floor(Math.random() * 4)],
    colorScheme:      'light',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
    },
  };
}

// ─── Settings Loader ──────────────────────────────────────────────────────────
async function loadSettings() {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .maybeSingle();
    if (error) throw error;
    engineState.settings = data || {};
    engineState.lastSettingsLoad = new Date().toISOString();
    console.log('[Settings] Loaded from Supabase:', JSON.stringify(engineState.settings));
  } catch (err) {
    console.error('[Settings] Failed to load:', err.message);
  }
}

// ─── Activity Logger ──────────────────────────────────────────────────────────
async function logActivity(type, message, data = {}) {
  const entry = { type, message, data, created_at: new Date().toISOString() };
  console.log(`[Activity][${type}] ${message}`);
  try {
    await supabase.from('activity_log').insert(entry);
  } catch (err) {
    console.error('[Activity] Log write failed:', err.message);
  }
}

// ─── Proxy Manager ────────────────────────────────────────────────────────────
function buildProxyConfig(settings) {
  if (!settings?.proxy_enabled || !settings?.proxy_list) return null;
  const proxies = settings.proxy_list.split('\n').map(p => p.trim()).filter(Boolean);
  if (!proxies.length) return null;
  const raw = proxies[Math.floor(Math.random() * proxies.length)];
  try {
    let server, username, password;
    const cleaned = raw.replace(/^https?:\/\//, '');
    if (cleaned.includes('@')) {
      const [creds, hostport] = cleaned.split('@');
      const [u, p] = creds.split(':');
      username = u; password = p;
      server = `http://${hostport}`;
    } else {
      server = `http://${cleaned}`;
    }
    return { server, username, password };
  } catch {
    console.error('[Proxy] Could not parse proxy:', raw);
    return null;
  }
}

// ─── Browser Factory ──────────────────────────────────────────────────────────
async function launchBrowser(proxyConfig) {
  const launchArgs = [
    '--no-sandbox', '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-infobars', '--disable-dev-shm-usage',
    '--disable-gpu', '--no-first-run', '--no-zygote', '--single-process',
  ];
  return await chromium.launch({
    headless: process.env.HEADLESS !== 'false',
    args: launchArgs,
    ...(proxyConfig ? { proxy: proxyConfig } : {}),
  });
}

async function createStealthContext(browser, fingerprint) {
  const context = await browser.newContext({
    userAgent: fingerprint.userAgent, viewport: fingerprint.viewport,
    locale: fingerprint.locale, timezoneId: fingerprint.timezoneId,
    deviceScaleFactor: fingerprint.deviceScaleFactor,
    colorScheme: fingerprint.colorScheme,
    extraHTTPHeaders: fingerprint.extraHTTPHeaders,
    permissions: ['geolocation'],
    geolocation: { latitude: 34.5, longitude: -82.6 },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    window.chrome = { runtime: {} };
  });
  return context;
}

// ─── Retailer Adapters ────────────────────────────────────────────────────────
const RETAILERS = {
  target: {
    name: 'Target',
    checkStock: async (page, keyword, maxPrice) => {
      await page.goto(`https://www.target.com/s?searchTerm=${encodeURIComponent(keyword)}&category=5xt1a`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000 + Math.random() * 2000);
      const products = await page.evaluate(() => {
        const items = [];
        document.querySelectorAll('[data-test="product-details"]').forEach(el => {
          const title = el.querySelector('[data-test="product-title"]')?.textContent?.trim();
          const priceEl = el.querySelector('[data-test="current-price"]');
          const price = priceEl ? parseFloat(priceEl.textContent.replace(/[^0-9.]/g, '')) : null;
          const addBtn = el.closest('[data-test^="product-card"]')?.querySelector('[data-test="shippingOrderPickup"]');
          const inStock = !!addBtn && !addBtn.disabled;
          const link = el.querySelector('a')?.href;
          if (title) items.push({ title, price, inStock, link });
        });
        return items;
      });
      return products.filter(p => p.inStock && (!maxPrice || p.price <= maxPrice));
    },
    purchase: async (page, product) => {
      await page.goto(product.link, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1500 + Math.random() * 1500);
      const addBtn = await page.$('[data-test="shippingOrderPickup"]');
      if (!addBtn) throw new Error('Add to cart button not found');
      await addBtn.click();
      await page.waitForTimeout(1000);
      await page.goto('https://www.target.com/cart', { waitUntil: 'domcontentloaded', timeout: 30000 });
      return { status: 'cart', message: 'Added to cart — manual checkout required' };
    },
  },
  walmart: {
    name: 'Walmart',
    checkStock: async (page, keyword, maxPrice) => {
      await page.goto(`https://www.walmart.com/search?q=${encodeURIComponent(keyword)}&cat_id=2536`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000 + Math.random() * 2000);
      const products = await page.evaluate(() => {
        const items = [];
        document.querySelectorAll('[data-item-id]').forEach(el => {
          const title = el.querySelector('[itemprop="name"]')?.textContent?.trim();
          const priceEl = el.querySelector('[itemprop="price"]');
          const price = priceEl ? parseFloat(priceEl.getAttribute('content')) : null;
          const addBtn = el.querySelector('button[aria-label*="Add to cart"]');
          const inStock = !!addBtn && !addBtn.disabled;
          const link = el.querySelector('a')?.href;
          if (title) items.push({ title, price, inStock, link });
        });
        return items;
      });
      return products.filter(p => p.inStock && (!maxPrice || p.price <= maxPrice));
    },
    purchase: async (page, product) => {
      await page.goto(product.link, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1500);
      const addBtn = await page.$('button[aria-label*="Add to cart"]');
      if (!addBtn) throw new Error('Add to cart button not found');
      await addBtn.click();
      return { status: 'cart', message: 'Added to cart — manual checkout required' };
    },
  },
  pokemon_center: {
    name: 'Pokemon Center',
    checkStock: async (page, keyword, maxPrice) => {
      await page.goto(`https://www.pokemoncenter.com/en-us/search#q=${encodeURIComponent(keyword)}&t=productType_card-games`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000 + Math.random() * 2000);
      const products = await page.evaluate(() => {
        const items = [];
        document.querySelectorAll('.product-tile').forEach(el => {
          const title = el.querySelector('.product-name')?.textContent?.trim();
          const priceEl = el.querySelector('.product-sales-price, .price');
          const price = priceEl ? parseFloat(priceEl.textContent.replace(/[^0-9.]/g, '')) : null;
          const addBtn = el.querySelector('button.add-to-cart');
          const inStock = !!addBtn && !addBtn.disabled && !addBtn.textContent.includes('Out of Stock');
          const link = el.querySelector('a.product-link')?.href;
          if (title) items.push({ title, price, inStock, link });
        });
        return items;
      });
      return products.filter(p => p.inStock && (!maxPrice || p.price <= maxPrice));
    },
    purchase: async (page, product) => {
      await page.goto(product.link, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);
      const addBtn = await page.$('button.add-to-cart');
      if (!addBtn) throw new Error('Add to cart button not found');
      await addBtn.click();
      return { status: 'cart', message: 'Added to cart — manual checkout required' };
    },
  },
  best_buy: {
    name: 'Best Buy',
    checkStock: async (page, keyword, maxPrice) => {
      await page.goto(`https://www.bestbuy.com/site/searchpage.jsp?st=${encodeURIComponent(keyword)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000 + Math.random() * 2000);
      const products = await page.evaluate(() => {
        const items = [];
        document.querySelectorAll('.sku-item').forEach(el => {
          const title = el.querySelector('.sku-title a')?.textContent?.trim();
          const priceEl = el.querySelector('[data-testid="customer-price"]');
          const price = priceEl ? parseFloat(priceEl.textContent.replace(/[^0-9.]/g, '')) : null;
          const addBtn = el.querySelector('.add-to-cart-button');
          const inStock = !!addBtn && !addBtn.disabled && !addBtn.textContent.includes('Sold Out');
          const link = el.querySelector('.sku-title a')?.href;
          if (title) items.push({ title, price, inStock, link });
        });
        return items;
      });
      return products.filter(p => p.inStock && (!maxPrice || p.price <= maxPrice));
    },
    purchase: async (page, product) => {
      await page.goto(product.link, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1500);
      const addBtn = await page.$('.add-to-cart-button');
      if (!addBtn) throw new Error('Add to cart button not found');
      await addBtn.click();
      return { status: 'cart', message: 'Added to cart — manual checkout required' };
    },
  },
  gamestop: {
    name: 'GameStop',
    checkStock: async (page, keyword, maxPrice) => {
      await page.goto(`https://www.gamestop.com/search#q=${encodeURIComponent(keyword)}&t=All`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2500 + Math.random() * 2000);
      const products = await page.evaluate(() => {
        const items = [];
        document.querySelectorAll('.product-tile').forEach(el => {
          const title = el.querySelector('.product-name')?.textContent?.trim();
          const priceEl = el.querySelector('.price-section .price');
          const price = priceEl ? parseFloat(priceEl.textContent.replace(/[^0-9.]/g, '')) : null;
          const addBtn = el.querySelector('.add-to-cart');
          const inStock = !!addBtn && !addBtn.disabled;
          const link = el.querySelector('a.product-link, a.thumb-link')?.href;
          if (title) items.push({ title, price, inStock, link });
        });
        return items;
      });
      return products.filter(p => p.inStock && (!maxPrice || p.price <= maxPrice));
    },
    purchase: async (page, product) => {
      await page.goto(product.link, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1500);
      const addBtn = await page.$('.add-to-cart');
      if (!addBtn) throw new Error('Add to cart button not found');
      await addBtn.click();
      return { status: 'cart', message: 'Added to cart — manual checkout required' };
    },
  },
  amazon: {
    name: 'Amazon',
    checkStock: async (page, keyword, maxPrice) => {
      await page.goto(`https://www.amazon.com/s?k=${encodeURIComponent(keyword)}&rh=n%3A166220011`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000 + Math.random() * 2000);
      const products = await page.evaluate(() => {
        const items = [];
        document.querySelectorAll('[data-component-type="s-search-result"]').forEach(el => {
          const title = el.querySelector('h2 a span')?.textContent?.trim();
          const priceWhole = el.querySelector('.a-price-whole')?.textContent?.replace(/[^0-9]/g, '');
          const priceFrac  = el.querySelector('.a-price-fraction')?.textContent?.replace(/[^0-9]/g, '') || '00';
          const price = priceWhole ? parseFloat(`${priceWhole}.${priceFrac}`) : null;
          const outOfStock = el.textContent.includes('Currently unavailable');
          const inStock = !outOfStock;
          const linkEl = el.querySelector('h2 a');
          const link = linkEl ? `https://www.amazon.com${linkEl.getAttribute('href')}` : null;
          if (title) items.push({ title, price, inStock, link });
        });
        return items;
      });
      return products.filter(p => p.inStock && (!maxPrice || p.price <= maxPrice));
    },
    purchase: async (page, product) => {
      await page.goto(product.link, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1500);
      const addBtn = await page.$('#add-to-cart-button');
      if (!addBtn) throw new Error('Add to cart button not found');
      await addBtn.click();
      return { status: 'cart', message: 'Added to cart — manual checkout required' };
    },
  },
};

// ─── Keyword Loader ───────────────────────────────────────────────────────────
async function loadKeywords() {
  const { data, error } = await supabase
    .from('keywords')
    .select('*')
    .eq('active', true)
    .order('priority', { ascending: true });
  if (error) { console.error('[Keywords] Failed to load:', error.message); return []; }
  return data || [];
}

// ─── Core Check Routine ───────────────────────────────────────────────────────
async function checkKeyword(keyword, proxyConfig) {
  const fingerprint = randomFingerprint();
  let browser = null, context = null, page = null;
  try {
    browser = await launchBrowser(proxyConfig);
    context = await createStealthContext(browser, fingerprint);
    page    = await context.newPage();
    await page.route('**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf,eot}', r => r.abort());
    const retailers = keyword.retailers || ['target', 'walmart'];
    const results   = [];
    for (const retailerKey of retailers) {
      const adapter = RETAILERS[retailerKey];
      if (!adapter) continue;
      try {
        await logActivity('check', `Checking ${adapter.name} for: ${keyword.term}`, { keyword: keyword.term, retailer: retailerKey, priority: keyword.priority });
        const inStock = await adapter.checkStock(page, keyword.term, keyword.max_price);
        engineState.checksCompleted++;
        if (inStock.length > 0) {
          await logActivity('check', `✅ IN STOCK at ${adapter.name}: ${inStock[0].title} — $${inStock[0].price}`, { keyword: keyword.term, retailer: retailerKey, products: inStock });
          results.push(...inStock.map(p => ({ ...p, retailer: retailerKey })));
        } else {
          await logActivity('check', `❌ Out of stock at ${adapter.name} for: ${keyword.term}`, { keyword: keyword.term, retailer: retailerKey });
        }
      } catch (err) {
        engineState.errors++;
        await logActivity('error', `Error checking ${adapter.name}: ${err.message}`, { keyword: keyword.term, retailer: retailerKey, error: err.message });
      }
    }
    const purchaseEnabled = engineState.settings?.auto_purchase_enabled;
    const dailyLimit      = engineState.settings?.daily_purchase_limit || 0;
    if (results.length > 0 && purchaseEnabled) {
      if (!dailyLimit || engineState.purchasesCompleted < dailyLimit) {
        for (const product of results.slice(0, keyword.max_quantity || 1)) {
          try {
            const adapter = RETAILERS[product.retailer];
            const result  = await adapter.purchase(page, product);
            engineState.purchasesCompleted++;
            await supabase.from('purchases').insert({ keyword_id: keyword.id, product_name: product.title, price: product.price, retailer: product.retailer, status: result.status, notes: result.message, purchased_at: new Date().toISOString() });
            await logActivity('purchase', `🛒 Purchased: ${product.title} @ $${product.price} from ${product.retailer}`, { product, result });
          } catch (err) {
            engineState.errors++;
            await logActivity('error', `Purchase failed: ${err.message}`, { product, error: err.message });
          }
        }
      }
    }
    return results;
  } finally {
    if (page)    await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}

// ─── Priority Queue ───────────────────────────────────────────────────────────
const lastChecked = new Map();
function isDue(keyword) {
  const last     = lastChecked.get(keyword.id) || 0;
  const interval = PRIORITY_INTERVALS[keyword.priority] || PRIORITY_INTERVALS.normal;
  return Date.now() - last >= interval;
}

// ─── Main Engine Loop ─────────────────────────────────────────────────────────
async function engineLoop() {
  await logActivity('engine', '🚀 DROPWATCH Engine v2.0 started — always-on mode');
  engineState.running  = true;
  engineState.startedAt = new Date().toISOString();
  await loadSettings();
  setInterval(loadSettings, 5 * 60 * 1000);
  let loopCount = 0;
  while (true) {
    if (engineState.paused) { await sleep(5000); continue; }
    try {
      const keywords = await loadKeywords();
      if (keywords.length === 0) { await sleep(10000); continue; }
      const due = keywords.filter(isDue);
      if (due.length === 0) { await sleep(2000); continue; }
      const proxy = buildProxyConfig(engineState.settings);
      if (proxy) await logActivity('proxy', `Using proxy: ${proxy.server}`, { server: proxy.server });
      const batch = due.slice(0, Math.min(due.length, 3));
      await Promise.allSettled(batch.map(async (kw) => { lastChecked.set(kw.id, Date.now()); await checkKeyword(kw, proxy); }));
    } catch (err) {
      engineState.errors++;
      await logActivity('error', `Engine loop error: ${err.message}`, { error: err.message });
      await sleep(15000);
    }
    await sleep(1000);
    loopCount++;
    if (loopCount % 100 === 0) {
      await logActivity('engine', `💓 Heartbeat — ${engineState.checksCompleted} checks, ${engineState.purchasesCompleted} purchases, ${engineState.errors} errors`);
    }
  }
}

// ─── Watchdog ─────────────────────────────────────────────────────────────────
function startWithWatchdog() {
  const run = async () => {
    try { await engineLoop(); }
    catch (err) {
      console.error('[Watchdog] Engine crashed:', err.message);
      await logActivity('engine', `💥 Engine crashed — restarting in 10s: ${err.message}`);
      setTimeout(run, 10000);
    }
  };
  run();
}

// ─── REST API ─────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', running: engineState.running, paused: engineState.paused, startedAt: engineState.startedAt, checksCompleted: engineState.checksCompleted, purchasesCompleted: engineState.purchasesCompleted, errors: engineState.errors, currentProduct: engineState.currentProduct, lastSettingsLoad: engineState.lastSettingsLoad, uptime: process.uptime(), memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) });
});
app.post('/pause', (req, res) => { engineState.paused = true; logActivity('engine', '⏸ Engine paused via API'); res.json({ paused: true }); });
app.post('/resume', (req, res) => { engineState.paused = false; logActivity('engine', '▶ Engine resumed via API'); res.json({ paused: false }); });
app.post('/reload-settings', async (req, res) => { await loadSettings(); res.json({ loaded: true, settings: engineState.settings }); });
app.get('/status', (req, res) => { res.json({ engine: engineState.running ? 'running' : 'stopped', paused: engineState.paused, checks: engineState.checksCompleted, purchases: engineState.purchasesCompleted, errors: engineState.errors, uptime: process.uptime() }); });
app.post('/check/:keywordId', async (req, res) => {
  const { data, error } = await supabase.from('keywords').select('*').eq('id', req.params.keywordId).maybeSingle();
  if (error || !data) return res.status(404).json({ error: 'Keyword not found' });
  const results = await checkKeyword(data, buildProxyConfig(engineState.settings));
  res.json({ found: results.length, results });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// ─── Boot ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[DROPWATCH] Express API listening on port ${PORT}`);
  startWithWatchdog();
});
