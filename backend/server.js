// DROPWATCH Backend Engine v2.0
// Playwright-based automated purchasing agent with product discovery
// Deploys to Railway with headless Chrome

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import express from 'express';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const config = {
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_KEY,
  checkInterval: parseInt(process.env.CHECK_INTERVAL || '30') * 1000,
  discoveryInterval: parseInt(process.env.DISCOVERY_INTERVAL || '300') * 1000, // 5 min default
  port: parseInt(process.env.PORT || '3000'),
  headless: process.env.HEADLESS !== 'false',
  maxRetries: 3,
  requestDelay: 1500 // ms between requests to same retailer
};

const supabase = createClient(config.supabaseUrl, config.supabaseKey);

// ═══════════════════════════════════════════════════════════════════════════════
// RETAILER SEARCH URLS + SELECTORS
// Each retailer has: searchUrl, product selectors, stock selectors, cart selectors
// ═══════════════════════════════════════════════════════════════════════════════

const retailers = {
  'Target': {
    searchUrl: (q) => `https://www.target.com/s?searchTerm=${encodeURIComponent(q)}&category=0&tref=typeahead%7Cterm`,
    parseResults: async (page) => {
      await page.waitForSelector('[data-test="product-card"], [data-test="@web/ProductCard"]', { timeout: 10000 }).catch(() => null);
      return page.$$eval('[data-test="product-card"], [data-test="@web/ProductCard/ProductCardVariantDefault"]', cards => {
        return cards.slice(0, 10).map(card => {
          const link = card.querySelector('a[href*="/p/"]');
          const title = card.querySelector('[data-test="product-title"], h3')?.textContent?.trim();
          const priceEl = card.querySelector('[data-test="current-price"] span, [data-test="product-price"] span');
          const price = priceEl?.textContent?.replace(/[^0-9.]/g, '');
          const imgEl = card.querySelector('img[src*="target.scene7"]');
          const image = imgEl?.src || '';
          return {
            name: title || '',
            url: link ? 'https://www.target.com' + link.getAttribute('href').split('?')[0] : '',
            price: parseFloat(price) || 0,
            image,
            retailer: 'Target'
          };
        }).filter(p => p.name && p.url);
      });
    },
    checkStock: async (page, url) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);
      const soldOut = await page.$('text="Sold out"');
      if (soldOut) return false;
      const addToCart = await page.$('button[data-test="shipItButton"], button[data-test="addToCartButton"], button[data-test="orderPickupButton"]');
      if (addToCart) {
        const isDisabled = await addToCart.isDisabled();
        return !isDisabled;
      }
      return false;
    },
    addToCart: async (page) => {
      const addBtn = await page.$('button[data-test="shipItButton"], button[data-test="addToCartButton"]');
      if (addBtn && !(await addBtn.isDisabled())) {
        await addBtn.click();
        await page.waitForTimeout(3000);
        return true;
      }
      return false;
    }
  },

  'Walmart': {
    searchUrl: (q) => `https://www.walmart.com/search?q=${encodeURIComponent(q)}`,
    parseResults: async (page) => {
      await page.waitForSelector('[data-testid="list-view"]', { timeout: 10000 }).catch(() => null);
      return page.$$eval('[data-testid="list-view"] [link-identifier]', cards => {
        return cards.slice(0, 10).map(card => {
          const link = card.querySelector('a[href*="/ip/"]');
          const title = card.querySelector('[data-automation-id="product-title"], span[data-automation-id="name"]')?.textContent?.trim();
          const priceEl = card.querySelector('[data-automation-id="product-price"] [itemprop="price"], .f2');
          const price = priceEl?.textContent?.replace(/[^0-9.]/g, '');
          const imgEl = card.querySelector('img[src*="walmartimages"]');
          return {
            name: title || '',
            url: link ? 'https://www.walmart.com' + link.getAttribute('href').split('?')[0] : '',
            price: parseFloat(price) || 0,
            image: imgEl?.src || '',
            retailer: 'Walmart'
          };
        }).filter(p => p.name && p.url);
      });
    },
    checkStock: async (page, url) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);
      const outOfStock = await page.$('text="Out of stock"');
      if (outOfStock) return false;
      const addToCart = await page.$('button[data-testid="add-to-cart-btn"]');
      if (addToCart) {
        const text = await addToCart.textContent();
        return text?.toLowerCase().includes('add to cart');
      }
      return false;
    },
    addToCart: async (page) => {
      const addBtn = await page.$('button[data-testid="add-to-cart-btn"]');
      if (addBtn) {
        await addBtn.click();
        await page.waitForTimeout(3000);
        return true;
      }
      return false;
    }
  },

  'Pokemon Center': {
    searchUrl: (q) => `https://www.pokemoncenter.com/search/${encodeURIComponent(q)}`,
    parseResults: async (page) => {
      await page.waitForSelector('.product-grid, [class*="ProductCard"]', { timeout: 10000 }).catch(() => null);
      return page.$$eval('.product-grid__item, [class*="ProductCard"]', cards => {
        return cards.slice(0, 10).map(card => {
          const link = card.querySelector('a[href*="/product/"]');
          const title = card.querySelector('.product-card__title, h3, [class*="title"]')?.textContent?.trim();
          const priceEl = card.querySelector('.product-card__price, [class*="price"]');
          const price = priceEl?.textContent?.replace(/[^0-9.]/g, '');
          const imgEl = card.querySelector('img');
          return {
            name: title || '',
            url: link ? (link.href.startsWith('http') ? link.href : 'https://www.pokemoncenter.com' + link.getAttribute('href')) : '',
            price: parseFloat(price) || 0,
            image: imgEl?.src || '',
            retailer: 'Pokemon Center'
          };
        }).filter(p => p.name && p.url);
      });
    },
    checkStock: async (page, url) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);
      const soldOut = await page.$('text="Sold Out"');
      if (soldOut) return false;
      const addToCart = await page.$('button.add-to-cart, button[data-testid="add-to-cart"], button:has-text("Add to Cart")');
      if (addToCart) {
        const isDisabled = await addToCart.isDisabled();
        return !isDisabled;
      }
      return false;
    },
    addToCart: async (page) => {
      const addBtn = await page.$('button.add-to-cart, button[data-testid="add-to-cart"], button:has-text("Add to Cart")');
      if (addBtn && !(await addBtn.isDisabled())) {
        await addBtn.click();
        await page.waitForTimeout(3000);
        return true;
      }
      return false;
    }
  },

  'Best Buy': {
    searchUrl: (q) => `https://www.bestbuy.com/site/searchpage.jsp?st=${encodeURIComponent(q)}`,
    parseResults: async (page) => {
      await page.waitForSelector('.sku-item, .list-item', { timeout: 10000 }).catch(() => null);
      return page.$$eval('.sku-item, .list-item', cards => {
        return cards.slice(0, 10).map(card => {
          const link = card.querySelector('a.image-link, a[href*="/site/"]');
          const title = card.querySelector('.sku-title a, .sku-header a, h4 a')?.textContent?.trim();
          const priceEl = card.querySelector('.priceView-customer-price span, [data-testid="customer-price"] span');
          const price = priceEl?.textContent?.replace(/[^0-9.]/g, '');
          const imgEl = card.querySelector('img.product-image, img[class*="product"]');
          return {
            name: title || '',
            url: link ? (link.href.startsWith('http') ? link.href : 'https://www.bestbuy.com' + link.getAttribute('href')) : '',
            price: parseFloat(price) || 0,
            image: imgEl?.src || '',
            retailer: 'Best Buy'
          };
        }).filter(p => p.name && p.url);
      });
    },
    checkStock: async (page, url) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);
      const soldOut = await page.$('button.add-to-cart-button[disabled], text="Sold Out"');
      if (soldOut) return false;
      const addToCart = await page.$('button.add-to-cart-button:not([disabled])');
      return addToCart !== null;
    },
    addToCart: async (page) => {
      const addBtn = await page.$('button.add-to-cart-button:not([disabled])');
      if (addBtn) {
        await addBtn.click();
        await page.waitForTimeout(3000);
        return true;
      }
      return false;
    }
  },

  'GameStop': {
    searchUrl: (q) => `https://www.gamestop.com/search/?q=${encodeURIComponent(q)}&lang=default`,
    parseResults: async (page) => {
      await page.waitForSelector('.product-grid-tile, .product-tile', { timeout: 10000 }).catch(() => null);
      return page.$$eval('.product-grid-tile, .product-tile', cards => {
        return cards.slice(0, 10).map(card => {
          const link = card.querySelector('a[href*="/products/"]');
          const title = card.querySelector('.product-tile__title, .product-name, h3 a')?.textContent?.trim();
          const priceEl = card.querySelector('.product-tile__price, .price-text, .actual-price');
          const price = priceEl?.textContent?.replace(/[^0-9.]/g, '');
          const imgEl = card.querySelector('img');
          return {
            name: title || '',
            url: link ? (link.href.startsWith('http') ? link.href : 'https://www.gamestop.com' + link.getAttribute('href')) : '',
            price: parseFloat(price) || 0,
            image: imgEl?.src || '',
            retailer: 'GameStop'
          };
        }).filter(p => p.name && p.url);
      });
    },
    checkStock: async (page, url) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);
      const addToCart = await page.$('button.add-to-cart:not([disabled])');
      return addToCart !== null;
    },
    addToCart: async (page) => {
      const addBtn = await page.$('button.add-to-cart:not([disabled])');
      if (addBtn) {
        await addBtn.click();
        await page.waitForTimeout(3000);
        return true;
      }
      return false;
    }
  },

  'Amazon': {
    searchUrl: (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}`,
    parseResults: async (page) => {
      await page.waitForSelector('[data-component-type="s-search-result"]', { timeout: 10000 }).catch(() => null);
      return page.$$eval('[data-component-type="s-search-result"]', cards => {
        return cards.slice(0, 10).map(card => {
          const link = card.querySelector('a.a-link-normal[href*="/dp/"]');
          const title = card.querySelector('h2 a span, .a-size-medium')?.textContent?.trim();
          const priceWhole = card.querySelector('.a-price-whole')?.textContent?.replace(/[^0-9]/g, '') || '';
          const priceFraction = card.querySelector('.a-price-fraction')?.textContent?.replace(/[^0-9]/g, '') || '00';
          const price = priceWhole ? parseFloat(`${priceWhole}.${priceFraction}`) : 0;
          const imgEl = card.querySelector('img.s-image');
          return {
            name: title || '',
            url: link ? 'https://www.amazon.com' + link.getAttribute('href').split('?')[0] : '',
            price,
            image: imgEl?.src || '',
            retailer: 'Amazon'
          };
        }).filter(p => p.name && p.url);
      });
    },
    checkStock: async (page, url) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);
      const outOfStock = await page.$('#outOfStock, text="Currently unavailable"');
      if (outOfStock) return false;
      const addToCart = await page.$('#add-to-cart-button');
      return addToCart !== null;
    },
    addToCart: async (page) => {
      const addBtn = await page.$('#add-to-cart-button');
      if (addBtn) {
        await addBtn.click();
        await page.waitForTimeout(3000);
        return true;
      }
      return false;
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// BROWSER MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

let browser = null;
let isRunning = false;
let isDiscovering = false;
let lastCheck = null;
let lastDiscovery = null;
let discoveryTimer = null;
let stats = {
  totalChecks: 0,
  stockFound: 0,
  purchaseAttempts: 0,
  successfulPurchases: 0,
  errors: 0,
  productsDiscovered: 0,
  discoveryRuns: 0
};

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
];

function randomUA() {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

async function initBrowser() {
  if (!browser) {
    console.log('🚀 Launching browser...');
    browser = await chromium.launch({
      headless: config.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled'
      ]
    });
    console.log('✅ Browser ready');
  }
  return browser;
}

async function createPage() {
  const b = await initBrowser();
  const context = await b.newContext({
    userAgent: randomUA(),
    viewport: { width: 1366, height: 768 },
    locale: 'en-US'
  });
  // Block unnecessary resources for speed
  await context.route('**/*.{png,jpg,jpeg,gif,svg,ico,woff,woff2,ttf}', route => route.abort());
  await context.route('**/analytics**', route => route.abort());
  await context.route('**/tracking**', route => route.abort());
  const page = await context.newPage();
  return { page, context };
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 2: PRODUCT DISCOVERY SCRAPER
// Takes keywords → searches retailers → auto-adds matching products to DB
// ═══════════════════════════════════════════════════════════════════════════════

async function discoverProducts() {
  console.log('\n🔎 ═══════════════════════════════════════');
  console.log('🔎 PRODUCT DISCOVERY CYCLE');
  console.log('🔎 ═══════════════════════════════════════');

  // Fetch keywords from database
  const { data: keywords, error } = await supabase
    .from('keywords')
    .select('*')
    .eq('is_active', true);

  if (error || !keywords?.length) {
    console.log('⚠️ No active keywords found. Add keywords in the admin panel.');
    return;
  }

  console.log(`📋 ${keywords.length} active keyword(s): ${keywords.map(k => k.term).join(', ')}`);
  stats.discoveryRuns++;

  for (const keyword of keywords) {
    const targetRetailers = keyword.retailers ? JSON.parse(keyword.retailers) : Object.keys(retailers);

    for (const retailerName of targetRetailers) {
      const retailer = retailers[retailerName];
      if (!retailer?.searchUrl || !retailer?.parseResults) {
        console.log(`⚠️ No search adapter for ${retailerName}`);
        continue;
      }

      try {
        console.log(`🔍 Searching ${retailerName} for "${keyword.term}"...`);
        const { page, context } = await createPage();

        try {
          const searchUrl = retailer.searchUrl(keyword.term);
          await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(3000);

          const results = await retailer.parseResults(page);
          console.log(`   Found ${results.length} results on ${retailerName}`);

          // Filter by price limits if set
          const filtered = results.filter(p => {
            if (keyword.max_price && p.price > keyword.max_price) return false;
            if (keyword.min_price && p.price < keyword.min_price) return false;
            // Check if product name actually matches the keyword
            const terms = keyword.term.toLowerCase().split(' ');
            const nameLC = p.name.toLowerCase();
            return terms.every(t => nameLC.includes(t));
          });

          console.log(`   ${filtered.length} match filters`);

          // Add new products to database (skip duplicates)
          for (const product of filtered) {
            // Check if this URL already exists in our products table
            const { data: existing } = await supabase
              .from('products')
              .select('id')
              .eq('url', product.url)
              .single();

            if (!existing) {
              const { data: inserted, error: insertErr } = await supabase
                .from('products')
                .insert([{
                  name: product.name,
                  url: product.url,
                  retailer: product.retailer,
                  target_price: product.price,
                  image_url: product.image,
                  is_active: keyword.auto_activate !== false,
                  keyword_id: keyword.id,
                  discovered_at: new Date().toISOString(),
                  purchase_count: 0
                }])
                .select();

              if (!insertErr && inserted?.length) {
                console.log(`   ✨ NEW: ${product.name} @ $${product.price} (${product.retailer})`);
                stats.productsDiscovered++;
              }
            }
          }
        } finally {
          await context.close();
        }

        // Delay between retailer searches
        await new Promise(r => setTimeout(r, config.requestDelay));

      } catch (err) {
        console.error(`   ❌ Error searching ${retailerName}: ${err.message}`);
        stats.errors++;
      }
    }

    // Update last_searched timestamp on keyword
    await supabase
      .from('keywords')
      .update({ last_searched: new Date().toISOString() })
      .eq('id', keyword.id);
  }

  lastDiscovery = new Date();
  console.log(`🔎 Discovery complete. ${stats.productsDiscovered} total products discovered.`);
  console.log('🔎 ═══════════════════════════════════════\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 3: INVENTORY MONITOR (checks known products for stock)
// ═══════════════════════════════════════════════════════════════════════════════

async function checkProduct(product) {
  const adapter = retailers[product.retailer];
  if (!adapter) {
    console.log(`⚠️ No adapter for retailer: ${product.retailer}`);
    return { inStock: false, error: 'No adapter' };
  }

  if (!product.url) {
    console.log(`⚠️ No URL for product: ${product.name}`);
    return { inStock: false, error: 'No URL' };
  }

  const { page, context } = await createPage();

  try {
    console.log(`🔍 Checking: ${product.name} @ ${product.retailer}`);
    const inStock = await adapter.checkStock(page, product.url);

    if (inStock) {
      console.log(`✅ IN STOCK: ${product.name}`);
      stats.stockFound++;

      // Attempt to add to cart
      const added = await adapter.addToCart(page);
      if (added) {
        stats.purchaseAttempts++;
        console.log(`🛒 Added to cart: ${product.name}`);

        // Record purchase in database
        await recordPurchase(product);
      }
    } else {
      console.log(`❌ Out of stock: ${product.name}`);
    }

    // Update last_checked + stock status in database
    await supabase
      .from('products')
      .update({
        last_checked: new Date().toISOString(),
        in_stock: inStock
      })
      .eq('id', product.id);

    return { inStock, error: null };
  } catch (error) {
    console.error(`❌ Error checking ${product.name}:`, error.message);
    stats.errors++;
    return { inStock: false, error: error.message };
  } finally {
    await context.close();
  }
}

async function recordPurchase(product) {
  const purchase = {
    product_id: product.id,
    product_name: product.name,
    retailer: product.retailer,
    quantity: 1,
    price: product.target_price,
    total: product.target_price,
    status: 'carted',
    order_number: `DW-${Date.now()}`,
    purchased_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('purchases')
    .insert([purchase])
    .select();

  if (!error) {
    console.log(`📝 Purchase recorded: ${purchase.order_number}`);
    stats.successfulPurchases++;

    // Update product purchase count
    await supabase
      .from('products')
      .update({ purchase_count: (product.purchase_count || 0) + 1 })
      .eq('id', product.id);
  }

  return { data, error };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ENGINE LOOP
// ═══════════════════════════════════════════════════════════════════════════════

async function runCheckCycle() {
  if (!isRunning) return;

  console.log('\n═══════════════════════════════════════');
  console.log(`🔄 STOCK CHECK CYCLE at ${new Date().toISOString()}`);

  // Get active products that have URLs
  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .eq('is_active', true)
    .not('url', 'is', null);

  if (error) {
    console.error('❌ Error fetching products:', error);
    return;
  }

  console.log(`📦 ${products.length} active products to check`);

  for (const product of products) {
    if (!isRunning) break;
    await checkProduct(product);
    stats.totalChecks++;

    // Delay between checks to avoid rate limiting
    await new Promise(r => setTimeout(r, config.requestDelay));
  }

  lastCheck = new Date();
  console.log(`✅ Cycle complete. Next in ${config.checkInterval / 1000}s`);
  console.log('═══════════════════════════════════════\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPRESS API
// ═══════════════════════════════════════════════════════════════════════════════

const app = express();
app.use(express.json());

// CORS for frontend
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Health check / status
app.get('/', (req, res) => {
  res.json({
    service: 'DROPWATCH Engine',
    version: '2.0',
    status: isRunning ? 'running' : 'stopped',
    discovery: isDiscovering ? 'active' : 'idle',
    lastCheck: lastCheck?.toISOString(),
    lastDiscovery: lastDiscovery?.toISOString(),
    stats
  });
});

// Start engine (both discovery + stock monitoring)
app.post('/start', async (req, res) => {
  if (isRunning) {
    return res.json({ message: 'Already running' });
  }

  isRunning = true;
  isDiscovering = true;
  console.log('▶️ Engine started (discovery + monitoring)');

  // Run initial discovery immediately
  discoverProducts().catch(err => console.error('Discovery error:', err));

  // Start discovery loop
  discoveryTimer = setInterval(() => {
    if (isRunning) discoverProducts().catch(err => console.error('Discovery error:', err));
  }, config.discoveryInterval);

  // Start stock check loop
  const loop = async () => {
    while (isRunning) {
      await runCheckCycle();
      await new Promise(r => setTimeout(r, config.checkInterval));
    }
  };
  loop();

  res.json({ message: 'Engine started', status: 'running', discovery: 'active' });
});

// Stop engine
app.post('/stop', async (req, res) => {
  isRunning = false;
  isDiscovering = false;
  if (discoveryTimer) {
    clearInterval(discoveryTimer);
    discoveryTimer = null;
  }
  console.log('⏹️ Engine stopped');
  res.json({ message: 'Engine stopped', status: 'stopped' });
});

// Get stats
app.get('/stats', (req, res) => {
  res.json({
    isRunning,
    isDiscovering,
    lastCheck: lastCheck?.toISOString(),
    lastDiscovery: lastDiscovery?.toISOString(),
    ...stats
  });
});

// Trigger discovery manually
app.post('/discover', async (req, res) => {
  console.log('🔎 Manual discovery triggered');
  discoverProducts().catch(err => console.error('Discovery error:', err));
  res.json({ message: 'Discovery started' });
});

// Manual check for a specific product
app.post('/check/:id', async (req, res) => {
  const { id } = req.params;

  const { data: product, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const result = await checkProduct(product);
  res.json({ product: product.name, ...result });
});

// Add keyword
app.post('/keywords', async (req, res) => {
  const { term, retailers: targetRetailers, max_price, min_price, auto_activate } = req.body;

  const { data, error } = await supabase
    .from('keywords')
    .insert([{
      term,
      retailers: targetRetailers ? JSON.stringify(targetRetailers) : null,
      max_price: max_price || null,
      min_price: min_price || null,
      auto_activate: auto_activate !== false,
      is_active: true,
      created_at: new Date().toISOString()
    }])
    .select();

  if (error) return res.status(400).json({ error: error.message });
  res.json({ keyword: data[0], message: 'Keyword added' });
});

// List keywords
app.get('/keywords', async (req, res) => {
  const { data, error } = await supabase
    .from('keywords')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Delete keyword
app.delete('/keywords/:id', async (req, res) => {
  const { error } = await supabase
    .from('keywords')
    .delete()
    .eq('id', req.params.id);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Keyword deleted' });
});

// Start server
app.listen(config.port, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                  DROPWATCH ENGINE v2.0                        ║
║                  Collector Station                            ║
╠═══════════════════════════════════════════════════════════════╣
║  Status:     Ready                                            ║
║  Port:       ${config.port}                                             ║
║  Check:      ${config.checkInterval / 1000}s interval                                   ║
║  Discovery:  ${config.discoveryInterval / 1000}s interval                                ║
║  Headless:   ${config.headless}                                           ║
╚═══════════════════════════════════════════════════════════════╝

API Endpoints:
  GET  /            Health check + status
  POST /start       Start engine (discovery + monitoring)
  POST /stop        Stop engine
  GET  /stats       Get statistics
  POST /discover    Trigger manual discovery
  POST /check/:id   Check specific product
  GET  /keywords    List keywords
  POST /keywords    Add keyword
  DEL  /keywords/:id  Delete keyword
  `);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  isRunning = false;
  isDiscovering = false;
  if (discoveryTimer) clearInterval(discoveryTimer);
  if (browser) await browser.close();
  process.exit(0);
});
