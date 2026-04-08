-- ═══════════════════════════════════════════════════════════════════════════════
-- DROPWATCH DATABASE SCHEMA
-- PostgreSQL schema for purchasing agent persistence
-- ═══════════════════════════════════════════════════════════════════════════════

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ═══════════════════════════════════════════════════════════════════════════════
-- ENUMS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TYPE product_status AS ENUM (
  'COMING_SOON',
  'SOFT_LAUNCH', 
  'LIVE',
  'SOLD_OUT',
  'DISCONTINUED'
);

CREATE TYPE inventory_status AS ENUM (
  'IN_STOCK',
  'LIMITED',
  'REGIONAL',
  'BACKORDER',
  'OOS',
  'UNKNOWN'
);

CREATE TYPE profile_status AS ENUM (
  'READY',
  'COOLING',
  'BANNED',
  'VIRGIN'
);

CREATE TYPE action_type AS ENUM (
  'CHECKOUT',
  'ADD_TO_CART',
  'MONITOR'
);

CREATE TYPE action_status AS ENUM (
  'PENDING',
  'EXECUTING',
  'SUCCESS',
  'FAILED',
  'ABORTED'
);

CREATE TYPE checkout_result AS ENUM (
  'SUCCESS',
  'FAILED',
  'OOS_DURING_CHECKOUT',
  'PAYMENT_DECLINED',
  'QUEUE_TIMEOUT',
  'CAPTCHA_REQUIRED',
  'SESSION_EXPIRED',
  'RATE_LIMITED',
  'UNKNOWN_ERROR'
);

CREATE TYPE log_type AS ENUM (
  'INFO',
  'WARN',
  'DETECT',
  'SUCCESS',
  'FAIL'
);

