import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { engine } from './engineClient';
import ActivityTab from './components/ActivityTab';

// ═══════════════════════════════════════════════════════════════════════════════
// DROPWATCH ADMIN PANEL v3.0
// Complete control center — Keywords, Products, Purchases, Settings, Activity
// ═══════════════════════════════════════════════════════════════════════════════

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState('keywords');
  const [products, setProducts] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [keywords, setKeywords] = useState([]);
  const [activity, setActivity] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [engineStatus, setEngineStatus] = useState('stopped');
  const [engineStats, setEngineStats] = useState({});
  const [engineLoading, setEngineLoading] = useState(false);

  useEffect(() => {
    fetchData();
    fetchEngineStatus();
    const interval = setInterval(fetchEngineStatus, 15000);
    const activityInterval = setInterval(fetchActivity, 10000);
    return () => { clearInterval(interval); clearInterval(activityInterval); };
  }, []);

  const fetchEngineStatus = async () => {
    const status = await engine.getStatus();
    setEngineStatus(status.status || 'stopped');
    setEngineStats(status.stats || {});
  };

  const toggleEngine = async () => {
    setEngineLoading(true);
    try {
      if (engineStatus === 'running') {
        await engine.stop();
      } else {
        await engine.start();
      }
      setTimeout(async () => {
        await fetchEngineStatus();
        setEngineLoading(false);
      }, 1500);
    } catch (err) {
      console.error('Engine toggle failed:', err);
      setEngineLoading(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [productsRes, purchasesRes] = await Promise.all([
        supabase.from('products').select('*').order('created_at', { ascending: false }),
        supabase.from('purchases').select('*').order('purchased_at', { ascending: false }).limit(50)
      ]);
      if (productsRes.data) setProducts(productsRes.data);
      if (purchasesRes.data) setPurchases(purchasesRes.data);

      // Keywords
      const kwRes = await supabase.from('keywords').select('*').order('created_at', { ascending: false });
      if (kwRes.data) setKeywords(kwRes.data);
      if (kwRes.error) console.log('Keywords table:', kwRes.error.message);

      // Settings
      const settingsRes = await supabase.from('settings').select('*');
      if (settingsRes.data) {
        const s = {};
        settingsRes.data.forEach(row => { s[row.key] = row.value; });
        setSettings(s);
      }

      await fetchActivity();
    } catch (err) {
      console.error('Error fetching data:', err);
    }
    setLoading(false);
  };

  const fetchActivity = async () => {
    const res = await supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(50);
    if (res.data) setActivity(res.data);
  };

  // Keyword CRUD
  const addKeyword = async (data) => {
    const { data: inserted, error } = await supabase.from('keywords').insert([{
      term: data.term,
      max_price: data.maxPrice || null,
      min_price: data.minPrice || null,
      max_quantity: data.maxQuantity || 2,
      retailers: data.retailers?.length ? data.retailers : [],
      priority: data.priority || 'normal',
      auto_activate: true,
      is_active: true
    }]).select();
    if (error) { alert('Error: ' + error.message); return false; }
    if (inserted) setKeywords(prev => [...inserted, ...prev]);
    return true;
  };

  const deleteKeyword = async (id) => {
    await supabase.from('keywords').delete().eq('id', id);
    setKeywords(prev => prev.filter(k => k.id !== id));
  };

  const toggleKeyword = async (id, isActive) => {
    await supabase.from('keywords').update({ is_active: !isActive }).eq('id', id);
    setKeywords(prev => prev.map(k => k.id === id ? { ...k, is_active: !isActive } : k));
  };

  // Product actions
  const deleteProduct = async (id) => {
    await supabase.from('products').delete().eq('id', id);
    setProducts(prev => prev.filter(p => p.id !== id));
  };

  const toggleProduct = async (id, isActive) => {
    await supabase.from('products').update({ is_active: !isActive }).eq('id', id);
    setProducts(prev => prev.map(p => p.id === id ? { ...p, is_active: !isActive } : p));
  };

  // Settings
  const updateSetting = async (key, value) => {
    await supabase.from('settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const triggerDiscovery = async () => {
    const res = await engine.discover();
    if (res.error) alert('Discovery failed: ' + res.error);
  };

  const tabs = [
    { id: 'keywords', icon: '🔍', label: 'Keywords' },
    { id: 'products', icon: '📦', label: 'Products' },
    { id: 'activity', icon: '📡', label: 'Activity' },
    { id: 'purchases', icon: '🛒', label: 'Purchases' },
    { id: 'settings', icon: '⚙️', label: 'Settings' },
  ];

  return (
    <div style={S.container}>
      <header style={S.header}>
        <div style={S.headerLeft}>
          <h1 style={S.logo}>
            <span style={{ marginRight: '8px' }}>⚡</span>
            DROPWATCH
            <span style={S.badge}>ADMIN</span>
          </h1>
        </div>
        <div style={S.headerCenter}>
          <button
            style={{ ...S.engineBtn, backgroundColor: engineStatus === 'running' ? '#00D26A' : '#333' }}
            onClick={toggleEngine}
            disabled={engineLoading}
          >
            {engineLoading ? '⏳' : engineStatus === 'running' ? '● RUNNING' : '○ STOPPED'}
          </button>
          <span style={S.statBadge}>Checks: {engineStats.totalChecks || 0}</span>
          <span style={S.statBadge}>Found: {engineStats.stockFound || 0}</span>
          <span style={S.statBadge}>Discovered: {engineStats.productsDiscovered || 0}</span>
        </div>
        <div style={S.headerRight}>
          <a href="/" style={S.backLink}>← Dashboard</a>
        </div>
      </header>

      <div style={S.tabs}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            style={{ ...S.tab, ...(activeTab === tab.id ? S.tabActive : {}) }}
            onClick={() => setActiveTab(tab.id)}
          >
            <span style={{ fontSize: '14px' }}>{tab.icon}</span> {tab.label}
          </button>
        ))}
      </div>

      <main style={S.main}>
        {loading ? (
          <div style={S.loadingState}>Loading...</div>
        ) : (
          <>
            {activeTab === 'keywords' && <KeywordsTab keywords={keywords} onAdd={addKeyword} onDelete={deleteKeyword} onToggle={toggleKeyword} onDiscover={triggerDiscovery} />}
            {activeTab === 'products' && <ProductsTab products={products} onDelete={deleteProduct} onToggle={toggleProduct} />}
            {activeTab === 'activity' && <ActivityTab activity={activity} onRefresh={fetchActivity} />}
            {activeTab === 'purchases' && <PurchasesTab purchases={purchases} />}
            {activeTab === 'settings' && <SettingsTab settings={settings} onUpdate={updateSetting} />}
          </>
        )}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// KEYWORDS TAB
