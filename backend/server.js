// DROPWATCH Backend Engine
// Playwright-based automated purchasing agent
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
  checkInterval: parseInt(process.env.CHECK_INTERVAL || '60') * 1000,
  port: parseInt(process.env.PORT || '3000'),
  headless: process.env.HEADLESS !== 'false'
};

const supabase = createClient(config.supabaseUrl, config.supabaseKey);

// ═══════════════════════════════════════════════════════════════════════════════
// RETAILER ADAPTERS
// ═══════════════════════════════════════════════════════════════════════════════

const retailers = {
  'Target': {
    checkStock: async (page, url) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      
      // Check for "Add to cart" button
      const addToCart = await page.$('button[data-test="shipItButton"], button[data-test="addToCartButton"]');
      if (addToCart) {
        const isDisabled = await addToCart.isDisabled();
        return !isDisabled;
      }
      
      // Check for "Out of stock" text
      const outOfStock = await page.$('text="Out of stock"');
      return !outOfStock;
    },
    
    addToCart: async (page) => {
      const addBtn = await page.$('button[data-test="shipItButton"], button[data-test="addToCartButton"]');
      if (addBtn) {
        await addBtn.click();
        await page.waitForTimeout(2000);
        return true;
      }
      return false;
    }
  },
  
  'Walmart': {
    checkStock: async (page, url) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      
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
        await page.waitForTimeout(2000);
        return true;
      }
      return false;
    }
  },
  
  'Pokemon Center': {
    checkStock: async (page, url) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      
      const addToCart = await page.$('button.add-to-cart, button[data-testid="add-to-cart"]');
      if (addToCart) {
        const isDisabled = await addToCart.isDisabled();
        return !isDisabled;
      }
      return false;
    },
    
    addToCart: async (page) => {
      const addBtn = await page.$('button.add-to-cart, button[data-testid="add-to-cart"]');
      if (addBtn) {
        await addBtn.click();
        await page.waitForTimeout(2000);
        return true;
      }
      return false;
    }
  },
  
  'Best Buy': {
    checkStock: async (page, url) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      
      const addToCart = await page.$('button.add-to-cart-button');
      if (addToCart) {
        const isDisabled = await addToCart.isDisabled();
        return !isDisabled;
      }
      return false;
    },
    
    addToCart: async (page) => {
      const addBtn = await page.$('button.add-to-cart-button');
      if (addBtn) {
        await addBtn.click();
        await page.waitForTimeout(2000);
        return true;
      }
      return false;
    }
  },
  
  'GameStop': {
    checkStock: async (page, url) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      
      const addToCart = await page.$('button.add-to-cart');
      return addToCart !== null;
    },
    
    addToCart: async (page) => {
      const addBtn = await page.$('button.add-to-cart');
      if (addBtn) {
        await addBtn.click();
        await page.waitForTimeout(2000);
        return true;
      }
      return false;
    }
  },
  
  'Amazon': {
    checkStock: async (page, url) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      
      const addToCart = await page.$('#add-to-cart-button');
      return addToCart !== null;
    },
    
    addToCart: async (page) => {
      const addBtn = await page.$('#add-to-cart-button');
      if (addBtn) {
        await addBtn.click();
        await page.waitForTimeout(2000);
        return true;
      }
      return false;
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

let browser = null;
let isRunning = false;
let lastCheck = null;
let stats = {
  totalChecks: 0,
  stockFound: 0,
  purchaseAttempts: 0,
  successfulPurchases: 0,
  errors: 0
};

async function initBrowser() {
  if (!browser) {
    console.log('🚀 Launching browser...');
    browser = await chromium.launch({
      headless: config.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
    console.log('✅ Browser ready');
  }
  return browser;
}

async function checkProduct(product) {
  const adapter = retailers[product.retailer];
  if (!adapter) {
    console.log(`⚠️ No adapter for retailer: ${product.retailer}`);
    return { inStock: false, error: 'No adapter' };
  }

  const browser = await initBrowser();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

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

    // Update last_checked in database
    await supabase
      .from('products')
      .update({ last_checked: new Date().toISOString() })
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
    status: 'pending',
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

async function runCheckCycle() {
  if (!isRunning) return;

  console.log('\n═══════════════════════════════════════');
  console.log(`🔄 Starting check cycle at ${new Date().toISOString()}`);
  
  // Get active products
  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .eq('is_active', true);

  if (error) {
    console.error('❌ Error fetching products:', error);
    return;
  }

  console.log(`📦 Found ${products.length} active products`);

  for (const product of products) {
    await checkProduct(product);
    stats.totalChecks++;
    
    // Small delay between checks
    await new Promise(r => setTimeout(r, 2000));
  }

  lastCheck = new Date();
  console.log(`✅ Cycle complete. Next check in ${config.checkInterval / 1000}s`);
  console.log('═══════════════════════════════════════\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPRESS API
// ═══════════════════════════════════════════════════════════════════════════════

const app = express();
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({
    service: 'DROPWATCH Engine',
    status: isRunning ? 'running' : 'stopped',
    lastCheck: lastCheck?.toISOString(),
    stats
  });
});

// Start engine
app.post('/start', async (req, res) => {
  if (isRunning) {
    return res.json({ message: 'Already running' });
  }
  
  isRunning = true;
  console.log('▶️ Engine started');
  
  // Start check loop
  const loop = async () => {
    while (isRunning) {
      await runCheckCycle();
      await new Promise(r => setTimeout(r, config.checkInterval));
    }
  };
  loop();
  
  res.json({ message: 'Engine started', status: 'running' });
});

// Stop engine
app.post('/stop', async (req, res) => {
  isRunning = false;
  console.log('⏹️ Engine stopped');
  res.json({ message: 'Engine stopped', status: 'stopped' });
});

// Get stats
app.get('/stats', (req, res) => {
  res.json({
    isRunning,
    lastCheck: lastCheck?.toISOString(),
    ...stats
  });
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

// Start server
app.listen(config.port, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    DROPWATCH ENGINE                            ║
║                   Collector Station                            ║
╠═══════════════════════════════════════════════════════════════╣
║  Status:    Ready                                              ║
║  Port:      ${config.port}                                              ║
║  Interval:  ${config.checkInterval / 1000}s                                              ║
║  Headless:  ${config.headless}                                            ║
╚═══════════════════════════════════════════════════════════════╝

POST /start  - Start the engine
POST /stop   - Stop the engine
GET  /stats  - Get statistics
GET  /       - Health check
  `);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  isRunning = false;
  if (browser) await browser.close();
  process.exit(0);
});
