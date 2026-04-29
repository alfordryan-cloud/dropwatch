/**
 * workers/sku-finder.js
 *
 * Reusable SKU search/lookup library for Target + Walmart. Powers both:
 *   - scripts/find-skus.js (CLI)
 *   - server.js POST /api/search-skus (frontend Find SKUs tab)
 *
 * No side effects. Returns plain JS objects shaped:
 *   { sku, title, price, inStock, url }
 *
 * Walmart search routes through Bright Data Web Unlocker (PerimeterX bypass);
 * Target uses RedSky's public PLP search API (same key the web app embeds).
 */

const TARGET_API_KEY = '9f36aeafbe60771e321a7cc95a78140772ab3e96';
const TARGET_STORE_ID = '1357';
const TARGET_VISITOR_ID = '0192EA47A8420201A567B14CCB7AF1E5';

// ─── URL parsing ─────────────────────────────────────────────────────────

function parseUrlForSku(url) {
  let m = url.match(/target\.com\/p\/[^/]*\/-\/A-(\d+)/i);
  if (m) return { retailer: 'target', sku: m[1] };
  m = url.match(/target\.com\/p\/-\/A-(\d+)/i);
  if (m) return { retailer: 'target', sku: m[1] };
  m = url.match(/walmart\.com\/ip\/[^/]*\/(\d+)/i);
  if (m) return { retailer: 'walmart', sku: m[1] };
  return null;
}

// ─── Target ──────────────────────────────────────────────────────────────

async function targetSearch(keyword, opts = {}) {
  const url = `https://redsky.target.com/redsky_aggregations/v1/web/plp_search_v2`
    + `?key=${TARGET_API_KEY}`
    + `&channel=WEB`
    + `&keyword=${encodeURIComponent(keyword)}`
    + `&count=${opts.maxResults || 25}`
    + `&default_purchasability_filter=false`
    + `&pricing_store_id=${TARGET_STORE_ID}`
    + `&visitor_id=${TARGET_VISITOR_ID}`
    + `&page=%2Fs%2F${encodeURIComponent(keyword)}`;
  const r = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      origin: 'https://www.target.com',
      referer: `https://www.target.com/s?searchTerm=${encodeURIComponent(keyword)}`,
    },
  });
  if (!r.ok) throw new Error(`RedSky ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const products = data?.data?.search?.products || [];
  return products.map(p => {
    const item = p.item || p;
    const tcin = item?.tcin || p?.tcin || '';
    const title = item?.product_description?.title || p?.title || item?.title || '';
    const price = p?.price?.current_retail || p?.price?.formatted_current_price_value || item?.price?.current_retail || null;
    const inStock = p?.fulfillment?.is_out_of_stock_in_all_store_locations === false
      || p?.fulfillment?.shipping_options?.availability_status === 'IN_STOCK'
      || p?.availability === 'IN_STOCK';
    return {
      sku: String(tcin),
      title: String(title || '').replace(/;/g, ',').trim(),
      price: price != null ? Number(price) : null,
      inStock: !!inStock,
      url: tcin ? `https://www.target.com/p/-/A-${tcin}` : null,
    };
  }).filter(p => p.sku);
}

async function targetLookup(sku) {
  const url = `https://redsky.target.com/redsky_aggregations/v1/web/pdp_client_v1`
    + `?key=${TARGET_API_KEY}&tcin=${sku}&pricing_store_id=${TARGET_STORE_ID}&has_pricing_store_id=true`
    + `&store_id=${TARGET_STORE_ID}&has_store_id=true`;
  const r = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0' },
  });
  if (!r.ok) throw new Error(`RedSky pdp ${r.status}`);
  const data = await r.json();
  const item = data?.data?.product?.item;
  return {
    sku,
    title: (item?.product_description?.title || '').replace(/;/g, ',').trim(),
    price: data?.data?.product?.price?.current_retail || null,
    inStock: !data?.data?.product?.fulfillment?.is_out_of_stock_in_all_store_locations,
    url: `https://www.target.com/p/-/A-${sku}`,
  };
}

// ─── Walmart (via Bright Data Web Unlocker) ──────────────────────────────

