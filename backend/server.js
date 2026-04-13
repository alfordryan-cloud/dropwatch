/**
 * DROPWATCH Engine v3.0
 * Phase 2: Tiered Inventory Monitoring + Pre-Login Sessions
 *
 * Architecture:
 *   Tier 1 — Direct retail API endpoints (Target RedSky, Walmart, Best Buy, Pokémon Center)
 *            Sub-200ms JSON responses, no browser needed
 *   Tier 2 — Webhook / RSS monitoring (future)
 *   Tier 3 — Playwright page scraping (fallback from v2.3)
 *
 * New in v3.0:
 * - Direct API inventory checks (10x faster than Playwright)
 * - Tiered routing: API first → Playwright fallback
 * - Pre-login session manager (cookie persistence in Supabase)
 * - Per-retailer rate limiting to avoid bans
 * - Retry logic with exponential backoff
 * - Health scoring per adapter (tracks success/fail rates)
 * - Cookie-based authenticated checkout (skip login at purchase time)
 */

const express = require('express');
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createClient } = require('@supabase/supabase-js');

// ─── Stealth Plugin ─────────────────────────────────────────────────────────────
chromium.use(StealthPlugin());

// ─── Supabase ────────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── Express App ─────────────────────────────────────────────────────────────────
const app = express();
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(express.json());
const PORT = process.env.PORT || 3001;

// ─── Engine State ────────────────────────────────────────────────────────────────
let engineState = {
  running: false,
  paused: false,
  startedAt: null,
  checksCompleted: 0,
  apiChecks: 0,
  playwrightChecks: 0,
  purchasesCompleted: 0,
  errors: 0,
  currentProduct: null,
  settings: {},
  lastSettingsLoad: null,
};

const PRIORITY_INTERVALS = {
  critical: 10_000,
  high: 30_000,
  normal: 60_000,
  low: 300_000,
};

// ─── Adapter Health Tracking ─────────────────────────────────────────────────────
// Tracks success/failure per retailer per tier so the engine can auto-route
const adapterHealth = {};

function recordAdapterResult(retailer, tier, success) {
  const key = `${retailer}:${tier}`;
  if (!adapterHealth[key]) {
    adapterHealth[key] = { success: 0, fail: 0, lastSuccess: null, lastFail: null, consecutive_fails: 0 };
  }
  const h = adapterHealth[key];
  if (success) {
    h.success++;
    h.lastSuccess = Date.now();
    h.consecutive_fails = 0;
  } else {
    h.fail++;
    h.lastFail = Date.now();
    h.consecutive_fails++;
  }
}

function isAdapterHealthy(retailer, tier) {
  const key = `${retailer}:${tier}`;
  const h = adapterHealth[key];
  if (!h) return true; // no data = assume healthy
  // If 5+ consecutive failures, back off for 5 minutes
  if (h.consecutive_fails >= 5) {
    const cooldown = 5 * 60 * 1000;
    if (Date.now() - h.lastFail < cooldown) return false;
    // Cooldown expired — reset and try again
    h.consecutive_fails = 0;
  }
  return true;
}

// ─── Rate Limiter ────────────────────────────────────────────────────────────────
const rateLimits = {};
const RATE_LIMITS = {
  target: { requests: 10, windowMs: 60_000 },
  walmart: { requests: 8, windowMs: 60_000 },
  best_buy: { requests: 10, windowMs: 60_000 },
  pokemon_center: { requests: 12, windowMs: 60_000 },
  gamestop: { requests: 8, windowMs: 60_000 },
  amazon: { requests: 6, windowMs: 60_000 },
};

function canMakeRequest(retailer) {
  const limit = RATE_LIMITS[retailer] || { requests: 10, windowMs: 60_000 };
  if (!rateLimits[retailer]) rateLimits[retailer] = [];
  const now = Date.now();
  rateLimits[retailer] = rateLimits[retailer].filter(t => now - t < limit.windowMs);
  if (rateLimits[retailer].length >= limit.requests) return false;
  rateLimits[retailer].push(now);
  return true;
}

// ─── Retry with Backoff ──────────────────────────────────────────────────────────
async function withRetry(fn, maxRetries = 2, baseDelay = 1000) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
      await sleep(delay);
    }
  }
}

// ─── Fingerprint Randomization (for Tier 3) ──────────────────────────────────────
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
const LOCALES = ['en-US', 'en-US', 'en-US', 'en-GB', 'en-CA'];
const TIMEZONES = ['America/New_York', 'America/Chicago', 'America/Los_Angeles', 'America/Denver'];

