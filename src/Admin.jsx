import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { engine, searchSkus, lookupSku, getWatchlist, addToWatchlist, updateWatchlistItem, removeFromWatchlist } from './engineClient';

// ═══════════════════════════════════════════════════════════════════════════════
// DROPWATCH ADMIN PANEL v4.2
// Full control center — Keywords, Products, Drops, Accounts, Batch Import, Activity, Purchases, Settings
// ═══════════════════════════════════════════════════════════════════════════════

const RETAILERS = [
  { id: 'best_buy', label: 'Best Buy' },
  { id: 'target', label: 'Target' },
  { id: 'walmart', label: 'Walmart' },
  { id: 'topps', label: 'Topps' },
];

export default function AdminPanel() {
  // Default to Find SKUs (the primary tool now); fall back if hash points
  // to a removed tab.
  const validTabs = new Set(['findskus', 'watchlist', 'drops', 'accounts']);
  const initialTab = window.location.hash.replace('#', '') || 'findskus';
  const [activeTab, setActiveTab] = useState(validTabs.has(initialTab) ? initialTab : 'findskus');
  const [products, setProducts] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [keywords, setKeywords] = useState([]);
  const [activity, setActivity] = useState([]);
  const [drops, setDrops] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [retailerConfigs, setRetailerConfigs] = useState([]);
  const [health, setHealth] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
    fetchHealth();
    const h = setInterval(fetchHealth, 15000);
    const a = setInterval(fetchActivity, 10000);
    const d = setInterval(fetchDrops, 15000);
    return () => { clearInterval(h); clearInterval(a); clearInterval(d); };
  }, []);

  useEffect(() => {
    window.location.hash = activeTab;
  }, [activeTab]);

  const fetchHealth = async () => {
    try { setHealth(await engine.getEngineHealth()); } catch { setHealth({ offline: true }); }
  };

  const fetchActivity = async () => {
    const res = await supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(100);
    if (res.data) setActivity(res.data);
  };

  const fetchDrops = async () => {
    try { setDrops(await engine.getDropStatus()); } catch {}
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [p, pu, kw, a, rc] = await Promise.all([
        supabase.from('products').select('*').order('created_at', { ascending: false }),
        supabase.from('purchases').select('*').order('purchased_at', { ascending: false }).limit(100),
        supabase.from('keywords').select('*').order('created_at', { ascending: false }),
        supabase.from('retailer_accounts').select('*').order('retailer').order('email'),
        supabase.from('retailer_config').select('*').order('retailer'),
      ]);
      if (p.data) setProducts(p.data);
      if (pu.data) setPurchases(pu.data);
      if (kw.data) setKeywords(kw.data);
      if (a.data) setAccounts(a.data);
      if (rc.data) setRetailerConfigs(rc.data);
      await fetchActivity();
      await fetchDrops();
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const refresh = () => fetchData();

  // Stellar AIO is the active retailer-buying engine (Walmart smoke test
  // passed 2026-04-29, Target standing-watch live). Pre-Stellar tabs
  // (keywords, products, drops, batch, activity, purchases, settings) were
  // for the dropwatch-engine workers we decommissioned and would mislead.
  // Keep only what the active workflow uses: Find SKUs (sourcing) and
  // Accounts (read-only sanity check on stored sessions).
  const tabs = [
    { id: 'findskus', icon: '🎯', label: 'Find SKUs' },
    { id: 'watchlist', icon: '📋', label: 'Watchlist' },
    { id: 'drops', icon: '🚀', label: 'Drops' },
    { id: 'accounts', icon: '👤', label: 'Accounts' },
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
          <span style={{ ...S.enginePill, ...(health.offline ? S.engineOffline : S.engineOnline) }}>
            {health.offline ? '○ OFFLINE' : `● v${health.version || '?'}`}
          </span>
          <span style={S.statBadge}>Workers: {(health.workers || []).length}</span>
          <span style={S.statBadge}>Uptime: {formatUptime(health.uptime)}</span>
          <span style={S.statBadge}>Mem: {health.memoryMB || 0}MB</span>
          <span style={S.statBadge}>Products: {products.length}</span>
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
            {activeTab === 'keywords' && <KeywordsTab keywords={keywords} onRefresh={refresh} />}
            {activeTab === 'products' && <ProductsTab products={products} accounts={accounts} onRefresh={refresh} />}
            {activeTab === 'findskus' && <FindSkusTab onRefresh={refresh} />}
            {activeTab === 'watchlist' && <WatchlistTab />}
            {activeTab === 'drops' && <DropsTab />}
            {activeTab === 'drops' && <DropsTab drops={drops} onRefresh={fetchDrops} products={products} />}
            {activeTab === 'accounts' && <AccountsTab accounts={accounts} onRefresh={refresh} />}
            {activeTab === 'batch' && <BatchImportTab onRefresh={refresh} />}
            {activeTab === 'activity' && <ActivityTab activity={activity} onRefresh={fetchActivity} />}
            {activeTab === 'purchases' && <PurchasesTab purchases={purchases} />}
            {activeTab === 'settings' && <SettingsTab configs={retailerConfigs} onRefresh={refresh} />}
          </>
        )}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// KEYWORDS TAB — with require/exclude filters
// ═══════════════════════════════════════════════════════════════════════════════

