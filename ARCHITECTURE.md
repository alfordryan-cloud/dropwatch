# DROPWATCH - Automated Purchasing Agent

## System Architecture & Implementation Guide

### For Collector Station Trading Card Acquisition

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Core Components](#core-components)
4. [Feature Implementation](#feature-implementation)
5. [Retailer Integrations](#retailer-integrations)
6. [Deployment Guide](#deployment-guide)
7. [Security Considerations](#security-considerations)
8. [Operational Playbook](#operational-playbook)

---

## System Overview

DROPWATCH is an enterprise-grade automated purchasing system designed for high-velocity acquisition of trading card products across major retailers. The system monitors inventory states, confirms availability, and executes checkout flows with minimal latency.

### Design Principles

- **Resilience First**: Every component is designed to fail gracefully and recover automatically
- **Profile Isolation**: Failures in one identity don't cascade to others
- **Adaptive Throttling**: System self-regulates based on retailer response patterns
- **Audit Everything**: Complete traceability for every action and decision

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              DROPWATCH SYSTEM                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │                           PRESENTATION LAYER                                │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │ │
│  │  │   Web UI     │  │  Mobile App  │  │   Alerts     │  │   CLI/API    │   │ │
│  │  │  (React)     │  │   (PWA)      │  │  (Push/SMS)  │  │   Access     │   │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘   │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                       │                                          │
│  ┌────────────────────────────────────┼───────────────────────────────────────┐ │
│  │                           APPLICATION LAYER                                 │ │
│  │                                    │                                        │ │
│  │  ┌──────────────┐  ┌──────────────┼──────────────┐  ┌──────────────┐      │ │
│  │  │   MONITOR    │──│   STATE      │   EXECUTION  │──│   ALERTS     │      │ │
│  │  │   SERVICE    │  │   MANAGER    │   SERVICE    │  │   SERVICE    │      │ │
│  │  │              │  │              │              │  │              │      │ │
│  │  │ • SKU Track  │  │ • SKUs       │ • Checkout   │  │ • Push       │      │ │
│  │  │ • State Δ    │  │ • Profiles   │ • Cart Mgmt  │  │ • SMS        │      │ │
│  │  │ • Patterns   │  │ • Queue      │ • Retry      │  │ • Slack      │      │ │
│  │  │ • Flapping   │  │ • Logs       │ • Failover   │  │ • Email      │      │ │
│  │  └──────────────┘  └──────────────┴──────────────┘  └──────────────┘      │ │
│  │                            │                                               │ │
│  │  ┌─────────────────────────┼─────────────────────────────────────────────┐│ │
│  │  │              CONFIRMATION SERVICE                                      ││ │
│  │  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 ││ │
│  │  │  │ Page Element │  │  Add-to-Cart │  │  Fulfillment │                 ││ │
│  │  │  │   Checker    │  │   Validator  │  │   Checker    │                 ││ │
│  │  │  └──────────────┘  └──────────────┘  └──────────────┘                 ││ │
│  │  └───────────────────────────────────────────────────────────────────────┘│ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                       │                                          │
│  ┌────────────────────────────────────┼───────────────────────────────────────┐ │
│  │                         INTEGRATION LAYER                                   │ │
│  │                                                                             │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │ │
│  │  │  Target  │ │ Walmart  │ │ Best Buy │ │ Pokemon  │ │ GameStop │        │ │
│  │  │ Adapter  │ │ Adapter  │ │ Adapter  │ │ Center   │ │ Adapter  │        │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘        │ │
│  │                                                                             │ │
│  │  ┌─────────────────────────────────────────────────────────────────────┐  │ │
│  │  │                    BROWSER AUTOMATION ENGINE                         │  │ │
│  │  │           (Playwright / Puppeteer with Stealth Plugins)             │  │ │
│  │  └─────────────────────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                       │                                          │
│  ┌────────────────────────────────────┼───────────────────────────────────────┐ │
│  │                           DATA LAYER                                        │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │ │
│  │  │   Redis      │  │  PostgreSQL  │  │  S3/Storage  │  │   Secrets    │   │ │
│  │  │  (Cache/Q)   │  │   (State)    │  │   (Logs)     │  │   Manager    │   │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘   │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Monitor Service

**Purpose**: Continuously track SKU states across retailers

```javascript
// Configuration
{
  pollInterval: 5000,        // 5 seconds per SKU batch
  batchSize: 3,              // Concurrent checks
  stateChangeDebounce: 2000, // Avoid false positives
}

// State Machine
COMING_SOON → SOFT_LAUNCH → LIVE → OOS
                    ↑          ↓
                    └──────────┘ (Restock)
                    
// Special States
FLAPPING: Rapid on/off within 60s window (3+ changes)
REGIONAL: Available only in certain zip codes
```

**Key Features**:
- Pattern detection for soft launches (often 1-2 hours before official)
- Retailer-specific timing analysis (Target drops ~7am CT, etc.)
- Price delta tracking for below-MSRP opportunities
- Regional inventory differentiation

### 2. Confirmation Service

**Purpose**: Reduce false positives before committing resources

```javascript
// Multi-signal confirmation
{
  pageElements: {
    // Check: price display, stock indicator, button states
    required: ['addToCartButton:enabled', 'stockStatus:inStock'],
    optional: ['deliveryDate:present']
  },
  cartValidation: {
    // Actually add to cart to confirm
    timeout: 3000,
    rollback: true
  },
  fulfillment: {
    // Check available methods
    shipping: true,
    storePickup: ['zipCode1', 'zipCode2']
  }
}
```

### 3. Execution Service

**Purpose**: Execute checkout flows with zero hesitation

**Checkout Flow Types**:

| Flow Type | Retailers | Steps | Avg Time |
|-----------|-----------|-------|----------|
| Standard | Target, Walmart, GameStop | 5-7 | 8-12s |
| Queue | Pokemon Center, Best Buy | 2-3 + wait | Variable |
| One-Click | Amazon | 1-2 | 2-3s |

**Optimization Techniques**:
- Pre-authenticated sessions
- Cached payment tokens
- Skip optional steps (surveys, add-ons)
- Parallel form submission

### 4. Profile Management

**Purpose**: Multi-identity resilience

```javascript
// Profile Schema
{
  id: "P1",
  name: "Primary",
  shipping: {
    name: "...",
    address: "...",
    city: "Easley",
    state: "SC",
    zip: "29640"
  },
  payment: {
    type: "card",
    tokenRef: "vault://...",  // Never store raw card data
    last4: "6789"
  },
  credentials: {
    target: { encrypted: "..." },
    walmart: { encrypted: "..." },
    // ...
  },
  health: 95,        // 0-100 score
  status: "READY",   // READY | COOLING | BANNED | VIRGIN
  cooldownUntil: null
}
```

**Health Score Calculation**:
```
health = 100 - (consecutiveFailures * 5) + (successes * 2)
         - (queueTimeouts * 10) - (captchaHits * 15)
```

### 5. Alert Service

**Purpose**: Real-time visibility and control

| Alert Type | Channels | Priority |
|------------|----------|----------|
| DROP | Push, SMS, Slack | P0 - Immediate |
| SUCCESS | Push, Slack | P1 - High |
| FAIL | Push | P2 - Normal |
| WARN | Dashboard only | P3 - Low |

---

## Feature Implementation

### 1. Product & Drop Intelligence

```javascript
// SKU Registry Entry
{
  id: "PKM-SV08-ETB",
  name: "Surging Sparks Elite Trainer Box",
  retailers: [
    { name: "Target", url: "...", dpci: "087-10-XXXX" },
    { name: "Walmart", url: "...", upc: "8209..." },
    { name: "Pokemon Center", url: "...", productId: "..." }
  ],
  msrp: 49.99,
  releaseDate: "2024-11-08",
  priority: 1,
  triggers: {
    priceMax: 49.99,    // Don't buy above MSRP
    stockMin: "LIMITED", // LIMITED or better
    statusIn: ["LIVE", "SOFT_LAUNCH"]
  }
}
```

### 2. Inventory Flapping Detection

```javascript
// Detect rapid state changes
function detectFlapping(history, windowMs = 60000, threshold = 3) {
  const recentChanges = history.filter(
    h => Date.now() - h.timestamp < windowMs
  );
  return recentChanges.length >= threshold;
}

// Action on flapping
if (isFlapping) {
  // Wait for stability before acting
  await waitForStability(sku, stabilityWindow: 30000);
}
```

### 3. Regional Inventory Handling

```javascript
// Check inventory by zip code
async function checkRegionalInventory(sku, zipCodes) {
  const results = await Promise.all(
    zipCodes.map(zip => checkInventoryForZip(sku, zip))
  );
  
  return {
    available: results.some(r => r.inStock),
    byZip: Object.fromEntries(
      zipCodes.map((zip, i) => [zip, results[i]])
    )
  };
}
```

### 4. Concurrency Control

```javascript
// Semaphore-based concurrency
class ConcurrencyController {
  constructor(maxConcurrent) {
    this.max = maxConcurrent;
    this.current = 0;
    this.queue = [];
  }
  
  async acquire() {
    if (this.current < this.max) {
      this.current++;
      return;
    }
    await new Promise(resolve => this.queue.push(resolve));
    this.current++;
  }
  
  release() {
    this.current--;
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next();
    }
  }
}
```

### 5. Failure Learning

```javascript
// Tag and learn from failures
function processFailure(action, error) {
  const failureType = classifyFailure(error);
  
  switch (failureType) {
    case 'QUEUE_TIMEOUT':
      // Increase wait tolerance for this retailer
      adjustQueueTimeout(action.retailer, +15000);
      break;
    case 'CAPTCHA':
      // Mark profile as "hot"
      markProfileHot(action.profileId);
      break;
    case 'OOS_DURING_CHECKOUT':
      // Product likely has low inventory
      increasePollFrequency(action.skuId);
      break;
    case 'PAYMENT_DECLINED':
      // Payment issue - don't retry same profile
      disableProfilePayment(action.profileId);
      break;
  }
}
```

---

## Retailer Integrations

### Target

```javascript
{
  name: "Target",
  baseUrl: "https://www.target.com",
  apiEndpoints: {
    inventory: "/api/inventory/v2/stores/{storeId}/items/{dpci}",
    cart: "/api/checkout/v1/cart",
    checkout: "/api/checkout/v1/checkout"
  },
  selectors: {
    addToCart: '[data-test="addToCartButton"]',
    quantity: '[data-test="quantitySelector"]',
    checkout: '[data-test="checkout"]'
  },
  auth: {
    type: "session",
    loginUrl: "/account/sign-in"
  },
  quirks: {
    requiresZipForInventory: true,
    cartExpiry: 900000, // 15 minutes
    maxQuantity: 2
  }
}
```

### Pokemon Center

```javascript
{
  name: "Pokemon Center",
  baseUrl: "https://www.pokemoncenter.com",
  quirks: {
    queueSystem: true,        // Uses Cloudflare Waiting Room
    maxQueueWait: 300000,     // 5 minute timeout
    sessionSticky: true,      // Can't switch browsers mid-queue
    limitedCheckoutWindow: 600000 // 10 minutes once through queue
  },
  strategies: {
    // Pre-position in queue before drop
    preQueue: true,
    preQueueBuffer: 1800000   // 30 minutes before expected drop
  }
}
```

---

## Deployment Guide

### Infrastructure Requirements

```yaml
# docker-compose.yml
version: '3.8'

services:
  dropwatch-api:
    build: ./api
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://...
      - REDIS_URL=redis://redis:6379
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
    depends_on:
      - postgres
      - redis

  dropwatch-worker:
    build: ./worker
    deploy:
      replicas: 3
    environment:
      - REDIS_URL=redis://redis:6379
      - BROWSER_POOL_SIZE=5
    volumes:
      - browser-data:/data/browsers

  dropwatch-ui:
    build: ./ui
    ports:
      - "80:80"

  postgres:
    image: postgres:15
    volumes:
      - postgres-data:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=dropwatch
      - POSTGRES_PASSWORD=${DB_PASSWORD}

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data

volumes:
  postgres-data:
  redis-data:
  browser-data:
```

### Scaling Considerations

| Component | Scaling Strategy | Notes |
|-----------|-----------------|-------|
| API | Horizontal | Stateless, behind load balancer |
| Workers | Horizontal | Each needs browser pool |
| Browsers | Per-worker pool | 3-5 per worker recommended |
| Database | Vertical first | Consider read replicas later |
| Redis | Single primary | Queue + cache |

---

## Security Considerations

### Credential Storage

```javascript
// NEVER store credentials in plaintext
// Use a proper secrets manager

// AWS Secrets Manager example
const secretsManager = new SecretsManager();
const credentials = await secretsManager.getSecret('dropwatch/profiles');

// Or use age/sops for encrypted files
// age -r age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p secrets.json
```

### Payment Security

- **NEVER** store full card numbers
- Use payment processor tokens (Stripe, Square, etc.)
- Implement proper PCI-DSS compliance if handling cards
- Consider virtual card numbers for isolation

### Profile Isolation

```javascript
// Each profile should have:
// - Separate browser context (cookies, localStorage)
// - Unique fingerprint (canvas, WebGL, etc.)
// - Different session timing patterns
// - Isolated failure domains

async function createIsolatedContext(profile) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled']
  });
  
  const context = await browser.newContext({
    userAgent: profile.userAgent,
    viewport: profile.viewport,
    geolocation: profile.geolocation,
    storageState: profile.storageState
  });
  
  return context;
}
```

---

## Operational Playbook

### Pre-Drop Checklist

- [ ] Verify all target SKUs are registered
- [ ] Confirm profile health scores > 70%
- [ ] Test payment methods (small purchase)
- [ ] Verify alert channels working
- [ ] Check throttle settings
- [ ] Review retailer-specific timing patterns

### During Drop

1. **Monitor dashboard** - Watch for state changes
2. **Check queue depths** - Ensure actions are processing
3. **Watch for failures** - Be ready to intervene
4. **Profile rotation** - Swap in fresh profiles if needed

### Post-Drop Analysis

```javascript
// Generate drop report
const report = {
  dropId: "DROP-2024-11-08",
  targetSKUs: [...],
  timeline: {
    firstDetection: "07:02:34 CT",
    firstAttempt: "07:02:35 CT",
    firstSuccess: "07:02:47 CT",
    lastAttempt: "07:15:22 CT"
  },
  results: {
    totalAttempts: 47,
    successes: 12,
    failures: 35,
    successRate: 0.255
  },
  failureBreakdown: {
    OOS_DURING_CHECKOUT: 28,
    QUEUE_TIMEOUT: 4,
    PAYMENT_DECLINED: 2,
    OTHER: 1
  },
  profilePerformance: [...],
  recommendations: [
    "Increase concurrency for Target (queue depth was low)",
    "Profile P3 should be retired (3 consecutive failures)",
    "Consider adding 2 more profiles for next drop"
  ]
};
```

---

## Support & Maintenance

### Log Locations

```
/var/log/dropwatch/
├── api.log          # API requests
├── worker.log       # Worker activity  
├── browser.log      # Browser automation
├── checkout.log     # Checkout attempts
└── alerts.log       # Sent alerts
```

### Health Checks

```javascript
// Endpoints
GET /health           // Basic health
GET /health/detailed  // Component status
GET /metrics          // Prometheus metrics

// Key metrics to monitor
- dropwatch_active_monitors
- dropwatch_checkout_attempts_total
- dropwatch_checkout_success_total
- dropwatch_queue_depth
- dropwatch_profile_health_avg
- dropwatch_browser_pool_available
```

---

## Legal Disclaimer

This system is designed for legitimate retail purchasing. Users are responsible for:
- Complying with retailer Terms of Service
- Respecting purchase limits
- Not engaging in scalping or market manipulation
- Following all applicable laws and regulations

---

*DROPWATCH v1.0 - Built for Collector Station*
