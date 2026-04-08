import React, { useState, useEffect, useCallback } from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// COLLECTOR STATION - AUTOMATED PURCHASING AGENT
// Enterprise-grade drop detection & checkout automation system
// ═══════════════════════════════════════════════════════════════════════════════

// Mock data generators for demo
const generateMockSKUs = () => [
  { id: 'PKM-SV08-ETB', name: 'Surging Sparks ETB', retailer: 'Target', status: 'LIVE', price: 49.99, msrp: 49.99, stock: 'IN_STOCK', lastCheck: Date.now(), priority: 1, delta: 0 },
  { id: 'PKM-SV08-BB', name: 'Surging Sparks Booster Box', retailer: 'Pokemon Center', status: 'COMING_SOON', price: 143.64, msrp: 143.64, stock: 'OOS', lastCheck: Date.now(), priority: 1, delta: 0 },
  { id: 'PKM-151-ETB', name: '151 ETB (Restock)', retailer: 'Walmart', status: 'FLAPPING', price: 49.99, msrp: 49.99, stock: 'LIMITED', lastCheck: Date.now(), priority: 2, delta: 0 },
  { id: 'PKM-PRISM-UPC', name: 'Prismatic Evolutions UPC', retailer: 'Best Buy', status: 'SOFT_LAUNCH', price: 119.99, msrp: 119.99, stock: 'REGIONAL', lastCheck: Date.now(), priority: 1, delta: 0 },
  { id: 'SP-TOPPS-S2', name: 'Topps Series 2 Hobby', retailer: 'Target', status: 'LIVE', price: 89.99, msrp: 99.99, stock: 'IN_STOCK', lastCheck: Date.now(), priority: 2, delta: -10 },
];

const generateMockProfiles = () => [
  { id: 'P1', name: 'Primary', health: 98, successRate: 0.94, lastUsed: Date.now() - 3600000, status: 'READY', failures: 2, successes: 31 },
  { id: 'P2', name: 'Backup Alpha', health: 85, successRate: 0.87, lastUsed: Date.now() - 7200000, status: 'READY', failures: 5, successes: 33 },
  { id: 'P3', name: 'Backup Beta', health: 72, successRate: 0.78, lastUsed: Date.now() - 86400000, status: 'COOLING', failures: 9, successes: 32 },
  { id: 'P4', name: 'Reserve', health: 100, successRate: 1.0, lastUsed: null, status: 'VIRGIN', failures: 0, successes: 0 },
];

const generateMockLogs = () => [
  { id: 1, time: Date.now() - 120000, type: 'SUCCESS', sku: 'PKM-SV08-ETB', retailer: 'Target', profile: 'P1', message: 'Checkout complete - Order #TGT-98234' },
  { id: 2, time: Date.now() - 180000, type: 'DETECT', sku: 'PKM-PRISM-UPC', retailer: 'Best Buy', profile: null, message: 'Soft launch detected - Early access window' },
  { id: 3, time: Date.now() - 240000, type: 'WARN', sku: 'PKM-151-ETB', retailer: 'Walmart', profile: 'P2', message: 'Inventory flapping detected - 3 state changes in 60s' },
  { id: 4, time: Date.now() - 300000, type: 'FAIL', sku: 'PKM-SV08-BB', retailer: 'Pokemon Center', profile: 'P3', message: 'Queue timeout after 45s - Profile marked HOT' },
  { id: 5, time: Date.now() - 360000, type: 'INFO', sku: null, retailer: null, profile: null, message: 'System throttle engaged - Load factor 0.85' },
];

// Status color mappings
const statusColors = {
  LIVE: '#00ff88',
  COMING_SOON: '#ffd700',
  SOFT_LAUNCH: '#00bfff',
  FLAPPING: '#ff6b6b',
  OOS: '#666',
};

const stockColors = {
  IN_STOCK: '#00ff88',
  LIMITED: '#ffd700',
  REGIONAL: '#00bfff',
  OOS: '#ff4444',
};