function KeywordsTab({ keywords, onRefresh }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ term: '', maxPrice: '', maxQuantity: '2', priority: 'normal', retailers: [], require: '', exclude: '', auto_activate: false });
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  const handleSave = async () => {
    if (!form.term.trim()) return;
    setSaving(true);
    try {
      const payload = {
        term: form.term.trim(),
        max_price: parseFloat(form.maxPrice) || null,
        max_quantity: parseInt(form.maxQuantity) || 2,
        priority: form.priority,
        retailers: form.retailers,
        require: form.require.split(',').map(s => s.trim()).filter(Boolean),
        exclude: form.exclude.split(',').map(s => s.trim()).filter(Boolean),
        auto_activate: form.auto_activate,
      };
      await engine.addKeyword(payload);
      setForm({ term: '', maxPrice: '', maxQuantity: '2', priority: 'normal', retailers: [], require: '', exclude: '', auto_activate: false });
      setShowForm(false);
      onRefresh();
    } catch (err) {
      if (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
        alert('Cannot reach the backend engine at localhost:3001.\n\nMake sure the backend is running:\n  cd ~/Documents/dropwatch && node server.js');
      } else {
        alert('Error: ' + err.message);
      }
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete keyword?')) return;
    await engine.deleteKeyword(id);
    onRefresh();
  };

  const handleToggle = async (k) => {
    await supabase.from('keywords').update({ is_active: !k.is_active }).eq('id', k.id);
    onRefresh();
  };

  const handleDiscover = async () => {
    setRunning(true);
    try {
      const result = await engine.runDiscovery();
      alert(`Discovery complete: ${result.discovered || 0} new products from ${result.searched || 0} keywords`);
      onRefresh();
    } catch (err) {
      alert('Discovery failed: ' + err.message);
    }
    setRunning(false);
  };

  const toggleRetailer = (r) => {
    setForm(prev => ({ ...prev, retailers: prev.retailers.includes(r) ? prev.retailers.filter(x => x !== r) : [...prev.retailers, r] }));
  };

  return (
    <div>
      <div style={S.sectionHeader}>
        <div>
          <h2 style={S.sectionTitle}>Product Discovery Keywords ({keywords.length})</h2>
          <p style={S.sectionSub}>Keywords search retailers and auto-add matching products. Use require/exclude to filter noise.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleDiscover} disabled={running} style={S.btnSecondary}>
            {running ? '⏳ Running...' : '🔎 Run Discovery Now'}
          </button>
          <button onClick={() => setShowForm(true)} style={S.btnPrimary}>+ Add Keyword</button>
        </div>
      </div>

      {showForm && (
        <div style={S.formCard}>
          <div style={S.formGrid}>
            <div style={S.formGroup}>
              <label style={S.label}>Search Term *</label>
              <input style={S.input} placeholder="e.g. pokemon prismatic evolutions" value={form.term} onChange={e => setForm({ ...form, term: e.target.value })} />
            </div>
            <div style={S.formRow}>
              <div style={S.formGroup}>
                <label style={S.label}>Max Price</label>
                <input style={S.input} type="number" placeholder="55" value={form.maxPrice} onChange={e => setForm({ ...form, maxPrice: e.target.value })} />
              </div>
              <div style={S.formGroup}>
                <label style={S.label}>Qty Per Cart</label>
                <input style={S.input} type="number" value={form.maxQuantity} onChange={e => setForm({ ...form, maxQuantity: e.target.value })} />
              </div>
              <div style={S.formGroup}>
                <label style={S.label}>Priority (check frequency)</label>
                <select style={S.input} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                  <option value="low">Low (5 min)</option>
                  <option value="normal">Normal (30s)</option>
                  <option value="high">High (5s)</option>
                  <option value="critical">Critical (1.5s)</option>
                </select>
              </div>
            </div>
            <div style={S.formRow}>
              <div style={S.formGroup}>
                <label style={S.label}>Must INCLUDE (comma separated)</label>
                <input style={S.input} placeholder="pokemon, elite trainer" value={form.require} onChange={e => setForm({ ...form, require: e.target.value })} />
                <span style={S.hint}>Only products containing ALL these words will be added.</span>
              </div>
              <div style={S.formGroup}>
                <label style={S.label}>Must EXCLUDE (comma separated)</label>
                <input style={S.input} placeholder="uno, aquasonic, elitebook" value={form.exclude} onChange={e => setForm({ ...form, exclude: e.target.value })} />
                <span style={S.hint}>Products with any of these words will be skipped.</span>
              </div>
            </div>
            <div style={S.formGroup}>
              <label style={S.label}>Retailers (empty = all 3)</label>
              <div style={S.chipGroup}>
                {RETAILERS.map(r => (
                  <button key={r.id} onClick={() => toggleRetailer(r.id)} style={{ ...S.chip, ...(form.retailers.includes(r.id) ? S.chipActive : {}) }}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={S.formGroup}>
              <label style={{ ...S.label, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.auto_activate} onChange={e => setForm({ ...form, auto_activate: e.target.checked })} />
                <span>Skip approval — auto-activate discovered products (NOT RECOMMENDED)</span>
              </label>
              <span style={S.hint}>By default, discovered products require your approval before monitoring starts.</span>
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
          <p style={{ color: '#666', fontSize: '14px' }}>Add keywords to start auto-discovering products</p>
        </div>
      ) : (
        <div style={S.list}>
          {keywords.map(kw => {
            const { baseTerm, require, exclude } = parseKeywordTerm(kw.term || '');
            const retailers = Array.isArray(kw.retailers) ? kw.retailers : (kw.retailers ? JSON.parse(kw.retailers) : []);
            return (
              <div key={kw.id} style={S.listItem}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ color: '#FFF', fontSize: '15px', fontWeight: '500' }}>{baseTerm}</span>
                    <span style={{ ...S.priorityBadge, ...S.priorities[kw.priority] }}>{kw.priority}</span>
                    {require.length > 0 && <span style={S.filterBadgeReq}>+{require.join(',')}</span>}
                    {exclude.length > 0 && <span style={S.filterBadgeExc}>-{exclude.join(',')}</span>}
                  </div>
                  <div style={{ color: '#888', fontSize: '12px', marginTop: '4px' }}>
                    {kw.max_price ? `Max $${kw.max_price}` : 'No price limit'}
                    {' · '}Qty: {kw.max_quantity || 2}
                    {retailers.length > 0 ? ` · ${retailers.join(', ')}` : ' · All retailers'}
                    {kw.products_found > 0 ? ` · ${kw.products_found} found` : ''}
                    {kw.last_searched ? ` · Last: ${timeAgo(kw.last_searched)}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button onClick={() => handleToggle(kw)} style={{ ...S.statusPill, ...(kw.is_active ? S.statusActive : S.statusPaused) }}>
                    {kw.is_active ? '● Active' : '○ Paused'}
                  </button>
                  <button onClick={() => handleDelete(kw.id)} style={S.deleteBtn}>×</button>
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
// PRODUCTS TAB — with priority, bulk ops, filtering
// ═══════════════════════════════════════════════════════════════════════════════

function ProductsTab({ products, accounts, onRefresh }) {
  const [filterRetailer, setFilterRetailer] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [selected, setSelected] = useState(new Set());
  const [editing, setEditing] = useState(null); // product being edited
  const [testBuying, setTestBuying] = useState(null); // { product, status, result }

  const filtered = products.filter(p => {
    if (filterRetailer !== 'all' && p.retailer !== filterRetailer) return false;
    if (filterStatus === 'active' && !p.is_active) return false;
    if (filterStatus === 'inactive' && p.is_active) return false;
    if (filterStatus !== 'all' && filterStatus !== 'active' && filterStatus !== 'inactive' && p.status !== filterStatus) return false;
    if (filterPriority !== 'all' && (p.check_priority || 'normal') !== filterPriority) return false;
    return true;
  });

  const toggleSelect = (id) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };

  const selectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(p => p.id)));
  };

  const bulkPriority = async (priority) => {
    if (!confirm(`Set ${selected.size} products to priority "${priority}"?`)) return;
    await supabase.from('products').update({ check_priority: priority }).in('id', [...selected]);
    setSelected(new Set());
    onRefresh();
  };

  const bulkActivate = async (active) => {
    await supabase.from('products').update({ is_active: active }).in('id', [...selected]);
    setSelected(new Set());
    onRefresh();
  };

  const bulkDelete = async () => {
    if (!confirm(`Delete ${selected.size} products?`)) return;
    await supabase.from('products').delete().in('id', [...selected]);
    setSelected(new Set());
    onRefresh();
  };

  const updatePriority = async (id, priority) => {
    await supabase.from('products').update({ check_priority: priority }).eq('id', id);
    onRefresh();
  };

  const testBuy = async (product) => {
    const retailerAccounts = accounts?.filter(a => a.retailer === product.retailer && a.active && a.session_valid);
    if (!retailerAccounts?.length) {
      return alert(`No valid ${product.retailer} account with saved session. Add one in Accounts tab first.`);
    }
    const account = retailerAccounts[0];
    const price = product.last_price || '?';
    const id = product.sku || product.tcin || product.pid;
    if (!confirm(
      `🚨 REAL PURCHASE — This will place an actual order.\n\n` +
      `Product: ${product.name}\n` +
      `Retailer: ${product.retailer}\n` +
      `Account: ${account.email}\n` +
      `Current price: $${price}\n` +
      `Quantity: 1 (for test)\n\n` +
      `Continue?`
    )) return;

    setTestBuying({ product, account, state: 'starting', log: [`🚀 Starting test purchase of ${product.name}`] });
    try {
      const result = await engine.testPurchase(product.retailer, {
        [product.retailer === 'target' ? 'tcin' : product.retailer === 'walmart' ? 'pid' : 'sku']: id,
        account_id: account.id,
      });
      setTestBuying(t => ({ ...t, state: 'done', result, log: [...t.log, `✅ Done — ${JSON.stringify(result.results || result)}`] }));
    } catch (err) {
      setTestBuying(t => ({ ...t, state: 'failed', error: err.message, log: [...t.log, `❌ Error: ${err.message}`] }));
    }
  };

  const toggleProduct = async (id, isActive) => {
    await supabase.from('products').update({ is_active: !isActive }).eq('id', id);
    onRefresh();
  };

  return (
    <div>
      <div style={S.sectionHeader}>
        <div>
          <h2 style={S.sectionTitle}>Products ({filtered.length}/{products.length})</h2>
          <p style={S.sectionSub}>Active products get monitored at their priority interval. Critical = 1.5s, high = 5s, normal = 30s, low = 5min.</p>
        </div>
      </div>

      {/* Filters */}
      <div style={S.filterBar}>
        <select style={S.input} value={filterRetailer} onChange={e => setFilterRetailer(e.target.value)}>
          <option value="all">All Retailers</option>
          {RETAILERS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
        <select style={S.input} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="active">Active Only</option>
          <option value="inactive">Inactive Only</option>
          <option value="in_stock">In Stock</option>
          <option value="watching">Watching</option>
          <option value="detected">Detected</option>
          <option value="coming_soon">Coming Soon</option>
          <option value="purchased">Purchased</option>
        </select>
        <select style={S.input} value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
          <option value="all">All Priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div style={S.bulkBar}>
          <span style={{ color: '#00D26A', fontSize: '13px' }}>{selected.size} selected</span>
          <select style={{ ...S.input, width: 'auto' }} onChange={e => { if (e.target.value) bulkPriority(e.target.value); }} value="">
            <option value="">Set priority...</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
          <button onClick={() => bulkActivate(true)} style={S.btnSecondary}>Activate</button>
          <button onClick={() => bulkActivate(false)} style={S.btnSecondary}>Deactivate</button>
          <button onClick={bulkDelete} style={{ ...S.btnSecondary, color: '#E24B4A', borderColor: 'rgba(226,75,74,0.3)' }}>Delete</button>
          <button onClick={() => setSelected(new Set())} style={S.btnSecondary}>Clear</button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={S.emptyState}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>📦</div>
          <h3 style={{ color: '#AAA', margin: '0 0 8px' }}>No products match filters</h3>
        </div>
      ) : (
        <div style={S.list}>
          <div style={{ ...S.listItem, padding: '8px 18px', backgroundColor: 'rgba(255,255,255,0.05)' }}>
            <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={selectAll} />
            <span style={{ color: '#888', fontSize: '12px', marginLeft: '12px' }}>Select all visible</span>
          </div>
          {filtered.map(p => {
            const id = p.sku || p.tcin || p.pid || '?';
            return (
              <div key={p.id} style={S.listItem}>
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} style={{ marginRight: '12px' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ color: '#FFF', fontSize: '14px', fontWeight: '500' }}>{p.name || '(no name)'}</span>
                    <span style={{ ...S.priorityBadge, ...S.priorities[p.check_priority || 'normal'] }}>{p.check_priority || 'normal'}</span>
                    <span style={{ ...S.statusBadge, ...S.statusStyles[p.status] || S.statusStyles.watching }}>{p.status || 'watching'}</span>
                  </div>
                  <div style={{ color: '#888', fontSize: '12px', marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    <span>{p.retailer} · {id}</span>
                    {p.last_price && (
                      <span>current: <span style={{ color: '#DDD' }}>${p.last_price}</span></span>
                    )}
                    {p.target_price && (
                      <span>max buy: <span style={{ color: '#00D26A', fontWeight: '500' }}>${p.target_price}</span></span>
                    )}
                    <span>qty {p.max_quantity || 1}</span>
                    {p.purchase_count > 0 && <span>{p.purchase_count} purchased</span>}
                    <span>{p.last_checked_at ? timeAgo(p.last_checked_at) : 'never checked'}</span>
                    {p.url && <a href={p.url} target="_blank" rel="noreferrer" style={S.linkColor}>open</a>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    onClick={() => testBuy(p)}
                    title="Fire a real purchase now — for testing the end-to-end flow"
                    style={{ ...S.btnSecondary, color: '#EF9F27', borderColor: 'rgba(239,159,39,0.3)' }}
                  >
                    🧪 Test Buy
                  </button>
                  <button onClick={() => setEditing(p)} style={S.btnSecondary}>✎ Edit</button>
                  <select style={{ ...S.inputSmall }} value={p.check_priority || 'normal'} onChange={e => updatePriority(p.id, e.target.value)}>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="normal">Normal</option>
                    <option value="low">Low</option>
                  </select>
                  <button onClick={() => toggleProduct(p.id, p.is_active)} style={{ ...S.statusPill, ...(p.is_active ? S.statusActive : S.statusPaused) }}>
                    {p.is_active ? '● Active' : '○ Off'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && <EditProductModal product={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onRefresh(); }} />}
      {testBuying && <TestBuyModal task={testBuying} onClose={() => setTestBuying(null)} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST BUY MODAL — fires a real purchase through the full flow
// ═══════════════════════════════════════════════════════════════════════════════

function TestBuyModal({ task, onClose }) {
  const { product, account, state, error, result } = task;
  const isDone = state === 'done' || state === 'failed';

  // Extract result details
  const purchaseResults = result?.results || [];
  const firstResult = purchaseResults[0];

  return (
    <div style={S.modalOverlay} onClick={e => { if (e.target === e.currentTarget && isDone) onClose(); }}>
      <div style={{ ...S.modalCard, maxWidth: '580px' }}>
        <h3 style={{ color: '#FFF', fontSize: '16px', margin: '0 0 6px', fontWeight: '700' }}>
          {state === 'done' && firstResult?.success ? (
            firstResult.status === 'ordered' ? '✅ Order Placed!' : '⚠️ Reached Cart'
          ) : state === 'failed' ? (
            '❌ Test Buy Failed'
          ) : (
            '🧪 Test Purchase In Progress'
          )}
        </h3>
        <p style={{ color: '#888', fontSize: '12px', margin: '0 0 14px' }}>
          {product.retailer} · {product.name.substring(0, 60)} · ${product.last_price || '?'}
        </p>

        <div style={{ padding: '12px 14px', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '8px', marginBottom: '14px' }}>
          <div style={{ fontSize: '13px', color: '#AAA', marginBottom: '8px' }}>
            Using account: <strong style={{ color: '#FFF' }}>{account.email}</strong>
          </div>
          {!isDone && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#EF9F27', fontSize: '13px' }}>
              <span className="spinner">⏳</span>
              Chrome is opening. Navigating → ATC → cart → checkout → place order...
              <span style={{ color: '#888', fontSize: '11px' }}>(watch the Chrome window)</span>
            </div>
          )}

          {isDone && firstResult && (
            <div style={{ fontSize: '13px', color: '#DDD' }}>
              <div>Loop: <strong>{firstResult.loop}</strong></div>
              <div>Status: <strong style={{ color: firstResult.status === 'ordered' ? '#00D26A' : firstResult.status === 'cart' ? '#EF9F27' : '#E24B4A' }}>{firstResult.status || 'unknown'}</strong></div>
              <div>Duration: {(firstResult.elapsed / 1000).toFixed(1)}s</div>
              {firstResult.error && <div style={{ color: '#E24B4A', marginTop: '6px' }}>Error: {firstResult.error}</div>}
            </div>
          )}
          {isDone && !firstResult && !error && (
            <div style={{ color: '#AAA', fontSize: '13px' }}>No result data returned. Check Chrome window for status.</div>
          )}
          {error && (
            <div style={{ color: '#E24B4A', fontSize: '13px', marginTop: '8px' }}>{error}</div>
          )}
        </div>

        <div style={{ fontSize: '11px', color: '#666', marginBottom: '14px' }}>
          ℹ️ Test Buy uses the same BLITZ purchase flow as auto-buy. If this succeeds, real drops will work. This test bypasses the auto_purchase + stock + price gates — it buys whatever's on the page, right now, with quantity 1.
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={!isDone} style={{ ...S.btnPrimary, opacity: isDone ? 1 : 0.5 }}>
            {isDone ? 'Close' : 'Running...'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EDIT PRODUCT MODAL — edit price/qty/priority/name/target
// ═══════════════════════════════════════════════════════════════════════════════

function EditProductModal({ product, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: product.name || '',
    target_price: product.target_price || '',
    max_quantity: product.max_quantity || (product.retailer === 'walmart' ? 5 : 2),
    check_priority: product.check_priority || 'normal',
    is_active: product.is_active,
  });
  const [saving, setSaving] = useState(false);

  const id = product.sku || product.tcin || product.pid;
  const notesData = (() => { try { return product.notes ? JSON.parse(product.notes) : {}; } catch { return {}; } })();
  const currentlyThirdParty = notesData.isFirstParty === false;

  const save = async () => {
    setSaving(true);
    try {
      await supabase.from('products').update({
        name: form.name.trim() || product.name,
        target_price: form.target_price === '' ? null : parseFloat(form.target_price),
        max_quantity: parseInt(form.max_quantity) || 1,
        check_priority: form.check_priority,
        is_active: form.is_active,
        updated_at: new Date().toISOString(),
      }).eq('id', product.id);
      onSaved();
    } catch (err) {
      alert('Error: ' + err.message);
    }
    setSaving(false);
  };

  const remove = async () => {
    if (!confirm(`Delete "${product.name}"? This will stop monitoring.`)) return;
    await supabase.from('products').delete().eq('id', product.id);
    onSaved();
  };

  return (
    <div style={S.modalOverlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.modalCard}>
        <h3 style={{ ...S.settingsCardTitle, margin: '0 0 6px', fontSize: '16px' }}>Edit Product</h3>
        <p style={{ color: '#888', fontSize: '12px', margin: '0 0 16px', fontFamily: 'monospace' }}>
          {product.retailer} · {id}
          {currentlyThirdParty && <span style={{ color: '#EF9F27', marginLeft: '8px' }}>⏱ Currently 3P ({notesData.currentSeller || 'marketplace'})</span>}
        </p>

        <div style={S.formGrid}>
          <div style={S.formGroup}>
            <label style={S.label}>Name</label>
            <input style={S.input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div style={S.formRow}>
            <div style={S.formGroup}>
              <label style={S.label}>Max Purchase Price</label>
              <input
                style={S.input}
                type="number"
                step="0.01"
                placeholder="No cap"
                value={form.target_price}
                onChange={e => setForm({ ...form, target_price: e.target.value })}
              />
              <span style={S.hint}>Auto-buy only fires if current price ≤ this. Current: ${product.last_price || '?'}</span>
            </div>
            <div style={S.formGroup}>
              <label style={S.label}>Qty Per Cart</label>
              <input
                style={S.input}
                type="number"
                value={form.max_quantity}
                onChange={e => setForm({ ...form, max_quantity: e.target.value })}
              />
              <span style={S.hint}>{product.retailer === 'walmart' ? 'Walmart limit: 5' : 'BB/Target limit: 2'} per SKU</span>
            </div>
            <div style={S.formGroup}>
              <label style={S.label}>Urgency / Priority</label>
              <select style={S.input} value={form.check_priority} onChange={e => setForm({ ...form, check_priority: e.target.value })}>
                <option value="critical">🔴 Critical (1.5s polling)</option>
                <option value="high">🟠 High (5s polling)</option>
                <option value="normal">🔵 Normal (30s polling)</option>
                <option value="low">⚪ Low (5 min polling)</option>
              </select>
            </div>
          </div>
          <div style={S.formGroup}>
            <label style={{ ...S.label, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
              <span>Active (monitor for stock)</span>
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', marginTop: '18px' }}>
          <button onClick={remove} style={{ ...S.btnSecondary, color: '#E24B4A', borderColor: 'rgba(226,75,74,0.3)' }}>🗑 Delete Product</button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={onClose} style={S.btnSecondary}>Cancel</button>
            <button onClick={save} disabled={saving} style={S.btnPrimary}>
              {saving ? '⏳ Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DROPS TAB
// ═══════════════════════════════════════════════════════════════════════════════

// LEGACY — pre-Stellar drops UI that talked to the decommissioned dropwatch
// engine. Kept for reference only. Replaced by the new DropsTab below that
// wires watchlist → Stellar deployer JSON config.
// eslint-disable-next-line no-unused-vars
function LegacyDropsTab({ drops, onRefresh, products }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    retailer: 'best_buy',
    product_id: '',
    drop_time: '',
    description: '',
    prep_minutes: 15,
    end_minutes: 30,
    auto_pre_login: true,
  });

  const handleCreate = async () => {
    if (!form.drop_time) return alert('Drop time required');
    try {
      await engine.createDrop({
        retailer: form.retailer,
        product_id: form.product_id || null,
        drop_time: new Date(form.drop_time).toISOString(),
        description: form.description,
        prep_minutes: parseInt(form.prep_minutes) || 15,
        auto_pre_login: form.auto_pre_login,
      });
      setShowForm(false);
      setForm({ retailer: 'best_buy', product_id: '', drop_time: '', description: '', prep_minutes: 15, end_minutes: 30, auto_pre_login: true });
      onRefresh();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const handleCancel = async (id) => {
    if (!confirm('Cancel this drop?')) return;
    await engine.cancelDrop(id);
    onRefresh();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this drop?')) return;
    await engine.deleteDrop(id);
    onRefresh();
  };

  const handleTrigger = async (id, phase) => {
    if (!confirm(`Manually trigger ${phase}?`)) return;
    try {
      await engine.triggerDropPhase(id, phase);
      onRefresh();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const phaseColor = {
    scheduled: { bg: 'rgba(55,138,221,0.15)', fg: '#378ADD' },
    preparing: { bg: 'rgba(239,159,39,0.15)', fg: '#EF9F27' },
    live: { bg: 'rgba(226,75,74,0.15)', fg: '#E24B4A' },
    completed: { bg: 'rgba(255,255,255,0.05)', fg: '#666' },
  };

  const retailerProducts = products.filter(p => p.retailer === form.retailer);

  return (
    <div>
      <div style={S.sectionHeader}>
        <div>
          <h2 style={S.sectionTitle}>Scheduled Drops ({drops.length})</h2>
          <p style={S.sectionSub}>System auto pre-logs accounts before drops, enables drop mode + auto-purchase at drop time, disables 30 min after.</p>
        </div>
        <button onClick={() => setShowForm(true)} style={S.btnPrimary}>+ Schedule Drop</button>
      </div>

      {showForm && (
        <div style={S.formCard}>
          <div style={S.formGrid}>
            <div style={S.formRow}>
              <div style={S.formGroup}>
                <label style={S.label}>Retailer *</label>
                <select style={S.input} value={form.retailer} onChange={e => setForm({ ...form, retailer: e.target.value, product_id: '' })}>
                  {RETAILERS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </div>
              <div style={S.formGroup}>
                <label style={S.label}>Drop Time * (your local time)</label>
                <input style={S.input} type="datetime-local" value={form.drop_time} onChange={e => setForm({ ...form, drop_time: e.target.value })} />
              </div>
            </div>
            <div style={S.formGroup}>
              <label style={S.label}>Description</label>
              <input style={S.input} placeholder="e.g. Pokemon Prismatic Evolutions ETB" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div style={S.formGroup}>
              <label style={S.label}>Target Product (optional — leave blank for all {form.retailer} products)</label>
              <select style={S.input} value={form.product_id} onChange={e => setForm({ ...form, product_id: e.target.value })}>
                <option value="">All active {form.retailer} products</option>
                {retailerProducts.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
              </select>
            </div>
            <div style={S.formRow}>
              <div style={S.formGroup}>
                <label style={S.label}>Prep Minutes (before drop)</label>
                <input style={S.input} type="number" value={form.prep_minutes} onChange={e => setForm({ ...form, prep_minutes: e.target.value })} />
                <span style={S.hint}>Pre-login happens {form.prep_minutes} min before drop.</span>
              </div>
              <div style={S.formGroup}>
                <label style={{ ...S.label, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.auto_pre_login} onChange={e => setForm({ ...form, auto_pre_login: e.target.checked })} />
                  <span>Auto pre-login accounts</span>
                </label>
              </div>
            </div>
          </div>
          <div style={S.formActions}>
            <button onClick={handleCreate} disabled={!form.drop_time} style={{ ...S.btnPrimary, opacity: !form.drop_time ? 0.5 : 1 }}>Schedule Drop</button>
            <button onClick={() => setShowForm(false)} style={S.btnSecondary}>Cancel</button>
          </div>
        </div>
      )}

      {drops.length === 0 ? (
        <div style={S.emptyState}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔴</div>
          <h3 style={{ color: '#AAA', margin: '0 0 8px' }}>No drops scheduled</h3>
          <p style={{ color: '#666', fontSize: '14px' }}>Schedule a drop to automate the full flow: pre-login → drop mode → auto-purchase → summary email</p>
        </div>
      ) : (
        <div style={S.list}>
          {drops.map(d => {
            const phase = d.phase || 'scheduled';
            const ph = phaseColor[phase] || phaseColor.scheduled;
            return (
              <div key={d.id} style={S.listItem}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ color: '#FFF', fontSize: '15px', fontWeight: '500' }}>{d.description || d.retailer}</span>
                    <span style={{ ...S.priorityBadge, backgroundColor: ph.bg, color: ph.fg }}>{phase.toUpperCase()}</span>
                    <span style={{ ...S.priorityBadge, backgroundColor: 'rgba(255,255,255,0.05)', color: '#AAA' }}>{d.retailer}</span>
                  </div>
                  <div style={{ color: '#888', fontSize: '12px', marginTop: '4px' }}>
                    Drop: {new Date(d.drop_time).toLocaleString()}
                    {' · '}Prep: {d.prep_minutes || 10}m
                    {d.minutes_until_drop > 0 && ` · ${d.minutes_until_drop}m until drop`}
                    {d.minutes_until_drop <= 0 && d.minutes_until_drop > -30 && ` · LIVE ${Math.abs(d.minutes_until_drop)}m ago`}
                    {d.auto_pre_login && ' · auto pre-login ✓'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  {phase === 'scheduled' && (
                    <button onClick={() => handleTrigger(d.id, 'prepare')} style={S.btnSecondary}>Prep Now</button>
                  )}
                  {phase === 'preparing' && (
                    <button onClick={() => handleTrigger(d.id, 'activate')} style={S.btnSecondary}>Go Live</button>
                  )}
                  {phase === 'live' && (
                    <button onClick={() => handleTrigger(d.id, 'complete')} style={S.btnSecondary}>End Drop</button>
                  )}
                  <button onClick={() => handleCancel(d.id)} style={S.btnSecondary}>Cancel</button>
                  <button onClick={() => handleDelete(d.id)} style={S.deleteBtn}>×</button>
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
// ACCOUNTS TAB
// ═══════════════════════════════════════════════════════════════════════════════

function AccountsTab({ accounts, onRefresh }) {
  const [preLoggingIn, setPreLoggingIn] = useState(null);
  const [addingFor, setAddingFor] = useState(null); // retailer id when adding
  const [form, setForm] = useState({
    retailer: 'best_buy',
    email: '',
    password: '',
    cvv: '',
    has_saved_payment: true,
    has_saved_address: true,
    imap_host: '',
    imap_port: 993,
    imap_user: '',
    imap_password: '',
  });
  const [saving, setSaving] = useState(false);
  const [setupTask, setSetupTask] = useState(null); // { taskId, state, message, email, retailer }

  const byRetailer = {};
  for (const a of accounts) {
    if (!byRetailer[a.retailer]) byRetailer[a.retailer] = [];
    byRetailer[a.retailer].push(a);
  }

  const preLoginAll = async (retailer) => {
    setPreLoggingIn(retailer);
    try {
      const result = await engine.preLoginAll(retailer);
      alert(`Pre-login complete — Success: ${result.success?.length || 0}, Failed: ${result.failed?.length || 0}`);
      onRefresh();
    } catch (err) {
      alert('Error: ' + err.message);
    }
    setPreLoggingIn(null);
  };

  const loginAccount = async (retailer, id) => {
    try {
      const result = await engine.loginAccount(retailer, id);
      alert(`Login: ${result.logged_in ? 'SUCCESS' : 'FAILED'}`);
      onRefresh();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const toggleActive = async (id, active) => {
    await supabase.from('retailer_accounts').update({ active: !active }).eq('id', id);
    onRefresh();
  };

  const deleteAccount = async (id, email) => {
    if (!confirm(`Delete account ${email}? This cannot be undone.`)) return;
    await supabase.from('retailer_accounts').delete().eq('id', id);
    onRefresh();
  };

  const startSetup = async (account) => {
    try {
      const result = await engine.startAccountSetup(account.id);
      setSetupTask({
        taskId: result.taskId,
        state: 'starting',
        message: 'Launching Chrome...',
        email: account.email,
        retailer: account.retailer,
      });
      // Start polling
      pollSetupStatus(result.taskId);
    } catch (err) {
      alert('Error starting setup: ' + err.message);
    }
  };

  const pollSetupStatus = async (taskId) => {
    const tick = async () => {
      try {
        const status = await engine.getSetupStatus(taskId);
        setSetupTask(prev => prev?.taskId === taskId ? { ...prev, ...status } : prev);
        if (status.state === 'complete' || status.state === 'failed' || status.state === 'cancelled') {
          // Done — refresh accounts after brief delay so user sees final message
          setTimeout(() => { onRefresh(); }, 3000);
          return;
        }
      } catch (err) {
        // Task may have expired — stop polling
        return;
      }
      setTimeout(tick, 2000);
    };
    tick();
  };

  const cancelSetup = async () => {
    if (!setupTask) return;
    try { await engine.cancelSetup(setupTask.taskId); } catch {}
    setSetupTask(null);
    onRefresh();
  };

  const closeSetup = () => setSetupTask(null);

  const startAdd = (retailer) => {
    setAddingFor(retailer);
    setForm({
      retailer,
      email: '',
      password: '',
      cvv: '',
      has_saved_payment: true,
      has_saved_address: true,
      imap_host: '',
      imap_port: 993,
      imap_user: '',
      imap_password: '',
    });
  };

  const cancelAdd = () => {
    setAddingFor(null);
  };

  const saveAccount = async () => {
    if (!form.email.trim() || !form.password.trim()) return alert('Email and password required');
    setSaving(true);
    try {
      // Direct Supabase insert (backend POST /api/accounts exists but direct is simpler for now)
      const notesPayload = form.cvv ? JSON.stringify({ cvv: form.cvv }) : null;
      const payload = {
        retailer: form.retailer,
        email: form.email.trim(),
        password: form.password,
        has_saved_payment: form.has_saved_payment,
        has_saved_address: form.has_saved_address,
        active: true,
        notes: notesPayload,
      };
      if (form.imap_host) {
        payload.imap_host = form.imap_host;
        payload.imap_port = parseInt(form.imap_port) || 993;
        payload.imap_user = form.imap_user || form.email;
        payload.imap_password = form.imap_password;
      }
      const { error } = await supabase.from('retailer_accounts').insert(payload);
      if (error) throw error;
      setAddingFor(null);
      onRefresh();
    } catch (err) {
      alert('Error: ' + err.message);
    }
    setSaving(false);
  };

  return (
    <div>
      <div style={S.sectionHeader}>
        <div>
          <h2 style={S.sectionTitle}>Accounts ({accounts.length})</h2>
          <p style={S.sectionSub}>Up to 10 accounts per retailer. Pre-login warms browser contexts + cookies before drops.</p>
        </div>
      </div>

      {RETAILERS.map(retailer => {
        const list = byRetailer[retailer.id] || [];
        const isAdding = addingFor === retailer.id;
        return (
          <div key={retailer.id} style={S.settingsCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={S.settingsCardTitle}>{retailer.label} — {list.length} account{list.length !== 1 ? 's' : ''} {list.length >= 10 && <span style={{ color: '#EF9F27', fontSize: '11px' }}>(limit reached)</span>}</h3>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={() => preLoginAll(retailer.id)} disabled={preLoggingIn === retailer.id || list.length === 0} style={S.btnSecondary}>
                  {preLoggingIn === retailer.id ? '⏳ Logging in...' : '🔑 Pre-Login All'}
                </button>
                <button onClick={() => startAdd(retailer.id)} disabled={list.length >= 10 || isAdding} style={S.btnPrimary}>
                  + Add Account
                </button>
              </div>
            </div>

            {/* Add Account Form */}
            {isAdding && (
              <div style={{ ...S.formCard, marginTop: 0, marginBottom: '16px', backgroundColor: 'rgba(0,210,106,0.04)', borderColor: 'rgba(0,210,106,0.2)' }}>
                <h4 style={{ color: '#00D26A', fontSize: '14px', margin: '0 0 12px' }}>New {retailer.label} Account</h4>
                <div style={S.formGrid}>
                  <div style={S.formRow}>
                    <div style={S.formGroup}>
                      <label style={S.label}>Email *</label>
                      <input style={S.input} type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="buyer@example.com" />
                    </div>
                    <div style={S.formGroup}>
                      <label style={S.label}>Password *</label>
                      <input style={S.input} type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
                    </div>
                    <div style={S.formGroup}>
                      <label style={S.label}>Card CVV (3 digits)</label>
                      <input style={S.input} type="password" maxLength="4" value={form.cvv} onChange={e => setForm({ ...form, cvv: e.target.value })} placeholder="394" />
                      <span style={S.hint}>Auto-filled at checkout for saved card.</span>
                    </div>
                  </div>
                  <div style={S.formRow}>
                    <div style={S.formGroup}>
                      <label style={{ ...S.label, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={form.has_saved_payment} onChange={e => setForm({ ...form, has_saved_payment: e.target.checked })} />
                        <span>Has saved payment method</span>
                      </label>
                    </div>
                    <div style={S.formGroup}>
                      <label style={{ ...S.label, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={form.has_saved_address} onChange={e => setForm({ ...form, has_saved_address: e.target.checked })} />
                        <span>Has saved shipping address</span>
                      </label>
                    </div>
                  </div>
                  <details style={{ marginTop: '8px' }}>
                    <summary style={{ color: '#AAA', fontSize: '12px', cursor: 'pointer' }}>IMAP config for 2FA auto-fetch (optional)</summary>
                    <div style={{ ...S.formRow, marginTop: '10px' }}>
                      <div style={S.formGroup}>
                        <label style={S.label}>IMAP Host</label>
                        <input style={S.input} placeholder="imap.gmail.com" value={form.imap_host} onChange={e => setForm({ ...form, imap_host: e.target.value })} />
                      </div>
                      <div style={S.formGroup}>
                        <label style={S.label}>Port</label>
                        <input style={S.input} type="number" value={form.imap_port} onChange={e => setForm({ ...form, imap_port: e.target.value })} />
                      </div>
                      <div style={S.formGroup}>
                        <label style={S.label}>IMAP Password (app password)</label>
                        <input style={S.input} type="password" value={form.imap_password} onChange={e => setForm({ ...form, imap_password: e.target.value })} />
                      </div>
                    </div>
                  </details>
                </div>
                <div style={S.formActions}>
                  <button onClick={saveAccount} disabled={saving || !form.email.trim() || !form.password.trim()} style={{ ...S.btnPrimary, opacity: (!form.email.trim() || !form.password.trim() ? 0.5 : 1) }}>
                    {saving ? '⏳ Saving...' : 'Save Account'}
                  </button>
                  <button onClick={cancelAdd} style={S.btnSecondary}>Cancel</button>
                </div>
                <p style={{ color: '#888', fontSize: '12px', margin: '12px 0 0' }}>
                  💡 After saving, sign into this account in Chrome, then run "Pre-Login All" to export cookies.
                </p>
              </div>
            )}

            {list.length === 0 ? (
              <p style={{ color: '#666', fontSize: '13px', margin: 0 }}>No accounts for {retailer.label}. Click "+ Add Account" to create one.</p>
            ) : (
              <div style={S.list}>
                {list.map(a => (
                  <div key={a.id} style={S.listItem}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: '#FFF', fontSize: '14px', fontWeight: '500' }}>{a.email}</span>
                        {a.session_valid && <span style={{ ...S.priorityBadge, ...S.statusStyles.in_stock }}>✓ valid session</span>}
                        {a.session_valid === false && <span style={{ ...S.priorityBadge, backgroundColor: 'rgba(226,75,74,0.15)', color: '#E24B4A' }}>✗ expired</span>}
                      </div>
                      <div style={{ color: '#888', fontSize: '12px', marginTop: '4px' }}>
                        {a.has_saved_payment && 'card saved · '}
                        {a.has_saved_address && 'addr saved · '}
                        {a.notes && (() => { try { return JSON.parse(a.notes).cvv ? 'cvv saved · ' : ''; } catch { return ''; } })()}
                        {a.imap_host && 'IMAP 2FA · '}
                        {a.last_login ? `last login ${timeAgo(a.last_login)}` : 'never logged in'}
                        {a.purchase_count > 0 && ` · ${a.purchase_count} purchases`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      {!a.session_valid && (
                        <button onClick={() => startSetup(a)} style={{ ...S.btnPrimary, fontSize: '11px', padding: '6px 12px' }}>
                          🔑 Setup Session
                        </button>
                      )}
                      {a.session_valid && (
                        <button onClick={() => startSetup(a)} style={S.btnSecondary} title="Re-run session setup (refreshes cookies)">
                          🔄 Refresh
                        </button>
                      )}
                      <button onClick={() => toggleActive(a.id, a.active)} style={{ ...S.statusPill, ...(a.active ? S.statusActive : S.statusPaused) }}>
                        {a.active ? '● Active' : '○ Off'}
                      </button>
                      <button onClick={() => deleteAccount(a.id, a.email)} style={S.deleteBtn}>×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Setup Session Modal */}
      {setupTask && (
        <div style={S.modalOverlay} onClick={e => { if (e.target === e.currentTarget && ['complete','failed','cancelled'].includes(setupTask.state)) closeSetup(); }}>
          <div style={S.modalCard}>
            <h3 style={{ ...S.settingsCardTitle, margin: '0 0 8px', fontSize: '16px' }}>
              {setupTask.state === 'complete' ? '✅ Setup Complete' :
               setupTask.state === 'failed' ? '❌ Setup Failed' :
               setupTask.state === 'cancelled' ? '⏹ Cancelled' :
               '🔑 Account Setup'}
            </h3>
            <p style={{ color: '#AAA', fontSize: '13px', margin: '0 0 14px' }}>
              {setupTask.email} @ {setupTask.retailer}
            </p>

            {/* Progress steps */}
            <div style={S.stepList}>
              <SetupStep label="Launch Chrome" state={stepStateFor('starting', setupTask.state)} />
              <SetupStep label="Sign in manually (+ add card/address)" state={stepStateFor('awaiting_login', setupTask.state)} />
              <SetupStep label="Verify session" state={stepStateFor('detecting', setupTask.state)} />
              <SetupStep label="Export cookies to Supabase" state={stepStateFor('exporting', setupTask.state)} />
              <SetupStep label="Ready to purchase" state={setupTask.state === 'complete' ? 'done' : 'pending'} />
            </div>

            <div style={{ padding: '12px 14px', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '8px', marginTop: '14px' }}>
              <div style={{ color: '#DDD', fontSize: '13px' }}>{setupTask.message || '...'}</div>
              {setupTask.error && (
                <div style={{ color: '#E24B4A', fontSize: '12px', marginTop: '8px' }}>Error: {setupTask.error}</div>
              )}
              {setupTask.cookieCount && (
                <div style={{ color: '#00D26A', fontSize: '12px', marginTop: '8px' }}>{setupTask.cookieCount} cookies saved</div>
              )}
            </div>

            {setupTask.state === 'awaiting_login' && (
              <p style={{ color: '#EF9F27', fontSize: '12px', margin: '14px 0 0' }}>
                👉 Check the Chrome window that just opened. Sign in with <strong>{setupTask.email}</strong>, add a saved card + shipping address, then I'll detect it automatically.
              </p>
            )}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
              {!['complete','failed','cancelled'].includes(setupTask.state) && (
                <button onClick={cancelSetup} style={S.btnSecondary}>Cancel</button>
              )}
              {['complete','failed','cancelled'].includes(setupTask.state) && (
                <button onClick={closeSetup} style={S.btnPrimary}>Close</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function stepStateFor(target, current) {
  const order = ['starting', 'awaiting_login', 'detecting', 'exporting', 'complete'];
  const ti = order.indexOf(target);
  const ci = order.indexOf(current);
  if (current === 'failed' || current === 'cancelled') return ti <= ci ? 'done' : 'pending';
  if (ci > ti) return 'done';
  if (ci === ti) return 'active';
  return 'pending';
}

function SetupStep({ label, state }) {
  const icon = state === 'done' ? '✓' : state === 'active' ? '●' : '○';
  const color = state === 'done' ? '#00D26A' : state === 'active' ? '#EF9F27' : '#555';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0' }}>
      <span style={{ color, fontFamily: 'monospace', width: '16px' }}>{icon}</span>
      <span style={{ color: state === 'pending' ? '#666' : '#DDD', fontSize: '13px' }}>{label}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BATCH IMPORT TAB
// ═══════════════════════════════════════════════════════════════════════════════

function BatchImportTab({ onRefresh }) {
  const [form, setForm] = useState({
    retailer: 'best_buy',
    ids: '',
    priority: 'high',
    max_quantity: '',
    target_price: '',
    auto_activate: true,
  });
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  const handleImport = async () => {
    const ids = form.ids.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
    if (ids.length === 0) return alert('Paste at least one ID or URL');
    setRunning(true);
    setResult(null);
    try {
      const r = await engine.batchImport({
        retailer: form.retailer,
        ids,
        priority: form.priority,
        max_quantity: parseInt(form.max_quantity) || undefined,
        target_price: parseFloat(form.target_price) || undefined,
        auto_activate: form.auto_activate,
      });
      setResult(r);
      onRefresh();
    } catch (err) {
      alert('Error: ' + err.message);
    }
    setRunning(false);
  };

  return (
    <div>
      <div style={S.sectionHeader}>
        <div>
          <h2 style={S.sectionTitle}>Batch Product Import</h2>
          <p style={S.sectionSub}>Paste SKUs (Best Buy), TCINs (Target), PIDs (Walmart) or full product URLs — one per line. For pre-announced drops where IDs are known ahead of time.</p>
        </div>
      </div>

      <div style={S.formCard}>
        <div style={S.formGrid}>
          <div style={S.formRow}>
            <div style={S.formGroup}>
              <label style={S.label}>Retailer *</label>
              <select style={S.input} value={form.retailer} onChange={e => setForm({ ...form, retailer: e.target.value })}>
                {RETAILERS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>
            <div style={S.formGroup}>
              <label style={S.label}>Priority</label>
              <select style={S.input} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                <option value="critical">Critical (1.5s)</option>
                <option value="high">High (5s)</option>
                <option value="normal">Normal (30s)</option>
                <option value="low">Low (5 min)</option>
              </select>
            </div>
            <div style={S.formGroup}>
              <label style={S.label}>Qty/cart</label>
              <input style={S.input} type="number" placeholder={form.retailer === 'walmart' ? '5' : '2'} value={form.max_quantity} onChange={e => setForm({ ...form, max_quantity: e.target.value })} />
            </div>
            <div style={S.formGroup}>
              <label style={S.label}>Max Price</label>
              <input style={S.input} type="number" placeholder="55" value={form.target_price} onChange={e => setForm({ ...form, target_price: e.target.value })} />
            </div>
          </div>
          <div style={S.formGroup}>
            <label style={S.label}>Product IDs or URLs (one per line)</label>
            <textarea
              style={{ ...S.input, minHeight: '180px', fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: '13px' }}
              placeholder={'6257430\n6622656\nhttps://www.bestbuy.com/site/6593765.p\n94827553\n1002908306'}
              value={form.ids}
              onChange={e => setForm({ ...form, ids: e.target.value })}
            />
            <span style={S.hint}>{form.ids.split(/[\n,]/).filter(s => s.trim()).length} ID(s) detected</span>
          </div>
          <div style={S.formGroup}>
            <label style={{ ...S.label, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.auto_activate} onChange={e => setForm({ ...form, auto_activate: e.target.checked })} />
              <span>Auto-activate (start monitoring immediately)</span>
            </label>
          </div>
        </div>
        <div style={S.formActions}>
          <button onClick={handleImport} disabled={running || !form.ids.trim()} style={{ ...S.btnPrimary, opacity: (!form.ids.trim() ? 0.5 : 1) }}>
            {running ? '⏳ Importing...' : '⚡ Import Products'}
          </button>
        </div>
      </div>

      {result && (
        <div style={S.formCard}>
          <h3 style={{ ...S.settingsCardTitle, margin: '0 0 12px' }}>
            Results: {result.added} added, {result.skipped} skipped, {result.errors} errors
          </h3>
          {result.details?.added?.length > 0 && (
            <div>
              <h4 style={{ color: '#00D26A', fontSize: '13px', margin: '12px 0 6px' }}>✅ Added ({result.details.added.length})</h4>
              <div style={S.list}>
                {result.details.added.map((a, i) => (
                  <div key={i} style={{ ...S.listItem, padding: '8px 14px' }}>
                    <span style={{ color: '#FFF', fontSize: '13px' }}>{a.id}</span>
                    <span style={{ color: '#AAA', fontSize: '12px', marginLeft: '12px', flex: 1 }}>{a.name}</span>
                    <span style={{ color: '#888', fontSize: '12px' }}>${a.price}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {result.details?.skipped?.length > 0 && (
            <div>
              <h4 style={{ color: '#EF9F27', fontSize: '13px', margin: '12px 0 6px' }}>⚠️ Skipped ({result.details.skipped.length})</h4>
              <div style={{ color: '#AAA', fontSize: '12px' }}>
                {result.details.skipped.map((s, i) => <div key={i}>{s.id} — {s.reason}</div>)}
              </div>
            </div>
          )}
          {result.details?.errors?.length > 0 && (
            <div>
              <h4 style={{ color: '#E24B4A', fontSize: '13px', margin: '12px 0 6px' }}>❌ Errors ({result.details.errors.length})</h4>
              <div style={{ color: '#AAA', fontSize: '12px' }}>
                {result.details.errors.map((e, i) => <div key={i}>{e.id} — {e.error}</div>)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVITY TAB
// ═══════════════════════════════════════════════════════════════════════════════

function ActivityTab({ activity, onRefresh }) {
  const icons = { discovery: '🔎', check: '🔍', purchase: '💰', error: '⚠️', engine: '⚡', alert: '📧', drop: '🔴', warn: '⚠️' };
  return (
    <div>
      <div style={S.sectionHeader}>
        <div>
          <h2 style={S.sectionTitle}>Live Activity Feed ({activity.length})</h2>
          <p style={S.sectionSub}>Real-time log. Auto-refreshes every 10s.</p>
        </div>
        <button onClick={onRefresh} style={S.btnSecondary}>🔄 Refresh</button>
      </div>
      {activity.length === 0 ? (
        <div style={S.emptyState}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>📡</div>
          <h3 style={{ color: '#AAA', margin: '0 0 8px' }}>No activity yet</h3>
        </div>
      ) : (
        <div style={S.list}>
          {activity.map(a => (
            <div key={a.id} style={{ ...S.listItem, padding: '10px 16px' }}>
              <span style={{ fontSize: '16px', marginRight: '10px' }}>{icons[a.type] || '•'}</span>
              <div style={{ flex: 1 }}>
                <span style={{ color: '#DDD', fontSize: '13px' }}>{a.message}</span>
                {a.data?.worker && <span style={{ color: '#888', fontSize: '11px', marginLeft: '8px' }}>{a.data.worker}</span>}
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
  const total = purchases.reduce((sum, p) => sum + (parseFloat(p.price || p.total) || 0), 0);
  const successful = purchases.filter(p => p.status === 'ordered' || p.status === 'cart').length;
  return (
    <div>
      <div style={S.sectionHeader}>
        <div>
          <h2 style={S.sectionTitle}>Purchase History ({purchases.length})</h2>
          <p style={S.sectionSub}>{successful} successful · Total spent: ${total.toFixed(2)}</p>
        </div>
      </div>
      {purchases.length === 0 ? (
        <div style={S.emptyState}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>💰</div>
          <h3 style={{ color: '#AAA', margin: '0 0 8px' }}>No purchases yet</h3>
        </div>
      ) : (
        <div style={S.list}>
          {purchases.map(p => (
            <div key={p.id} style={S.listItem}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ color: '#FFF', fontSize: '14px', fontWeight: '500' }}>{p.product_name}</span>
                  <span style={{ ...S.priorityBadge, ...(p.status === 'ordered' ? S.statusStyles.in_stock : S.statusStyles.watching) }}>{p.status}</span>
                </div>
                <div style={{ color: '#888', fontSize: '12px', marginTop: '4px' }}>
                  {p.retailer} · ${p.price} · {p.account_email} · {timeAgo(p.purchased_at)}
                  {p.checkout_time_ms && ` · ${(p.checkout_time_ms/1000).toFixed(1)}s`}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS TAB — per-retailer configs + email test
// ═══════════════════════════════════════════════════════════════════════════════

function SettingsTab({ configs, onRefresh }) {
  const [testing, setTesting] = useState(false);

  const toggleField = async (retailer, field, value) => {
    await engine.updateRetailerConfig(retailer, { [field]: value });
    onRefresh();
  };

  const updateNum = async (retailer, field, value) => {
    const n = parseInt(value);
    if (isNaN(n)) return;
    await engine.updateRetailerConfig(retailer, { [field]: n });
    onRefresh();
  };

  const testEmail = async () => {
    setTesting(true);
    try {
      await engine.testAlert();
      alert('Test email sent! Check your inbox.');
    } catch (err) {
      alert('Error: ' + err.message);
    }
    setTesting(false);
  };

  return (
    <div>
      <div style={S.sectionHeader}>
        <div>
          <h2 style={S.sectionTitle}>System Settings</h2>
          <p style={S.sectionSub}>Per-retailer configuration. drop_mode = 1.5s polling. auto_purchase = actually buy when in stock.</p>
        </div>
        <button onClick={testEmail} disabled={testing} style={S.btnSecondary}>
          {testing ? '⏳ Sending...' : '📧 Test Email Alert'}
        </button>
      </div>

      {configs.filter(c => ['best_buy', 'target', 'walmart'].includes(c.retailer)).map(c => (
        <div key={c.retailer} style={S.settingsCard}>
          <h3 style={S.settingsCardTitle}>{c.retailer.toUpperCase()}</h3>
          <div style={S.settingsGrid}>
            <ToggleField label="Enabled" value={c.enabled} onChange={v => toggleField(c.retailer, 'enabled', v)} />
            <ToggleField label="Drop Mode (fast polling)" value={c.drop_mode} onChange={v => toggleField(c.retailer, 'drop_mode', v)} danger />
            <ToggleField label="Auto Purchase" value={c.auto_purchase} onChange={v => toggleField(c.retailer, 'auto_purchase', v)} danger />
            <ToggleField label="Loop Checkouts" value={c.loop_checkouts} onChange={v => toggleField(c.retailer, 'loop_checkouts', v)} />
            <div style={S.formGroup}>
              <label style={S.label}>Normal Poll Interval (ms)</label>
              <input style={S.input} type="number" defaultValue={c.poll_interval_ms} onBlur={e => updateNum(c.retailer, 'poll_interval_ms', e.target.value)} />
            </div>
            <div style={S.formGroup}>
              <label style={S.label}>Max Queue Minutes</label>
              <input style={S.input} type="number" defaultValue={c.max_queue_minutes || 30} onBlur={e => updateNum(c.retailer, 'max_queue_minutes', e.target.value)} />
            </div>
            <div style={S.formGroup}>
              <label style={S.label}>Max Checkouts Per Loop</label>
              <input style={S.input} type="number" defaultValue={c.max_checkouts_per_loop || 5} onBlur={e => updateNum(c.retailer, 'max_checkouts_per_loop', e.target.value)} />
            </div>
            <div style={S.formGroup}>
              <label style={S.label}>Checks Today / Purchases Today / Errors</label>
              <div style={{ display: 'flex', gap: '10px', fontSize: '13px', color: '#AAA', paddingTop: '8px' }}>
                <span>✓ {c.checks_today || 0}</span>
                <span style={{ color: '#00D26A' }}>💰 {c.purchases_today || 0}</span>
                <span style={{ color: '#E24B4A' }}>✗ {c.errors_today || 0}</span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ToggleField({ label, value, onChange, danger }) {
  return (
    <div style={S.formGroup}>
      <label style={S.label}>{label}</label>
      <button
        onClick={() => onChange(!value)}
        style={{
          ...S.statusPill,
          ...(value ? (danger ? { backgroundColor: 'rgba(226,75,74,0.15)', color: '#E24B4A' } : S.statusActive) : S.statusPaused),
          padding: '8px 16px',
          width: 'fit-content',
        }}
      >
        {value ? '● ON' : '○ OFF'}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function timeAgo(date) {
  if (!date) return '';
  const s = Math.floor((new Date() - new Date(date)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function formatUptime(seconds) {
  if (!seconds) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function parseKeywordTerm(term) {
  const marker = ' |FILT| ';
  if (!term.includes(marker)) return { baseTerm: term, require: [], exclude: [] };
  const [base, filterStr] = term.split(marker);
  let require = [], exclude = [];
  (filterStr || '').split(';').forEach(part => {
    const [k, v] = part.split(':');
    if (!v) return;
    const words = v.split(',').map(w => w.trim()).filter(Boolean);
    if (k.trim() === 'require') require = words;
    if (k.trim() === 'exclude') exclude = words;
  });
  return { baseTerm: base.trim(), require, exclude };
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// FIND SKUS TAB — keyword search Target / Walmart, build Stellar Tag paste-block
// ═══════════════════════════════════════════════════════════════════════════════

function FindSkusTab({ onRefresh }) {
  const [retailer, setRetailer] = useState('target');
  const [keyword, setKeyword] = useState('');
  const [maxResults, setMaxResults] = useState('25');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [firstPartyOnly, setFirstPartyOnly] = useState(true); // default ON — drop scalpers
  const [buffer, setBuffer] = useState('10'); // % over retail for Stellar MaxPrice
  const [defaultQty, setDefaultQty] = useState('2'); // pre-fill on Save → Watchlist
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(new Set()); // SKUs checked for paste-block
  const [savingSku, setSavingSku] = useState(null); // sku currently being saved
  const [savedSkus, setSavedSkus] = useState(new Set()); // sku → saved badge
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState(''); // transient status

  // URL lookup mode (single product → one row)
  const [urlInput, setUrlInput] = useState('');

  const runSearch = async () => {
    if (!keyword.trim()) {
      setError('Enter a keyword first.');
      return;
    }
    setError('');
    setSearching(true);
    setItems([]);
    setSelected(new Set());
    try {
      const body = {
        retailer,
        keyword: keyword.trim(),
        maxResults: maxResults ? Number(maxResults) : 25,
      };
      if (minPrice) body.minPrice = Number(minPrice);
      if (maxPrice) body.maxPrice = Number(maxPrice);
      if (inStockOnly) body.inStockOnly = true;
      body.firstPartyOnly = firstPartyOnly;
      const resp = await searchSkus(body);
      setItems(resp.items || []);
      // pre-select all results so the paste-block is one click away
      setSelected(new Set((resp.items || []).map(p => p.sku)));
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setSearching(false);
    }
  };

  const runLookup = async () => {
    if (!urlInput.trim()) {
      setError('Paste a Target or Walmart product URL.');
      return;
    }
    setError('');
    setSearching(true);
    try {
      const item = await lookupSku({ url: urlInput.trim() });
      setItems([item]);
      setSelected(new Set([item.sku]));
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setSearching(false);
    }
  };

  const toggle = (sku) => {
    const next = new Set(selected);
    next.has(sku) ? next.delete(sku) : next.add(sku);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map(p => p.sku)));
  };

  const stellarBlock = (() => {
    const buf = (Number(buffer) || 0) / 100;
    return items
      .filter(p => selected.has(p.sku))
      .map(p => {
        const cap = p.price != null ? Math.ceil(p.price * (1 + buf)) : '';
        return `${p.sku};${p.title};${cap}`;
      })
      .join('\n');
  })();

  const copyBlock = async () => {
    if (!stellarBlock) {
      setHint('Select at least one row first.');
      setTimeout(() => setHint(''), 2500);
      return;
    }
    try {
      await navigator.clipboard.writeText(stellarBlock);
      setHint(`Copied ${selected.size} row(s). Paste into Stellar → Tags → Manage SKUs.`);
      setTimeout(() => setHint(''), 4000);
    } catch (e) {
      setHint(`Copy failed: ${e.message}. Use the textarea below.`);
      setTimeout(() => setHint(''), 4000);
    }
  };

  const presets = [
    { label: 'Pokemon TCG sealed', kw: 'pokemon tcg', min: '15', max: '200' },
    { label: 'Topps Chrome', kw: '2025 topps chrome', min: '15', max: '200' },
    { label: 'Bowman 2026', kw: 'bowman 2026', min: '15', max: '200' },
    { label: 'Panini Prizm', kw: 'panini prizm', min: '15', max: '200' },
    { label: 'Ascended Heroes', kw: 'ascended heroes', min: '15', max: '300' },
  ];

  const saveOne = async (p) => {
    setSavingSku(p.sku);
    setError('');
    try {
      const buf = (Number(buffer) || 0) / 100;
      const cap = p.price != null ? Math.ceil(p.price * (1 + buf)) : null;
      const body = {
        retailer,
        sku: p.sku,
        name: p.title || '(untitled)',
        url: p.url || null,
        last_price: p.price ?? null,
        target_price: cap,
        max_quantity: defaultQty ? Number(defaultQty) : 2,
        in_stock: p.inStock === true,
        is_active: true,
        status: 'watching',
      };
      if (retailer === 'target') body.tcin = p.sku;
      await addToWatchlist(body);
      setSavedSkus(prev => new Set(prev).add(p.sku));
      setHint(`Saved ${p.sku} to watchlist.`);
      setTimeout(() => setHint(''), 2500);
    } catch (e) {
      setError(`Save failed: ${e.message || e}`);
    } finally {
      setSavingSku(null);
    }
  };

  return (
    <div>
      <div style={S.sectionHeader}>
        <div>
          <h2 style={S.sectionTitle}>Find SKUs</h2>
          <p style={S.sectionSub}>
            Keyword-search Target (RedSky) or Walmart (via Bright Data Web Unlocker) for sealed sports + TCG product.
            Filter, then copy a Stellar-ready paste-block.
          </p>
        </div>
      </div>

      {/* Form: keyword search */}
      <div style={S.formCard}>
        <div style={S.formGrid}>
          <div style={S.formRow}>
            <div style={{ ...S.formGroup, flex: '0 0 auto' }}>
              <label style={S.label}>Retailer</label>
              <div style={S.chipGroup}>
                {['target', 'walmart'].map(r => (
                  <button
                    key={r}
                    style={{ ...S.chip, ...(retailer === r ? S.chipActive : {}) }}
                    onClick={() => setRetailer(r)}
                  >
                    {r === 'target' ? '🎯 Target' : '🛒 Walmart'}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ ...S.formGroup, flex: 3 }}>
              <label style={S.label}>Keyword</label>
              <input
                style={S.input}
                placeholder='e.g. "ascended heroes" or "topps chrome 2025"'
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') runSearch(); }}
              />
              <div style={{ ...S.chipGroup, marginTop: '6px' }}>
                {presets.map(p => (
                  <button
                    key={p.kw}
                    style={{ ...S.chip, fontSize: '11px' }}
                    onClick={() => { setKeyword(p.kw); setMinPrice(p.min); setMaxPrice(p.max); }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={S.formRow}>
            <div style={S.formGroup}>
              <label style={S.label}>Max Results</label>
              <input style={S.input} type="number" value={maxResults}
                onChange={e => setMaxResults(e.target.value)} placeholder="25" />
            </div>
            <div style={S.formGroup}>
              <label style={S.label}>Min Price ($)</label>
              <input style={S.input} type="number" value={minPrice}
                onChange={e => setMinPrice(e.target.value)} placeholder="(any)" />
            </div>
            <div style={S.formGroup}>
              <label style={S.label}>Max Price ($)</label>
              <input style={S.input} type="number" value={maxPrice}
                onChange={e => setMaxPrice(e.target.value)} placeholder="(any)" />
            </div>
            <div style={S.formGroup}>
              <label style={S.label}>Stellar Cap Buffer (%)</label>
              <input style={S.input} type="number" value={buffer}
                onChange={e => setBuffer(e.target.value)} placeholder="10" />
              <span style={S.hint}>MaxPrice in paste-block = ceil(retail × (1 + buffer))</span>
            </div>
            <div style={S.formGroup}>
              <label style={S.label}>Default Qty (Save)</label>
              <input style={S.input} type="number" value={defaultQty}
                onChange={e => setDefaultQty(e.target.value)} placeholder="2" />
              <span style={S.hint}>Walmart cap=5, Target cap=2</span>
            </div>
            <div style={{ ...S.formGroup, flex: '0 0 auto', alignSelf: 'flex-end' }}>
              <label style={{ ...S.label, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={firstPartyOnly}
                  onChange={e => setFirstPartyOnly(e.target.checked)} />
                Retailer-owned only (no 3P)
              </label>
              <label style={{ ...S.label, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '6px' }}>
                <input type="checkbox" checked={inStockOnly}
                  onChange={e => setInStockOnly(e.target.checked)} />
                In-stock only
              </label>
            </div>
          </div>

          <div style={S.formActions}>
            <button style={S.btnPrimary} onClick={runSearch} disabled={searching}>
              {searching ? '…searching' : 'Search'}
            </button>
            <button style={S.btnSecondary} onClick={() => { setItems([]); setSelected(new Set()); setError(''); }}>
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Form: single URL lookup */}
      <div style={{ ...S.formCard, marginTop: '12px' }}>
        <div style={S.formRow}>
          <div style={{ ...S.formGroup, flex: 4 }}>
            <label style={S.label}>Or paste a single product URL</label>
            <input
              style={S.input}
              placeholder="https://www.target.com/p/-/A-95163305  or  https://www.walmart.com/ip/19979958847"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') runLookup(); }}
            />
          </div>
          <div style={{ ...S.formGroup, flex: '0 0 auto', alignSelf: 'flex-end' }}>
            <button style={S.btnSecondary} onClick={runLookup} disabled={searching}>Lookup</button>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ marginTop: '12px', padding: '12px 16px', backgroundColor: 'rgba(226,75,74,0.1)', border: '1px solid rgba(226,75,74,0.3)', borderRadius: '8px', color: '#E24B4A', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* Results */}
      {items.length > 0 && (
        <>
          <div style={{ ...S.bulkBar, marginTop: '16px' }}>
            <span>{selected.size} of {items.length} selected</span>
            <button style={S.btnSecondary} onClick={toggleAll}>
              {selected.size === items.length ? 'Deselect all' : 'Select all'}
            </button>
            <button style={S.btnPrimary} onClick={copyBlock}>
              📋 Copy Stellar Tag block
            </button>
            {hint && <span style={{ color: '#00D26A', fontSize: '12px' }}>{hint}</span>}
          </div>

          <div style={{ overflowX: 'auto', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <th style={{ padding: '12px 14px', textAlign: 'left', color: '#888', fontWeight: '500', width: '40px' }}>
                    <input type="checkbox" checked={selected.size === items.length && items.length > 0} onChange={toggleAll} />
                  </th>
                  <th style={{ padding: '12px 14px', textAlign: 'left', color: '#888', fontWeight: '500' }}>SKU</th>
                  <th style={{ padding: '12px 14px', textAlign: 'left', color: '#888', fontWeight: '500' }}>Title</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right', color: '#888', fontWeight: '500' }}>Retail</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right', color: '#888', fontWeight: '500' }}>Stellar Cap</th>
                  <th style={{ padding: '12px 14px', textAlign: 'center', color: '#888', fontWeight: '500' }}>Seller</th>
                  <th style={{ padding: '12px 14px', textAlign: 'center', color: '#888', fontWeight: '500' }}>Stock</th>
                  <th style={{ padding: '12px 14px', textAlign: 'center', color: '#888', fontWeight: '500' }}>Save</th>
                  <th style={{ padding: '12px 14px', textAlign: 'center', color: '#888', fontWeight: '500' }}>Link</th>
                </tr>
              </thead>
              <tbody>
                {items.map(p => {
                  const buf = (Number(buffer) || 0) / 100;
                  const cap = p.price != null ? Math.ceil(p.price * (1 + buf)) : null;
                  const stockColor = p.inStock === true ? '#00D26A' : p.inStock === false ? '#666' : '#888';
                  return (
                    <tr key={p.sku} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '10px 14px' }}>
                        <input type="checkbox" checked={selected.has(p.sku)} onChange={() => toggle(p.sku)} />
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#AAA' }}>{p.sku}</td>
                      <td style={{ padding: '10px 14px', color: '#FFF' }}>{p.title || '(no title)'}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: '#FFF' }}>
                        {p.price != null ? `$${p.price.toFixed(2)}` : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: '#00D26A' }}>
                        {cap != null ? `$${cap}` : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        {p.firstParty === true ? (
                          <span style={{ ...S.statusBadge, ...S.statusActive }}>1P</span>
                        ) : p.firstParty === false ? (
                          <span style={{ ...S.statusBadge, backgroundColor: 'rgba(239,159,39,0.15)', color: '#EF9F27' }}
                                title={p.sellerName || '3P seller'}>3P</span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', color: stockColor, fontWeight: '600' }}>
                        {p.inStock === true ? 'IN STOCK' : p.inStock === false ? 'out' : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        {savedSkus.has(p.sku) ? (
                          <span style={{ ...S.statusBadge, ...S.statusActive }}>✓ saved</span>
                        ) : (
                          <button
                            style={{ ...S.btnSecondary, padding: '4px 10px', fontSize: '11px' }}
                            disabled={savingSku === p.sku}
                            onClick={() => saveOne(p)}
                            title="Add to Watchlist"
                          >
                            {savingSku === p.sku ? '…' : '💾 Save'}
                          </button>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        {p.url && <a href={p.url} target="_blank" rel="noreferrer" style={S.linkColor}>↗</a>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Read-only paste-block preview */}
          <div style={{ marginTop: '14px' }}>
            <label style={S.label}>Paste-block preview (copies above button writes this to clipboard)</label>
            <textarea
              readOnly
              value={stellarBlock || '(select rows to preview)'}
              style={{ ...S.input, height: '120px', fontFamily: 'monospace', fontSize: '12px', resize: 'vertical' }}
            />
            <span style={S.hint}>
              Format: <code>SKU;Title;MaxPrice</code> per line. Paste into Stellar → Tags → choose retailer Tag → Manage SKUs.
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Manual paste parsing — extract retailer SKU + name + price + URL from a
// pasted Discord message (typical Poke Alerts format) on the client side.
// Same regex as the server-side webhook receiver, kept in sync.
// ═══════════════════════════════════════════════════════════════════════════════

const PASTE_HOST_PATTERNS = {
  walmart: /walmart\.com/i,
  target: /target\.com/i,
  bestbuy: /bestbuy\.com/i,
  costco: /costco\.com/i,
  samsclub: /samsclub\.com/i,
  topps: /topps\.com/i,
};

function pasteExtractSku(retailer, url) {
  if (!url) return null;
  if (retailer === 'walmart') return url.match(/walmart\.com\/ip\/(?:[^/]+\/)?(\d+)/i)?.[1] || null;
  if (retailer === 'target') return url.match(/target\.com\/p\/[^/]*\/-?\/?A-(\d+)/i)?.[1] || null;
  if (retailer === 'bestbuy') return url.match(/skuId=(\d+)/i)?.[1]
    || url.match(/bestbuy\.com\/site\/[^/]+\/(\d+)\.p/i)?.[1] || null;
  if (retailer === 'costco') return url.match(/costco\.com\/[^/]+\.product\.(\d+)/i)?.[1]
    || url.match(/costco\.com\/.*-(\d+)\.html/i)?.[1] || null;
  if (retailer === 'samsclub') return url.match(/samsclub\.com\/p\/[^/]+\/P?(\d+)/i)?.[1] || null;
  if (retailer === 'topps') return url.match(/topps\.com\/products\/([a-zA-Z0-9_\-%]+)/i)?.[1] || null;
  return null;
}

function pasteExtractFromText(retailer, text) {
  if (!text) return null;
  const hostRe = PASTE_HOST_PATTERNS[retailer];
  if (!hostRe) return null;
  // Find URL containing retailer host
  const urlRe = new RegExp(`https?://[^\\s)\\]>]*${hostRe.source.replace(/\\\./g, '\\.')}[^\\s)\\]>]*`, 'i');
  const url = text.match(urlRe)?.[0]?.replace(/[.,;:!?]+$/, '') || null;
  const sku = pasteExtractSku(retailer, url);
  if (!sku) return null;

  const priceMatch = text.match(/\$\s*(\d{1,5}(?:\.\d{2})?)/);
  const limitMatch = text.match(/limit[:\s]+(\d+)/i) || text.match(/max[:\s]+(\d+)/i);

  // Title heuristic: first non-trivial line that isn't a URL or "@everyone"
  // or status emoji-only.
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let name = null;
  for (const l of lines) {
    if (urlRe.test(l)) continue;
    if (/^@\w+/.test(l)) continue;
    if (/^[\W_]+$/.test(l)) continue;
    if (l.length < 8) continue;
    name = l.slice(0, 200);
    break;
  }

  return {
    sku,
    url,
    name,
    price: priceMatch ? Number(priceMatch[1]) : null,
    quantity: limitMatch ? Number(limitMatch[1]) : null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// WATCHLIST TAB — saved products from Find SKUs; edit max price/qty, status, remove
// ═══════════════════════════════════════════════════════════════════════════════

function WatchlistTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterRetailer, setFilterRetailer] = useState('all');
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({ target_price: '', max_quantity: '', notes: '' });

  // Manual paste UI state
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteRetailer, setPasteRetailer] = useState('walmart');
  const [pasteText, setPasteText] = useState('');
  const [pastePreview, setPastePreview] = useState(null);
  const [pasteError, setPasteError] = useState('');
  const [pasteSaving, setPasteSaving] = useState(false);

  // Re-parse preview whenever text or retailer changes
  useEffect(() => {
    setPasteError('');
    if (!pasteText.trim()) { setPastePreview(null); return; }
    const p = pasteExtractFromText(pasteRetailer, pasteText);
    setPastePreview(p);
    if (!p) setPasteError(`Couldn't find a ${pasteRetailer}.com product URL in the pasted text.`);
  }, [pasteText, pasteRetailer]);

  const submitPaste = async () => {
    if (!pastePreview) return;
    setPasteSaving(true);
    setPasteError('');
    try {
      const item = {
        retailer: pasteRetailer,
        sku: pastePreview.sku,
        name: pastePreview.name || null,
        url: pastePreview.url || null,
        last_price: pastePreview.price ?? null,
        max_quantity: pastePreview.quantity ?? null,
        status: 'detected',
        in_stock: true,
        is_active: true,
        notes: `Manual paste from Poke Alerts\n---\n${pasteText.slice(0, 800)}`,
      };
      await addToWatchlist(item);
      setPasteText('');
      setPastePreview(null);
      await load();
    } catch (e) {
      setPasteError(e.message || String(e));
    } finally {
      setPasteSaving(false);
    }
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const r = await getWatchlist();
      setItems(r.items || []);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const startEdit = (it) => {
    setEditingId(it.id);
    setDraft({
      target_price: it.target_price ?? '',
      max_quantity: it.max_quantity ?? '',
      notes: it.notes ?? '',
    });
  };

  const saveEdit = async () => {
    try {
      const fields = {
        target_price: draft.target_price === '' ? null : Number(draft.target_price),
        max_quantity: draft.max_quantity === '' ? null : Number(draft.max_quantity),
        notes: draft.notes || null,
      };
      await updateWatchlistItem(editingId, fields);
      setEditingId(null);
      await load();
    } catch (e) {
      setError(e.message || String(e));
    }
  };

  const remove = async (id) => {
    if (!confirm('Remove from watchlist?')) return;
    try {
      await removeFromWatchlist(id);
      await load();
    } catch (e) {
      setError(e.message || String(e));
    }
  };

  const filtered = filterRetailer === 'all'
    ? items
    : items.filter(it => it.retailer === filterRetailer);

  const statusColor = (s, inStock) => {
    if (inStock) return { bg: 'rgba(0,210,106,0.15)', color: '#00D26A', label: 'IN STOCK' };
    if (s === 'purchased') return { bg: 'rgba(0,210,106,0.25)', color: '#00D26A', label: 'PURCHASED' };
    if (s === 'detected') return { bg: 'rgba(239,159,39,0.15)', color: '#EF9F27', label: 'DETECTED' };
    if (s === 'inventory_loaded') return { bg: 'rgba(161,124,246,0.15)', color: '#A17CF6', label: 'INV LOADED' };
    return { bg: 'rgba(255,255,255,0.05)', color: '#888', label: 'WATCHING' };
  };

  return (
    <div>
      <div style={S.sectionHeader}>
        <div>
          <h2 style={S.sectionTitle}>Watchlist</h2>
          <p style={S.sectionSub}>
            Products saved from Find SKUs. Set a max price + target quantity per item.
            Polling worker (next deploy) will track inventory + alert on stock changes.
          </p>
        </div>
        <div>
          <button style={S.btnSecondary} onClick={load} disabled={loading}>
            {loading ? '…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Manual paste from Poke Alerts (or any restock alert source) */}
      <div style={{ ...S.settingsCard, marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
             onClick={() => setPasteOpen(!pasteOpen)}>
          <div>
            <div style={{ color: '#FFF', fontSize: '14px', fontWeight: '600' }}>📋 Manual paste from alert</div>
            <div style={{ color: '#888', fontSize: '11px' }}>Paste a Discord message (Poke Alerts, etc.) — extract retailer SKU + URL + price + name → save to watchlist.</div>
          </div>
          <button style={S.btnSecondary}>{pasteOpen ? 'Hide' : 'Open'}</button>
        </div>

        {pasteOpen && (
          <div style={{ marginTop: '14px' }}>
            <div style={{ marginBottom: '10px' }}>
              <label style={S.label}>Retailer</label>
              <div style={S.chipGroup}>
                {['walmart','target','bestbuy','costco','samsclub','topps'].map(r => (
                  <button key={r} onClick={() => setPasteRetailer(r)}
                          style={{ ...S.chip, ...(pasteRetailer === r ? S.chipActive : {}) }}>
                    {r.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <label style={S.label}>Pasted message text (copy from Discord)</label>
            <textarea style={{ ...S.input, minHeight: '120px', fontFamily: 'monospace', fontSize: '12px' }}
                      placeholder="Paste the entire Discord message here — including the embed title and URL. The form parses it client-side and shows what'll be saved."
                      value={pasteText}
                      onChange={e => setPasteText(e.target.value)} />

            {pastePreview && (
              <div style={{ marginTop: '12px', padding: '12px', background: 'rgba(0,210,106,0.06)', border: '1px solid rgba(0,210,106,0.2)', borderRadius: '8px' }}>
                <div style={{ color: '#00D26A', fontSize: '12px', fontWeight: '600', marginBottom: '6px' }}>✓ Parsed</div>
                <div style={{ color: '#FFF', fontSize: '13px' }}>{pastePreview.name || '(no name extracted)'}</div>
                <div style={{ color: '#AAA', fontSize: '11px', marginTop: '4px', fontFamily: 'monospace' }}>
                  {pasteRetailer} / {pastePreview.sku}
                  {pastePreview.price != null ? ` / $${pastePreview.price}` : ''}
                  {pastePreview.quantity != null ? ` / limit ${pastePreview.quantity}` : ''}
                </div>
                {pastePreview.url && <a href={pastePreview.url} target="_blank" rel="noreferrer" style={{ color: '#378ADD', fontSize: '11px', wordBreak: 'break-all' }}>{pastePreview.url}</a>}
              </div>
            )}

            {pasteError && (
              <div style={{ marginTop: '10px', color: '#E24B4A', fontSize: '12px' }}>{pasteError}</div>
            )}

            <div style={{ marginTop: '12px', display: 'flex', gap: '10px' }}>
              <button style={{ ...S.btnPrimary, opacity: pastePreview && !pasteSaving ? 1 : 0.4, cursor: pastePreview && !pasteSaving ? 'pointer' : 'not-allowed' }}
                      onClick={submitPaste}
                      disabled={!pastePreview || pasteSaving}>
                {pasteSaving ? 'Saving…' : '💾 Save to watchlist'}
              </button>
              <button style={S.btnSecondary} onClick={() => { setPasteText(''); setPastePreview(null); setPasteError(''); }}>Clear</button>
            </div>
          </div>
        )}
      </div>

      <div style={S.filterBar}>
        <select style={S.input} value={filterRetailer} onChange={e => setFilterRetailer(e.target.value)}>
          <option value="all">All retailers ({items.length})</option>
          <option value="walmart">Walmart ({items.filter(i => i.retailer === 'walmart').length})</option>
          <option value="target">Target ({items.filter(i => i.retailer === 'target').length})</option>
          <option value="bestbuy">Best Buy ({items.filter(i => i.retailer === 'bestbuy').length})</option>
          <option value="costco">Costco ({items.filter(i => i.retailer === 'costco').length})</option>
          <option value="samsclub">Sam's Club ({items.filter(i => i.retailer === 'samsclub').length})</option>
          <option value="topps">Topps ({items.filter(i => i.retailer === 'topps').length})</option>
        </select>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', backgroundColor: 'rgba(226,75,74,0.1)', border: '1px solid rgba(226,75,74,0.3)', borderRadius: '8px', color: '#E24B4A', fontSize: '13px', marginBottom: '12px' }}>
          {error}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div style={S.emptyState}>
          <p style={{ color: '#888', margin: 0 }}>No products on the watchlist.</p>
          <p style={{ color: '#666', margin: '8px 0 0', fontSize: '12px' }}>
            Use the <strong>Find SKUs</strong> tab to search and click <strong>💾 Save</strong> to add products here.
          </p>
        </div>
      )}

      {filtered.length > 0 && (
        <div style={{ overflowX: 'auto', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <th style={{ padding: '12px 14px', textAlign: 'left', color: '#888', fontWeight: '500' }}>Retailer</th>
                <th style={{ padding: '12px 14px', textAlign: 'left', color: '#888', fontWeight: '500' }}>SKU</th>
                <th style={{ padding: '12px 14px', textAlign: 'left', color: '#888', fontWeight: '500' }}>Title</th>
                <th style={{ padding: '12px 14px', textAlign: 'right', color: '#888', fontWeight: '500' }}>Last $</th>
                <th style={{ padding: '12px 14px', textAlign: 'right', color: '#888', fontWeight: '500' }}>Max $</th>
                <th style={{ padding: '12px 14px', textAlign: 'right', color: '#888', fontWeight: '500' }}>Qty</th>
                <th style={{ padding: '12px 14px', textAlign: 'center', color: '#888', fontWeight: '500' }}>Status</th>
                <th style={{ padding: '12px 14px', textAlign: 'center', color: '#888', fontWeight: '500' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(it => {
                const sc = statusColor(it.status, it.in_stock);
                const isEditing = editingId === it.id;
                return (
                  <tr key={it.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '10px 14px', color: '#AAA' }}>
                      {it.retailer}
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#AAA' }}>
                      {it.url ? <a href={it.url} target="_blank" rel="noreferrer" style={S.linkColor}>{it.sku}</a> : it.sku}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#FFF' }}>
                      {it.name || '(no title)'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#FFF' }}>
                      {it.last_price != null ? `$${Number(it.last_price).toFixed(2)}` : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      {isEditing ? (
                        <input style={{ ...S.inputSmall, width: '70px', textAlign: 'right' }}
                          type="number" value={draft.target_price}
                          onChange={e => setDraft(d => ({ ...d, target_price: e.target.value }))} />
                      ) : (
                        <span style={{ color: '#00D26A' }}>
                          {it.target_price != null ? `$${it.target_price}` : '—'}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      {isEditing ? (
                        <input style={{ ...S.inputSmall, width: '50px', textAlign: 'right' }}
                          type="number" value={draft.max_quantity}
                          onChange={e => setDraft(d => ({ ...d, max_quantity: e.target.value }))} />
                      ) : (
                        <span style={{ color: '#FFF' }}>{it.max_quantity ?? '—'}</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <span style={{ ...S.statusBadge, backgroundColor: sc.bg, color: sc.color }}>
                        {sc.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      {isEditing ? (
                        <>
                          <button style={{ ...S.btnPrimary, padding: '4px 10px', fontSize: '11px', marginRight: '4px' }}
                            onClick={saveEdit}>Save</button>
                          <button style={{ ...S.btnSecondary, padding: '4px 10px', fontSize: '11px' }}
                            onClick={() => setEditingId(null)}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <button style={{ ...S.btnSecondary, padding: '4px 10px', fontSize: '11px', marginRight: '4px' }}
                            onClick={() => startEdit(it)}>Edit</button>
                          <button style={S.deleteBtn} onClick={() => remove(it.id)} title="Remove">×</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DropsTab — schedule drops, generate JSON config for stellar-deploy-tasks.js,
// preview the resulting Stellar tasks before deployment.
// ═══════════════════════════════════════════════════════════════════════════════

const KNOWN_ACCOUNTS = {
  walmart: ['Cnation Walmart Primary', 'Cnation Walmart Secondary'],
  target: ['Cnation Target Primary'],
  bestbuy: [], // populate after Stellar Best Buy profiles are created
  costco: [],  // populate after Stellar Costco profiles are created
  samsclub: [], // populate after Stellar Sam's Club profiles are created
  topps: [], // Topps not in Stellar; monitor-only via dropwatch + manual purchase
};

function DropsTab() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [retailer, setRetailer] = useState('walmart');
  const [mode, setMode] = useState('normal');
  const [groupName, setGroupName] = useState('Cnation Walmart Standing-Watch');
  const [appendToExisting, setAppendToExisting] = useState(true);
  const [selectedSkus, setSelectedSkus] = useState({});
  const [selectedAccounts, setSelectedAccounts] = useState(KNOWN_ACCOUNTS.walmart);
  const [delay, setDelay] = useState(1000);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getWatchlist().then(r => setItems(r.items || [])).catch(e => setError(e.message));
  }, []);

  // Reset accounts when retailer changes
  useEffect(() => {
    setSelectedAccounts(KNOWN_ACCOUNTS[retailer] || []);
    const groupNames = {
      walmart: 'Cnation Walmart Standing-Watch',
      target: 'Cnation Target Standing-Watch',
      bestbuy: 'Cnation Best Buy Standing-Watch',
      costco: 'Cnation Costco Standing-Watch',
      samsclub: 'Cnation Sam\'s Club Standing-Watch',
      topps: 'Cnation Topps Watch',
    };
    setGroupName(groupNames[retailer] || 'Cnation Watch');
  }, [retailer]);

  const filtered = items.filter(it => it.retailer === retailer && it.is_active);

  const toggleSku = (id) => {
    setSelectedSkus(prev => {
      const next = { ...prev };
      if (next[id]) delete next[id]; else next[id] = { qty: 5, maxPrice: '' };
      return next;
    });
  };

  const updateSkuField = (id, field, value) => {
    setSelectedSkus(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const toggleAccount = (acct) => {
    setSelectedAccounts(prev => prev.includes(acct) ? prev.filter(a => a !== acct) : [...prev, acct]);
  };

  const config = {
    groupName,
    appendToExistingGroup: appendToExisting ? groupName : null,
    retailer,
    mode,
    delay: Number(delay) || 1000,
    skus: filtered
      .filter(it => selectedSkus[it.id])
      .map(it => ({
        sku: it.sku,
        name: (it.name || it.sku).slice(0, 80),
        maxPrice: Number(selectedSkus[it.id].maxPrice || it.target_price || 0),
        qty: Number(selectedSkus[it.id].qty || it.max_quantity || 5),
      })),
    accounts: selectedAccounts,
  };

  const valid = config.skus.length > 0 && config.accounts.length > 0 && config.skus.every(s => s.maxPrice > 0);
  const taskCount = config.skus.length * (1 + config.accounts.length); // 1 monitor + N normal/fast per SKU

  const configJson = JSON.stringify(config, null, 2);
  const cliCmd = `cd ~/Documents/dropwatch && node scripts/stellar-deploy-tasks.js /tmp/drop-config.json`;
  const fullCmd = `cat > /tmp/drop-config.json <<'EOF'\n${configJson}\nEOF\n${cliCmd}`;

  const copy = (txt) => {
    navigator.clipboard.writeText(txt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const download = () => {
    const blob = new Blob([configJson], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `drop-${retailer}-${Date.now()}.json`;
    a.click();
  };

  return (
    <div>
      <div style={S.sectionHeader}>
        <div>
          <h2 style={S.sectionTitle}>Drops</h2>
          <p style={S.sectionSub}>
            Schedule a drop. Generates a config that <code>stellar-deploy-tasks.js</code> turns into Monitor + Fast/Normal tasks
            in Stellar AIO. <strong>Stellar must be quit</strong> before running the deploy command (LevelDB lock).
          </p>
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: 'rgba(226,75,74,0.1)', color: '#E24B4A', borderRadius: '8px', marginBottom: '16px' }}>{error}</div>
      )}

      {/* Drop config form */}
      <div style={S.settingsCard}>
        <h3 style={S.settingsCardTitle}>Drop config</h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
          <div>
            <label style={S.label}>Retailer</label>
            <div style={S.chipGroup}>
              {['walmart', 'target', 'bestbuy', 'costco', 'samsclub', 'topps'].map(r => (
                <button key={r} onClick={() => setRetailer(r)} style={{ ...S.chip, ...(retailer === r ? S.chipActive : {}) }}>{r.toUpperCase()}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={S.label}>Mode (queue drop = normal)</label>
            <div style={S.chipGroup}>
              {['normal', 'fast'].map(m => (
                <button key={m} onClick={() => setMode(m)} style={{ ...S.chip, ...(mode === m ? S.chipActive : {}) }}>{m}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={S.label}>Delay between actions (ms)</label>
            <input style={S.input} type="number" value={delay} onChange={e => setDelay(e.target.value)} />
          </div>
          <div>
            <label style={S.label}>Stellar task group name</label>
            <input style={S.input} value={groupName} onChange={e => setGroupName(e.target.value)} />
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', color: '#AAA', fontSize: '11px' }}>
              <input type="checkbox" checked={appendToExisting} onChange={e => setAppendToExisting(e.target.checked)} />
              Append to existing group (vs. create new)
            </label>
          </div>
        </div>
      </div>

      {/* SKU selection */}
      <div style={S.settingsCard}>
        <h3 style={S.settingsCardTitle}>SKUs from watchlist ({filtered.length} {retailer})</h3>
        {filtered.length === 0 ? (
          <p style={{ color: '#666' }}>No active watchlist items for {retailer}. Add some via Find SKUs → Save.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filtered.map(it => {
              const sel = selectedSkus[it.id];
              return (
                <div key={it.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 100px 70px', gap: '12px', alignItems: 'center', padding: '8px', background: sel ? 'rgba(0,210,106,0.05)' : 'transparent', borderRadius: '8px' }}>
                  <input type="checkbox" checked={!!sel} onChange={() => toggleSku(it.id)} />
                  <div>
                    <div style={{ color: '#FFF', fontSize: '13px' }}>{it.name || it.sku}</div>
                    <div style={{ color: '#666', fontSize: '11px', fontFamily: 'monospace' }}>{it.sku}</div>
                  </div>
                  <input style={S.inputSmall} placeholder={`Max $ (${it.target_price ?? '?'})`} value={sel?.maxPrice ?? ''} onChange={e => updateSkuField(it.id, 'maxPrice', e.target.value)} disabled={!sel} />
                  <input style={S.inputSmall} placeholder="Qty" value={sel?.qty ?? ''} onChange={e => updateSkuField(it.id, 'qty', e.target.value)} disabled={!sel} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Account selection */}
      <div style={S.settingsCard}>
        <h3 style={S.settingsCardTitle}>Accounts</h3>
        <div style={S.chipGroup}>
          {(KNOWN_ACCOUNTS[retailer] || []).map(acct => (
            <button key={acct} onClick={() => toggleAccount(acct)} style={{ ...S.chip, ...(selectedAccounts.includes(acct) ? S.chipActive : {}) }}>{acct}</button>
          ))}
          {(KNOWN_ACCOUNTS[retailer] || []).length === 0 && (
            <p style={{ color: '#666', fontSize: '12px', margin: 0 }}>{retailer === 'topps' ? 'Topps not supported in Stellar — use dropwatch monitoring + manual purchase.' : 'No accounts configured.'}</p>
          )}
        </div>
      </div>

      {/* Preview + deploy */}
      {valid && (
        <div style={S.settingsCard}>
          <h3 style={S.settingsCardTitle}>Preview ({taskCount} tasks: {config.skus.length} monitors + {config.skus.length * config.accounts.length} {mode})</h3>
          <pre style={{ background: 'rgba(0,0,0,0.5)', padding: '12px', borderRadius: '8px', color: '#A17CF6', fontSize: '11px', overflow: 'auto', maxHeight: '300px' }}>{configJson}</pre>

          <div style={{ display: 'flex', gap: '10px', marginTop: '14px', flexWrap: 'wrap' }}>
            <button style={S.btnPrimary} onClick={() => copy(fullCmd)}>{copied ? '✅ Copied!' : '📋 Copy deploy command'}</button>
            <button style={S.btnSecondary} onClick={download}>💾 Download JSON</button>
            <button style={S.btnSecondary} onClick={() => copy(configJson)}>Copy JSON only</button>
          </div>

          <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(239,159,39,0.08)', border: '1px solid rgba(239,159,39,0.2)', borderRadius: '8px', color: '#EF9F27', fontSize: '12px' }}>
            <strong>To deploy:</strong> Quit Stellar AIO (Cmd+Q), then paste the copied command into Terminal. Tasks will appear in Stellar's <code>{groupName}</code> group when you relaunch.
          </div>

          {/* Pre-flight checklist reminder */}
          <details style={{ marginTop: '14px' }}>
            <summary style={{ cursor: 'pointer', color: '#A17CF6', fontSize: '12px' }}>Pre-flight checklist (review before drop time)</summary>
            <ul style={{ color: '#AAA', fontSize: '12px', marginTop: '8px', paddingLeft: '20px' }}>
              <li>Proxy: Stellar uses Bright Data Residential (verified 2026-04-29 as US ASNs: AT&amp;T, Cablevision, CenturyLink). NOT Decodo ISP.</li>
              <li>Cookies: ≤ 2 hrs old. Run <code>scripts/stellar-patch-cookies.js</code> if older.</li>
              <li>Fast vs Normal: Walmart queue drops = <strong>normal</strong> mode (Fast Mode loses to queue).</li>
              <li>Each profile has "One Checkout Per Profile" toggle ON (verified per profile).</li>
              <li>Start tasks ~2-3 min before drop opens. Do not fire at drop time.</li>
              <li>Stop the drop if 10+ consecutive 456 errors — proxy is dead.</li>
            </ul>
          </details>
        </div>
      )}
    </div>
  );
}

const S = {
  container: { minHeight: '100vh', backgroundColor: '#0A0A0B', color: '#FFF', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  headerLeft: { display: 'flex', alignItems: 'center' },
  headerCenter: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
  headerRight: { display: 'flex', alignItems: 'center' },
  logo: { fontSize: '18px', fontWeight: '700', color: '#FFF', margin: 0, display: 'flex', alignItems: 'center' },
  badge: { marginLeft: '10px', padding: '2px 8px', borderRadius: '4px', backgroundColor: '#E24B4A', color: '#FFF', fontSize: '10px', fontWeight: '700' },
  backLink: { color: '#888', textDecoration: 'none', fontSize: '13px' },
  enginePill: { padding: '4px 12px', borderRadius: '12px', fontSize: '11px', fontWeight: '600' },
  engineOnline: { backgroundColor: 'rgba(0,210,106,0.15)', color: '#00D26A' },
  engineOffline: { backgroundColor: 'rgba(226,75,74,0.15)', color: '#E24B4A' },
  statBadge: { padding: '4px 10px', borderRadius: '12px', backgroundColor: 'rgba(255,255,255,0.06)', color: '#888', fontSize: '11px' },
  tabs: { display: 'flex', gap: '2px', padding: '0 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.02)', overflowX: 'auto' },
  tab: { padding: '12px 20px', border: 'none', backgroundColor: 'transparent', color: '#888', fontSize: '13px', cursor: 'pointer', borderBottom: '2px solid transparent', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' },
  tabActive: { color: '#FFF', borderBottomColor: '#00D26A', backgroundColor: 'rgba(0,210,106,0.05)' },
  main: { padding: '24px', maxWidth: '1300px', margin: '0 auto' },
  loadingState: { textAlign: 'center', padding: '60px', color: '#666' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', gap: '16px', flexWrap: 'wrap' },
  sectionTitle: { margin: 0, color: '#FFF', fontSize: '18px', fontWeight: '600' },
  sectionSub: { margin: '4px 0 0', color: '#888', fontSize: '13px' },
  emptyState: { textAlign: 'center', padding: '60px 20px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.1)' },
  list: { display: 'flex', flexDirection: 'column', gap: '6px' },
  listItem: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px' },
  filterBar: { display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' },
  bulkBar: { display: 'flex', gap: '10px', marginBottom: '16px', padding: '10px 16px', backgroundColor: 'rgba(0,210,106,0.1)', border: '1px solid rgba(0,210,106,0.3)', borderRadius: '8px', alignItems: 'center', flexWrap: 'wrap' },
  formCard: { backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '20px', marginBottom: '20px' },
  formGrid: { display: 'flex', flexDirection: 'column', gap: '14px' },
  formRow: { display: 'flex', gap: '12px', flexWrap: 'wrap' },
  formGroup: { flex: 1, minWidth: '150px' },
  formActions: { display: 'flex', gap: '8px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.06)' },
  label: { display: 'block', color: '#AAA', fontSize: '12px', marginBottom: '6px', fontWeight: '500' },
  input: { width: '100%', padding: '9px 12px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: '#FFF', fontSize: '13px', outline: 'none', boxSizing: 'border-box' },
  inputSmall: { padding: '5px 8px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', color: '#FFF', fontSize: '11px', outline: 'none' },
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
  statusBadge: { padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase' },
  priorities: {
    low: { backgroundColor: 'rgba(255,255,255,0.05)', color: '#666' },
    normal: { backgroundColor: 'rgba(55,138,221,0.15)', color: '#378ADD' },
    high: { backgroundColor: 'rgba(239,159,39,0.15)', color: '#EF9F27' },
    critical: { backgroundColor: 'rgba(226,75,74,0.15)', color: '#E24B4A' },
  },
  statusStyles: {
    watching: { backgroundColor: 'rgba(255,255,255,0.05)', color: '#888' },
    detected: { backgroundColor: 'rgba(239,159,39,0.15)', color: '#EF9F27' },
    in_stock: { backgroundColor: 'rgba(0,210,106,0.15)', color: '#00D26A' },
    coming_soon: { backgroundColor: 'rgba(161,124,246,0.15)', color: '#A17CF6' },
    purchased: { backgroundColor: 'rgba(0,210,106,0.25)', color: '#00D26A' },
  },
  filterBadgeReq: { padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '500', backgroundColor: 'rgba(0,210,106,0.1)', color: '#00D26A', fontFamily: 'monospace' },
  filterBadgeExc: { padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '500', backgroundColor: 'rgba(226,75,74,0.1)', color: '#E24B4A', fontFamily: 'monospace' },
  settingsCard: { backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '20px', marginBottom: '16px' },
  settingsCardTitle: { color: '#FFF', fontSize: '15px', fontWeight: '600', margin: '0 0 16px' },
  settingsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' },
  linkColor: { color: '#378ADD', textDecoration: 'none' },
  modalOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' },
  modalCard: { backgroundColor: '#151520', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px', padding: '24px', maxWidth: '520px', width: '100%', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' },
  stepList: { display: 'flex', flexDirection: 'column', gap: '2px', padding: '8px 0' },
};
