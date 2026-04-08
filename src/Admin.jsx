import React, { useState, useEffect } from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// DROPWATCH ADMIN PANEL
// All complex settings, profiles, and system configuration
// ═══════════════════════════════════════════════════════════════════════════════

const mockProfiles = [
  { id: 'P1', name: 'Primary', health: 98, status: 'READY', successes: 47, failures: 2, lastUsed: Date.now() - 3600000 },
  { id: 'P2', name: 'Backup Alpha', health: 85, status: 'READY', successes: 33, failures: 5, lastUsed: Date.now() - 7200000 },
  { id: 'P3', name: 'Backup Beta', health: 72, status: 'COOLING', successes: 32, failures: 9, lastUsed: Date.now() - 86400000 },
  { id: 'P4', name: 'Reserve', health: 100, status: 'VIRGIN', successes: 0, failures: 0, lastUsed: null },
];

const mockLogs = [
  { id: 1, time: Date.now() - 120000, type: 'SUCCESS', message: 'Checkout complete - Target - Surging Sparks ETB', profile: 'P1' },
  { id: 2, time: Date.now() - 180000, type: 'DETECT', message: 'Drop detected - Pokemon Center - Prismatic Bundle', profile: null },
  { id: 3, time: Date.now() - 240000, type: 'WARN', message: 'Inventory flapping detected - Walmart', profile: null },
  { id: 4, time: Date.now() - 300000, type: 'FAIL', message: 'Queue timeout - Pokemon Center', profile: 'P3' },
  { id: 5, time: Date.now() - 360000, type: 'INFO', message: 'System throttle adjusted to 75%', profile: null },
  { id: 6, time: Date.now() - 420000, type: 'SUCCESS', message: 'Checkout complete - Walmart - Surging Sparks ETB', profile: 'P1' },
  { id: 7, time: Date.now() - 500000, type: 'SUCCESS', message: 'Checkout complete - Target - Prismatic Bundle', profile: 'P2' },
];

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState('overview');
  const [systemStatus, setSystemStatus] = useState({
    mode: 'ARMED',
    throttle: 0.72,
    activeTasks: 2,
    queueDepth: 5,
  });
  const [profiles, setProfiles] = useState(mockProfiles);
  const [logs, setLogs] = useState(mockLogs);

  const formatTime = (ts) => {
    if (!ts) return 'Never';
    const diff = Date.now() - ts;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  return (
    <div style={styles.app}>
      {/* Sidebar */}
      <aside style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <span style={styles.adminBadge}>ADMIN</span>
          <h1 style={styles.sidebarTitle}>DROPWATCH</h1>
        </div>

        <nav style={styles.nav}>
          <NavItem icon="📊" label="Overview" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
          <NavItem icon="👤" label="Profiles" active={activeTab === 'profiles'} onClick={() => setActiveTab('profiles')} />
          <NavItem icon="🏪" label="Retailers" active={activeTab === 'retailers'} onClick={() => setActiveTab('retailers')} />
          <NavItem icon="⚙️" label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
          <NavItem icon="📜" label="Logs" active={activeTab === 'logs'} onClick={() => setActiveTab('logs')} />
        </nav>

        <div style={styles.sidebarFooter}>
          <a href="/" style={styles.backLink}>← Back to Dashboard</a>
        </div>
      </aside>

      {/* Main Content */}
      <main style={styles.main}>
        {/* Top Bar */}
        <header style={styles.topBar}>
          <h2 style={styles.pageTitle}>
            {activeTab === 'overview' && 'System Overview'}
            {activeTab === 'profiles' && 'Buyer Profiles'}
            {activeTab === 'retailers' && 'Retailer Configuration'}
            {activeTab === 'settings' && 'System Settings'}
            {activeTab === 'logs' && 'Activity Logs'}
          </h2>
          
          <div style={styles.systemControls}>
            <div style={styles.indicator}>
              <span style={styles.indicatorLabel}>Mode</span>
              <span style={{...styles.indicatorValue, color: systemStatus.mode === 'ARMED' ? '#00D26A' : '#888'}}>
                {systemStatus.mode}
              </span>
            </div>
            <div style={styles.indicator}>
              <span style={styles.indicatorLabel}>Throttle</span>
              <span style={styles.indicatorValue}>{Math.round(systemStatus.throttle * 100)}%</span>
            </div>
            <div style={styles.indicator}>
              <span style={styles.indicatorLabel}>Active</span>
              <span style={styles.indicatorValue}>{systemStatus.activeTasks}</span>
            </div>
            <button 
              style={{
                ...styles.modeButton,
                backgroundColor: systemStatus.mode === 'ARMED' ? 'rgba(255,68,68,0.15)' : 'rgba(0,210,106,0.15)',
                color: systemStatus.mode === 'ARMED' ? '#FF4444' : '#00D26A',
              }}
              onClick={() => setSystemStatus(s => ({ ...s, mode: s.mode === 'ARMED' ? 'STANDBY' : 'ARMED' }))}
            >
              {systemStatus.mode === 'ARMED' ? '■ Disarm System' : '▶ Arm System'}
            </button>
          </div>
        </header>

        {/* Content Area */}
        <div style={styles.content}>
          {activeTab === 'overview' && <OverviewTab systemStatus={systemStatus} profiles={profiles} logs={logs} formatTime={formatTime} />}
          {activeTab === 'profiles' && <ProfilesTab profiles={profiles} setProfiles={setProfiles} formatTime={formatTime} />}
          {activeTab === 'retailers' && <RetailersTab />}
          {activeTab === 'settings' && <SettingsTab systemStatus={systemStatus} setSystemStatus={setSystemStatus} />}
          {activeTab === 'logs' && <LogsTab logs={logs} formatTime={formatTime} />}
        </div>
      </main>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }) {
  return (
    <button style={{...styles.navItem, ...(active ? styles.navItemActive : {})}} onClick={onClick}>
      <span style={styles.navIcon}>{icon}</span>
      <span style={styles.navLabel}>{label}</span>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// OVERVIEW TAB
// ═══════════════════════════════════════════════════════════════════════════════

function OverviewTab({ systemStatus, profiles, logs, formatTime }) {
  const readyProfiles = profiles.filter(p => p.status === 'READY' || p.status === 'VIRGIN').length;
  const recentSuccesses = logs.filter(l => l.type === 'SUCCESS').length;
  const recentFailures = logs.filter(l => l.type === 'FAIL').length;

  return (
    <div style={styles.overviewGrid}>
      {/* Quick Stats */}
      <div style={styles.statsRow}>
        <StatCard label="Ready Profiles" value={readyProfiles} total={profiles.length} color="#00D26A" />
        <StatCard label="Recent Successes" value={recentSuccesses} color="#00D26A" />
        <StatCard label="Recent Failures" value={recentFailures} color="#FF6B6B" />
        <StatCard label="Queue Depth" value={systemStatus.queueDepth} color="#00BFFF" />
      </div>

      {/* Profile Health */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>Profile Health</h3>
        <div style={styles.healthBars}>
          {profiles.map(profile => (
            <div key={profile.id} style={styles.healthRow}>
              <span style={styles.healthName}>{profile.name}</span>
              <div style={styles.healthBarContainer}>
                <div style={{
                  ...styles.healthBar,
                  width: `${profile.health}%`,
                  backgroundColor: profile.health > 80 ? '#00D26A' : profile.health > 50 ? '#FFD700' : '#FF4444'
                }} />
              </div>
              <span style={styles.healthValue}>{profile.health}%</span>
              <span style={{
                ...styles.healthStatus,
                color: profile.status === 'READY' ? '#00D26A' : profile.status === 'COOLING' ? '#FFD700' : '#888'
              }}>
                {profile.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>Recent Activity</h3>
        <div style={styles.recentLogs}>
          {logs.slice(0, 5).map(log => (
            <div key={log.id} style={styles.logRow}>
              <span style={{
                ...styles.logType,
                color: log.type === 'SUCCESS' ? '#00D26A' : log.type === 'FAIL' ? '#FF4444' : log.type === 'WARN' ? '#FFD700' : '#888'
              }}>
                {log.type}
              </span>
              <span style={styles.logMessage}>{log.message}</span>
              <span style={styles.logTime}>{formatTime(log.time)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, total, color }) {
  return (
    <div style={styles.statCard}>
      <span style={{...styles.statValue, color}}>{value}{total && `/${total}`}</span>
      <span style={styles.statLabel}>{label}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROFILES TAB
// ═══════════════════════════════════════════════════════════════════════════════

function ProfilesTab({ profiles, setProfiles, formatTime }) {
  return (
    <div style={styles.profilesGrid}>
      {profiles.map(profile => (
        <div key={profile.id} style={styles.profileCard}>
          <div style={styles.profileHeader}>
            <h3 style={styles.profileName}>{profile.name}</h3>
            <span style={{
              ...styles.profileStatus,
              color: profile.status === 'READY' ? '#00D26A' : profile.status === 'COOLING' ? '#FFD700' : '#888'
            }}>
              {profile.status}
            </span>
          </div>

          <div style={styles.profileHealth}>
            <div style={styles.healthBarLarge}>
              <div style={{
                ...styles.healthBarFill,
                width: `${profile.health}%`,
                backgroundColor: profile.health > 80 ? '#00D26A' : profile.health > 50 ? '#FFD700' : '#FF4444'
              }} />
            </div>
            <span style={styles.healthPercent}>{profile.health}% Health</span>
          </div>

          <div style={styles.profileStats}>
            <div style={styles.profileStat}>
              <span style={styles.statNum}>{profile.successes}</span>
              <span style={styles.statLbl}>Successes</span>
            </div>
            <div style={styles.profileStat}>
              <span style={styles.statNum}>{profile.failures}</span>
              <span style={styles.statLbl}>Failures</span>
            </div>
            <div style={styles.profileStat}>
              <span style={styles.statNum}>
                {profile.successes + profile.failures > 0 
                  ? Math.round((profile.successes / (profile.successes + profile.failures)) * 100) 
                  : 100}%
              </span>
              <span style={styles.statLbl}>Rate</span>
            </div>
          </div>

          <div style={styles.profileFooter}>
            <span style={styles.lastUsed}>Last used: {formatTime(profile.lastUsed)}</span>
            <div style={styles.profileActions}>
              <button style={styles.actionBtn}>Edit</button>
              <button style={{...styles.actionBtn, ...styles.actionBtnDanger}}>Reset</button>
            </div>
          </div>
        </div>
      ))}

      <button style={styles.addProfileCard}>
        <span style={styles.addIcon}>+</span>
        <span>Add Profile</span>
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// RETAILERS TAB
// ═══════════════════════════════════════════════════════════════════════════════

function RetailersTab() {
  const [retailers, setRetailers] = useState([
    { id: 1, name: 'Target', enabled: true, accounts: 3, successRate: 0.78 },
    { id: 2, name: 'Walmart', enabled: true, accounts: 3, successRate: 0.72 },
    { id: 3, name: 'Pokemon Center', enabled: true, accounts: 3, successRate: 0.45 },
    { id: 4, name: 'Best Buy', enabled: true, accounts: 2, successRate: 0.65 },
    { id: 5, name: 'GameStop', enabled: false, accounts: 2, successRate: 0.55 },
    { id: 6, name: 'Amazon', enabled: false, accounts: 1, successRate: 0 },
  ]);

  const toggleRetailer = (id) => {
    setRetailers(retailers.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  return (
    <div style={styles.retailersList}>
      {retailers.map(retailer => (
        <div key={retailer.id} style={{...styles.retailerCard, opacity: retailer.enabled ? 1 : 0.5}}>
          <div style={styles.retailerInfo}>
            <h3 style={styles.retailerName}>{retailer.name}</h3>
            <div style={styles.retailerMeta}>
              <span>{retailer.accounts} accounts configured</span>
              {retailer.successRate > 0 && (
                <span style={{color: '#00D26A'}}>{Math.round(retailer.successRate * 100)}% success rate</span>
              )}
            </div>
          </div>
          
          <div style={styles.retailerControls}>
            <button style={styles.configBtn}>Configure</button>
            <div 
              style={{...styles.toggle, ...(retailer.enabled ? styles.toggleOn : {})}}
              onClick={() => toggleRetailer(retailer.id)}
            >
              <div style={{...styles.toggleKnob, ...(retailer.enabled ? styles.toggleKnobOn : {})}} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS TAB
// ═══════════════════════════════════════════════════════════════════════════════

function SettingsTab({ systemStatus, setSystemStatus }) {
  return (
    <div style={styles.settingsGrid}>
      <div style={styles.settingsSection}>
        <h3 style={styles.settingsSectionTitle}>Throttle Controls</h3>
        
        <div style={styles.settingRow}>
          <div style={styles.settingInfo}>
            <span style={styles.settingLabel}>Max Concurrency</span>
            <span style={styles.settingDesc}>Simultaneous checkout attempts</span>
          </div>
          <input type="number" defaultValue={3} min={1} max={10} style={styles.numberInput} />
        </div>

        <div style={styles.settingRow}>
          <div style={styles.settingInfo}>
            <span style={styles.settingLabel}>Request Delay</span>
            <span style={styles.settingDesc}>Milliseconds between requests</span>
          </div>
          <input type="number" defaultValue={500} min={100} max={2000} step={100} style={styles.numberInput} />
        </div>

        <div style={styles.settingRow}>
          <div style={styles.settingInfo}>
            <span style={styles.settingLabel}>Auto-throttle Threshold</span>
            <span style={styles.settingDesc}>System load before throttling</span>
          </div>
          <input type="number" defaultValue={85} min={50} max={100} style={styles.numberInput} />
        </div>
      </div>

      <div style={styles.settingsSection}>
        <h3 style={styles.settingsSectionTitle}>Safety Controls</h3>
        
        <ToggleSetting label="Auto-abort on 3+ failures" defaultChecked={true} />
        <ToggleSetting label="Automatic profile rotation" defaultChecked={true} />
        <ToggleSetting label="Flapping detection" defaultChecked={true} />
        <ToggleSetting label="Cascade failure isolation" defaultChecked={true} />
      </div>

      <div style={styles.settingsSection}>
        <h3 style={styles.settingsSectionTitle}>Alert Channels</h3>
        
        <ToggleSetting label="SMS Alerts (Twilio)" defaultChecked={true} />
        <ToggleSetting label="Slack Notifications" defaultChecked={false} />
        <ToggleSetting label="Email Summaries" defaultChecked={true} />
        <ToggleSetting label="Push Notifications" defaultChecked={true} />
      </div>

      <div style={styles.settingsSection}>
        <h3 style={styles.settingsSectionTitle}>Danger Zone</h3>
        
        <button style={styles.dangerBtn}>Clear All Logs</button>
        <button style={styles.dangerBtn}>Reset All Profiles</button>
        <button style={styles.dangerBtn}>Factory Reset</button>
      </div>
    </div>
  );
}

function ToggleSetting({ label, defaultChecked }) {
  const [checked, setChecked] = useState(defaultChecked);
  
  return (
    <div style={styles.toggleSettingRow}>
      <span style={styles.toggleSettingLabel}>{label}</span>
      <div 
        style={{...styles.toggle, ...(checked ? styles.toggleOn : {})}}
        onClick={() => setChecked(!checked)}
      >
        <div style={{...styles.toggleKnob, ...(checked ? styles.toggleKnobOn : {})}} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOGS TAB
// ═══════════════════════════════════════════════════════════════════════════════

function LogsTab({ logs, formatTime }) {
  const [filter, setFilter] = useState('ALL');

  const filteredLogs = filter === 'ALL' ? logs : logs.filter(l => l.type === filter);

  return (
    <div style={styles.logsContainer}>
      <div style={styles.logsHeader}>
        <div style={styles.logFilters}>
          {['ALL', 'SUCCESS', 'FAIL', 'WARN', 'DETECT', 'INFO'].map(f => (
            <button 
              key={f}
              style={{...styles.filterBtn, ...(filter === f ? styles.filterBtnActive : {})}}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <button style={styles.exportBtn}>Export Logs</button>
      </div>

      <div style={styles.logsTable}>
        {filteredLogs.map(log => (
          <div key={log.id} style={styles.logEntry}>
            <span style={{
              ...styles.logEntryType,
              backgroundColor: 
                log.type === 'SUCCESS' ? 'rgba(0,210,106,0.15)' :
                log.type === 'FAIL' ? 'rgba(255,68,68,0.15)' :
                log.type === 'WARN' ? 'rgba(255,215,0,0.15)' :
                log.type === 'DETECT' ? 'rgba(0,191,255,0.15)' :
                'rgba(255,255,255,0.05)',
              color:
                log.type === 'SUCCESS' ? '#00D26A' :
                log.type === 'FAIL' ? '#FF4444' :
                log.type === 'WARN' ? '#FFD700' :
                log.type === 'DETECT' ? '#00BFFF' :
                '#888'
            }}>
              {log.type}
            </span>
            <span style={styles.logEntryMessage}>{log.message}</span>
            {log.profile && <span style={styles.logEntryProfile}>{log.profile}</span>}
            <span style={styles.logEntryTime}>{formatTime(log.time)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════

const styles = {
  app: {
    display: 'flex',
    minHeight: '100vh',
    backgroundColor: '#0A0A0C',
    color: '#FFF',
    fontFamily: '"JetBrains Mono", "SF Mono", monospace',
  },

  // Sidebar
  sidebar: {
    width: '220px',
    backgroundColor: '#0D0D0F',
    borderRight: '1px solid rgba(255,255,255,0.06)',
    display: 'flex',
    flexDirection: 'column',
    position: 'fixed',
    height: '100vh',
  },
  sidebarHeader: {
    padding: '24px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  adminBadge: {
    fontSize: '10px',
    fontWeight: '700',
    letterSpacing: '2px',
    color: '#FF4444',
    marginBottom: '4px',
    display: 'block',
  },
  sidebarTitle: {
    margin: 0,
    fontSize: '16px',
    fontWeight: '700',
    letterSpacing: '1px',
  },
  nav: {
    flex: 1,
    padding: '16px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    border: 'none',
    borderRadius: '8px',
    background: 'transparent',
    color: '#666',
    fontSize: '13px',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.15s',
  },
  navItemActive: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: '#FFF',
  },
  navIcon: {
    fontSize: '16px',
  },
  navLabel: {},
  sidebarFooter: {
    padding: '20px',
    borderTop: '1px solid rgba(255,255,255,0.06)',
  },
  backLink: {
    color: '#666',
    fontSize: '12px',
    textDecoration: 'none',
  },

  // Main
  main: {
    flex: 1,
    marginLeft: '220px',
    display: 'flex',
    flexDirection: 'column',
  },
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 32px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    backgroundColor: '#0D0D0F',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  pageTitle: {
    margin: 0,
    fontSize: '18px',
    fontWeight: '600',
  },
  systemControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
  },
  indicator: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  indicatorLabel: {
    fontSize: '10px',
    color: '#555',
    letterSpacing: '1px',
  },
  indicatorValue: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#FFF',
  },
  modeButton: {
    padding: '10px 20px',
    border: 'none',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  content: {
    flex: 1,
    padding: '32px',
    overflow: 'auto',
  },

  // Overview
  overviewGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '16px',
  },
  statCard: {
    padding: '24px',
    borderRadius: '12px',
    backgroundColor: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
    textAlign: 'center',
  },
  statValue: {
    fontSize: '32px',
    fontWeight: '700',
    display: 'block',
  },
  statLabel: {
    fontSize: '12px',
    color: '#666',
    marginTop: '8px',
    display: 'block',
  },
  card: {
    padding: '24px',
    borderRadius: '12px',
    backgroundColor: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  cardTitle: {
    margin: '0 0 20px',
    fontSize: '14px',
    fontWeight: '600',
    color: '#888',
  },
  healthBars: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  healthRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  healthName: {
    width: '120px',
    fontSize: '13px',
  },
  healthBarContainer: {
    flex: 1,
    height: '8px',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  healthBar: {
    height: '100%',
    borderRadius: '4px',
    transition: 'width 0.3s',
  },
  healthValue: {
    width: '45px',
    fontSize: '13px',
    textAlign: 'right',
  },
  healthStatus: {
    width: '70px',
    fontSize: '11px',
    fontWeight: '600',
    textAlign: 'right',
  },
  recentLogs: {
    display: 'flex',
    flexDirection: 'column',
  },
  logRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '12px 0',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  },
  logType: {
    fontSize: '11px',
    fontWeight: '700',
    width: '70px',
  },
  logMessage: {
    flex: 1,
    fontSize: '12px',
    color: '#AAA',
  },
  logTime: {
    fontSize: '11px',
    color: '#555',
  },

  // Profiles
  profilesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '16px',
  },
  profileCard: {
    padding: '24px',
    borderRadius: '12px',
    backgroundColor: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  profileHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  profileName: {
    margin: 0,
    fontSize: '15px',
    fontWeight: '600',
  },
  profileStatus: {
    fontSize: '11px',
    fontWeight: '700',
  },
  profileHealth: {
    marginBottom: '20px',
  },
  healthBarLarge: {
    height: '6px',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: '3px',
    overflow: 'hidden',
    marginBottom: '6px',
  },
  healthBarFill: {
    height: '100%',
    borderRadius: '3px',
  },
  healthPercent: {
    fontSize: '11px',
    color: '#666',
  },
  profileStats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px',
    marginBottom: '20px',
  },
  profileStat: {
    textAlign: 'center',
  },
  statNum: {
    fontSize: '20px',
    fontWeight: '700',
    display: 'block',
  },
  statLbl: {
    fontSize: '10px',
    color: '#666',
  },
  profileFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: '16px',
    borderTop: '1px solid rgba(255,255,255,0.06)',
  },
  lastUsed: {
    fontSize: '11px',
    color: '#555',
  },
  profileActions: {
    display: 'flex',
    gap: '8px',
  },
  actionBtn: {
    padding: '6px 12px',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '4px',
    background: 'transparent',
    color: '#888',
    fontSize: '11px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  actionBtnDanger: {
    borderColor: 'rgba(255,68,68,0.3)',
    color: '#FF4444',
  },
  addProfileCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px',
    borderRadius: '12px',
    border: '2px dashed rgba(255,255,255,0.1)',
    background: 'transparent',
    color: '#555',
    fontSize: '13px',
    cursor: 'pointer',
  },
  addIcon: {
    fontSize: '32px',
    marginBottom: '8px',
  },

  // Retailers
  retailersList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  retailerCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
    borderRadius: '12px',
    backgroundColor: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
    transition: 'opacity 0.2s',
  },
  retailerInfo: {},
  retailerName: {
    margin: 0,
    fontSize: '15px',
    fontWeight: '600',
  },
  retailerMeta: {
    display: 'flex',
    gap: '16px',
    marginTop: '4px',
    fontSize: '12px',
    color: '#666',
  },
  retailerControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  configBtn: {
    padding: '8px 16px',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '6px',
    background: 'transparent',
    color: '#888',
    fontSize: '12px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  toggle: {
    width: '44px',
    height: '24px',
    borderRadius: '12px',
    backgroundColor: 'rgba(255,255,255,0.1)',
    cursor: 'pointer',
    position: 'relative',
    transition: 'all 0.2s',
  },
  toggleOn: {
    backgroundColor: '#00D26A',
  },
  toggleKnob: {
    position: 'absolute',
    top: '3px',
    left: '3px',
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    backgroundColor: '#FFF',
    transition: 'all 0.2s',
  },
  toggleKnobOn: {
    left: '23px',
  },

  // Settings
  settingsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '24px',
  },
  settingsSection: {
    padding: '24px',
    borderRadius: '12px',
    backgroundColor: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  settingsSectionTitle: {
    margin: '0 0 20px',
    fontSize: '13px',
    fontWeight: '600',
    color: '#888',
    letterSpacing: '0.5px',
  },
  settingRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  settingInfo: {
    display: 'flex',
    flexDirection: 'column',
  },
  settingLabel: {
    fontSize: '13px',
    color: '#FFF',
  },
  settingDesc: {
    fontSize: '11px',
    color: '#555',
    marginTop: '2px',
  },
  numberInput: {
    width: '80px',
    padding: '8px 12px',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '6px',
    backgroundColor: 'rgba(255,255,255,0.05)',
    color: '#FFF',
    fontSize: '13px',
    textAlign: 'center',
    fontFamily: 'inherit',
  },
  toggleSettingRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  toggleSettingLabel: {
    fontSize: '13px',
    color: '#CCC',
  },
  dangerBtn: {
    display: 'block',
    width: '100%',
    padding: '12px',
    marginBottom: '8px',
    border: '1px solid rgba(255,68,68,0.3)',
    borderRadius: '6px',
    background: 'transparent',
    color: '#FF4444',
    fontSize: '12px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },

  // Logs
  logsContainer: {},
  logsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  logFilters: {
    display: 'flex',
    gap: '4px',
  },
  filterBtn: {
    padding: '8px 14px',
    border: 'none',
    borderRadius: '6px',
    background: 'transparent',
    color: '#666',
    fontSize: '11px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  filterBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: '#FFF',
  },
  exportBtn: {
    padding: '8px 16px',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '6px',
    background: 'transparent',
    color: '#888',
    fontSize: '12px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  logsTable: {
    borderRadius: '12px',
    backgroundColor: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  logEntry: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '14px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  },
  logEntryType: {
    padding: '4px 10px',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: '700',
    minWidth: '65px',
    textAlign: 'center',
  },
  logEntryMessage: {
    flex: 1,
    fontSize: '12px',
    color: '#AAA',
  },
  logEntryProfile: {
    padding: '3px 8px',
    borderRadius: '4px',
    backgroundColor: 'rgba(255,215,0,0.1)',
    fontSize: '10px',
    color: '#FFD700',
  },
  logEntryTime: {
    fontSize: '11px',
    color: '#555',
    minWidth: '60px',
    textAlign: 'right',
  },
};