async function walmartFetchHtml(url) {
  const apiKey = process.env.BRIGHTDATA_API_KEY;
  const zone = process.env.BRIGHTDATA_UNLOCKER_ZONE || 'dropwatchv2';
  if (!apiKey) throw new Error('BRIGHTDATA_API_KEY not set');
  const r = await fetch('https://api.brightdata.com/request', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ zone, url, format: 'json', country: 'us' }),
  });
  if (!r.ok) throw new Error(`Web Unlocker ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const wrapper = await r.json();
  return wrapper.body || '';
}

async function walmartSearch(keyword, opts = {}) {
  const html = await walmartFetchHtml(`https://www.walmart.com/search?q=${encodeURIComponent(keyword)}`);
  const products = [];
  const next = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
  if (next) {
    try {
      const nd = JSON.parse(next[1]);
      const items = nd?.props?.pageProps?.initialData?.searchResult?.itemStacks?.[0]?.items
        || nd?.props?.pageProps?.initialData?.data?.search?.itemStacks?.[0]?.items
        || [];
      for (const it of items) {
        const sku = it?.usItemId || it?.itemId || it?.id || '';
        if (!sku) continue;
        const title = String(it?.name || '').replace(/;/g, ',').trim();
        const priceRaw = it?.priceInfo?.linePrice || it?.priceInfo?.currentPrice?.priceString || it?.price;
        const price = (typeof priceRaw === 'string' ? Number(priceRaw.replace?.(/[^\d.]/g, '')) : Number(priceRaw)) || null;
        const inStock = (it?.availabilityStatusV2?.value || it?.availabilityStatus || '').toUpperCase() === 'IN_STOCK';
        products.push({
          sku: String(sku),
          title,
          price,
          inStock,
          url: `https://www.walmart.com/ip/${sku}`,
        });
      }
    } catch { /* fall through to attribute scrape */ }
  }
  if (products.length === 0) {
    const re = /data-item-id="(\d+)"[^>]*>[^<]*<[^>]*aria-label="([^"]+)"/g;
    const seen = new Set();
    let m;
    while ((m = re.exec(html)) && products.length < (opts.maxResults || 25)) {
      const sku = m[1];
      if (seen.has(sku)) continue;
      seen.add(sku);
      products.push({
        sku,
        title: m[2].replace(/;/g, ',').trim(),
        price: null,
        inStock: null,
        url: `https://www.walmart.com/ip/${sku}`,
      });
    }
  }
  return products.slice(0, opts.maxResults || 25);
}

async function walmartLookup(sku) {
  const html = await walmartFetchHtml(`https://www.walmart.com/ip/${sku}`);
  const next = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
  if (!next) return { sku, title: '', price: null, inStock: null, url: `https://www.walmart.com/ip/${sku}` };
  try {
    const nd = JSON.parse(next[1]);
    const product = nd?.props?.pageProps?.initialData?.data?.product;
    return {
      sku,
      title: String(product?.name || '').replace(/;/g, ',').trim(),
      price: Number(product?.priceInfo?.currentPrice?.price || 0) || null,
      inStock: (product?.availabilityStatus || '').toUpperCase() === 'IN_STOCK',
      url: `https://www.walmart.com/ip/${sku}`,
    };
  } catch {
    return { sku, title: '', price: null, inStock: null, url: `https://www.walmart.com/ip/${sku}` };
  }
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Search products by keyword.
 * @param {'target'|'walmart'} retailer
 * @param {string} keyword
 * @param {object} opts - { maxResults, minPrice, maxPrice, inStockOnly }
 * @returns {Promise<Array<{sku,title,price,inStock,url}>>}
 */
async function search(retailer, keyword, opts = {}) {
  const fn = retailer === 'target' ? targetSearch : retailer === 'walmart' ? walmartSearch : null;
  if (!fn) throw new Error(`unsupported retailer: ${retailer}`);
  const all = await fn(keyword, opts);
  return applyFilters(all, opts);
}

/**
 * Lookup a single SKU (or product URL).
 */
async function lookup({ retailer, sku, url }) {
  if (url) {
    const parsed = parseUrlForSku(url);
    if (!parsed) throw new Error(`could not parse SKU from URL`);
    retailer = parsed.retailer;
    sku = parsed.sku;
  }
  if (!retailer || !sku) throw new Error('retailer and sku (or url) required');
  const fn = retailer === 'target' ? targetLookup : retailer === 'walmart' ? walmartLookup : null;
  if (!fn) throw new Error(`unsupported retailer: ${retailer}`);
  return fn(sku);
}

function applyFilters(items, opts) {
  const minP = opts.minPrice != null ? Number(opts.minPrice) : 0;
  const maxP = opts.maxPrice != null ? Number(opts.maxPrice) : Infinity;
  const inStockOnly = !!opts.inStockOnly;
  return items.filter(p => {
    if (inStockOnly && p.inStock === false) return false;
    if (p.price != null && p.price < minP) return false;
    if (p.price != null && p.price > maxP) return false;
    return true;
  });
}

/**
 * Convert results to Stellar Tag paste-block (`SKU;Title;MaxPrice` per line).
 */
function toStellarTagBlock(items, buffer = 0.10) {
  return items.map(p => {
    const cap = p.price != null ? Math.ceil(p.price * (1 + buffer)) : '';
    return `${p.sku};${p.title};${cap}`;
  }).join('\n');
}

export { search, lookup, parseUrlForSku, toStellarTagBlock };