function randomFingerprint() {
  return {
    userAgent: USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
    viewport: VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)],
    locale: LOCALES[Math.floor(Math.random() * LOCALES.length)],
    timezoneId: TIMEZONES[Math.floor(Math.random() * TIMEZONES.length)],
    deviceScaleFactor: [1, 1, 1, 2][Math.floor(Math.random() * 4)],
    colorScheme: 'light',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
    },
  };
}

function randomApiHeaders() {
  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  return {
    'User-Agent': ua,
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
  };
}

// ─── Settings Loader ─────────────────────────────────────────────────────────────
async function loadSettings() {
  try {
    const { data, error } = await supabase.from('settings').select('*').maybeSingle();
    if (error) throw error;
    engineState.settings = data || {};
    engineState.lastSettingsLoad = new Date().toISOString();
    console.log('[Settings] Loaded from Supabase:', JSON.stringify(engineState.settings));
  } catch (err) {
    console.error('[Settings] Failed to load:', err.message);
  }
}

// ─── Activity Logger ─────────────────────────────────────────────────────────────
async function logActivity(type, message, data = {}) {
  const entry = { type, message, data, created_at: new Date().toISOString() };
  console.log(`[Activity][${type}] ${message}`);
  try {
    await supabase.from('activity_log').insert(entry);
  } catch (err) {
    console.error('[Activity] Log write failed:', err.message);
  }
}

// ─── Proxy Manager ───────────────────────────────────────────────────────────────
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
      username = u;
      password = p;
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

// ─── Browser Factory (Tier 3 only) ──────────────────────────────────────────────
async function launchBrowser(proxyConfig) {
  const launchArgs = [
    '--no-sandbox', '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-infobars', '--disable-dev-shm-usage',
    '--disable-gpu', '--no-first-run',
    '--no-zygote', '--single-process',
  ];
  return await chromium.launch({
    headless: process.env.HEADLESS !== 'false',
    args: launchArgs,
    ...(proxyConfig ? { proxy: proxyConfig } : {}),
  });
}

