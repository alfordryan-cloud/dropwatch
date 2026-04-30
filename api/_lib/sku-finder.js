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
    // 1P (Target-owned) vs 3P (marketplace seller). Target's RedSky exposes
    // marketplace sellers via item.product_vendors[].vendor_name (e.g.
    // "BlueProton", "Nationwide Distributor"). Target-owned products have
    // no vendor entry. Source: empirical inspection of plp_search_v2 responses.
    const vendors = item?.product_vendors || [];
    const firstParty = vendors.length === 0
      || vendors.every(v => /^target/i.test(v?.vendor_name || ''));
    return {
      sku: String(tcin),
      title: String(title || '').replace(/;/g, ',').trim(),
      price: price != null ? Number(price) : null,
      inStock: !!inStock,
      firstParty,
      sellerName: vendors[0]?.vendor_name || (firstParty ? 'Target' : null),
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

// ─── Best Buy (official Products API) ────────────────────────────────────

// Best Buy gives 3 free API keys per developer account. We use 1 here; can
// add rotation later if hitting per-key throttles.
// Docs: https://bestbuyapis.github.io/api-documentation/

async function bbFetchJson(url) {
  const r = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0' },
  });
  if (!r.ok) throw new Error(`BestBuy API ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function bestbuySearch(keyword, opts = {}) {
  const apiKey = process.env.BESTBUY_API_KEY;
  if (!apiKey) throw new Error('BESTBUY_API_KEY not set');
  const limit = opts.maxResults || 25;
  // (search="...") matches name field; use "&" for AND across multiple words
  const q = encodeURIComponent(`(search="${keyword}")`);
  const fields = 'sku,name,salePrice,regularPrice,onlineAvailability,marketplace,preowned,addToCartUrl,url,image,modelNumber';
  const url = `https://api.bestbuy.com/v1/products${q.replace(/^/,'')}?show=${fields}&pageSize=${limit}&format=json&apiKey=${apiKey}`;
  const data = await bbFetchJson(url);
  return (data.products || []).map(p => ({
    sku: String(p.sku),
    title: String(p.name || '').replace(/;/g, ',').trim(),
    price: p.salePrice != null ? Number(p.salePrice) : (p.regularPrice != null ? Number(p.regularPrice) : null),
    inStock: !!p.onlineAvailability,
    firstParty: !p.marketplace,            // marketplace=true → 3P seller
    sellerName: p.marketplace ? 'Marketplace' : 'Best Buy',
    url: p.url || `https://www.bestbuy.com/site/${p.sku}.p?skuId=${p.sku}`,
  }));
}

async function bestbuyLookup(sku) {
  const apiKey = process.env.BESTBUY_API_KEY;
  if (!apiKey) throw new Error('BESTBUY_API_KEY not set');
  const fields = 'sku,name,salePrice,regularPrice,onlineAvailability,marketplace,preowned,url,image';
  const url = `https://api.bestbuy.com/v1/products(sku=${sku})?show=${fields}&format=json&apiKey=${apiKey}`;
  const data = await bbFetchJson(url);
  const p = data.products?.[0];
  if (!p) return { sku: String(sku), title: '', price: null, inStock: false, url: `https://www.bestbuy.com/site/${sku}.p?skuId=${sku}` };
  return {
    sku: String(p.sku),
    title: String(p.name || '').replace(/;/g, ',').trim(),
    price: p.salePrice != null ? Number(p.salePrice) : (p.regularPrice != null ? Number(p.regularPrice) : null),
    inStock: !!p.onlineAvailability,
    url: p.url || `https://www.bestbuy.com/site/${p.sku}.p?skuId=${p.sku}`,
  };
}

// ─── Bright Data Web Unlocker fetch (shared) ──────────────────────────────

async function bdUnlockerFetch(url) {
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
  if (wrapper.headers?.['x-brd-error-code']) {
    throw new Error(`Web Unlocker page_block: ${wrapper.headers['x-brd-error-code']}`);
  }
  return wrapper.body || '';
}

