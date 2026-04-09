# DROPWATCH Engine

Automated purchasing engine for Collector Station. Monitors retailer sites and purchases trading card products when in stock.

## Supported Retailers
- Target
- Walmart
- Pokemon Center
- Best Buy
- GameStop
- Amazon

## Deployment to Railway

### 1. Create Railway Project
1. Go to [railway.app](https://railway.app)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Connect your GitHub account
5. Select the `dropwatch` repository
6. Choose the `/backend` directory

### 2. Set Environment Variables
In Railway dashboard, add these variables:

| Variable | Value |
|----------|-------|
| `SUPABASE_URL` | `https://fmatefsrmgdyrneagzyb.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Your service role key from Supabase |
| `CHECK_INTERVAL` | `60` (seconds between checks) |
| `PORT` | `3000` (Railway sets this automatically) |
| `HEADLESS` | `true` |

### 3. Deploy
Railway will automatically build and deploy using the Dockerfile.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check & status |
| `/start` | POST | Start the monitoring engine |
| `/stop` | POST | Stop the engine |
| `/stats` | GET | Get purchase statistics |
| `/check/:id` | POST | Manually check a specific product |

## Usage

### Start the engine:
```bash
curl -X POST https://your-railway-url.railway.app/start
```

### Check status:
```bash
curl https://your-railway-url.railway.app/
```

### Stop the engine:
```bash
curl -X POST https://your-railway-url.railway.app/stop
```

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│  DROPWATCH UI   │────▶│   Supabase   │◀────│  Engine (here)  │
│   (Vercel)      │     │  (Database)  │     │   (Railway)     │
└─────────────────┘     └──────────────┘     └─────────────────┘
                                                    │
                              ┌─────────────────────┼─────────────────────┐
                              ▼                     ▼                     ▼
                        ┌──────────┐          ┌──────────┐          ┌──────────┐
                        │  Target  │          │ Walmart  │          │ Pokemon  │
                        │          │          │          │          │  Center  │
                        └──────────┘          └──────────┘          └──────────┘
```

## Notes

- The engine uses Playwright with headless Chromium
- Each retailer has a custom adapter for stock checking
- Successful purchases are logged to Supabase
- Email alerts can be triggered via Supabase Edge Functions
