# ⚡ DROPWATCH

### Automated Purchasing Agent for Collector Station

<p align="center">
  <img src="docs/dropwatch-banner.png" alt="DROPWATCH" width="600">
</p>

[![License](https://img.shields.io/badge/license-Proprietary-red.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/docker-ready-blue.svg)](https://docker.com/)

---

## 🎯 Overview

DROPWATCH is an enterprise-grade automated purchasing system designed for high-velocity acquisition of trading card products across major retailers. Built specifically for **Collector Station**, it provides:

- **Real-time product monitoring** across Target, Walmart, Best Buy, Pokemon Center, GameStop, and Amazon
- **Intelligent drop detection** with soft-launch and state-change alerts
- **Multi-profile checkout automation** with health scoring and rotation
- **Queue handling** for retailers like Pokemon Center with waiting rooms
- **Failure resilience** with automatic retry, cooldown, and cascade isolation

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DROPWATCH SYSTEM                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                         PRESENTATION LAYER                              │ │
│  │   Web UI (React)  │  Mobile (PWA)  │  Alerts (Push/SMS)  │  CLI/API    │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                       │                                      │
│  ┌────────────────────────────────────┼───────────────────────────────────┐ │
│  │                         APPLICATION LAYER                               │ │
│  │   Monitor Service → State Manager → Execution Service → Alert Service  │ │
│  │                    ↓                                                    │ │
│  │              Confirmation Service                                       │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                       │                                      │
│  ┌────────────────────────────────────┼───────────────────────────────────┐ │
│  │                         INTEGRATION LAYER                               │ │
│  │   Target │ Walmart │ Best Buy │ Pokemon Center │ GameStop │ Amazon     │ │
│  │                    Browser Automation (Playwright)                      │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                       │                                      │
│  ┌────────────────────────────────────┼───────────────────────────────────┐ │
│  │                           DATA LAYER                                    │ │
│  │        PostgreSQL (State)  │  Redis (Queue/Cache)  │  S3 (Logs)        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 20+ (for local development)
- PostgreSQL 15+ (or use Docker)

### 1. Clone & Configure

```bash
git clone https://github.com/collectorstation/dropwatch.git
cd dropwatch

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
nano .env
```

### 2. Generate Secrets

```bash
# Generate encryption key
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env

# Generate JWT secret
echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env

# Set database password
echo "DB_PASSWORD=$(openssl rand -base64 24)" >> .env
```

### 3. Start Services

```bash
# Start all services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

### 4. Access Dashboard

Open http://localhost in your browser.

---

## 📦 Project Structure

```
dropwatch/
├── src/
│   ├── adapters/           # Retailer-specific implementations
│   │   ├── base.js         # Base adapter class
│   │   ├── target.js       # Target adapter
│   │   ├── walmart.js      # Walmart adapter
│   │   └── pokemon-center.js
│   ├── browser/            # Playwright automation engine
│   │   └── engine.js       # Browser pool & stealth
│   ├── App.jsx             # React dashboard
│   └── engine.js           # Core purchasing engine
├── database/
│   └── schema.sql          # PostgreSQL schema
├── docker/
│   ├── Dockerfile.api      # API server
│   ├── Dockerfile.worker   # Browser automation worker
│   ├── Dockerfile.ui       # Nginx + React
│   ├── nginx.conf          # Nginx configuration
│   └── prometheus.yml      # Metrics configuration
├── docker-compose.yml      # Full stack deployment
├── package.json
└── README.md
```

---

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_PASSWORD` | PostgreSQL password | Required |
| `ENCRYPTION_KEY` | Master encryption key | Required |
| `JWT_SECRET` | JWT signing secret | Required |
| `WORKER_REPLICAS` | Number of worker instances | 2 |
| `BROWSER_POOL_SIZE` | Browsers per worker | 3 |
| `MAX_CONCURRENCY` | Max concurrent checkouts | 3 |

### Retailer Configuration

Each retailer can be enabled/disabled and configured via the dashboard or database:

```sql
UPDATE retailers SET is_enabled = true WHERE name = 'Target';
UPDATE retailers SET config = '{"maxQuantity": 2}' WHERE name = 'Pokemon Center';
```

---

## 🔧 Development

### Local Setup

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium

# Start development servers
npm run dev
```

### Running Tests

```bash
# Unit tests
npm test

# E2E tests
npm run test:e2e

# Type checking
npm run typecheck
```

---

## 📊 Monitoring

### Enable Monitoring Stack

```bash
docker-compose --profile monitoring up -d
```

Access:
- **Grafana**: http://localhost:3001 (admin/admin)
- **Prometheus**: http://localhost:9090

### Key Metrics

| Metric | Description |
|--------|-------------|
| `dropwatch_checkout_attempts_total` | Total checkout attempts |
| `dropwatch_checkout_success_total` | Successful checkouts |
| `dropwatch_queue_depth` | Current action queue depth |
| `dropwatch_profile_health_avg` | Average profile health score |
| `dropwatch_browser_pool_available` | Available browser instances |

---

## 🔐 Security

### Credential Storage

All sensitive data is encrypted at rest using AES-256-GCM:
- Payment tokens
- Retailer credentials
- Shipping addresses

### Best Practices

1. **Never commit `.env`** - Use `.env.example` as template
2. **Rotate encryption keys** periodically
3. **Use separate profiles** for different retailers
4. **Enable 2FA** on retailer accounts where possible

---

## 🚨 Alerts

### Supported Channels

- **Push Notifications** - Browser push
- **SMS** - Via Twilio
- **Email** - SMTP
- **Slack** - Webhook

### Alert Types

| Type | Channels | Description |
|------|----------|-------------|
| DROP | Push, SMS, Slack | Product went live |
| SUCCESS | Push, Slack | Checkout completed |
| FAIL | Push | Checkout failed |
| WARN | Dashboard | System warning |

---

## 📋 Operational Playbook

### Pre-Drop Checklist

- [ ] Verify all target SKUs are registered
- [ ] Confirm profile health scores > 70%
- [ ] Test payment methods (small purchase)
- [ ] Verify alert channels working
- [ ] Check throttle settings
- [ ] Review retailer-specific timing patterns

### Troubleshooting

**Profile marked COOLING:**
```sql
UPDATE profiles SET status = 'READY', consecutive_failures = 0 
WHERE id = 'profile-uuid';
```

**Clear action queue:**
```sql
UPDATE actions SET status = 'ABORTED' WHERE status = 'PENDING';
```

**Reset SKU state:**
```sql
UPDATE skus SET status = 'COMING_SOON', inventory = 'UNKNOWN' 
WHERE id = 'sku-uuid';
```

---

## 📜 Legal

This software is proprietary to Collector Station. Unauthorized use, copying, or distribution is prohibited.

Users are responsible for:
- Complying with retailer Terms of Service
- Respecting purchase limits
- Following all applicable laws and regulations

---

## 🤝 Support

For issues or questions, contact the Collector Station team.

---

<p align="center">
  <strong>DROPWATCH</strong> — Built for Collector Station<br>
  <em>"United in the Chase"</em>
</p>