// ═══════════════════════════════════════════════════════════════════════════════

function KeywordsTab({ keywords, onAdd, onDelete, onToggle, onDiscover }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ term: '', maxPrice: '', maxQuantity: '2', priority: 'normal', retailers: [] });
  const [saving, setSaving] = useState(false);
  const allRetailers = ['Target', 'Walmart', 'Pokemon Center', 'Best Buy', 'GameStop', 'Amazon'];

  const handleSave = async () => {
    if (!form.term.trim()) return;
    setSaving(true);
    const success = await onAdd({
      term: form.term.trim(),
      maxPrice: parseFloat(form.maxPrice) || null,
      maxQuantity: parseInt(form.maxQuantity) || 2,
      priority: form.priority,
      retailers: form.retailers
    });
    setSaving(false);
    if (success) {
      setForm({ term: '', maxPrice: '', maxQuantity: '2', priority: 'normal', retailers: [] });
      setShowForm(false);
    }
  };

  const toggleRetailer = (r) => {
    setForm(prev => ({
      ...prev,
      retailers: prev.retailers.includes(r) ? prev.retailers.filter(x => x !== r) : [...prev.retailers, r]
    }));
  };

  return (
    <div>
      <div style={S.sectionHeader}>
        <div>
          <h2 style={S.sectionTitle}>Product Discovery Keywords</h2>
          <p style={S.sectionSub}>Set keywords → engine searches retailers → auto-discovers products → monitors stock</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onDiscover} style={S.btnSecondary}>🔎 Run Discovery</button>
          <button onClick={() => setShowForm(true)} style={S.btnPrimary}>+ Add Keyword</button>
        </div>
      </div>

      {showForm && (
        <div style={S.formCard}>
          <div style={S.formGrid}>
            <div style={S.formGroup}>
              <label style={S.label}>Search Term *</label>
              <input style={S.input} placeholder="e.g. Prismatic Evolutions ETB" value={form.term} onChange={e => setForm({ ...form, term: e.target.value })} />
            </div>
            <div style={S.formRow}>
              <div style={S.formGroup}>
                <label style={S.label}>Max Price</label>
                <input style={S.input} type="number" placeholder="54.99" value={form.maxPrice} onChange={e => setForm({ ...form, maxPrice: e.target.value })} />
              </div>
              <div style={S.formGroup}>
                <label style={S.label}>Max Qty Per Product</label>
                <input style={S.input} type="number" value={form.maxQuantity} onChange={e => setForm({ ...form, maxQuantity: e.target.value })} />
              </div>
              <div style={S.formGroup}>
                <label style={S.label}>Priority</label>
                <select style={S.input} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                  <option value="low">Low (check every 5 min)</option>
                  <option value="normal">Normal (check every 1 min)</option>
                  <option value="high">High (check every 30s)</option>
                  <option value="critical">Critical (check every 10s)</option>
                </select>
              </div>
            </div>
            <div style={S.formGroup}>
              <label style={S.label}>Retailers (empty = all)</label>
              <div style={S.chipGroup}>
                {allRetailers.map(r => (
                  <button key={r} onClick={() => toggleRetailer(r)} style={{ ...S.chip, ...(form.retailers.includes(r) ? S.chipActive : {}) }}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div style={S.formActions}>
            <button onClick={handleSave} disabled={saving || !form.term.trim()} style={{ ...S.btnPrimary, opacity: !form.term.trim() ? 0.5 : 1 }}>
              {saving ? '⏳ Saving...' : 'Save Keyword'}
            </button>
            <button onClick={() => setShowForm(false)} style={S.btnSecondary}>Cancel</button>
          </div>
        </div>
      )}

      {keywords.length === 0 ? (
        <div style={S.emptyState}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔍</div>
          <h3 style={{ color: '#AAA', margin: '0 0 8px' }}>No keywords configured</h3>
          <p style={{ color: '#666', fontSize: '14px' }}>Add keywords to start auto-discovering products across all retailers</p>
        </div>
      ) : (
        <div style={S.list}>
          {keywords.map(kw => {
            const retailers = Array.isArray(kw.retailers) ? kw.retailers : (kw.retailers ? JSON.parse(kw.retailers) : []);
            return (
              <div key={kw.id} style={S.listItem}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: '#FFF', fontSize: '15px', fontWeight: '500' }}>{kw.term}</span>
                    <span style={{ ...S.priorityBadge, ...S.priorities[kw.priority] }}>{kw.priority}</span>
                  </div>
                  <div style={{ color: '#888', fontSize: '12px', marginTop: '4px' }}>
                    {kw.max_price ? `Max $${kw.max_price}` : 'No price limit'}
                    {' · '}Qty: {kw.max_quantity || 2}
                    {retailers.length > 0 ? ` · ${retailers.join(', ')}` : ' · All retailers'}
                    {kw.products_found > 0 ? ` · ${kw.products_found} products found` : ''}
                    {kw.last_searched ? ` · Last: ${timeAgo(kw.last_searched)}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button onClick={() => onToggle(kw.id, kw.is_active)} style={{ ...S.statusPill, ...(kw.is_active ? S.statusActive : S.statusPaused) }}>
                    {kw.is_active ? '● Active' : '○ Paused'}
                  </button>
                  <button onClick={() => onDelete(kw.id)} style={S.deleteBtn}>×</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCTS TAB
// ═══════════════════════════════════════════════════════════════════════════════

function ProductsTab({ products, onDelete, onToggle }) {
  return (
    <div>
      <div style={S.sectionHeader}>
        <div>
          <h2 style={S.sectionTitle}>Discovered Products ({products.length})</h2>
          <p style={S.sectionSub}>Auto-discovered from keywords. Active products are monitored for stock.</p>
        </div>
      </div>
      {products.length === 0 ? (
        <div style={S.emptyState}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>📦</div>
          <h3 style={{ color: '#AAA', margin: '0 0 8px' }}>No products yet</h3>
          <p style={{ color: '#666', fontSize: '14px' }}>Add keywords and run discovery to find products</p>
        </div>
      ) : (
        <div style={S.list}>
          {products.map(p => (
            <div key={p.id} style={S.listItem}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#FFF', fontSize: '14px', fontWeight: '500' }}>{p.name}</span>
                  {p.in_stock && <span style={{ color: '#00D26A', fontSize: '11px', fontWeight: '600' }}>● IN STOCK</span>}
                </div>
                <div style={{ color: '#888', fontSize: '12px', marginTop: '4px' }}>
                  {p.retailer} · ${p.target_price || '—'}
                  {p.purchase_count > 0 ? ` · ${p.purchase_count} purchased` : ''}
                  {p.last_checked ? ` · Checked ${timeAgo(p.last_checked)}` : ' · Never checked'}
                  {p.url ? '' : ' · ⚠ No URL'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button onClick={() => onToggle(p.id, p.is_active)} style={{ ...S.statusPill, ...(p.is_active ? S.statusActive : S.statusPaused) }}>
                  {p.is_active ? '● Active' : '○ Off'}
                </button>
                <button onClick={() => onDelete(p.id)} style={S.deleteBtn}>×</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVITY TAB — Real-time engine feed
// ═══════════════════════════════════════════════════════════════════════════════

function ActivityTab({ activity, onRefresh }) {
  const icons = { discovery: '🔎', stock_check: '🔍', in_stock: '✅', out_of_stock: '❌', cart_add: '🛒', purchase: '💰', error: '⚠️', engine_start: '▶️', engine_stop: '⏹️', keyword_added: '🏷️', product_found: '✨' };

  return (
    <div>
      <div style={S.sectionHeader}>
        <div>
          <h2 style={S.sectionTitle}>Live Activity Feed</h2>
          <p style={S.sectionSub}>Real-time log of everything the engine is doing. Auto-refreshes every 10 seconds.</p>
        </div>
        <button onClick={onRefresh} style={S.btnSecondary}>🔄 Refresh</button>
      </div>
      {activity.length === 0 ? (
        <div style={S.emptyState}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>📡</div>
          <h3 style={{ color: '#AAA', margin: '0 0 8px' }}>No activity yet</h3>
          <p style={{ color: '#666', fontSize: '14px' }}>Start the engine to see real-time activity</p>
        </div>
      ) : (
        <div style={S.list}>
          {activity.map(a => (
            <div key={a.id} style={{ ...S.listItem, padding: '10px 16px' }}>
              <span style={{ fontSize: '16px', marginRight: '10px' }}>{icons[a.type] || '•'}</span>
              <div style={{ flex: 1 }}>
                <span style={{ color: '#DDD', fontSize: '13px' }}>{a.message}</span>
                {a.retailer && <span style={{ color: '#888', fontSize: '11px', marginLeft: '8px' }}>{a.retailer}</span>}
              </div>
              <span style={{ color: '#666', fontSize: '11px', whiteSpace: 'nowrap' }}>{timeAgo(a.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PURCHASES TAB
// ═══════════════════════════════════════════════════════════════════════════════

function PurchasesTab({ purchases }) {
  const total = purchases.reduce((sum, p) => sum + (parseFloat(p.total) || 0), 0);

  return (
    <div>
      <div style={S.sectionHeader}>
        <div>
          <h2 style={S.sectionTitle}>Purchase History ({purchases.length})</h2>
          <p style={S.sectionSub}>Total spent: ${total.toFixed(2)}</p>
        </div>
      </div>
      {purchases.length === 0 ? (
        <div style={S.emptyState}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🛒</div>
          <h3 style={{ color: '#AAA', margin: '0 0 8px' }}>No purchases yet</h3>
          <p style={{ color: '#666', fontSize: '14px' }}>Purchases will appear here when the engine buys items</p>
        </div>
      ) : (
        <div style={S.list}>
          {purchases.map(p => (
            <div key={p.id} style={S.listItem}>
              <div style={{ flex: 1 }}>
                <span style={{ color: '#FFF', fontSize: '14px', fontWeight: '500' }}>{p.product_name}</span>
                <div style={{ color: '#888', fontSize: '12px', marginTop: '4px' }}>
                  {p.retailer} · {p.quantity}x · Order: {p.order_number} · {p.status}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: '#00D26A', fontSize: '15px', fontWeight: '600' }}>${parseFloat(p.total || 0).toFixed(2)}</div>
                <div style={{ color: '#666', fontSize: '11px' }}>{timeAgo(p.purchased_at)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS TAB
// ═══════════════════════════════════════════════════════════════════════════════

function SettingsTab({ settings, onUpdate }) {
  const eng = settings.engine || { auto_start: true, check_interval: 30, discovery_interval: 300 };
  const limits = settings.limits || { max_spend_per_day: 500, max_items_per_product: 2, max_items_per_day: 10 };
  const proxy = settings.proxy || { enabled: false, provider: '', api_key: '', type: 'residential' };
  const notif = settings.notifications || { email: 'ryan@radical.company', email_enabled: true };

  const updateField = (section, field, value) => {
    const current = settings[section] || {};
    onUpdate(section, { ...current, [field]: value });
  };

  return (
    <div>
      <h2 style={S.sectionTitle}>Engine Settings</h2>

      {/* Engine Config */}
      <div style={S.settingsCard}>
        <h3 style={S.settingsCardTitle}>Engine Configuration</h3>
        <div style={S.settingsGrid}>
          <div style={S.formGroup}>
            <label style={S.label}>Stock Check Interval (seconds)</label>
            <input style={S.input} type="number" value={eng.check_interval} onChange={e => updateField('engine', 'check_interval', parseInt(e.target.value))} />
            <span style={S.hint}>How often to check each product for stock</span>
          </div>
          <div style={S.formGroup}>
            <label style={S.label}>Discovery Interval (seconds)</label>
            <input style={S.input} type="number" value={eng.discovery_interval} onChange={e => updateField('engine', 'discovery_interval', parseInt(e.target.value))} />
            <span style={S.hint}>How often to search for new products</span>
          </div>
          <div style={S.formGroup}>
            <label style={S.label}>Auto-Start on Deploy</label>
            <select style={S.input} value={eng.auto_start ? 'true' : 'false'} onChange={e => updateField('engine', 'auto_start', e.target.value === 'true')}>
              <option value="true">Yes — engine starts automatically</option>
              <option value="false">No — manual start required</option>
            </select>
          </div>
        </div>
      </div>

      {/* Purchase Limits */}
      <div style={S.settingsCard}>
        <h3 style={S.settingsCardTitle}>Purchase Limits</h3>
        <div style={S.settingsGrid}>
          <div style={S.formGroup}>
            <label style={S.label}>Max Spend Per Day ($)</label>
            <input style={S.input} type="number" value={limits.max_spend_per_day} onChange={e => updateField('limits', 'max_spend_per_day', parseInt(e.target.value))} />
          </div>
          <div style={S.formGroup}>
            <label style={S.label}>Max Items Per Product</label>
            <input style={S.input} type="number" value={limits.max_items_per_product} onChange={e => updateField('limits', 'max_items_per_product', parseInt(e.target.value))} />
          </div>
          <div style={S.formGroup}>
            <label style={S.label}>Max Items Per Day (total)</label>
            <input style={S.input} type="number" value={limits.max_items_per_day} onChange={e => updateField('limits', 'max_items_per_day', parseInt(e.target.value))} />
          </div>
        </div>
      </div>

      {/* Proxy Configuration */}
      <div style={S.settingsCard}>
        <h3 style={S.settingsCardTitle}>Proxy / Anti-Detection (Phase 2)</h3>
        <div style={S.settingsGrid}>
          <div style={S.formGroup}>
            <label style={S.label}>Proxy Enabled</label>
            <select style={S.input} value={proxy.enabled ? 'true' : 'false'} onChange={e => updateField('proxy', 'enabled', e.target.value === 'true')}>
              <option value="false">Disabled</option>
              <option value="true">Enabled</option>
            </select>
          </div>
          <div style={S.formGroup}>
            <label style={S.label}>Provider</label>
            <select style={S.input} value={proxy.provider} onChange={e => updateField('proxy', 'provider', e.target.value)}>
              <option value="">Select provider...</option>
              <option value="brightdata">Bright Data</option>
              <option value="oxylabs">Oxylabs</option>
              <option value="smartproxy">SmartProxy</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <div style={S.formGroup}>
            <label style={S.label}>Proxy API Key / URL</label>
            <input style={S.input} type="password" placeholder="Enter proxy credentials" value={proxy.api_key} onChange={e => updateField('proxy', 'api_key', e.target.value)} />
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div style={S.settingsCard}>
        <h3 style={S.settingsCardTitle}>Notifications</h3>
        <div style={S.settingsGrid}>
          <div style={S.formGroup}>
            <label style={S.label}>Alert Email</label>
            <input style={S.input} type="email" value={notif.email} onChange={e => updateField('notifications', 'email', e.target.value)} />
          </div>
          <div style={S.formGroup}>
            <label style={S.label}>Email Alerts</label>
            <select style={S.input} value={notif.email_enabled ? 'true' : 'false'} onChange={e => updateField('notifications', 'email_enabled', e.target.value === 'true')}>
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function timeAgo(date) {
  if (!date) return '';
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════

const S = {
  container: { minHeight: '100vh', backgroundColor: '#0A0A0B', color: '#FFF', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  headerLeft: { display: 'flex', alignItems: 'center' },
  headerCenter: { display: 'flex', alignItems: 'center', gap: '12px' },
  headerRight: { display: 'flex', alignItems: 'center' },
  logo: { fontSize: '18px', fontWeight: '700', color: '#FFF', margin: 0, display: 'flex', alignItems: 'center' },
  badge: { marginLeft: '10px', padding: '2px 8px', borderRadius: '4px', backgroundColor: '#E24B4A', color: '#FFF', fontSize: '10px', fontWeight: '700' },
  backLink: { color: '#888', textDecoration: 'none', fontSize: '13px' },
  engineBtn: { padding: '6px 16px', borderRadius: '20px', border: 'none', color: '#000', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },
  statBadge: { padding: '4px 10px', borderRadius: '12px', backgroundColor: 'rgba(255,255,255,0.06)', color: '#888', fontSize: '11px' },
  tabs: { display: 'flex', gap: '2px', padding: '0 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.02)' },
  tab: { padding: '12px 20px', border: 'none', backgroundColor: 'transparent', color: '#888', fontSize: '13px', cursor: 'pointer', borderBottom: '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' },
  tabActive: { color: '#FFF', borderBottomColor: '#00D26A', backgroundColor: 'rgba(0,210,106,0.05)' },
  main: { padding: '24px', maxWidth: '1200px', margin: '0 auto' },
  loadingState: { textAlign: 'center', padding: '60px', color: '#666' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' },
  sectionTitle: { margin: 0, color: '#FFF', fontSize: '18px', fontWeight: '600' },
  sectionSub: { margin: '4px 0 0', color: '#888', fontSize: '13px' },
  emptyState: { textAlign: 'center', padding: '60px 20px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.1)' },
  list: { display: 'flex', flexDirection: 'column', gap: '6px' },
  listItem: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px' },
  formCard: { backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '20px', marginBottom: '20px' },
  formGrid: { display: 'flex', flexDirection: 'column', gap: '14px' },
  formRow: { display: 'flex', gap: '12px' },
  formGroup: { flex: 1 },
  formActions: { display: 'flex', gap: '8px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.06)' },
  label: { display: 'block', color: '#AAA', fontSize: '12px', marginBottom: '6px', fontWeight: '500' },
  input: { width: '100%', padding: '9px 12px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: '#FFF', fontSize: '13px', outline: 'none', boxSizing: 'border-box' },
  hint: { display: 'block', color: '#666', fontSize: '11px', marginTop: '4px' },
  chipGroup: { display: 'flex', flexWrap: 'wrap', gap: '6px' },
  chip: { padding: '5px 14px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.12)', backgroundColor: 'transparent', color: '#AAA', fontSize: '12px', cursor: 'pointer' },
  chipActive: { borderColor: '#00D26A', backgroundColor: 'rgba(0,210,106,0.12)', color: '#00D26A' },
  btnPrimary: { padding: '9px 20px', border: 'none', borderRadius: '8px', backgroundColor: '#00D26A', color: '#000', fontSize: '13px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' },
  btnSecondary: { padding: '9px 16px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', backgroundColor: 'transparent', color: '#AAA', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' },
  statusPill: { padding: '4px 12px', borderRadius: '12px', border: 'none', fontSize: '11px', cursor: 'pointer', fontWeight: '500' },
  statusActive: { backgroundColor: 'rgba(0,210,106,0.15)', color: '#00D26A' },
  statusPaused: { backgroundColor: 'rgba(255,255,255,0.05)', color: '#666' },
  deleteBtn: { background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '20px', padding: '2px 6px', lineHeight: '1' },
  priorityBadge: { padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase' },
  priorities: {
    low: { backgroundColor: 'rgba(255,255,255,0.05)', color: '#666' },
    normal: { backgroundColor: 'rgba(55,138,221,0.15)', color: '#378ADD' },
    high: { backgroundColor: 'rgba(239,159,39,0.15)', color: '#EF9F27' },
    critical: { backgroundColor: 'rgba(226,75,74,0.15)', color: '#E24B4A' },
  },
  settingsCard: { backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '20px', marginBottom: '16px' },
  settingsCardTitle: { color: '#FFF', fontSize: '15px', fontWeight: '600', margin: '0 0 16px' },
  settingsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' },
};
