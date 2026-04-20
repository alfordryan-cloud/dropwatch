import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { engine } from './engineClient';

// ═══════════════════════════════════════════════════════════════════════════════
// DROPWATCH v4.2 — OPERATIONAL COMMAND CENTER
// Real-time monitoring, purchase activity, drop status, retailer health
// ═══════════════════════════════════════════════════════════════════════════════

const RETAILERS = ['best_buy', 'target', 'walmart', 'topps'];
const RETAILER_LABEL = { best_buy: 'Best Buy', target: 'Target', walmart: 'Walmart', topps: 'Topps' };
const RETAILER_COLOR = { best_buy: '#FFE000', target: '#CC0000', walmart: '#0071DC', topps: '#E31837' };

export default function Dashboard() {
  const [products, setProducts] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [activity, setActivity] = useState([]);
  const [health, setHealth] = useState(null);
  const [activeDrops, setActiveDrops] = useState([]);
  const [retailerConfigs, setRetailerConfigs] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [quickAddUrl, setQuickAddUrl] = useState('');
  const [quickAddPrice, setQuickAddPrice] = useState('');
  const [quickAddQty, setQuickAddQty] = useState('');
  const [quickAddPriority, setQuickAddPriority] = useState('high');
  const [quickAddStatus, setQuickAddStatus] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null); // product being edited
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    refresh();
    const i1 = setInterval(() => refreshHealth(), 5000);
    const i2 = setInterval(() => refreshActivity(), 8000);
    const i3 = setInterval(() => refreshDrops(), 15000);
    return () => { clearInterval(i1); clearInterval(i2); clearInterval(i3); };
  }, []);

  const refresh = async () => {
    setLoading(true);
    await Promise.all([refreshHealth(), refreshActivity(), refreshDrops(), refreshData()]);
    setLoading(false);
  };

  const refreshHealth = async () => {
    try { setHealth(await engine.getEngineHealth()); } catch { setHealth({ offline: true }); }
  };

  const refreshActivity = async () => {
    const { data } = await supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(30);
    if (data) setActivity(data);
  };

  const refreshDrops = async () => {
    try {
      const drops = await engine.getDropStatus();
      setActiveDrops((drops || []).filter(d => d.phase === 'live' || d.phase === 'preparing' || d.phase === 'scheduled').slice(0, 3));
    } catch {}
  };

  const refreshData = async () => {
    const [p, pu, rc] = await Promise.all([
      supabase.from('products').select('*').order('check_priority', { ascending: true }).order('created_at', { ascending: false }),
      supabase.from('purchases').select('*').order('purchased_at', { ascending: false }).limit(20),
      supabase.from('retailer_config').select('*').in('retailer', RETAILERS),
    ]);
    if (p.data) setProducts(p.data);
    if (pu.data) setPurchases(pu.data);
    if (rc.data) setRetailerConfigs(rc.data);
  };

  const runSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchResults([]);
    try {
      const [bb, tgt, wmt] = await Promise.allSettled([
        engine.searchRetailer('best_buy', searchQuery),
        engine.searchRetailer('target', searchQuery),
        engine.searchRetailer('walmart', searchQuery),
      ]);
      const combined = [];
      if (bb.status === 'fulfilled' && bb.value?.results) combined.push(...bb.value.results.slice(0, 8).map(r => ({ retailer: 'best_buy', sku: r.sku, name: r.title, price: r.price, inStock: r.inStock, url: r.url })));
      if (tgt.status === 'fulfilled' && tgt.value?.results) combined.push(...tgt.value.results.slice(0, 8).map(r => ({ retailer: 'target', sku: r.tcin, name: r.title, price: r.price, inStock: r.inStock, url: r.url })));
      if (wmt.status === 'fulfilled' && wmt.value?.results) combined.push(...wmt.value.results.slice(0, 8).map(r => ({ retailer: 'walmart', sku: r.productId, name: r.title, price: r.price, inStock: r.inStock, url: r.link })));
      setSearchResults(combined);
    } catch (err) {
      alert('Search failed: ' + err.message);
    }
    setIsSearching(false);
  };

  const addFromSearch = async (item) => {
    try {
      await engine.batchImport({ retailer: item.retailer, ids: [item.sku], priority: 'high', target_price: item.price, auto_activate: true });
      await refreshData();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  // Quick Add by URL — paste any product URL from BB/Target/Walmart
  const detectRetailerFromUrl = (url) => {
    if (/bestbuy\.com/i.test(url)) return 'best_buy';
    if (/target\.com/i.test(url)) return 'target';
    if (/walmart\.com/i.test(url)) return 'walmart';
    if (/topps\.com/i.test(url)) return 'topps';
    return null;
  };

  const handleQuickAdd = async () => {
    const url = quickAddUrl.trim();
    if (!url) return;
    const retailer = detectRetailerFromUrl(url);
    if (!retailer) {
      setQuickAddStatus({ type: 'error', msg: 'URL must be from bestbuy.com, target.com, or walmart.com' });
      return;
    }
    setQuickAddStatus({ type: 'pending', msg: 'Adding...' });
    try {
      const payload = {
        retailer,
        ids: [url],
        priority: quickAddPriority,
        auto_activate: true,
      };
      const maxPrice = parseFloat(quickAddPrice);
      if (!isNaN(maxPrice) && maxPrice > 0) payload.target_price = maxPrice;
      const qty = parseInt(quickAddQty);
      if (!isNaN(qty) && qty > 0) payload.max_quantity = qty;

      const result = await engine.batchImport(payload);
      if (result.added > 0) {
        const item = result.details.added[0];
        setQuickAddStatus({
          type: 'success',
          msg: `✓ Added: ${item.name || item.id}${item.price ? ` — current $${item.price}` : ''}${maxPrice ? ` · max $${maxPrice}` : ''}${qty ? ` · qty ${qty}` : ''} · ${quickAddPriority}`,
        });
        setQuickAddUrl('');
        setQuickAddPrice('');
        setQuickAddQty('');
        // keep priority as-is for next add
      } else if (result.skipped > 0) {
        setQuickAddStatus({ type: 'warn', msg: `Already in your list: ${result.details.skipped[0].id}` });
      } else if (result.errors > 0) {
        setQuickAddStatus({ type: 'error', msg: result.details.errors[0].error });
      }
      await refreshData();
    } catch (err) {
      setQuickAddStatus({ type: 'error', msg: 'Error: ' + err.message });
    }
  };

  const togglePause = async () => {
    try {
      if (health?.paused) await engine.resumeAll();
      else await engine.pauseAll();
      await refreshHealth();
    } catch (err) { alert(err.message); }
  };

  // ─── Computed stats ─────────────────────────────────────────────────

  const now = Date.now();
  const DAY = 86400000;
  const stats = {
    today: purchases.filter(p => now - new Date(p.purchased_at).getTime() < DAY).length,
    week: purchases.filter(p => now - new Date(p.purchased_at).getTime() < 7 * DAY).length,
    month: purchases.filter(p => now - new Date(p.purchased_at).getTime() < 30 * DAY).length,
    totalSpent: purchases.reduce((sum, p) => sum + (parseFloat(p.price) || 0), 0),
    productsActive: products.filter(p => p.is_active).length,
    pending: products.filter(p => !p.is_active).length,
    inStockCount: products.filter(p => p.status === 'in_stock' && p.is_active).length,
    criticalCount: products.filter(p => p.check_priority === 'critical' && p.is_active).length,
    highCount: products.filter(p => p.check_priority === 'high' && p.is_active).length,
    anyAutoBuy: retailerConfigs.some(c => c.auto_purchase === true),
  };

  const priorityProducts = products.filter(p => p.is_active && ['critical', 'high'].includes(p.check_priority)).slice(0, 8);
  const pendingProducts = products.filter(p => !p.is_active).slice(0, 10);
  const recentPurchases = purchases.slice(0, 8);
  const recentActivity = activity.slice(0, 12);

  const approveProduct = async (id) => {
    await supabase.from('products').update({ is_active: true }).eq('id', id);
    await refreshData();
  };

  const rejectProduct = async (id) => {
    await supabase.from('products').delete().eq('id', id);
    await refreshData();
  };

  const approveAll = async () => {
    if (!confirm(`Approve all ${pendingProducts.length} pending products? They will start being monitored.`)) return;
    await supabase.from('products').update({ is_active: true }).in('id', pendingProducts.map(p => p.id));
    await refreshData();
  };

  // Detect likely 3P marketplace listings by name patterns (graded cards, Japanese imports, reseller names)
  const THIRD_PARTY_PATTERNS = [
    /\bpsa\s*\d/i, /\bcgc\b/i, /\bbgs\b/i, /graded/i,
    /\(japanese\)/i, /\(chinese\)/i, /japanese\s+booster/i, /chinese\s+30th/i,
    /mystery\s+box/i, /random\s+pokemon/i, /random\s+graded/i,
    /slab\s+kings/i, /monmouth/i, /realgoodeal/i, /hit\s+kings/i, /top\s+class\s+cards/i, /card\s+market/i, /morrison/i,
    /- 1 Booster Pack\b/i, /promo\s+sealed\s+pack/i, /first\s+edition.*chinese/i,
    /futsal\s+20\d\d/i, /trick\s+or\s+trade/i,
    /cyber\s+judge/i, /glory\s+of\s+team\s+rocket/i, /paradise\s+dragona/i, /ancient\s+roar/i,
    /future\s+flash/i, /triple\s+beat/i, /terastal\s+festival/i, /white\s+flare/i,
  ];
  const isLikely3P = (name) => THIRD_PARTY_PATTERNS.some(re => re.test(name || ''));
  const likely3PCount = pendingProducts.filter(p => isLikely3P(p.name)).length;

  const remove3P = async () => {
    const toDelete = products.filter(p => !p.is_active && isLikely3P(p.name));
    if (toDelete.length === 0) return alert('No likely 3P items found in pending.');
    if (!confirm(`Remove ${toDelete.length} likely 3P/marketplace items?\n\nExamples: graded cards, Japanese imports, reseller listings. These won't be purchaseable at retailer direct prices.`)) return;
    await supabase.from('products').delete().in('id', toDelete.map(p => p.id));
    await refreshData();
  };

  if (loading) {
    return (
      <div style={S.app}>
        <div style={S.loadingWrap}>
          <div style={S.loadingIcon}>⚡</div>
          <div style={S.loadingText}>Loading DROPWATCH...</div>
        </div>
      </div>
    );
  }

  const online = !health?.offline;
  const workers = health?.workers || [];

  return (
    <div style={S.app}>
      {/* HEADER */}
      <header style={S.header}>
        <div style={S.headerLeft}>
          <div style={S.logo}>
            <span style={S.logoIcon}>⚡</span>
            <span style={S.logoText}>DROPWATCH</span>
            <span style={S.versionBadge}>v4.2</span>
          </div>
          <span style={{ ...S.healthPill, ...(online ? S.healthOnline : S.healthOffline) }}>
            {online ? `● ${health?.paused ? 'PAUSED' : 'RUNNING'}` : '○ OFFLINE'}
          </span>
        </div>

        <nav style={S.nav}>
          <a href="/admin#drops" style={S.navLink}>Drops</a>
          <a href="/admin#keywords" style={S.navLink}>Keywords</a>
          <a href="/admin#products" style={S.navLink}>Products</a>
          <a href="/admin#accounts" style={S.navLink}>Accounts</a>
          <a href="/admin" style={{ ...S.navLink, ...S.navLinkPrimary }}>⚙ Admin</a>
        </nav>

        <div style={S.headerRight}>
          <button onClick={togglePause} disabled={!online} style={{ ...S.iconBtn, opacity: online ? 1 : 0.4 }}>
            {health?.paused ? '▶' : '⏸'}
          </button>
          <button onClick={refresh} style={S.iconBtn}>↻</button>
        </div>
      </header>

      {/* ACTIVE DROP BANNER */}
      {activeDrops.length > 0 && activeDrops[0].phase !== 'scheduled' && (
        <div style={{ ...S.dropBanner, ...(activeDrops[0].phase === 'live' ? S.dropBannerLive : S.dropBannerPrep) }}>
          <div style={{ flex: 1 }}>
            <strong style={{ fontSize: '15px' }}>
              {activeDrops[0].phase === 'live' ? '🔴 DROP LIVE' : '🟡 DROP PREPARING'}
            </strong>
            <span style={{ marginLeft: '12px', fontSize: '14px' }}>
              {activeDrops.map(d => `${d.description || d.retailer} · ${d.retailer}`).join('  ·  ')}
            </span>
          </div>
          <a href="/admin#drops" style={S.bannerLink}>Manage →</a>
        </div>
      )}

      {/* MAIN GRID */}
      <main style={S.main}>
        {/* ROW 1 — Stat tiles */}
        <section style={S.statsRow}>
          <StatTile label="Monitoring" value={stats.productsActive} sublabel={`${stats.pending} pending approval · ${products.length} total`} accent="#378ADD" />
          <StatTile label="Currently In Stock" value={stats.inStockCount} sublabel={stats.anyAutoBuy ? 'auto-buy ON for some retailers' : 'auto-buy OFF — not purchasing'} accent={stats.anyAutoBuy ? '#00D26A' : '#888'} glow={stats.inStockCount > 0 && stats.anyAutoBuy} />
          <StatTile label="Critical Priority" value={stats.criticalCount} sublabel={`${stats.highCount} high priority`} accent="#E24B4A" />
          <StatTile label="Purchases Today" value={stats.today} sublabel={`${stats.month} this month · $${stats.totalSpent.toFixed(2)} total`} accent="#EF9F27" />
        </section>

        {/* Pending Approval — shows only when there are pending products */}
        {pendingProducts.length > 0 && (
          <section style={S.pendingSection}>
            <div style={S.colHeader}>
              <div>
                <h3 style={{ ...S.colTitle, color: '#EF9F27' }}>⚠ {stats.pending} Pending Your Approval</h3>
                <p style={{ color: '#888', fontSize: '12px', margin: '4px 0 0' }}>Discovered products won't be monitored or purchased until you approve them.</p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <a href="/admin#products" style={S.linkBtn}>Review all →</a>
                {likely3PCount > 0 && (
                  <button onClick={remove3P} style={{ ...S.btnSecondary || {}, padding: '8px 14px', backgroundColor: 'rgba(226,75,74,0.15)', color: '#E24B4A', border: '1px solid rgba(226,75,74,0.3)', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                    🗑 Remove {likely3PCount} Likely 3P
                  </button>
                )}
                <button onClick={approveAll} style={S.approveAllBtn}>Approve All {stats.pending}</button>
              </div>
            </div>
            <div style={S.list}>
              {pendingProducts.map(p => {
                const notesData = (() => { try { return p.notes ? JSON.parse(p.notes) : {}; } catch { return {}; } })();
                const currentlyThirdParty = notesData.isFirstParty === false;
                const currentSeller = notesData.currentSeller;
                const suspectedByName = isLikely3P(p.name);
                const show3P = currentlyThirdParty || suspectedByName;

                return (
                  <div key={p.id} style={{ ...S.listRow, ...(show3P ? { borderColor: 'rgba(226,75,74,0.3)' } : {}) }}>
                    <span style={{ ...S.retailerChip, color: RETAILER_COLOR[p.retailer] }}>{RETAILER_LABEL[p.retailer] || p.retailer}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={S.productName}>
                        {p.name || '(no name)'}
                        {currentlyThirdParty && (
                          <span
                            title={`Currently sold by ${currentSeller || '3rd party'}. We'll auto-buy only when ${RETAILER_LABEL[p.retailer]} direct restocks this TCIN.`}
                            style={{ ...S.inlineBadge, marginLeft: '8px', color: '#EF9F27', background: 'rgba(239,159,39,0.15)', border: '1px solid rgba(239,159,39,0.3)' }}>
                            ⏱ Currently 3P ({currentSeller || 'marketplace'}) — waiting for direct restock
                          </span>
                        )}
                        {!currentlyThirdParty && suspectedByName && (
                          <span style={{ ...S.inlineBadge, marginLeft: '8px', color: '#E24B4A', background: 'rgba(226,75,74,0.15)', border: '1px solid rgba(226,75,74,0.3)' }}>⚠ Likely 3P</span>
                        )}
                      </div>
                      <div style={S.listRowMeta}>
                        {p.sku || p.tcin || p.pid}
                        {p.last_price != null && <> · current <span style={{ color: '#DDD' }}>${p.last_price}</span></>}
                        {p.target_price != null && <> · max buy <span style={{ color: '#00D26A', fontWeight: 500 }}>${p.target_price}</span></>}
                        <> · qty {p.max_quantity || 1}</>
                        {p.url && <> · <a href={p.url} target="_blank" rel="noreferrer" style={{ color: '#378ADD', textDecoration: 'none' }}>view on {RETAILER_LABEL[p.retailer]}</a></>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => setEditingProduct(p)} style={S.rejectBtn}>✎ Edit</button>
                      <button onClick={() => approveProduct(p.id)} style={S.approveBtn}>✓ Approve</button>
                      <button onClick={() => rejectProduct(p.id)} style={S.rejectBtn}>✗ Reject</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ROW 2 — Retailer status cards (toggles are clickable) */}
        <section style={S.retailerRow}>
          {RETAILERS.map(r => {
            const cfg = retailerConfigs.find(c => c.retailer === r) || {};
            const worker = workers.find(w => w === r);
            const rProducts = products.filter(p => p.retailer === r && p.is_active);
            const rInStock = rProducts.filter(p => p.status === 'in_stock').length;
            const warning = rProducts.length > 0 && !cfg.auto_purchase;

            const toggleAutoBuy = async () => {
              const newValue = !cfg.auto_purchase;
              if (newValue && !confirm(`Enable AUTO-BUY for ${RETAILER_LABEL[r]}?\n\nThe bot will automatically place real orders when monitored products hit stock at or below your max price.\n\nMake sure your products have correct max prices set.`)) return;
              await engine.updateRetailerConfig(r, { auto_purchase: newValue });
              await refreshData();
            };

            const toggleDropMode = async () => {
              const newValue = !cfg.drop_mode;
              if (newValue && !confirm(`Enable DROP MODE for ${RETAILER_LABEL[r]}?\n\nThis switches critical/high priority products to 1.5s polling (instead of 30s).\n\nUse only during announced drops — may trigger rate limits.`)) return;
              await engine.updateRetailerConfig(r, { drop_mode: newValue });
              await refreshData();
            };

            return (
              <div key={r} style={{ ...S.retailerCard, borderLeftColor: RETAILER_COLOR[r], ...(warning ? { outline: '1px solid rgba(239,159,39,0.4)' } : {}) }}>
                <div style={S.retailerHeader}>
                  <span style={S.retailerName}>{RETAILER_LABEL[r]}</span>
                  <span style={{ ...S.workerDot, background: worker ? '#00D26A' : '#444' }} />
                </div>
                <div style={S.retailerStats}>
                  <div><strong>{rProducts.length}</strong> monitoring</div>
                  {rInStock > 0 && <div style={{ color: '#00D26A' }}><strong>{rInStock}</strong> in stock</div>}
                </div>
                {warning && (
                  <div style={{ color: '#EF9F27', fontSize: '11px', marginBottom: '8px', fontWeight: '500' }}>
                    ⚠ Auto-buy OFF — bot won't purchase even when stock hits
                  </div>
                )}
                <div style={S.retailerToggles}>
                  <ClickableToggle on={cfg.drop_mode} label="DROP MODE" onClick={toggleDropMode} />
                  <ClickableToggle on={cfg.auto_purchase} label="AUTO BUY" onClick={toggleAutoBuy} danger />
                </div>
                <div style={S.retailerFooter}>
                  <span>✓ {cfg.checks_today || 0}</span>
                  <span style={{ color: '#00D26A' }}>💰 {cfg.purchases_today || 0}</span>
                  <span style={{ color: cfg.errors_today > 0 ? '#E24B4A' : '#666' }}>✗ {cfg.errors_today || 0}</span>
                </div>
              </div>
            );
          })}
        </section>

        {/* Quick Add by URL — paste any retailer product URL with price/qty/urgency */}
        <section style={{ backgroundColor: 'rgba(0,210,106,0.04)', border: '1px solid rgba(0,210,106,0.2)', borderRadius: '14px', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <span style={{ color: '#00D26A', fontSize: '16px' }}>⚡</span>
            <strong style={{ color: '#FFF', fontSize: '14px' }}>Quick Add by URL</strong>
            <span style={{ color: '#888', fontSize: '12px' }}>Paste any Best Buy / Target / Walmart product URL — auto-detects retailer</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
            <input
              style={{ ...S.searchInput, flex: 1 }}
              placeholder="https://www.target.com/p/.../A-1009318827  or  https://www.bestbuy.com/site/6257430.p"
              value={quickAddUrl}
              onChange={e => setQuickAddUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleQuickAdd()}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) minmax(140px, 1fr) minmax(160px, 1fr) auto', gap: '8px', alignItems: 'end' }}>
            <div>
              <label style={{ display: 'block', color: '#AAA', fontSize: '11px', marginBottom: '4px', fontWeight: '500' }}>Max Purchase Price</label>
              <input
                style={S.searchInput}
                type="number"
                placeholder="54.99"
                value={quickAddPrice}
                onChange={e => setQuickAddPrice(e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: 'block', color: '#AAA', fontSize: '11px', marginBottom: '4px', fontWeight: '500' }}>Qty Per Cart</label>
              <input
                style={S.searchInput}
                type="number"
                placeholder={detectRetailerFromUrl(quickAddUrl) === 'walmart' ? '5' : '2'}
                value={quickAddQty}
                onChange={e => setQuickAddQty(e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: 'block', color: '#AAA', fontSize: '11px', marginBottom: '4px', fontWeight: '500' }}>Urgency</label>
              <select style={S.searchInput} value={quickAddPriority} onChange={e => setQuickAddPriority(e.target.value)}>
                <option value="critical">🔴 Critical (1.5s polling)</option>
                <option value="high">🟠 High (5s polling)</option>
                <option value="normal">🔵 Normal (30s polling)</option>
                <option value="low">⚪ Low (5 min polling)</option>
              </select>
            </div>
            <button onClick={handleQuickAdd} disabled={!quickAddUrl.trim() || quickAddStatus?.type === 'pending'} style={{ ...S.searchBtn, height: '38px' }}>
              {quickAddStatus?.type === 'pending' ? '⏳ Adding...' : '+ Monitor'}
            </button>
          </div>
          {quickAddStatus && (
            <div style={{
              marginTop: '10px',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '13px',
              backgroundColor: quickAddStatus.type === 'success' ? 'rgba(0,210,106,0.15)' :
                              quickAddStatus.type === 'error' ? 'rgba(226,75,74,0.15)' :
                              quickAddStatus.type === 'warn' ? 'rgba(239,159,39,0.15)' :
                              'rgba(255,255,255,0.05)',
              color: quickAddStatus.type === 'success' ? '#00D26A' :
                     quickAddStatus.type === 'error' ? '#E24B4A' :
                     quickAddStatus.type === 'warn' ? '#EF9F27' : '#AAA',
            }}>
              {quickAddStatus.msg}
            </div>
          )}
        </section>

        {/* ROW 3 — Search bar */}
        <section style={S.searchSection}>
          <div style={S.searchBar}>
            <input
              style={S.searchInput}
              placeholder="Search all retailers (pokemon prismatic, topps, panini prizm...)"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runSearch()}
            />
            <button onClick={runSearch} disabled={isSearching || !searchQuery.trim()} style={S.searchBtn}>
              {isSearching ? '⏳ Searching...' : '🔎 Search'}
            </button>
          </div>
          {searchResults.length > 0 && (
            <div style={S.searchResults}>
              <div style={S.searchResultsHeader}>
                {searchResults.length} results across {new Set(searchResults.map(r => r.retailer)).size} retailer(s)
                <button onClick={() => { setSearchResults([]); setSearchQuery(''); }} style={S.linkBtn}>Clear</button>
              </div>
              {searchResults.map((r, i) => (
                <div key={i} style={S.searchResultItem}>
                  <span style={{ ...S.retailerChip, color: RETAILER_COLOR[r.retailer] }}>{RETAILER_LABEL[r.retailer]}</span>
                  <span style={S.searchResultName}>{r.name}</span>
                  <span style={S.searchResultMeta}>
                    {r.price ? `$${r.price}` : '—'} · {r.sku}
                    {r.inStock && <span style={{ color: '#00D26A', marginLeft: '8px' }}>● IN STOCK</span>}
                  </span>
                  <button onClick={() => addFromSearch(r)} style={S.searchAddBtn}>+ Monitor</button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ROW 4 — Two columns: Priority products | Live activity */}
        <section style={S.twoColumn}>
          {/* LEFT: Priority Products */}
          <div style={S.col}>
            <div style={S.colHeader}>
              <h3 style={S.colTitle}>Priority Products</h3>
              <a href="/admin#products" style={S.linkBtn}>View all {stats.productsActive} →</a>
            </div>
            {priorityProducts.length === 0 ? (
              <EmptyCard icon="🎯" msg="No critical/high priority products" sub="Set product priorities in Admin → Products" />
            ) : (
              <div style={S.list}>
                {priorityProducts.map(p => (
                  <div key={p.id} style={S.listRow}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={S.listRowTitle}>
                        <span style={S.productName}>{p.name || '(no name)'}</span>
                        <PriorityBadge p={p.check_priority} />
                        <StatusBadge s={p.status} />
                      </div>
                      <div style={S.listRowMeta}>
                        {RETAILER_LABEL[p.retailer]} · {p.sku || p.tcin || p.pid}
                        {p.last_price != null && <> · current <span style={{ color: '#DDD' }}>${p.last_price}</span></>}
                        {p.target_price != null && <> · max <span style={{ color: '#00D26A', fontWeight: 500 }}>${p.target_price}</span></>}
                        <> · qty {p.max_quantity || 1}</>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* RIGHT: Live Activity */}
          <div style={S.col}>
            <div style={S.colHeader}>
              <h3 style={S.colTitle}>Live Activity</h3>
              <a href="/admin#activity" style={S.linkBtn}>Full feed →</a>
            </div>
            {recentActivity.length === 0 ? (
              <EmptyCard icon="📡" msg="No activity yet" sub="Engine will log checks + purchases here" />
            ) : (
              <div style={S.list}>
                {recentActivity.map(a => (
                  <div key={a.id} style={{ ...S.listRow, padding: '8px 12px' }}>
                    <span style={{ fontSize: '14px', marginRight: '8px' }}>{activityIcon(a.type)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#DDD', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.message}
                      </div>
                    </div>
                    <span style={{ color: '#555', fontSize: '10px', whiteSpace: 'nowrap' }}>{timeAgo(a.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ROW 5 — Recent Purchases (full width) */}
        <section>
          <div style={S.colHeader}>
            <h3 style={S.colTitle}>Recent Purchases</h3>
            <a href="/admin#purchases" style={S.linkBtn}>History →</a>
          </div>
          {recentPurchases.length === 0 ? (
            <EmptyCard icon="💰" msg="No purchases yet" sub="Purchases will appear here after auto-buy fires" />
          ) : (
            <div style={S.list}>
              {recentPurchases.map(p => (
                <div key={p.id} style={S.listRow}>
                  <span style={{ ...S.retailerChip, color: RETAILER_COLOR[p.retailer] }}>{RETAILER_LABEL[p.retailer] || p.retailer}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={S.productName}>{p.product_name}</div>
                    <div style={S.listRowMeta}>{p.account_email} · {timeAgo(p.purchased_at)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: '#FFF', fontWeight: '600' }}>${p.price}</div>
                    <div style={{ ...S.statusBadge, ...(p.status === 'ordered' ? S.statusOrdered : S.statusWatching) }}>
                      {p.status}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Edit Product Modal */}
      {editingProduct && (
        <EditProductModal
          product={editingProduct}
          onClose={() => setEditingProduct(null)}
          onSaved={async () => { setEditingProduct(null); await refreshData(); }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EDIT PRODUCT MODAL
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

  const modalStyles = {
    overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' },
    card: { backgroundColor: '#151520', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px', padding: '24px', maxWidth: '560px', width: '100%', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' },
    label: { display: 'block', color: '#AAA', fontSize: '12px', marginBottom: '6px', fontWeight: '500' },
    input: { width: '100%', padding: '9px 12px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: '#FFF', fontSize: '13px', outline: 'none', boxSizing: 'border-box' },
    hint: { display: 'block', color: '#666', fontSize: '11px', marginTop: '4px' },
    row: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' },
    btnPrimary: { padding: '9px 20px', border: 'none', borderRadius: '8px', backgroundColor: '#00D26A', color: '#000', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
    btnSecondary: { padding: '9px 16px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', backgroundColor: 'transparent', color: '#AAA', fontSize: '13px', cursor: 'pointer' },
    btnDanger: { padding: '9px 16px', border: '1px solid rgba(226,75,74,0.3)', borderRadius: '8px', backgroundColor: 'transparent', color: '#E24B4A', fontSize: '13px', cursor: 'pointer' },
  };

  return (
    <div style={modalStyles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modalStyles.card}>
        <h3 style={{ color: '#FFF', fontSize: '16px', margin: '0 0 6px', fontWeight: '700' }}>Edit Product</h3>
        <p style={{ color: '#888', fontSize: '12px', margin: '0 0 16px', fontFamily: 'monospace' }}>
          {product.retailer} · {id}
          {currentlyThirdParty && <span style={{ color: '#EF9F27', marginLeft: '8px' }}>⏱ Currently 3P ({notesData.currentSeller || 'marketplace'})</span>}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={modalStyles.label}>Name</label>
            <input style={modalStyles.input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>

          <div style={modalStyles.row}>
            <div>
              <label style={modalStyles.label}>Max Purchase Price</label>
              <input
                style={modalStyles.input}
                type="number"
                step="0.01"
                placeholder="No cap"
                value={form.target_price}
                onChange={e => setForm({ ...form, target_price: e.target.value })}
              />
              <span style={modalStyles.hint}>Auto-buy only if ≤ this · Current: ${product.last_price || '?'}</span>
            </div>
            <div>
              <label style={modalStyles.label}>Qty Per Cart</label>
              <input
                style={modalStyles.input}
                type="number"
                value={form.max_quantity}
                onChange={e => setForm({ ...form, max_quantity: e.target.value })}
              />
              <span style={modalStyles.hint}>{product.retailer === 'walmart' ? 'Walmart: 5 max' : 'BB/Target: 2 max'}</span>
            </div>
            <div>
              <label style={modalStyles.label}>Urgency</label>
              <select style={modalStyles.input} value={form.check_priority} onChange={e => setForm({ ...form, check_priority: e.target.value })}>
                <option value="critical">🔴 Critical (1.5s)</option>
                <option value="high">🟠 High (5s)</option>
                <option value="normal">🔵 Normal (30s)</option>
                <option value="low">⚪ Low (5 min)</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#DDD', fontSize: '13px' }}>
              <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
              Active — monitor for stock and fire auto-buy
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
          <button onClick={remove} style={modalStyles.btnDanger}>🗑 Delete</button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={onClose} style={modalStyles.btnSecondary}>Cancel</button>
            <button onClick={save} disabled={saving} style={{ ...modalStyles.btnPrimary, opacity: saving ? 0.5 : 1 }}>
              {saving ? '⏳ Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════════════

function StatTile({ label, value, sublabel, accent, glow }) {
  return (
    <div style={{ ...S.statTile, ...(glow ? { boxShadow: `0 0 20px ${accent}33`, borderColor: accent } : {}) }}>
      <div style={{ ...S.statValue, color: accent }}>{value}</div>
      <div style={S.statLabel}>{label}</div>
      {sublabel && <div style={S.statSublabel}>{sublabel}</div>}
    </div>
  );
}

function Toggle({ on, label, danger }) {
  const color = on ? (danger ? '#E24B4A' : '#00D26A') : '#555';
  return (
    <span style={{ ...S.toggle, color, borderColor: `${color}55`, background: `${color}15` }}>
      {on ? '● ' : '○ '}{label}
    </span>
  );
}

function ClickableToggle({ on, label, onClick, danger }) {
  const color = on ? (danger ? '#E24B4A' : '#00D26A') : '#555';
  return (
    <button
      onClick={onClick}
      title={`Click to ${on ? 'disable' : 'enable'} ${label}`}
      style={{ ...S.toggle, color, borderColor: `${color}55`, background: `${color}15`, cursor: 'pointer', userSelect: 'none', outline: 'none' }}
    >
      {on ? '● ' : '○ '}{label}
    </button>
  );
}

function PriorityBadge({ p }) {
  const colors = { critical: '#E24B4A', high: '#EF9F27', normal: '#378ADD', low: '#666' };
  const c = colors[p] || colors.normal;
  return <span style={{ ...S.inlineBadge, color: c, background: `${c}15`, border: `1px solid ${c}44` }}>{p || 'normal'}</span>;
}

function StatusBadge({ s }) {
  const styles = {
    in_stock: { color: '#00D26A', bg: 'rgba(0,210,106,0.15)' },
    coming_soon: { color: '#A17CF6', bg: 'rgba(161,124,246,0.15)' },
    detected: { color: '#EF9F27', bg: 'rgba(239,159,39,0.15)' },
    purchased: { color: '#00D26A', bg: 'rgba(0,210,106,0.25)' },
    watching: { color: '#888', bg: 'rgba(255,255,255,0.05)' },
  };
  const st = styles[s] || styles.watching;
  return <span style={{ ...S.inlineBadge, color: st.color, background: st.bg }}>{s || 'watching'}</span>;
}

function EmptyCard({ icon, msg, sub }) {
  return (
    <div style={S.emptyCard}>
      <div style={{ fontSize: '32px' }}>{icon}</div>
      <div style={{ color: '#AAA', fontSize: '14px', marginTop: '8px' }}>{msg}</div>
      {sub && <div style={{ color: '#666', fontSize: '12px', marginTop: '4px' }}>{sub}</div>}
    </div>
  );
}

function activityIcon(type) {
  return { check: '🔍', purchase: '💰', error: '⚠️', engine: '⚡', alert: '📧', drop: '🔴', discovery: '🔎', warn: '⚠️' }[type] || '•';
}

function timeAgo(date) {
  if (!date) return '';
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════

const S = {
  app: { minHeight: '100vh', backgroundColor: '#080810', color: '#FFF', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },

  // Header
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.02)' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '14px' },
  headerRight: { display: 'flex', gap: '8px' },
  logo: { display: 'flex', alignItems: 'center', gap: '8px' },
  logoIcon: { fontSize: '22px' },
  logoText: { fontSize: '17px', fontWeight: '800', letterSpacing: '1px' },
  versionBadge: { padding: '2px 8px', borderRadius: '4px', backgroundColor: 'rgba(0,210,106,0.15)', color: '#00D26A', fontSize: '10px', fontWeight: '700', fontFamily: 'monospace' },
  healthPill: { padding: '4px 12px', borderRadius: '12px', fontSize: '11px', fontWeight: '600', fontFamily: 'monospace' },
  healthOnline: { backgroundColor: 'rgba(0,210,106,0.15)', color: '#00D26A' },
  healthOffline: { backgroundColor: 'rgba(226,75,74,0.15)', color: '#E24B4A' },
  nav: { display: 'flex', gap: '6px' },
  navLink: { padding: '8px 14px', color: '#AAA', textDecoration: 'none', fontSize: '13px', borderRadius: '8px', transition: 'all 0.15s' },
  navLinkPrimary: { color: '#FFF', backgroundColor: 'rgba(0,210,106,0.15)' },
  iconBtn: { width: '36px', height: '36px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', background: 'transparent', color: '#AAA', fontSize: '16px', cursor: 'pointer' },

  // Drop banner
  dropBanner: { display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  dropBannerLive: { background: 'linear-gradient(90deg, rgba(226,75,74,0.25) 0%, rgba(226,75,74,0.08) 100%)', color: '#FFF', borderBottom: '2px solid #E24B4A' },
  dropBannerPrep: { background: 'linear-gradient(90deg, rgba(239,159,39,0.25) 0%, rgba(239,159,39,0.08) 100%)', color: '#FFF', borderBottom: '2px solid #EF9F27' },
  bannerLink: { color: '#FFF', textDecoration: 'none', fontSize: '13px', padding: '6px 14px', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '8px' },

  // Main
  main: { padding: '20px 24px', maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' },

  // Stat tiles
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' },
  statTile: { backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '20px' },
  statValue: { fontSize: '36px', fontWeight: '800', lineHeight: 1, fontFamily: 'ui-monospace, SFMono-Regular, monospace' },
  statLabel: { color: '#CCC', fontSize: '13px', fontWeight: '500', marginTop: '8px' },
  statSublabel: { color: '#666', fontSize: '11px', marginTop: '4px' },

  // Retailer cards
  retailerRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' },
  retailerCard: { backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderLeft: '3px solid #FFE000', borderRadius: '12px', padding: '16px' },
  retailerHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  retailerName: { fontSize: '15px', fontWeight: '700', color: '#FFF' },
  workerDot: { width: '8px', height: '8px', borderRadius: '50%' },
  retailerStats: { display: 'flex', gap: '14px', color: '#AAA', fontSize: '13px', marginBottom: '10px' },
  retailerToggles: { display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' },
  toggle: { padding: '3px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '600', fontFamily: 'monospace', border: '1px solid' },
  retailerFooter: { display: 'flex', gap: '14px', color: '#888', fontSize: '11px', fontFamily: 'monospace', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.05)' },

  // Search
  searchSection: {},
  searchBar: { display: 'flex', gap: '8px' },
  searchInput: { flex: 1, padding: '12px 16px', backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: '#FFF', fontSize: '14px', outline: 'none' },
  searchBtn: { padding: '12px 24px', backgroundColor: '#00D26A', color: '#000', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' },
  searchResults: { marginTop: '12px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '8px', maxHeight: '400px', overflowY: 'auto' },
  searchResultsHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', color: '#AAA', fontSize: '12px' },
  searchResultItem: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.04)' },
  searchResultName: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#FFF', fontSize: '13px' },
  searchResultMeta: { color: '#888', fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'nowrap' },
  searchAddBtn: { padding: '6px 12px', backgroundColor: 'rgba(0,210,106,0.15)', color: '#00D26A', border: '1px solid rgba(0,210,106,0.3)', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' },
  retailerChip: { fontSize: '10px', fontWeight: '700', padding: '3px 8px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '10px', textTransform: 'uppercase', fontFamily: 'monospace' },

  // Two-column
  twoColumn: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' },
  col: {},
  colHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' },
  colTitle: { margin: 0, color: '#FFF', fontSize: '15px', fontWeight: '700' },
  linkBtn: { color: '#00D26A', fontSize: '12px', textDecoration: 'none', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit' },

  // Lists
  list: { display: 'flex', flexDirection: 'column', gap: '4px' },
  listRow: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', backgroundColor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px' },
  listRowTitle: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  listRowMeta: { color: '#777', fontSize: '11px', marginTop: '3px', fontFamily: 'monospace' },
  productName: { color: '#FFF', fontSize: '13px', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '400px' },

  // Inline badges
  inlineBadge: { padding: '2px 7px', borderRadius: '8px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', fontFamily: 'monospace' },
  statusBadge: { padding: '2px 7px', borderRadius: '8px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', fontFamily: 'monospace', marginTop: '2px' },
  statusOrdered: { color: '#00D26A', backgroundColor: 'rgba(0,210,106,0.15)' },
  statusWatching: { color: '#888', backgroundColor: 'rgba(255,255,255,0.05)' },

  // Empty
  emptyCard: { textAlign: 'center', padding: '40px 20px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '12px' },

  // Pending approval
  pendingSection: { backgroundColor: 'rgba(239,159,39,0.05)', border: '1px solid rgba(239,159,39,0.2)', borderRadius: '14px', padding: '18px' },
  approveAllBtn: { padding: '8px 16px', backgroundColor: '#EF9F27', color: '#000', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' },
  approveBtn: { padding: '6px 12px', backgroundColor: 'rgba(0,210,106,0.15)', color: '#00D26A', border: '1px solid rgba(0,210,106,0.3)', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' },
  rejectBtn: { padding: '6px 12px', backgroundColor: 'rgba(255,255,255,0.03)', color: '#888', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' },

  // Loading
  loadingWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' },
  loadingIcon: { fontSize: '48px', animation: 'pulse 1.5s ease-in-out infinite' },
  loadingText: { color: '#888', fontSize: '14px', marginTop: '12px' },
};