const logTypeColors = {
  SUCCESS: '#00ff88',
  DETECT: '#00bfff',
  WARN: '#ffd700',
  FAIL: '#ff4444',
  INFO: '#888',
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APPLICATION COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function PurchasingAgent() {
  const [activeTab, setActiveTab] = useState('monitor');
  const [skus, setSkus] = useState(generateMockSKUs());
  const [profiles, setProfiles] = useState(generateMockProfiles());
  const [logs, setLogs] = useState(generateMockLogs());
  const [systemStatus, setSystemStatus] = useState({
    mode: 'ARMED',
    throttle: 0.65,
    activeTasks: 3,
    queueDepth: 12,
    lastDrop: Date.now() - 3600000,
  });
  const [selectedSKU, setSelectedSKU] = useState(null);
  const [isAddingSKU, setIsAddingSKU] = useState(false);
  const [newSKU, setNewSKU] = useState({ id: '', name: '', retailer: 'Target', msrp: '', priority: 2 });

  // Simulate real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      setSkus(prev => prev.map(sku => ({
        ...sku,
        lastCheck: Date.now(),
        stock: Math.random() > 0.95 ? (sku.stock === 'OOS' ? 'LIMITED' : sku.stock) : sku.stock,
      })));
      
      setSystemStatus(prev => ({
        ...prev,
        throttle: Math.min(1, Math.max(0.3, prev.throttle + (Math.random() - 0.5) * 0.1)),
        activeTasks: Math.floor(Math.random() * 5) + 1,
      }));
    }, 3000);
    
    return () => clearInterval(interval);
  }, []);

  const formatTime = (ts) => {
    if (!ts) return 'Never';
    const diff = Date.now() - ts;
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return `${Math.floor(diff / 3600000)}h ago`;
  };

  const handleAddSKU = () => {
    if (newSKU.id && newSKU.name) {
      setSkus(prev => [...prev, {
        ...newSKU,
        msrp: parseFloat(newSKU.msrp) || 0,
        price: parseFloat(newSKU.msrp) || 0,
        status: 'COMING_SOON',
        stock: 'OOS',
        lastCheck: Date.now(),
        delta: 0,
      }]);
      setNewSKU({ id: '', name: '', retailer: 'Target', msrp: '', priority: 2 });
      setIsAddingSKU(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Scanline overlay */}
      <div style={styles.scanlines} />
      
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.logoSection}>
          <div style={styles.logo}>
            <span style={styles.logoIcon}>⚡</span>
            <span style={styles.logoText}>DROPWATCH</span>
          </div>
          <span style={styles.tagline}>COLLECTOR STATION PURCHASING AGENT</span>
        </div>
        
        <div style={styles.systemIndicators}>
          <SystemIndicator 
            label="MODE" 
            value={systemStatus.mode} 
            color={systemStatus.mode === 'ARMED' ? '#00ff88' : '#ffd700'} 
          />
          <SystemIndicator 
            label="THROTTLE" 
            value={`${Math.round(systemStatus.throttle * 100)}%`} 
            color={systemStatus.throttle > 0.8 ? '#ff6b6b' : '#00ff88'} 
          />
          <SystemIndicator 
            label="ACTIVE" 
            value={systemStatus.activeTasks} 
            color="#00bfff" 
          />
          <SystemIndicator 
            label="QUEUE" 
            value={systemStatus.queueDepth} 
            color="#ffd700" 
          />
        </div>
        
        <div style={styles.headerControls}>
          <button 
            style={{...styles.modeButton, ...(systemStatus.mode === 'ARMED' ? styles.modeButtonActive : {})}}
            onClick={() => setSystemStatus(prev => ({ ...prev, mode: prev.mode === 'ARMED' ? 'STANDBY' : 'ARMED' }))}
          >
            {systemStatus.mode === 'ARMED' ? '🔴 DISARM' : '🟢 ARM SYSTEM'}
          </button>
        </div>
      </header>

      {/* Navigation */}
      <nav style={styles.nav}>
        {['monitor', 'profiles', 'logs', 'settings'].map(tab => (
          <button
            key={tab}
            style={{...styles.navButton, ...(activeTab === tab ? styles.navButtonActive : {})}}
            onClick={() => setActiveTab(tab)}
          >
            {tab.toUpperCase()}
          </button>
        ))}
      </nav>

      {/* Main Content */}
      <main style={styles.main}>
        {activeTab === 'monitor' && (
          <MonitorView 
            skus={skus} 
            setSkus={setSkus}
            selectedSKU={selectedSKU}
            setSelectedSKU={setSelectedSKU}
            isAddingSKU={isAddingSKU}
            setIsAddingSKU={setIsAddingSKU}
            newSKU={newSKU}
            setNewSKU={setNewSKU}
            handleAddSKU={handleAddSKU}
            formatTime={formatTime}
            systemStatus={systemStatus}
          />
        )}
        {activeTab === 'profiles' && (
          <ProfilesView profiles={profiles} setProfiles={setProfiles} formatTime={formatTime} />
        )}
        {activeTab === 'logs' && (
          <LogsView logs={logs} formatTime={formatTime} />
        )}
        {activeTab === 'settings' && (
          <SettingsView systemStatus={systemStatus} setSystemStatus={setSystemStatus} />
        )}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT: System Indicator
// ═══════════════════════════════════════════════════════════════════════════════

function SystemIndicator({ label, value, color }) {
  return (
    <div style={styles.indicator}>
      <span style={styles.indicatorLabel}>{label}</span>
      <span style={{...styles.indicatorValue, color}}>{value}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// VIEW: Monitor (SKU Tracking)
// ═══════════════════════════════════════════════════════════════════════════════

function MonitorView({ skus, setSkus, selectedSKU, setSelectedSKU, isAddingSKU, setIsAddingSKU, newSKU, setNewSKU, handleAddSKU, formatTime, systemStatus }) {
  return (
    <div style={styles.monitorGrid}>
      {/* SKU List */}
      <div style={styles.skuPanel}>
        <div style={styles.panelHeader}>
          <h2 style={styles.panelTitle}>📦 TRACKED SKUs</h2>
          <button style={styles.addButton} onClick={() => setIsAddingSKU(true)}>+ ADD SKU</button>
        </div>
        
        {isAddingSKU && (
          <div style={styles.addSKUForm}>
            <input
              style={styles.input}
              placeholder="SKU ID (e.g., PKM-SV09-ETB)"
              value={newSKU.id}
              onChange={e => setNewSKU(prev => ({ ...prev, id: e.target.value }))}
            />
            <input
              style={styles.input}
              placeholder="Product Name"
              value={newSKU.name}
              onChange={e => setNewSKU(prev => ({ ...prev, name: e.target.value }))}
            />
            <select
              style={styles.select}
              value={newSKU.retailer}
              onChange={e => setNewSKU(prev => ({ ...prev, retailer: e.target.value }))}
            >
              <option>Target</option>
              <option>Walmart</option>
              <option>Best Buy</option>
              <option>Pokemon Center</option>
              <option>GameStop</option>
              <option>Amazon</option>
            </select>
            <input
              style={styles.input}
              placeholder="MSRP"
              type="number"
              value={newSKU.msrp}
              onChange={e => setNewSKU(prev => ({ ...prev, msrp: e.target.value }))}
            />
            <div style={styles.formButtons}>
              <button style={styles.saveButton} onClick={handleAddSKU}>SAVE</button>
              <button style={styles.cancelButton} onClick={() => setIsAddingSKU(false)}>CANCEL</button>
            </div>
          </div>
        )}
        
        <div style={styles.skuList}>
          {skus.map(sku => (
            <div 
              key={sku.id} 
              style={{
                ...styles.skuCard,
                ...(selectedSKU === sku.id ? styles.skuCardSelected : {}),
                borderLeftColor: statusColors[sku.status],
              }}
              onClick={() => setSelectedSKU(sku.id === selectedSKU ? null : sku.id)}
            >
              <div style={styles.skuHeader}>
                <span style={styles.skuName}>{sku.name}</span>
                <span style={{...styles.skuStatus, color: statusColors[sku.status]}}>{sku.status.replace('_', ' ')}</span>
              </div>
              <div style={styles.skuMeta}>
                <span style={styles.skuRetailer}>{sku.retailer}</span>
                <span style={styles.skuPrice}>
                  ${sku.price.toFixed(2)}
                  {sku.delta !== 0 && (
                    <span style={{color: sku.delta < 0 ? '#00ff88' : '#ff4444', marginLeft: '4px'}}>
                      ({sku.delta > 0 ? '+' : ''}{sku.delta})
                    </span>
                  )}
                </span>
              </div>
              <div style={styles.skuFooter}>
                <span style={{...styles.stockBadge, backgroundColor: stockColors[sku.stock] + '22', color: stockColors[sku.stock]}}>
                  {sku.stock.replace('_', ' ')}
                </span>
                <span style={styles.lastCheck}>Checked {formatTime(sku.lastCheck)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action Panel */}
      <div style={styles.actionPanel}>
        <div style={styles.panelHeader}>
          <h2 style={styles.panelTitle}>⚡ ACTION QUEUE</h2>
        </div>
        
        <div style={styles.actionStats}>
          <div style={styles.statBox}>
            <span style={styles.statValue}>{skus.filter(s => s.status === 'LIVE').length}</span>
            <span style={styles.statLabel}>LIVE DROPS</span>
          </div>
          <div style={styles.statBox}>
            <span style={styles.statValue}>{skus.filter(s => s.stock === 'IN_STOCK').length}</span>
            <span style={styles.statLabel}>IN STOCK</span>
          </div>
          <div style={styles.statBox}>
            <span style={styles.statValue}>{skus.filter(s => s.priority === 1).length}</span>
            <span style={styles.statLabel}>HIGH PRIORITY</span>
          </div>
        </div>

        <div style={styles.conditionsPanel}>
          <h3 style={styles.subHeader}>🎯 TRIGGER CONDITIONS</h3>
          <div style={styles.conditionsList}>
            <ConditionRow label="Price ≤ MSRP" active={true} />
            <ConditionRow label="Stock = IN_STOCK or LIMITED" active={true} />
            <ConditionRow label="Status = LIVE or SOFT_LAUNCH" active={true} />
            <ConditionRow label="Profile Health ≥ 70%" active={true} />
            <ConditionRow label="Throttle < 90%" active={systemStatus.throttle < 0.9} />
          </div>
        </div>

        <div style={styles.actionsReady}>
          <h3 style={styles.subHeader}>🚀 READY TO EXECUTE</h3>
          {skus.filter(s => s.status === 'LIVE' && s.stock === 'IN_STOCK').map(sku => (
            <div key={sku.id} style={styles.readyCard}>
              <div style={styles.readyInfo}>
                <span style={styles.readyName}>{sku.name}</span>
                <span style={styles.readyRetailer}>{sku.retailer}</span>
              </div>
              <button style={styles.executeButton}>EXECUTE</button>
            </div>
          ))}
          {skus.filter(s => s.status === 'LIVE' && s.stock === 'IN_STOCK').length === 0 && (
            <div style={styles.noActions}>No actions ready - monitoring...</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConditionRow({ label, active }) {
  return (
    <div style={styles.conditionRow}>
      <span style={{...styles.conditionDot, backgroundColor: active ? '#00ff88' : '#ff4444'}} />
      <span style={{...styles.conditionLabel, color: active ? '#fff' : '#666'}}>{label}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// VIEW: Profiles
// ═══════════════════════════════════════════════════════════════════════════════

function ProfilesView({ profiles, setProfiles, formatTime }) {
  return (
    <div style={styles.profilesGrid}>
      {profiles.map(profile => (
        <div key={profile.id} style={styles.profileCard}>
          <div style={styles.profileHeader}>
            <span style={styles.profileName}>{profile.name}</span>
            <span style={{
              ...styles.profileStatus,
              color: profile.status === 'READY' ? '#00ff88' : profile.status === 'COOLING' ? '#ffd700' : '#888'
            }}>
              {profile.status}
            </span>
          </div>
          
          <div style={styles.healthBar}>
            <div style={{...styles.healthFill, width: `${profile.health}%`, backgroundColor: profile.health > 80 ? '#00ff88' : profile.health > 50 ? '#ffd700' : '#ff4444'}} />
          </div>
          <span style={styles.healthLabel}>Health: {profile.health}%</span>
          
          <div style={styles.profileStats}>
            <div style={styles.profileStat}>
              <span style={styles.profileStatValue}>{profile.successes}</span>
              <span style={styles.profileStatLabel}>Successes</span>
            </div>
            <div style={styles.profileStat}>
              <span style={styles.profileStatValue}>{profile.failures}</span>
              <span style={styles.profileStatLabel}>Failures</span>
            </div>
            <div style={styles.profileStat}>
              <span style={styles.profileStatValue}>{Math.round(profile.successRate * 100)}%</span>
              <span style={styles.profileStatLabel}>Success Rate</span>
            </div>
          </div>
          
          <div style={styles.profileFooter}>
            <span style={styles.lastUsed}>Last used: {formatTime(profile.lastUsed)}</span>
            <div style={styles.profileActions}>
              <button style={styles.profileButton}>EDIT</button>
              <button style={{...styles.profileButton, ...styles.profileButtonDanger}}>RESET</button>
            </div>
          </div>
        </div>
      ))}
      
      <div style={styles.addProfileCard}>
        <span style={styles.addProfileIcon}>+</span>
        <span style={styles.addProfileText}>Add Profile</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// VIEW: Logs
// ═══════════════════════════════════════════════════════════════════════════════

function LogsView({ logs, formatTime }) {
  return (
    <div style={styles.logsPanel}>
      <div style={styles.logsHeader}>
        <h2 style={styles.panelTitle}>📜 ACTIVITY LOG</h2>
        <div style={styles.logFilters}>
          <button style={{...styles.filterButton, ...styles.filterButtonActive}}>ALL</button>
          <button style={styles.filterButton}>SUCCESS</button>
          <button style={styles.filterButton}>WARN</button>
          <button style={styles.filterButton}>FAIL</button>
        </div>
      </div>
      
      <div style={styles.logsList}>
        {logs.map(log => (
          <div key={log.id} style={styles.logEntry}>
            <span style={{...styles.logType, color: logTypeColors[log.type]}}>[{log.type}]</span>
            <span style={styles.logTime}>{formatTime(log.time)}</span>
            <span style={styles.logMessage}>{log.message}</span>
            {log.sku && <span style={styles.logSku}>{log.sku}</span>}
            {log.retailer && <span style={styles.logRetailer}>{log.retailer}</span>}
            {log.profile && <span style={styles.logProfile}>{log.profile}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// VIEW: Settings
// ═══════════════════════════════════════════════════════════════════════════════

function SettingsView({ systemStatus, setSystemStatus }) {
  return (
    <div style={styles.settingsGrid}>
      <div style={styles.settingsSection}>
        <h3 style={styles.settingsTitle}>🎚️ THROTTLE CONTROLS</h3>
        <div style={styles.settingRow}>
          <label style={styles.settingLabel}>Max Concurrency</label>
          <input type="range" min="1" max="10" defaultValue="3" style={styles.slider} />
          <span style={styles.settingValue}>3</span>
        </div>
        <div style={styles.settingRow}>
          <label style={styles.settingLabel}>Request Delay (ms)</label>
          <input type="range" min="100" max="2000" defaultValue="500" style={styles.slider} />
          <span style={styles.settingValue}>500</span>
        </div>
        <div style={styles.settingRow}>
          <label style={styles.settingLabel}>Auto-throttle Threshold</label>
          <input type="range" min="50" max="100" defaultValue="85" style={styles.slider} />
          <span style={styles.settingValue}>85%</span>
        </div>
      </div>

      <div style={styles.settingsSection}>
        <h3 style={styles.settingsTitle}>🔔 ALERT SETTINGS</h3>
        <ToggleSetting label="Push notifications" defaultChecked={true} />
        <ToggleSetting label="SMS alerts (critical only)" defaultChecked={false} />
        <ToggleSetting label="Email summaries" defaultChecked={true} />
        <ToggleSetting label="Slack integration" defaultChecked={false} />
      </div>

      <div style={styles.settingsSection}>
        <h3 style={styles.settingsTitle}>🛡️ SAFETY CONTROLS</h3>
        <ToggleSetting label="Auto-abort on 3+ failures" defaultChecked={true} />
        <ToggleSetting label="Profile rotation" defaultChecked={true} />
        <ToggleSetting label="Flapping detection" defaultChecked={true} />
        <ToggleSetting label="Cascade isolation" defaultChecked={true} />
      </div>

      <div style={styles.settingsSection}>
        <h3 style={styles.settingsTitle}>🏪 RETAILER CONFIG</h3>
        <RetailerConfig name="Target" enabled={true} />
        <RetailerConfig name="Walmart" enabled={true} />
        <RetailerConfig name="Best Buy" enabled={true} />
        <RetailerConfig name="Pokemon Center" enabled={true} />
        <RetailerConfig name="GameStop" enabled={false} />
        <RetailerConfig name="Amazon" enabled={false} />
      </div>
    </div>
  );
}

function ToggleSetting({ label, defaultChecked }) {
  const [checked, setChecked] = useState(defaultChecked);
  return (
    <div style={styles.toggleRow}>
      <span style={styles.toggleLabel}>{label}</span>
      <div 
        style={{...styles.toggle, ...(checked ? styles.toggleOn : {})}}
        onClick={() => setChecked(!checked)}
      >
        <div style={{...styles.toggleKnob, ...(checked ? styles.toggleKnobOn : {})}} />
      </div>
    </div>
  );
}

function RetailerConfig({ name, enabled }) {
  const [isEnabled, setIsEnabled] = useState(enabled);
  return (
    <div style={styles.retailerRow}>
      <span style={{...styles.retailerName, color: isEnabled ? '#fff' : '#666'}}>{name}</span>
      <div 
        style={{...styles.toggle, ...(isEnabled ? styles.toggleOn : {})}}
        onClick={() => setIsEnabled(!isEnabled)}
      >
        <div style={{...styles.toggleKnob, ...(isEnabled ? styles.toggleKnobOn : {})}} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0a0a0f 0%, #0d1117 50%, #0a0a0f 100%)',
    color: '#e0e0e0',
    fontFamily: '"JetBrains Mono", "SF Mono", "Consolas", monospace',
    position: 'relative',
    overflow: 'hidden',
  },
  scanlines: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.1) 2px, rgba(0,0,0,0.1) 4px)',
    pointerEvents: 'none',
    zIndex: 1000,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 24px',
    borderBottom: '1px solid #1a1a2e',
    background: 'rgba(10,10,15,0.95)',
    backdropFilter: 'blur(10px)',
  },
  logoSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  logoIcon: {
    fontSize: '24px',
  },
  logoText: {
    fontSize: '20px',
    fontWeight: '700',
    letterSpacing: '4px',
    background: 'linear-gradient(90deg, #ff4444, #ff6b6b)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  tagline: {
    fontSize: '10px',
    letterSpacing: '2px',
    color: '#666',
  },
  systemIndicators: {
    display: 'flex',
    gap: '32px',
  },
  indicator: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
  },
  indicatorLabel: {
    fontSize: '9px',
    letterSpacing: '1px',
    color: '#666',
  },
  indicatorValue: {
    fontSize: '14px',
    fontWeight: '700',
    letterSpacing: '1px',
  },
  headerControls: {
    display: 'flex',
    gap: '12px',
  },
  modeButton: {
    padding: '10px 20px',
    border: '1px solid #333',
    borderRadius: '4px',
    background: 'transparent',
    color: '#888',
    fontSize: '12px',
    fontWeight: '600',
    letterSpacing: '1px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.2s ease',
  },
  modeButtonActive: {
    borderColor: '#ff4444',
    color: '#ff4444',
    boxShadow: '0 0 20px rgba(255,68,68,0.3)',
  },
  nav: {
    display: 'flex',
    gap: '0',
    borderBottom: '1px solid #1a1a2e',
    background: 'rgba(10,10,15,0.8)',
  },
  navButton: {
    padding: '12px 32px',
    border: 'none',
    borderBottom: '2px solid transparent',
    background: 'transparent',
    color: '#666',
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '2px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.2s ease',
  },
  navButtonActive: {
    color: '#00ff88',
    borderBottomColor: '#00ff88',
  },
  main: {
    padding: '24px',
    minHeight: 'calc(100vh - 140px)',
  },
  monitorGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 400px',
    gap: '24px',
  },
  skuPanel: {
    background: 'rgba(20,20,30,0.6)',
    borderRadius: '8px',
    border: '1px solid #1a1a2e',
    overflow: 'hidden',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid #1a1a2e',
  },
  panelTitle: {
    margin: 0,
    fontSize: '12px',
    fontWeight: '600',
    letterSpacing: '2px',
    color: '#888',
  },
  addButton: {
    padding: '6px 12px',
    border: '1px solid #00ff88',
    borderRadius: '4px',
    background: 'transparent',
    color: '#00ff88',
    fontSize: '10px',
    fontWeight: '600',
    letterSpacing: '1px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  addSKUForm: {
    padding: '16px 20px',
    borderBottom: '1px solid #1a1a2e',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    background: 'rgba(0,255,136,0.05)',
  },
  input: {
    padding: '10px 12px',
    border: '1px solid #333',
    borderRadius: '4px',
    background: 'rgba(0,0,0,0.3)',
    color: '#fff',
    fontSize: '12px',
    fontFamily: 'inherit',
    outline: 'none',
  },
  select: {
    padding: '10px 12px',
    border: '1px solid #333',
    borderRadius: '4px',
    background: 'rgba(0,0,0,0.3)',
    color: '#fff',
    fontSize: '12px',
    fontFamily: 'inherit',
    outline: 'none',
  },
  formButtons: {
    display: 'flex',
    gap: '12px',
  },
  saveButton: {
    flex: 1,
    padding: '10px',
    border: 'none',
    borderRadius: '4px',
    background: '#00ff88',
    color: '#000',
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '1px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  cancelButton: {
    flex: 1,
    padding: '10px',
    border: '1px solid #444',
    borderRadius: '4px',
    background: 'transparent',
    color: '#888',
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '1px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  skuList: {
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: '600px',
    overflowY: 'auto',
  },
  skuCard: {
    padding: '14px 16px',
    borderRadius: '6px',
    background: 'rgba(30,30,40,0.6)',
    borderLeft: '3px solid #666',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  skuCardSelected: {
    background: 'rgba(0,255,136,0.1)',
    borderLeftWidth: '4px',
  },
  skuHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  skuName: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#fff',
  },
  skuStatus: {
    fontSize: '9px',
    fontWeight: '700',
    letterSpacing: '1px',
  },
  skuMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  skuRetailer: {
    fontSize: '11px',
    color: '#888',
  },
  skuPrice: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#00ff88',
  },
  skuFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stockBadge: {
    padding: '3px 8px',
    borderRadius: '3px',
    fontSize: '9px',
    fontWeight: '700',
    letterSpacing: '1px',
  },
  lastCheck: {
    fontSize: '10px',
    color: '#555',
  },
  actionPanel: {
    background: 'rgba(20,20,30,0.6)',
    borderRadius: '8px',
    border: '1px solid #1a1a2e',
    overflow: 'hidden',
  },
  actionStats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '1px',
    background: '#1a1a2e',
    margin: '0 0 1px 0',
  },
  statBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '16px',
    background: 'rgba(20,20,30,0.8)',
  },
  statValue: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#00ff88',
  },
  statLabel: {
    fontSize: '9px',
    letterSpacing: '1px',
    color: '#666',
    marginTop: '4px',
  },
  conditionsPanel: {
    padding: '16px 20px',
    borderBottom: '1px solid #1a1a2e',
  },
  subHeader: {
    margin: '0 0 12px 0',
    fontSize: '10px',
    fontWeight: '600',
    letterSpacing: '1px',
    color: '#666',
  },
  conditionsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  conditionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  conditionDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  conditionLabel: {
    fontSize: '11px',
  },
  actionsReady: {
    padding: '16px 20px',
  },
  readyCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px',
    marginTop: '8px',
    borderRadius: '6px',
    background: 'rgba(0,255,136,0.1)',
    border: '1px solid rgba(0,255,136,0.3)',
  },
  readyInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  readyName: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#fff',
  },
  readyRetailer: {
    fontSize: '10px',
    color: '#888',
  },
  executeButton: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: '4px',
    background: '#00ff88',
    color: '#000',
    fontSize: '10px',
    fontWeight: '700',
    letterSpacing: '1px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  noActions: {
    padding: '20px',
    textAlign: 'center',
    color: '#555',
    fontSize: '11px',
  },
  profilesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '16px',
  },
  profileCard: {
    padding: '20px',
    borderRadius: '8px',
    background: 'rgba(20,20,30,0.6)',
    border: '1px solid #1a1a2e',
  },
  profileHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  profileName: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#fff',
  },
  profileStatus: {
    fontSize: '10px',
    fontWeight: '700',
    letterSpacing: '1px',
  },
  healthBar: {
    height: '6px',
    borderRadius: '3px',
    background: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    marginBottom: '8px',
  },
  healthFill: {
    height: '100%',
    borderRadius: '3px',
    transition: 'width 0.3s ease',
  },
  healthLabel: {
    fontSize: '10px',
    color: '#666',
    marginBottom: '16px',
    display: 'block',
  },
  profileStats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px',
    marginBottom: '16px',
  },
  profileStat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  profileStatValue: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#fff',
  },
  profileStatLabel: {
    fontSize: '9px',
    color: '#666',
    letterSpacing: '0.5px',
  },
  profileFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: '12px',
    borderTop: '1px solid #1a1a2e',
  },
  lastUsed: {
    fontSize: '10px',
    color: '#555',
  },
  profileActions: {
    display: 'flex',
    gap: '8px',
  },
  profileButton: {
    padding: '6px 12px',
    border: '1px solid #333',
    borderRadius: '4px',
    background: 'transparent',
    color: '#888',
    fontSize: '9px',
    fontWeight: '600',
    letterSpacing: '1px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  profileButtonDanger: {
    borderColor: '#ff4444',
    color: '#ff4444',
  },
  addProfileCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px',
    borderRadius: '8px',
    border: '2px dashed #333',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  addProfileIcon: {
    fontSize: '32px',
    color: '#444',
    marginBottom: '8px',
  },
  addProfileText: {
    fontSize: '12px',
    color: '#555',
    letterSpacing: '1px',
  },
  logsPanel: {
    background: 'rgba(20,20,30,0.6)',
    borderRadius: '8px',
    border: '1px solid #1a1a2e',
    overflow: 'hidden',
  },
  logsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid #1a1a2e',
  },
  logFilters: {
    display: 'flex',
    gap: '8px',
  },
  filterButton: {
    padding: '6px 12px',
    border: '1px solid #333',
    borderRadius: '4px',
    background: 'transparent',
    color: '#666',
    fontSize: '9px',
    fontWeight: '600',
    letterSpacing: '1px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  filterButtonActive: {
    borderColor: '#00ff88',
    color: '#00ff88',
  },
  logsList: {
    padding: '12px 16px',
    maxHeight: '600px',
    overflowY: 'auto',
  },
  logEntry: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 0',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    fontSize: '11px',
  },
  logType: {
    fontWeight: '700',
    minWidth: '70px',
    letterSpacing: '1px',
  },
  logTime: {
    color: '#555',
    minWidth: '60px',
  },
  logMessage: {
    flex: 1,
    color: '#ccc',
  },
  logSku: {
    padding: '2px 6px',
    borderRadius: '3px',
    background: 'rgba(255,255,255,0.05)',
    color: '#888',
    fontSize: '9px',
  },
  logRetailer: {
    padding: '2px 6px',
    borderRadius: '3px',
    background: 'rgba(0,191,255,0.1)',
    color: '#00bfff',
    fontSize: '9px',
  },
  logProfile: {
    padding: '2px 6px',
    borderRadius: '3px',
    background: 'rgba(255,215,0,0.1)',
    color: '#ffd700',
    fontSize: '9px',
  },
  settingsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '24px',
  },
  settingsSection: {
    padding: '20px',
    borderRadius: '8px',
    background: 'rgba(20,20,30,0.6)',
    border: '1px solid #1a1a2e',
  },
  settingsTitle: {
    margin: '0 0 20px 0',
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '1px',
    color: '#888',
  },
  settingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '16px',
  },
  settingLabel: {
    flex: 1,
    fontSize: '12px',
    color: '#ccc',
  },
  slider: {
    width: '120px',
    accentColor: '#00ff88',
  },
  settingValue: {
    minWidth: '40px',
    textAlign: 'right',
    fontSize: '12px',
    fontWeight: '600',
    color: '#00ff88',
  },
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16px',
  },
  toggleLabel: {
    fontSize: '12px',
    color: '#ccc',
  },
  toggle: {
    width: '40px',
    height: '22px',
    borderRadius: '11px',
    background: '#333',
    cursor: 'pointer',
    position: 'relative',
    transition: 'all 0.2s ease',
  },
  toggleOn: {
    background: '#00ff88',
  },
  toggleKnob: {
    position: 'absolute',
    top: '3px',
    left: '3px',
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    background: '#fff',
    transition: 'all 0.2s ease',
  },
  toggleKnobOn: {
    left: '21px',
  },
  retailerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '12px',
    padding: '8px 0',
  },
  retailerName: {
    fontSize: '12px',
  },
};