// alias for backward compat — walmart code still calls walmartFetchHtml
const walmartFetchHtml = bdUnlockerFetch;

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
        // 1P (Walmart-owned) vs 3P (marketplace). Walmart's GraphQL response
        // exposes sellerName per item — anything other than "Walmart.com" /
        // "Walmart Inc" is a marketplace listing.
        const sellerName = it?.sellerName || '';
        const firstParty = /^walmart(\.com| inc)?$/i.test(sellerName) || sellerName === '';
        products.push({
          sku: String(sku),
          title,
          price,
          inStock,
          firstParty,
          sellerName: sellerName || (firstParty ? 'Walmart' : null),
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

// ─── Topps (Shopify-based, via Bright Data Web Unlocker) ──────────────────

// Topps uses URL-slug-based products, not numeric SKUs. We treat the slug as
// the canonical "sku" for storage. Categories: mlb, nfl, nba, ufc, bowman, etc.
// Topps sells sports cards; not Pokemon. Source: walmart/target/topps all
// proxy through the same dropwatchv2 Web Unlocker zone (Ron Azu enabled
// Cloudflare bypass for topps.com on 2026-04-29 per support ticket).

const TOPPS_VALID_COLLECTIONS = new Set([
  'mlb', 'nfl', 'nba', 'ufc', 'bowman', 'topps-now', 'all', 'wwe', 'star-wars', 'formula-1', 'soccer',
]);

async function toppsSearch(keyword, opts = {}) {
  // If keyword matches a known collection (mlb, nfl, nba, etc.), browse the
  // collection. Otherwise hit the search endpoint.
  const lc = (keyword || '').toLowerCase().trim();
  const url = TOPPS_VALID_COLLECTIONS.has(lc)
    ? `https://www.topps.com/collections/${lc}`
    : `https://www.topps.com/search?q=${encodeURIComponent(keyword)}`;
  const html = await bdUnlockerFetch(url);
  return parseToppsHtml(html, opts.maxResults || 25);
}

function parseToppsHtml(html, maxResults) {
  // Topps is Shopify-based. Product cards have <a href="/products/SLUG">.
  // Extract by scanning for the product anchor + nearby title and price.
  const products = [];
  const seen = new Set();
  // Match: href="/products/<slug>" and capture nearby text (greedy bounded)
  const linkRe = /href="\/products\/([a-zA-Z0-9_\-%]+)"/g;
  let m;
  while ((m = linkRe.exec(html)) && products.length < maxResults) {
    const slug = m[1];
    if (seen.has(slug)) continue;
    seen.add(slug);
    // Look ~400 chars after for title/price
    const window = html.substring(m.index, m.index + 800);
    const titleMatch = window.match(/<(?:span|h\d|div)[^>]*>([^<]{8,140})<\/(?:span|h\d|div)>/);
    const priceMatch = window.match(/\$\s*(\d{1,5}(?:\.\d{2})?)/);
    const soldOutMatch = /sold\s*out|out\s+of\s+stock/i.test(window);
    products.push({
      sku: slug,
      title: (titleMatch?.[1] || decodeURIComponent(slug.replace(/-/g, ' '))).trim().replace(/;/g, ',').slice(0, 200),
      price: priceMatch ? Number(priceMatch[1]) : null,
      inStock: !soldOutMatch,
      firstParty: true, // Topps sells direct only — no 3P marketplace
      sellerName: 'Topps',
      url: `https://www.topps.com/products/${slug}`,
    });
  }
  return products;
}

async function toppsLookup(slug) {
  // slug is the URL-encoded path component, e.g. "cody-bellinger-2026-mlb-topps-now-card-96"
  const url = slug.startsWith('http') ? slug : `https://www.topps.com/products/${slug}`;
  const html = await bdUnlockerFetch(url);
  // Try Shopify ProductJson — Shopify exposes it inline as JSON-LD or a meta tag
  const jsonLd = html.match(/<script[^>]+type="application\/ld\+json"[^>]*>([^<]+)<\/script>/i);
  if (jsonLd) {
    try {
      const d = JSON.parse(jsonLd[1]);
      const offer = Array.isArray(d.offers) ? d.offers[0] : d.offers;
      return {
        sku: slug,
        title: String(d.name || '').replace(/;/g, ',').trim(),
        price: offer?.price != null ? Number(offer.price) : null,
        inStock: /InStock/i.test(offer?.availability || ''),
        url,
      };
    } catch { /* fall through */ }
  }
  // Fallback: regex
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const priceMatch = html.match(/"price":\s*"?(\d+(?:\.\d+)?)/);
  const soldOut = /sold\s*out|out\s+of\s+stock/i.test(html);
  return {
    sku: slug,
    title: (titleMatch?.[1] || slug).replace(/\s*-\s*Topps.*$/i, '').replace(/;/g, ',').trim(),
    price: priceMatch ? Number(priceMatch[1]) : null,
    inStock: !soldOut,
    url,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Search products by keyword.
 * @param {'target'|'walmart'|'topps'} retailer
 * @param {string} keyword
 * @param {object} opts - { maxResults, minPrice, maxPrice, inStockOnly }
 * @returns {Promise<Array<{sku,title,price,inStock,url}>>}
 */
async function search(retailer, keyword, opts = {}) {
  const fn = retailer === 'target' ? targetSearch
    : retailer === 'walmart' ? walmartSearch
    : retailer === 'topps' ? toppsSearch
    : retailer === 'bestbuy' ? bestbuySearch
    : null;
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
    if (parsed) {
      retailer = parsed.retailer;
      sku = parsed.sku;
    } else if (/topps\.com\/products\//i.test(url)) {
      retailer = 'topps';
      sku = url.match(/topps\.com\/products\/([^/?#]+)/i)?.[1];
    } else if (/bestbuy\.com\/site\//i.test(url)) {
      retailer = 'bestbuy';
      sku = url.match(/skuId=(\d+)/i)?.[1] || url.match(/\/(\d{7,})\.p/)?.[1];
    }
    if (!retailer || !sku) throw new Error(`could not parse SKU from URL`);
  }
  if (!retailer || !sku) throw new Error('retailer and sku (or url) required');
  const fn = retailer === 'target' ? targetLookup
    : retailer === 'walmart' ? walmartLookup
    : retailer === 'topps' ? toppsLookup
    : retailer === 'bestbuy' ? bestbuyLookup
    : null;
  if (!fn) throw new Error(`unsupported retailer: ${retailer}`);
  return fn(sku);
}

function applyFilters(items, opts) {
  const minP = opts.minPrice != null ? Number(opts.minPrice) : 0;
  const maxP = opts.maxPrice != null ? Number(opts.maxPrice) : Infinity;
  const inStockOnly = !!opts.inStockOnly;
  const firstPartyOnly = opts.firstPartyOnly !== false; // default ON — drop marketplace scalpers
  return items.filter(p => {
    if (firstPartyOnly && p.firstParty === false) return false;
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