CREATE TYPE alert_channel AS ENUM (
  'PUSH',
  'SMS',
  'EMAIL',
  'SLACK'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- RETAILERS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE retailers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  base_url VARCHAR(500) NOT NULL,
  checkout_flow VARCHAR(50) DEFAULT 'standard',
  is_enabled BOOLEAN DEFAULT true,
  max_quantity_per_item INTEGER DEFAULT 2,
  cart_expiry_ms INTEGER DEFAULT 900000,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed retailers
INSERT INTO retailers (name, base_url, checkout_flow, config) VALUES
  ('Target', 'https://www.target.com', 'standard', '{"requiresZipForInventory": true}'),
  ('Walmart', 'https://www.walmart.com', 'standard', '{}'),
  ('Best Buy', 'https://www.bestbuy.com', 'queue', '{"queueEnabled": true}'),
  ('Pokemon Center', 'https://www.pokemoncenter.com', 'queue', '{"queueEnabled": true, "queueTimeout": 600000}'),
  ('GameStop', 'https://www.gamestop.com', 'standard', '{}'),
  ('Amazon', 'https://www.amazon.com', 'one-click', '{}');

-- ═══════════════════════════════════════════════════════════════════════════════
-- SKUs (Products to Track)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE skus (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku_id VARCHAR(100) NOT NULL, -- External SKU identifier
  name VARCHAR(500) NOT NULL,
  retailer_id UUID REFERENCES retailers(id) ON DELETE CASCADE,
  url VARCHAR(2000),
  msrp DECIMAL(10, 2),
  current_price DECIMAL(10, 2),
  status product_status DEFAULT 'COMING_SOON',
  inventory inventory_status DEFAULT 'UNKNOWN',
  priority INTEGER DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
  release_date DATE,
  
  -- Retailer-specific identifiers
  dpci VARCHAR(50), -- Target
  tcin VARCHAR(50), -- Target
  upc VARCHAR(50),  -- Universal
  item_id VARCHAR(50), -- Walmart
  product_id VARCHAR(100), -- Generic
  
  -- Trigger conditions
  max_price DECIMAL(10, 2),
  min_stock inventory_status DEFAULT 'LIMITED',
  
  -- Metadata
  last_check TIMESTAMP WITH TIME ZONE,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(sku_id, retailer_id)
);

CREATE INDEX idx_skus_retailer ON skus(retailer_id);
CREATE INDEX idx_skus_status ON skus(status);
CREATE INDEX idx_skus_enabled ON skus(is_enabled) WHERE is_enabled = true;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SKU STATE HISTORY
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE sku_state_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku_id UUID REFERENCES skus(id) ON DELETE CASCADE,
  old_status product_status,
  new_status product_status,
  old_inventory inventory_status,
  new_inventory inventory_status,
  old_price DECIMAL(10, 2),
  new_price DECIMAL(10, 2),
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sku_history_sku ON sku_state_history(sku_id);
CREATE INDEX idx_sku_history_time ON sku_state_history(recorded_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PROFILES (Buyer Identities)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  status profile_status DEFAULT 'VIRGIN',
  health INTEGER DEFAULT 100 CHECK (health BETWEEN 0 AND 100),
  success_rate DECIMAL(5, 4) DEFAULT 1.0,
  
  -- Stats
  total_successes INTEGER DEFAULT 0,
  total_failures INTEGER DEFAULT 0,
  consecutive_failures INTEGER DEFAULT 0,
  
  -- Timing
  last_used TIMESTAMP WITH TIME ZONE,
  cooldown_until TIMESTAMP WITH TIME ZONE,
  
  -- Shipping (encrypted)
  shipping_encrypted BYTEA,
  
  -- Browser fingerprint config
  user_agent TEXT,
  viewport_width INTEGER DEFAULT 1920,
  viewport_height INTEGER DEFAULT 1080,
  timezone VARCHAR(100) DEFAULT 'America/New_York',
  locale VARCHAR(20) DEFAULT 'en-US',
  
  -- Session state (encrypted)
  storage_state_encrypted BYTEA,
  
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_profiles_status ON profiles(status);
CREATE INDEX idx_profiles_health ON profiles(health DESC);
CREATE INDEX idx_profiles_enabled ON profiles(is_enabled) WHERE is_enabled = true;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PROFILE CREDENTIALS (per retailer)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE profile_credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  retailer_id UUID REFERENCES retailers(id) ON DELETE CASCADE,
  
  -- Encrypted credentials
  credentials_encrypted BYTEA NOT NULL,
  
  -- Saved payment reference (encrypted)
  payment_token_encrypted BYTEA,
  payment_last_four VARCHAR(4),
  
  is_valid BOOLEAN DEFAULT true,
  last_validated TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(profile_id, retailer_id)
);

CREATE INDEX idx_creds_profile ON profile_credentials(profile_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- ACTION QUEUE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku_id UUID REFERENCES skus(id) ON DELETE SET NULL,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  action_type action_type NOT NULL,
  status action_status DEFAULT 'PENDING',
  priority INTEGER DEFAULT 2,
  
  -- Execution details
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Result
  result checkout_result,
  order_id VARCHAR(100),
  error_message TEXT,
  duration_ms INTEGER,
  
  -- Retry tracking
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 2,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_actions_status ON actions(status);
CREATE INDEX idx_actions_sku ON actions(sku_id);
CREATE INDEX idx_actions_profile ON actions(profile_id);
CREATE INDEX idx_actions_pending ON actions(created_at) WHERE status = 'PENDING';

-- ═══════════════════════════════════════════════════════════════════════════════
-- SYSTEM LOGS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  log_type log_type NOT NULL,
  message TEXT NOT NULL,
  
  -- Related entities
  sku_id UUID REFERENCES skus(id) ON DELETE SET NULL,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  retailer_id UUID REFERENCES retailers(id) ON DELETE SET NULL,
  action_id UUID REFERENCES actions(id) ON DELETE SET NULL,
  
  -- Additional context
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_logs_type ON logs(log_type);
CREATE INDEX idx_logs_time ON logs(created_at DESC);
CREATE INDEX idx_logs_sku ON logs(sku_id);
CREATE INDEX idx_logs_profile ON logs(profile_id);

-- Partition logs by month for performance
-- In production, consider using pg_partman

-- ═══════════════════════════════════════════════════════════════════════════════
-- ALERTS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alert_type VARCHAR(50) NOT NULL,
  channel alert_channel NOT NULL,
  message TEXT NOT NULL,
  
  -- Related entities
  sku_id UUID REFERENCES skus(id) ON DELETE SET NULL,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action_id UUID REFERENCES actions(id) ON DELETE SET NULL,
  
  -- Delivery status
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  delivered_at TIMESTAMP WITH TIME ZONE,
  delivery_status VARCHAR(50) DEFAULT 'PENDING',
  delivery_error TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_alerts_type ON alerts(alert_type);
CREATE INDEX idx_alerts_sent ON alerts(sent_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- METRICS (Aggregated)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE metrics_hourly (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hour TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Overall
  total_attempts INTEGER DEFAULT 0,
  total_successes INTEGER DEFAULT 0,
  total_failures INTEGER DEFAULT 0,
  
  -- By retailer (JSONB for flexibility)
  by_retailer JSONB DEFAULT '{}',
  
  -- By SKU
  by_sku JSONB DEFAULT '{}',
  
  -- System metrics
  avg_checkout_duration_ms INTEGER,
  max_queue_depth INTEGER,
  avg_throttle DECIMAL(5, 4),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(hour)
);

CREATE INDEX idx_metrics_hour ON metrics_hourly(hour DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SYSTEM SETTINGS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Default settings
INSERT INTO settings (key, value, description) VALUES
  ('system.mode', '"STANDBY"', 'System mode: STANDBY, ARMED, PAUSED'),
  ('throttle.max_concurrency', '3', 'Maximum concurrent checkout attempts'),
  ('throttle.request_delay_ms', '500', 'Delay between requests in ms'),
  ('throttle.auto_threshold', '0.85', 'Auto-throttle threshold'),
  ('monitor.poll_interval_ms', '5000', 'SKU polling interval'),
  ('safety.max_failures_abort', '3', 'Consecutive failures before abort'),
  ('safety.profile_cooldown_ms', '300000', 'Profile cooldown after failures'),
  ('alerts.push_enabled', 'true', 'Enable push notifications'),
  ('alerts.sms_enabled', 'false', 'Enable SMS alerts'),
  ('alerts.email_enabled', 'true', 'Enable email alerts'),
  ('alerts.slack_enabled', 'false', 'Enable Slack alerts');

-- ═══════════════════════════════════════════════════════════════════════════════
-- FUNCTIONS & TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Update timestamp function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to relevant tables
CREATE TRIGGER update_retailers_updated_at BEFORE UPDATE ON retailers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_skus_updated_at BEFORE UPDATE ON skus
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_credentials_updated_at BEFORE UPDATE ON profile_credentials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Record SKU state changes
CREATE OR REPLACE FUNCTION record_sku_state_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status OR 
     OLD.inventory IS DISTINCT FROM NEW.inventory OR
     OLD.current_price IS DISTINCT FROM NEW.current_price THEN
    INSERT INTO sku_state_history (sku_id, old_status, new_status, old_inventory, new_inventory, old_price, new_price)
    VALUES (NEW.id, OLD.status, NEW.status, OLD.inventory, NEW.inventory, OLD.current_price, NEW.current_price);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sku_state_change_trigger AFTER UPDATE ON skus
  FOR EACH ROW EXECUTE FUNCTION record_sku_state_change();

-- Update profile health on action completion
CREATE OR REPLACE FUNCTION update_profile_health()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'SUCCESS' AND NEW.profile_id IS NOT NULL THEN
    UPDATE profiles SET
      total_successes = total_successes + 1,
      consecutive_failures = 0,
      health = LEAST(100, health + 2),
      success_rate = (total_successes + 1)::DECIMAL / NULLIF(total_successes + total_failures + 1, 0),
      last_used = NOW(),
      status = 'READY'
    WHERE id = NEW.profile_id;
  ELSIF NEW.status = 'FAILED' AND NEW.profile_id IS NOT NULL THEN
    UPDATE profiles SET
      total_failures = total_failures + 1,
      consecutive_failures = consecutive_failures + 1,
      health = GREATEST(0, health - 5),
      success_rate = total_successes::DECIMAL / NULLIF(total_successes + total_failures + 1, 0),
      last_used = NOW(),
      status = CASE 
        WHEN consecutive_failures >= 3 THEN 'COOLING'::profile_status 
        ELSE status 
      END,
      cooldown_until = CASE 
        WHEN consecutive_failures >= 3 THEN NOW() + INTERVAL '5 minutes'
        ELSE cooldown_until
      END
    WHERE id = NEW.profile_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER action_completion_trigger AFTER UPDATE ON actions
  FOR EACH ROW 
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('SUCCESS', 'FAILED'))
  EXECUTE FUNCTION update_profile_health();

-- ═══════════════════════════════════════════════════════════════════════════════
-- VIEWS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Active SKUs view
CREATE VIEW active_skus AS
SELECT 
  s.*,
  r.name as retailer_name,
  r.base_url as retailer_url
FROM skus s
JOIN retailers r ON s.retailer_id = r.id
WHERE s.is_enabled = true AND r.is_enabled = true;

-- Ready profiles view
CREATE VIEW ready_profiles AS
SELECT *
FROM profiles
WHERE is_enabled = true 
  AND status IN ('READY', 'VIRGIN')
  AND (cooldown_until IS NULL OR cooldown_until < NOW())
ORDER BY health DESC;

-- Pending actions view
CREATE VIEW pending_actions AS
SELECT 
  a.*,
  s.name as sku_name,
  s.sku_id as external_sku_id,
  r.name as retailer_name,
  p.name as profile_name
FROM actions a
LEFT JOIN skus s ON a.sku_id = s.id
LEFT JOIN retailers r ON s.retailer_id = r.id
LEFT JOIN profiles p ON a.profile_id = p.id
WHERE a.status = 'PENDING'
ORDER BY a.priority ASC, a.created_at ASC;

-- Recent activity view
CREATE VIEW recent_activity AS
SELECT 
  l.id,
  l.log_type,
  l.message,
  l.created_at,
  s.name as sku_name,
  r.name as retailer_name,
  p.name as profile_name
FROM logs l
LEFT JOIN skus s ON l.sku_id = s.id
LEFT JOIN retailers r ON l.retailer_id = r.id
LEFT JOIN profiles p ON l.profile_id = p.id
ORDER BY l.created_at DESC
LIMIT 100;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PERMISSIONS (Example - adjust for your setup)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Create application role
-- CREATE ROLE dropwatch_app LOGIN PASSWORD 'your_secure_password';

-- Grant permissions
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dropwatch_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dropwatch_app;
-- GRANT SELECT ON ALL VIEWS IN SCHEMA public TO dropwatch_app;

-- ═══════════════════════════════════════════════════════════════════════════════
-- CLEANUP JOBS (Run periodically via cron or pg_cron)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Clean old logs (keep 30 days)
-- DELETE FROM logs WHERE created_at < NOW() - INTERVAL '30 days';

-- Clean old state history (keep 90 days)
-- DELETE FROM sku_state_history WHERE recorded_at < NOW() - INTERVAL '90 days';

-- Reset cooled profiles
-- UPDATE profiles SET status = 'READY', consecutive_failures = 0 
-- WHERE status = 'COOLING' AND cooldown_until < NOW();