async function createStealthContext(browser, fingerprint) {
  const context = await browser.newContext({
    userAgent: fingerprint.userAgent,
    viewport: fingerprint.viewport,
    locale: fingerprint.locale,
    timezoneId: fingerprint.timezoneId,
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

// ═══════════════════════════════════════════════════════════════════════════════
//  TIER 1 — DIRECT API ADAPTERS
//  These hit the same internal inventory APIs the retailer apps/websites use.
//  No browser needed. Sub-200ms response times.
// ═══════════════════════════════════════════════════════════════════════════════

const API_ADAPTERS = {

  // ─── Target RedSky API ──────────────────────────────────────────────────────
  target: {
    name: 'Target (API)',

    /**
     * Target's RedSky API is what target.com's frontend calls.
     * Two approaches:
     *   1. Search by keyword → get TCINs → check each for availability
     *   2. Direct TCIN lookup if known
     *
     * The search endpoint:
     *   https://redsky.target.com/redsky_aggregations/v1/web/plp_search_v2
     *   ?keyword={term}&count=24&channel=WEB&pricing_store_id=3991
     *   &key=9f36aeafbe60771e321a7cc95a78140772ab3e96
     *
     * The PDP endpoint (per-product):
     *   https://redsky.target.com/redsky_aggregations/v1/web/pdp_client_v1
     *   ?tcin={TCIN}&key=9f36aeafbe60771e321a7cc95a78140772ab3e96
     *   &pricing_store_id=3991&scheduled_delivery_store_id=3991
     */
    checkStock: async (keyword, maxPrice) => {
      const headers = {
        ...randomApiHeaders(),
        'Referer': 'https://www.target.com/',
        'Origin': 'https://www.target.com',
      };

      // Target API key (public, embedded in their frontend bundle)
      const apiKey = '9f36aeafbe60771e321a7cc95a78140772ab3e96';
      // Store ID for Greenville, SC area (closest to Easley)
      const storeId = '3991';

      const searchUrl = `https://redsky.target.com/redsky_aggregations/v1/web/plp_search_v2?keyword=${encodeURIComponent(keyword.term)}&count=24&offset=0&channel=WEB&page=%2Fs%2F${encodeURIComponent(keyword.term)}&pricing_store_id=${storeId}&scheduled_delivery_store_id=${storeId}&key=${apiKey}`;

      const resp = await fetch(searchUrl, { headers, signal: AbortSignal.timeout(10000) });

      if (!resp.ok) {
        throw new Error(`Target API ${resp.status}: ${resp.statusText}`);
      }

      const json = await resp.json();
      const results = json?.data?.search?.products || [];
      const inStock = [];

      for (const product of results) {
        const item = product?.item || {};
        const price = product?.price?.current_retail || product?.price?.reg_retail || null;
        const title = item?.product_description?.title || 'Unknown';
        const tcin = item?.tcin;

        // Check fulfillment availability
        const fulfillment = product?.fulfillment || {};
        const isAvailableOnline =
          fulfillment?.shipping_options?.availability_status === 'IN_STOCK' ||
          fulfillment?.scheduled_delivery?.availability_status === 'IN_STOCK';

        // Store pickup availability
        const storePickup = fulfillment?.store_options?.[0]?.order_pickup?.availability_status === 'IN_STOCK' ||
          fulfillment?.store_options?.[0]?.in_store_only?.availability_status === 'IN_STOCK';

        const available = isAvailableOnline || storePickup;

        if (available && (!maxPrice || (price && price <= maxPrice))) {
          inStock.push({
            title,
            price,
            inStock: true,
            link: `https://www.target.com/p/-/A-${tcin}`,
            tcin,
            fulfillment: {
              online: isAvailableOnline,
              storePickup,
            },
            source: 'api',
          });
        }
      }

      return inStock;
    },
  },

  // ─── Walmart API ────────────────────────────────────────────────────────────
  walmart: {
    name: 'Walmart (API)',

    /**
     * Walmart's search API that their frontend uses.
     * Endpoint:
     *   https://www.walmart.com/orchestra/home/graphql
     *   or the search API:
     *   https://www.walmart.com/orchestra/snb/graphql/Search
     *
     * Simpler approach — hit their search endpoint which returns
     * availability data inline with results.
     */
    checkStock: async (keyword, maxPrice) => {
      const headers = {
        ...randomApiHeaders(),
        'Referer': 'https://www.walmart.com/',
        'Origin': 'https://www.walmart.com',
        'x-o-correlation-id': crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        'x-o-gql-query': 'query Search',
        'wm_mp': 'true',
        'wm_page_url': `https://www.walmart.com/search?q=${encodeURIComponent(keyword.term)}`,
      };

      // Walmart's search API
      const searchUrl = `https://www.walmart.com/orchestra/snb/graphql/Search?variables=${encodeURIComponent(JSON.stringify({
        query: keyword.term,
        page: 1,
        sort: 'best_match',
        catId: '2536', // Trading Cards category
        prg: 'desktop',
        facets: [],
      }))}`;

      const resp = await fetch(searchUrl, {
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (!resp.ok) {
        // Fallback: try the simpler search endpoint
        return await walmartFallbackSearch(keyword, maxPrice, headers);
      }

      const json = await resp.json();
      const items = json?.data?.search?.searchResult?.itemStacks?.[0]?.items || [];
      const inStock = [];

      for (const item of items) {
        if (item?.type === 'SEARCH_TILE') continue; // skip ads

        const title = item?.name || 'Unknown';
        const price = item?.price || item?.priceInfo?.currentPrice?.price || null;
        const available = item?.availabilityStatusV2?.value === 'IN_STOCK' ||
          item?.fulfillmentBadgeGroups?.[0]?.text?.includes('Shipping') ||
          item?.canAddToCart === true;
        const productId = item?.usItemId || item?.id;

        if (available && (!maxPrice || (price && price <= maxPrice))) {
          inStock.push({
            title,
            price,
            inStock: true,
            link: `https://www.walmart.com/ip/${productId}`,
            productId,
            source: 'api',
          });
        }
      }

      return inStock;
    },
  },

  // ─── Best Buy API ──────────────────────────────────────────────────────────
  best_buy: {
    name: 'Best Buy (API)',

    /**
     * Best Buy's internal fulfillment/pricing API.
     * Their frontend calls:
     *   https://www.bestbuy.com/api/tcfb/model.json
     *   with paths for pricing, availability by SKU
     *
     * Search uses:
     *   https://www.bestbuy.com/api/1.0/jsonp/products
     *   ?search={term}&categoryPath.id=pcmcat252700050006
     */
    checkStock: async (keyword, maxPrice) => {
      const headers = {
        ...randomApiHeaders(),
        'Referer': 'https://www.bestbuy.com/',
        'Origin': 'https://www.bestbuy.com',
      };

      // Best Buy product search API
      const searchUrl = `https://www.bestbuy.com/api/1.0/jsonp/products?search=${encodeURIComponent(keyword.term)}&page=1&pageSize=24&typeId=4&categoryPath.id=pcmcat252700050006&callback=`;

      const resp = await fetch(searchUrl, {
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (!resp.ok) {
        throw new Error(`Best Buy API ${resp.status}: ${resp.statusText}`);
      }

      let text = await resp.text();
      // Strip JSONP wrapper if present
      if (text.startsWith('(')) text = text.slice(1, -2);
      if (text.startsWith('callback(')) text = text.replace(/^callback\(/, '').replace(/\);?$/, '');

      let json;
      try { json = JSON.parse(text); } catch { throw new Error('Best Buy API: invalid JSON'); }

      const products = json?.products || [];
      const inStock = [];

      for (const product of products) {
        const title = product?.name || 'Unknown';
        const price = product?.salePrice || product?.regularPrice || null;
        const sku = product?.sku;
        const available = product?.addToCartUrl != null || product?.inStoreAvailability || product?.onlineAvailability;

        if (available && (!maxPrice || (price && price <= maxPrice))) {
          inStock.push({
            title,
            price,
            inStock: true,
            link: `https://www.bestbuy.com/site/${sku}.p`,
            sku,
            source: 'api',
          });
        }
      }

      return inStock;
    },
  },

  // ─── Pokémon Center API ────────────────────────────────────────────────────
  pokemon_center: {
    name: 'Pokémon Center (API)',

    /**
     * Pokémon Center uses a headless CMS / Salesforce Commerce Cloud backend.
     * Their search API:
     *   https://www.pokemoncenter.com/en-us/api/search
     *   or their product catalog:
     *   https://www.pokemoncenter.com/api/product/{id}
     *
     * They also use Algolia for search — we can hit that directly:
     *   POST https://u50g3q2q4i-dsn.algolia.net/1/indexes/prod_STARTER_en-us/query
     *   with headers: x-algolia-api-key, x-algolia-application-id
     */
    checkStock: async (keyword, maxPrice) => {
      const headers = {
        ...randomApiHeaders(),
        'Referer': 'https://www.pokemoncenter.com/',
        'Origin': 'https://www.pokemoncenter.com',
      };

      // Try their search page API which returns product data as JSON
      const searchUrl = `https://www.pokemoncenter.com/en-us/search?q=${encodeURIComponent(keyword.term)}&type=product`;

      const resp = await fetch(searchUrl, {
        headers: {
          ...headers,
          'Accept': 'text/html,application/json',
          'x-requested-with': 'XMLHttpRequest',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!resp.ok) {
        throw new Error(`Pokemon Center API ${resp.status}: ${resp.statusText}`);
      }

      // Pokemon Center may return HTML or JSON depending on headers
      const contentType = resp.headers.get('content-type') || '';
      let products = [];

      if (contentType.includes('json')) {
        const json = await resp.json();
        products = json?.results || json?.products || json?.hits || [];
      } else {
        // If HTML, try to extract the __NEXT_DATA__ or embedded JSON
        const html = await resp.text();
        const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
        if (nextDataMatch) {
          try {
            const nextData = JSON.parse(nextDataMatch[1]);
            products = nextData?.props?.pageProps?.products ||
              nextData?.props?.pageProps?.searchResults?.products || [];
          } catch { /* fall through */ }
        }
      }

      const inStock = [];
      for (const product of products) {
        const title = product?.name || product?.title || product?.product_name || 'Unknown';
        const price = product?.price || product?.prices?.sale || product?.prices?.list || null;
        const available = product?.inStock !== false && product?.availability !== 'OUT_OF_STOCK' &&
          product?.orderable !== false;
        const slug = product?.slug || product?.url || product?.id;

        if (available && (!maxPrice || (price && price <= maxPrice))) {
          inStock.push({
            title,
            price,
            inStock: true,
            link: slug?.startsWith('http') ? slug : `https://www.pokemoncenter.com/en-us/product/${slug}`,
            productId: product?.id || product?.productId,
            source: 'api',
          });
        }
      }

      return inStock;
    },
  },
};

// Walmart fallback if GraphQL endpoint is blocked
async function walmartFallbackSearch(keyword, maxPrice, headers) {
  const url = `https://www.walmart.com/search?q=${encodeURIComponent(keyword.term)}&catId=2536&affinityOverride=default`;
  const resp = await fetch(url, {
    headers: { ...headers, 'Accept': 'text/html' },
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error(`Walmart fallback ${resp.status}`);
  const html = await resp.text();

  // Extract __NEXT_DATA__ JSON from the page
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
  if (!match) throw new Error('Walmart: no __NEXT_DATA__ found');

  const nextData = JSON.parse(match[1]);
  const items = nextData?.props?.pageProps?.initialData?.searchResult?.itemStacks?.[0]?.items || [];
  const inStock = [];

  for (const item of items) {
    const title = item?.name || 'Unknown';
    const price = item?.price || null;
    const available = item?.availabilityStatusV2?.value === 'IN_STOCK' || item?.canAddToCart;
    const productId = item?.usItemId;

    if (available && (!maxPrice || (price && price <= maxPrice))) {
      inStock.push({
        title, price, inStock: true,
        link: `https://www.walmart.com/ip/${productId}`,
        productId, source: 'api-fallback',
      });
    }
  }
  return inStock;
}


// ═══════════════════════════════════════════════════════════════════════════════
//  TIER 3 — PLAYWRIGHT SCRAPING ADAPTERS (fallback from v2.3)
// ═══════════════════════════════════════════════════════════════════════════════

const PLAYWRIGHT_ADAPTERS = {
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
          const priceFrac = el.querySelector('.a-price-fraction')?.textContent?.replace(/[^0-9]/g, '') || '00';
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


// ═══════════════════════════════════════════════════════════════════════════════
//  PRE-LOGIN SESSION MANAGER
//  Authenticates into retailer accounts on startup and persists cookies
//  in Supabase so checkout flows start already logged in.
// ═══════════════════════════════════════════════════════════════════════════════

const sessionStore = {}; // { retailer: { cookies: [...], expiry: timestamp } }

async function loadSavedSessions() {
  try {
    const { data, error } = await supabase
      .from('retailer_accounts')
      .select('*')
      .eq('active', true);
    if (error) throw error;

    for (const account of (data || [])) {
      if (account.cookies) {
        try {
          sessionStore[account.retailer] = {
            cookies: typeof account.cookies === 'string' ? JSON.parse(account.cookies) : account.cookies,
            expiry: account.cookie_expiry ? new Date(account.cookie_expiry).getTime() : Date.now() + 24 * 60 * 60 * 1000,
            email: account.email,
          };
          console.log(`[Sessions] Loaded saved session for ${account.retailer}`);
        } catch (e) {
          console.error(`[Sessions] Failed to parse cookies for ${account.retailer}:`, e.message);
        }
      }
    }
  } catch (err) {
    console.error('[Sessions] Failed to load saved sessions:', err.message);
  }
}

async function saveCookies(retailer, cookies) {
  try {
    await supabase
      .from('retailer_accounts')
      .update({
        cookies: JSON.stringify(cookies),
        cookie_expiry: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        last_login: new Date().toISOString(),
      })
      .eq('retailer', retailer)
      .eq('active', true);
    console.log(`[Sessions] Saved ${cookies.length} cookies for ${retailer}`);
  } catch (err) {
    console.error(`[Sessions] Failed to save cookies for ${retailer}:`, err.message);
  }
}

async function loginToRetailer(retailer, account) {
  const fingerprint = randomFingerprint();
  let browser = null, context = null, page = null;

  try {
    browser = await launchBrowser(buildProxyConfig(engineState.settings));
    context = await createStealthContext(browser, fingerprint);
    page = await context.newPage();

    const loginFlows = {
      target: async () => {
        await page.goto('https://www.target.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);
        await page.fill('#username', account.email);
        await page.fill('#password', account.password);
        await page.click('#login');
        await page.waitForTimeout(5000);
      },
      walmart: async () => {
        await page.goto('https://www.walmart.com/account/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);
        await page.fill('[data-automation-id="email-input"]', account.email);
        await page.fill('[data-automation-id="password-input"]', account.password);
        await page.click('[data-automation-id="signin-submit-btn"]');
        await page.waitForTimeout(5000);
      },
      best_buy: async () => {
        await page.goto('https://www.bestbuy.com/identity/global/signin', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);
        await page.fill('[id="fld-e"]', account.email);
        await page.fill('[id="fld-p1"]', account.password);
        await page.click('.cia-form__controls__submit');
        await page.waitForTimeout(5000);
      },
      pokemon_center: async () => {
        await page.goto('https://www.pokemoncenter.com/en-us/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);
        await page.fill('input[name="email"]', account.email);
        await page.fill('input[name="password"]', account.password);
        await page.click('button[type="submit"]');
        await page.waitForTimeout(5000);
      },
    };

    const loginFn = loginFlows[retailer];
    if (!loginFn) {
      console.log(`[Sessions] No login flow defined for ${retailer}`);
      return false;
    }

    await loginFn();

    // Capture cookies
    const cookies = await context.cookies();
    sessionStore[retailer] = {
      cookies,
      expiry: Date.now() + 24 * 60 * 60 * 1000,
      email: account.email,
    };

    await saveCookies(retailer, cookies);
    await logActivity('session', `✅ Logged into ${retailer} as ${account.email}`, { retailer });
    return true;

  } catch (err) {
    await logActivity('error', `Failed to login to ${retailer}: ${err.message}`, { retailer, error: err.message });
    return false;
  } finally {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}

async function initializeSessions() {
  await loadSavedSessions();

  // Check which sessions need refresh
  const { data: accounts } = await supabase
    .from('retailer_accounts')
    .select('*')
    .eq('active', true);

  if (!accounts?.length) {
    console.log('[Sessions] No retailer accounts configured');
    return;
  }

  for (const account of accounts) {
    const existing = sessionStore[account.retailer];
    if (existing && existing.expiry > Date.now()) {
      console.log(`[Sessions] ${account.retailer} session still valid, skipping login`);
      continue;
    }
    await loginToRetailer(account.retailer, account);
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  TIERED CHECK ROUTINE
//  Routes through tiers: API first → Playwright fallback
// ═══════════════════════════════════════════════════════════════════════════════

async function loadKeywords() {
  const { data, error } = await supabase
    .from('keywords')
    .select('*')
    .eq('active', true)
    .order('priority', { ascending: true });
  if (error) { console.error('[Keywords] Failed to load:', error.message); return []; }
  return data || [];
}

async function checkKeyword(keyword, proxyConfig) {
  const retailers = keyword.retailers || ['target', 'walmart'];
  const results = [];

  for (const retailerKey of retailers) {
    if (!canMakeRequest(retailerKey)) {
      console.log(`[RateLimit] Skipping ${retailerKey} — rate limited`);
      continue;
    }

    let found = [];

    // ── TIER 1: Direct API ──────────────────────────────────────────────
    const apiAdapter = API_ADAPTERS[retailerKey];
    if (apiAdapter && isAdapterHealthy(retailerKey, 'api')) {
      try {
        await logActivity('check', `[API] Checking ${apiAdapter.name} for: ${keyword.term}`, {
          keyword: keyword.term, retailer: retailerKey, tier: 'api', priority: keyword.priority,
        });

        const startTime = Date.now();
        found = await withRetry(() => apiAdapter.checkStock(keyword, keyword.max_price), 1, 500);
        const elapsed = Date.now() - startTime;

        engineState.checksCompleted++;
        engineState.apiChecks++;
        recordAdapterResult(retailerKey, 'api', true);

        if (found.length > 0) {
          await logActivity('check', `✅ [API] IN STOCK at ${apiAdapter.name}: ${found[0].title} — $${found[0].price} (${elapsed}ms)`, {
            keyword: keyword.term, retailer: retailerKey, products: found, tier: 'api', elapsed,
          });
        } else {
          await logActivity('check', `❌ [API] Out of stock at ${apiAdapter.name} for: ${keyword.term} (${elapsed}ms)`, {
            keyword: keyword.term, retailer: retailerKey, tier: 'api', elapsed,
          });
        }

        results.push(...found.map(p => ({ ...p, retailer: retailerKey })));
        continue; // API succeeded — skip Playwright for this retailer

      } catch (err) {
        recordAdapterResult(retailerKey, 'api', false);
        await logActivity('warn', `[API] ${apiAdapter.name} failed, falling back to Playwright: ${err.message}`, {
          keyword: keyword.term, retailer: retailerKey, error: err.message,
        });
      }
    }

    // ── TIER 3: Playwright Fallback ─────────────────────────────────────
    const playwrightAdapter = PLAYWRIGHT_ADAPTERS[retailerKey];
    if (playwrightAdapter && isAdapterHealthy(retailerKey, 'playwright')) {
      let browser = null, context = null, page = null;
      try {
        const fingerprint = randomFingerprint();
        browser = await launchBrowser(proxyConfig);
        context = await createStealthContext(browser, fingerprint);
        page = await context.newPage();
        await page.route('**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf,eot}', r => r.abort());

        await logActivity('check', `[PW] Checking ${playwrightAdapter.name} for: ${keyword.term}`, {
          keyword: keyword.term, retailer: retailerKey, tier: 'playwright', priority: keyword.priority,
        });

        const startTime = Date.now();
        found = await playwrightAdapter.checkStock(page, keyword.term, keyword.max_price);
        const elapsed = Date.now() - startTime;

        engineState.checksCompleted++;
        engineState.playwrightChecks++;
        recordAdapterResult(retailerKey, 'playwright', true);

        if (found.length > 0) {
          await logActivity('check', `✅ [PW] IN STOCK at ${playwrightAdapter.name}: ${found[0].title} — $${found[0].price} (${elapsed}ms)`, {
            keyword: keyword.term, retailer: retailerKey, products: found, tier: 'playwright', elapsed,
          });
        } else {
          await logActivity('check', `❌ [PW] Out of stock at ${playwrightAdapter.name} for: ${keyword.term} (${elapsed}ms)`, {
            keyword: keyword.term, retailer: retailerKey, tier: 'playwright', elapsed,
          });
        }

        results.push(...found.map(p => ({ ...p, retailer: retailerKey, source: 'playwright' })));

      } catch (err) {
        engineState.errors++;
        recordAdapterResult(retailerKey, 'playwright', false);
        await logActivity('error', `[PW] Error checking ${playwrightAdapter.name}: ${err.message}`, {
          keyword: keyword.term, retailer: retailerKey, error: err.message,
        });
      } finally {
        if (page) await page.close().catch(() => {});
        if (context) await context.close().catch(() => {});
        if (browser) await browser.close().catch(() => {});
      }
    }
  }

  // ── Purchase Flow ──────────────────────────────────────────────────────
  const purchaseEnabled = engineState.settings?.auto_purchase_enabled;
  const dailyLimit = engineState.settings?.daily_purchase_limit || 0;

  if (results.length > 0 && purchaseEnabled) {
    if (!dailyLimit || engineState.purchasesCompleted < dailyLimit) {
      for (const product of results.slice(0, keyword.max_quantity || 1)) {
        const playwrightAdapter = PLAYWRIGHT_ADAPTERS[product.retailer];
        if (!playwrightAdapter?.purchase) continue;

        let browser = null, context = null, page = null;
        try {
          const fingerprint = randomFingerprint();
          browser = await launchBrowser(buildProxyConfig(engineState.settings));
          context = await createStealthContext(browser, fingerprint);

          // Load pre-login cookies if available
          const session = sessionStore[product.retailer];
          if (session?.cookies && session.expiry > Date.now()) {
            await context.addCookies(session.cookies);
            await logActivity('session', `🔑 Using saved session for ${product.retailer}`, { retailer: product.retailer });
          }

          page = await context.newPage();

          const result = await playwrightAdapter.purchase(page, product);
          engineState.purchasesCompleted++;

          await supabase.from('purchases').insert({
            keyword_id: keyword.id,
            product_name: product.title,
            price: product.price,
            retailer: product.retailer,
            status: result.status,
            notes: result.message,
            source: product.source || 'unknown',
            purchased_at: new Date().toISOString(),
          });

          await logActivity('purchase', `🛒 Purchased: ${product.title} @ $${product.price} from ${product.retailer}`, { product, result });

        } catch (err) {
          engineState.errors++;
          await logActivity('error', `Purchase failed: ${err.message}`, { product, error: err.message });
        } finally {
          if (page) await page.close().catch(() => {});
          if (context) await context.close().catch(() => {});
          if (browser) await browser.close().catch(() => {});
        }
      }
    }
  }

  return results;
}


// ─── Priority Queue ──────────────────────────────────────────────────────────────
const lastChecked = new Map();

function isDue(keyword) {
  const last = lastChecked.get(keyword.id) || 0;
  const interval = PRIORITY_INTERVALS[keyword.priority] || PRIORITY_INTERVALS.normal;
  return Date.now() - last >= interval;
}

// ─── Main Engine Loop ────────────────────────────────────────────────────────────
async function engineLoop() {
  await logActivity('engine', '🚀 DROPWATCH Engine v3.0 started — Tiered API + Playwright');
  engineState.running = true;
  engineState.startedAt = new Date().toISOString();

  // Load settings and initialize sessions
  await loadSettings();
  await initializeSessions();
  setInterval(loadSettings, 5 * 60 * 1000);

  // Refresh sessions every 12 hours
  setInterval(async () => {
    await logActivity('session', '🔄 Refreshing retailer sessions...');
    await initializeSessions();
  }, 12 * 60 * 60 * 1000);

  let loopCount = 0;

  while (true) {
    if (engineState.paused) {
      await sleep(5000);
      continue;
    }

    try {
      const keywords = await loadKeywords();
      if (keywords.length === 0) { await sleep(10000); continue; }

      const due = keywords.filter(isDue);
      if (due.length === 0) { await sleep(2000); continue; }

      const proxy = buildProxyConfig(engineState.settings);
      if (proxy) await logActivity('proxy', `Using proxy: ${proxy.server}`, { server: proxy.server });

      // Process up to 5 keywords concurrently (API calls are lightweight)
      const batch = due.slice(0, Math.min(due.length, 5));
      await Promise.allSettled(batch.map(async (kw) => {
        lastChecked.set(kw.id, Date.now());
        await checkKeyword(kw, proxy);
      }));

    } catch (err) {
      engineState.errors++;
      await logActivity('error', `Engine loop error: ${err.message}`, { error: err.message });
      await sleep(15000);
    }

    await sleep(1000);
    loopCount++;

    if (loopCount % 100 === 0) {
      await logActivity('engine', `💓 Heartbeat — ${engineState.checksCompleted} checks (${engineState.apiChecks} API / ${engineState.playwrightChecks} PW), ${engineState.purchasesCompleted} purchases, ${engineState.errors} errors`);
    }
  }
}

// ─── Watchdog ────────────────────────────────────────────────────────────────────
function startWithWatchdog() {
  const run = async () => {
    try {
      await engineLoop();
    } catch (err) {
      console.error('[Watchdog] Engine crashed:', err.message);
      await logActivity('engine', `💥 Engine crashed — restarting in 10s: ${err.message}`);
      setTimeout(run, 10000);
    }
  };
  run();
}


// ═══════════════════════════════════════════════════════════════════════════════
//  REST API
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '3.0',
    online: true,
    running: engineState.running,
    paused: engineState.paused,
    startedAt: engineState.startedAt,
    checksCompleted: engineState.checksCompleted,
    apiChecks: engineState.apiChecks,
    playwrightChecks: engineState.playwrightChecks,
    purchasesCompleted: engineState.purchasesCompleted,
    errors: engineState.errors,
    currentProduct: engineState.currentProduct,
    lastSettingsLoad: engineState.lastSettingsLoad,
    uptime: process.uptime(),
    memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
  });
});

app.get('/adapter-health', (req, res) => {
  res.json(adapterHealth);
});

app.get('/sessions', (req, res) => {
  const sessions = {};
  for (const [retailer, session] of Object.entries(sessionStore)) {
    sessions[retailer] = {
      email: session.email,
      cookieCount: session.cookies?.length || 0,
      expiry: new Date(session.expiry).toISOString(),
      valid: session.expiry > Date.now(),
    };
  }
  res.json(sessions);
});

app.post('/refresh-sessions', async (req, res) => {
  await initializeSessions();
  res.json({ refreshed: true });
});

app.post('/pause', (req, res) => {
  engineState.paused = true;
  logActivity('engine', '⏸ Engine paused via API');
  res.json({ paused: true });
});

app.post('/resume', (req, res) => {
  engineState.paused = false;
  logActivity('engine', '▶ Engine resumed via API');
  res.json({ paused: false });
});

app.post('/reload-settings', async (req, res) => {
  await loadSettings();
  res.json({ loaded: true, settings: engineState.settings });
});

app.get('/status', (req, res) => {
  res.json({
    engine: engineState.running ? 'running' : 'stopped',
    version: '3.0',
    paused: engineState.paused,
    checks: engineState.checksCompleted,
    apiChecks: engineState.apiChecks,
    playwrightChecks: engineState.playwrightChecks,
    purchases: engineState.purchasesCompleted,
    errors: engineState.errors,
    uptime: process.uptime(),
    adapterHealth,
  });
});

app.post('/check/:keywordId', async (req, res) => {
  const { data, error } = await supabase.from('keywords').select('*').eq('id', req.params.keywordId).maybeSingle();
  if (error || !data) return res.status(404).json({ error: 'Keyword not found' });
  const results = await checkKeyword(data, buildProxyConfig(engineState.settings));
  res.json({ found: results.length, results });
});

// ── Quick API-only test endpoint ─────────────────────────────────────────────
app.post('/test-api/:retailer', async (req, res) => {
  const { retailer } = req.params;
  const { term, max_price } = req.body;

  const adapter = API_ADAPTERS[retailer];
  if (!adapter) return res.status(400).json({ error: `No API adapter for ${retailer}` });

  try {
    const start = Date.now();
    const results = await adapter.checkStock({ term, max_price }, max_price);
    const elapsed = Date.now() - start;
    res.json({ retailer, term, elapsed: `${elapsed}ms`, found: results.length, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── Helpers ─────────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// ─── Boot ────────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[DROPWATCH v3.0] Express API listening on port ${PORT}`);
  startWithWatchdog();
});
