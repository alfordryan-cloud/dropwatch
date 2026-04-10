import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { engine } from './engineClient';
import EngineStatus from './components/EngineStatus';

// ═══════════════════════════════════════════════════════════════════════════════
// DROPWATCH - DASHBOARD WITH SUPABASE
// Clean interface with real database connection
// ═══════════════════════════════════════════════════════════════════════════════

export default function Dashboard() {
  const [view, setView] = useState('dashboard');
  const [products, setProducts] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [timePeriod, setTimePeriod] = useState('today');
  const [systemActive, setSystemActive] = useState(false);
  const [engineStats, setEngineStats] = useState({});

  // Fetch data from Supabase + Engine status
  useEffect(() => {
    fetchData();
    fetchEngineStatus();
    // Poll engine status every 30 seconds
    const interval = setInterval(fetchEngineStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchEngineStatus = async () => {
    const status = await engine.getStatus();
    setSystemActive(status.status === 'running');
    setEngineStats(status.stats || {});
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch products
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

      if (productsError) throw productsError;

      // Fetch purchases
      const { data: purchasesData, error: purchasesError } = await supabase
        .from('purchases')
        .select('*')
        .order('purchased_at', { ascending: false })
        .limit(10);

      if (purchasesError) throw purchasesError;

      // Transform products data
      const transformedProducts = (productsData || []).map(p => ({
        id: p.id,
        name: p.name,
        image: getProductEmoji(p.name),
        category: getCategory(p.name),
        msrp: parseFloat(p.target_price) || 0,
        status: p.is_active ? 'active' : 'watching',
        purchased: {
          today: p.purchase_count || 0,
          week: p.purchase_count || 0,
          month: p.purchase_count || 0,
          total: p.purchase_count || 0
        },
        retailers: [p.retailer],
        lastPurchase: p.last_checked ? new Date(p.last_checked).getTime() : null,
        successRate: 0.75
      }));

      // Transform purchases data
      const transformedPurchases = (purchasesData || []).map(p => ({
        id: p.id,
        product: p.product_name,
        retailer: p.retailer,
        quantity: p.quantity,
        time: new Date(p.purchased_at).getTime(),
        status: p.status,
        orderNumber: p.order_number,
        total: parseFloat(p.total) || 0
      }));

      setProducts(transformedProducts);
      setPurchases(transformedPurchases);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getProductEmoji = (name) => {
    const lower = name.toLowerCase();
    if (lower.includes('pokemon') || lower.includes('sparks') || lower.includes('evolutions')) return '⚡';
    if (lower.includes('topps') || lower.includes('baseball')) return '⚾';
    if (lower.includes('panini') || lower.includes('basketball') || lower.includes('prizm')) return '🏀';
    if (lower.includes('football')) return '🏈';
    return '📦';
  };

  const getCategory = (name) => {
    const lower = name.toLowerCase();
    if (lower.includes('pokemon') || lower.includes('sparks') || lower.includes('evolutions')) return 'Pokemon';
    if (lower.includes('topps') || lower.includes('panini') || lower.includes('prizm')) return 'Sports';
    return 'Other';
  };

  // Calculate totals
  const totals = {
    today: products.reduce((sum, p) => sum + (p.purchased?.today || 0), 0),
    week: products.reduce((sum, p) => sum + (p.purchased?.week || 0), 0),
    month: products.reduce((sum, p) => sum + (p.purchased?.month || 0), 0),
  };

  const formatTime = (ts) => {
    if (!ts) return 'Never';
    const diff = Date.now() - ts;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    
    setTimeout(() => {
      setSearchResults([
        { name: searchQuery, retailers: ['Target', 'Walmart', 'Best Buy'], msrp: 49.99, available: true },
        { name: `${searchQuery} Bundle`, retailers: ['Pokemon Center'], msrp: 39.99, available: true },
        { name: `${searchQuery} Collection`, retailers: ['GameStop'], msrp: 119.99, available: false },
      ]);
      setIsSearching(false);
    }, 1000);
  };

  const addProduct = async (product) => {
    try {
      const { data, error } = await supabase
        .from('products')
        .insert([{
          name: product.name,
          retailer: product.retailers[0] || 'Target',
          url: `https://example.com/${product.name.toLowerCase().replace(/\s+/g, '-')}`,
          target_price: product.msrp,
          max_quantity: 1,
          is_active: true,
          purchase_count: 0
        }])
        .select();

      if (error) throw error;

      // Refresh data
      await fetchData();
      setSearchResults([]);
      setSearchQuery('');
      setView('dashboard');
    } catch (err) {
      console.error('Error adding product:', err);
      alert('Failed to add product: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div style={styles.app}>
        <div style={styles.loadingContainer}>
          <div style={styles.loadingSpinner}>⚡</div>
          <p style={styles.loadingText}>Loading DROPWATCH...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.app}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.logo}>
            <span style={styles.logoIcon}>⚡</span>
            DROPWATCH
          </h1>
          <span style={styles.tagline}>Collector Station</span>
        </div>
        
        <div style={styles.headerCenter}>
          <button 
            style={{...styles.navBtn, ...(view === 'dashboard' ? styles.navBtnActive : {})}}
            onClick={() => setView('dashboard')}
          >
            Dashboard
          </button>
          <button 
            style={{...styles.navBtn, ...(view === 'add' ? styles.navBtnActive : {})}}
            onClick={() => setView('add')}
          >
            + Add Product
          </button>
          <button 
            style={styles.navBtn}
            onClick={() => window.location.href = '/admin'}
          >
            ⚙ Admin
          </button>
        </div>

        <div style={styles.headerRight}>
          <button 
            style={styles.refreshBtn}
            onClick={fetchData}
            title="Refresh data"
          >
            🔄
          </button>
          <div style={styles.systemStatus}>
            <span style={{...styles.statusDot, backgroundColor: systemActive ? '#00D26A' : '#666'}} />
            <span style={styles.statusText}>{systemActive ? 'Active' : 'Paused'}</span>
          </div>
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div style={styles.errorBanner}>
          ⚠️ {error}
          <button style={styles.dismissBtn} onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Main Content */}
      <main style={styles.main}>
        {view === 'dashboard' && (
          <DashboardView 
            products={products}
            purchases={purchases}
            totals={totals}
            timePeriod={timePeriod}
            setTimePeriod={setTimePeriod}
            formatTime={formatTime}
          />
        )}
        
        {view === 'add' && (
          <AddProductView
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            handleSearch={handleSearch}
            isSearching={isSearching}
            searchResults={searchResults}
            addProduct={addProduct}
          />
        )}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD VIEW
// ═══════════════════════════════════════════════════════════════════════════════

function DashboardView({ products, purchases, totals, timePeriod, setTimePeriod, formatTime }) {
  return (
    <div style={styles.dashboard}>
      {/* Summary Cards */}
      <div style={styles.summaryRow}>
        <SummaryCard 
          label="Today" 
          value={totals.today} 
          active={timePeriod === 'today'}
          onClick={() => setTimePeriod('today')}
        />
        <SummaryCard 
          label="This Week" 
          value={totals.week}
          active={timePeriod === 'week'}
          onClick={() => setTimePeriod('week')}
        />
        <SummaryCard 
          label="This Month" 
          value={totals.month}
          active={timePeriod === 'month'}
          onClick={() => setTimePeriod('month')}
        />
        <SummaryCard 
          label="Products Tracked" 
          value={products.filter(p => p.status === 'active').length}
          subtitle="active"
        />
      </div>

      {/* Two Column Layout */}
      <div style={styles.contentGrid}>
        {/* Products List */}
        <div style={styles.productsSection}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Products</h2>
            <span style={styles.productCount}>{products.length} total</span>
          </div>
          
          <div style={styles.productsList}>
            {products.length === 0 ? (
              <div style={styles.emptyState}>
                <span style={styles.emptyIcon}>📦</span>
                <p style={styles.emptyText}>No products yet</p>
                <p style={styles.emptySubtext}>Add products to start tracking</p>
              </div>
            ) : (
              products.map(product => (
                <ProductCard 
                  key={product.id} 
                  product={product} 
                  timePeriod={timePeriod}
                  formatTime={formatTime}
                />
              ))
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div style={styles.activitySection}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Recent Purchases</h2>
          </div>
          
          <div style={styles.activityList}>
            {purchases.length === 0 ? (
              <div style={styles.emptyState}>
                <span style={styles.emptyIcon}>🛒</span>
                <p style={styles.emptyText}>No purchases yet</p>
              </div>
            ) : (
              purchases.map(item => (
                <ActivityItem key={item.id} item={item} formatTime={formatTime} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, subtitle, active, onClick }) {
  return (
    <div 
      style={{
        ...styles.summaryCard,
        ...(active ? styles.summaryCardActive : {}),
        ...(onClick ? { cursor: 'pointer' } : {})
      }}
      onClick={onClick}
    >
      <span style={styles.summaryValue}>{value}</span>
      <span style={styles.summaryLabel}>{label}</span>
      {subtitle && <span style={styles.summarySubtitle}>{subtitle}</span>}
    </div>
  );
}

function ProductCard({ product, timePeriod, formatTime }) {
  const purchaseCount = product.purchased?.[timePeriod] || product.purchased?.today || 0;
  
  return (
    <div style={styles.productCard}>
      <div style={styles.productIcon}>{product.image}</div>
      
      <div style={styles.productInfo}>
        <h3 style={styles.productName}>{product.name}</h3>
        <div style={styles.productMeta}>
          <span style={styles.productCategory}>{product.category}</span>
          <span style={styles.productPrice}>${product.msrp?.toFixed(2)}</span>
        </div>
        <div style={styles.productRetailers}>
          {product.retailers?.map((r, i) => (
            <span key={i} style={styles.retailerTag}>{r}</span>
          ))}
        </div>
      </div>

      <div style={styles.productStats}>
        <div style={styles.purchaseCount}>
          <span style={styles.purchaseNumber}>{purchaseCount}</span>
          <span style={styles.purchaseLabel}>purchased</span>
        </div>
        <div style={styles.lastPurchase}>
          Last: {formatTime(product.lastPurchase)}
        </div>
      </div>

      <div style={styles.productStatus}>
        <span style={{
          ...styles.statusBadge,
          backgroundColor: product.status === 'active' ? 'rgba(0,210,106,0.15)' : 'rgba(255,255,255,0.05)',
          color: product.status === 'active' ? '#00D26A' : '#666'
        }}>
          {product.status === 'active' ? '● Active' : '○ Watching'}
        </span>
      </div>
    </div>
  );
}

function ActivityItem({ item, formatTime }) {
  return (
    <div style={styles.activityItem}>
      <div style={styles.activityIcon}>
        {item.status === 'completed' ? '✓' : '⏳'}
      </div>
      <div style={styles.activityContent}>
        <span style={styles.activityProduct}>{item.product}</span>
        <span style={styles.activityDetails}>
          {item.quantity}x from {item.retailer} • ${item.total?.toFixed(2)}
        </span>
      </div>
      <span style={styles.activityTime}>{formatTime(item.time)}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADD PRODUCT VIEW
// ═══════════════════════════════════════════════════════════════════════════════

function AddProductView({ searchQuery, setSearchQuery, handleSearch, isSearching, searchResults, addProduct }) {
  return (
    <div style={styles.addProduct}>
      <div style={styles.searchSection}>
        <h2 style={styles.addTitle}>Add Product to Track</h2>
        <p style={styles.addSubtitle}>Search for products across all retailers</p>
        
        <div style={styles.searchBox}>
          <input
            type="text"
            placeholder="Search for a product..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            style={styles.searchInput}
          />
          <button 
            onClick={handleSearch}
            disabled={isSearching}
            style={styles.searchButton}
          >
            {isSearching ? 'Searching...' : 'Search'}
          </button>
        </div>
      </div>

      {searchResults.length > 0 && (
        <div style={styles.resultsSection}>
          <h3 style={styles.resultsTitle}>Search Results</h3>
          <div style={styles.resultsList}>
            {searchResults.map((result, index) => (
              <div key={index} style={styles.resultCard}>
                <div style={styles.resultInfo}>
                  <h4 style={styles.resultName}>{result.name}</h4>
                  <div style={styles.resultMeta}>
                    <span style={styles.resultPrice}>${result.msrp}</span>
                    <span style={{
                      ...styles.resultAvailability,
                      color: result.available ? '#00D26A' : '#FF4444'
                    }}>
                      {result.available ? 'In Stock' : 'Out of Stock'}
                    </span>
                  </div>
                  <div style={styles.resultRetailers}>
                    {result.retailers.map((r, i) => (
                      <span key={i} style={styles.retailerTag}>{r}</span>
                    ))}
                  </div>
                </div>
                <button 
                  onClick={() => addProduct(result)}
                  style={styles.addButton}
                >
                  + Add
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={styles.suggestionsSection}>
        <h3 style={styles.suggestionsTitle}>Popular Searches</h3>
        <div style={styles.suggestionsList}>
          {['Surging Sparks ETB', 'Prismatic Evolutions', 'Topps Series 2', 'Panini Prizm'].map((term, i) => (
            <button 
              key={i}
              onClick={() => setSearchQuery(term)}
              style={styles.suggestionChip}
            >
              {term}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════

const styles = {
  app: {
    minHeight: '100vh',
    backgroundColor: '#0A0A0B',
    color: '#FFF',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
  },
  loadingSpinner: {
    fontSize: '48px',
  },
  loadingText: {
    marginTop: '16px',
    color: '#666',
    fontSize: '14px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 32px',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  logo: {
    margin: 0,
    fontSize: '20px',
    fontWeight: '700',
    color: '#FFF',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  logoIcon: {
    fontSize: '24px',
  },
  tagline: {
    fontSize: '13px',
    color: '#666',
    paddingLeft: '16px',
    borderLeft: '1px solid rgba(255,255,255,0.1)',
  },
  headerCenter: {
    display: 'flex',
    gap: '8px',
  },
  navBtn: {
    padding: '10px 20px',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: 'transparent',
    color: '#888',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  navBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: '#FFF',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  refreshBtn: {
    padding: '8px 12px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    fontSize: '16px',
  },
  systemStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    borderRadius: '20px',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  statusText: {
    fontSize: '13px',
    color: '#AAA',
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '12px 24px',
    backgroundColor: 'rgba(255,68,68,0.1)',
    borderBottom: '1px solid rgba(255,68,68,0.2)',
    color: '#FF4444',
    fontSize: '14px',
  },
  dismissBtn: {
    padding: '4px 8px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#FF4444',
    fontSize: '18px',
    cursor: 'pointer',
  },
  main: {
    padding: '32px',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  dashboard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  summaryRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '16px',
  },
  summaryCard: {
    padding: '24px',
    borderRadius: '12px',
    backgroundColor: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    transition: 'all 0.2s',
  },
  summaryCardActive: {
    backgroundColor: 'rgba(0,210,106,0.08)',
    borderColor: 'rgba(0,210,106,0.3)',
  },
  summaryValue: {
    fontSize: '32px',
    fontWeight: '700',
    color: '#FFF',
  },
  summaryLabel: {
    fontSize: '14px',
    color: '#888',
  },
  summarySubtitle: {
    fontSize: '12px',
    color: '#555',
  },
  contentGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 400px',
    gap: '24px',
  },
  productsSection: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.06)',
    padding: '20px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '20px',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '16px',
    fontWeight: '600',
    color: '#FFF',
  },
  productCount: {
    fontSize: '13px',
    color: '#666',
  },
  productsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  emptyState: {
    padding: '48px 24px',
    textAlign: 'center',
  },
  emptyIcon: {
    fontSize: '48px',
    opacity: 0.3,
  },
  emptyText: {
    margin: '16px 0 4px',
    fontSize: '16px',
    color: '#666',
  },
  emptySubtext: {
    margin: 0,
    fontSize: '13px',
    color: '#444',
  },
  productCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '20px',
    borderRadius: '12px',
    backgroundColor: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
    transition: 'all 0.2s',
  },
  productIcon: {
    fontSize: '32px',
    width: '56px',
    height: '56px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: '12px',
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    margin: 0,
    fontSize: '15px',
    fontWeight: '600',
    color: '#FFF',
  },
  productMeta: {
    display: 'flex',
    gap: '12px',
    marginTop: '4px',
  },
  productCategory: {
    fontSize: '12px',
    color: '#666',
  },
  productPrice: {
    fontSize: '12px',
    color: '#00D26A',
    fontWeight: '600',
  },
  productRetailers: {
    display: 'flex',
    gap: '6px',
    marginTop: '8px',
    flexWrap: 'wrap',
  },
  retailerTag: {
    padding: '3px 8px',
    borderRadius: '4px',
    backgroundColor: 'rgba(255,255,255,0.08)',
    fontSize: '11px',
    color: '#AAA',
  },
  productStats: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '4px',
    minWidth: '120px',
  },
  purchaseCount: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '4px',
  },
  purchaseNumber: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#FFF',
  },
  purchaseLabel: {
    fontSize: '12px',
    color: '#666',
  },
  lastPurchase: {
    fontSize: '11px',
    color: '#555',
  },
  productStatus: {
    marginLeft: '16px',
  },
  statusBadge: {
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '500',
  },
  activitySection: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.06)',
    padding: '20px',
  },
  activityList: {
    display: 'flex',
    flexDirection: 'column',
  },
  activityItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px 0',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  activityIcon: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    backgroundColor: 'rgba(0,210,106,0.15)',
    color: '#00D26A',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: '700',
  },
  activityContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  activityProduct: {
    fontSize: '13px',
    fontWeight: '500',
    color: '#FFF',
  },
  activityDetails: {
    fontSize: '12px',
    color: '#666',
  },
  activityTime: {
    fontSize: '12px',
    color: '#555',
  },
  addProduct: {
    maxWidth: '700px',
    margin: '0 auto',
  },
  searchSection: {
    textAlign: 'center',
    marginBottom: '40px',
  },
  addTitle: {
    margin: 0,
    fontSize: '28px',
    fontWeight: '600',
    color: '#FFF',
  },
  addSubtitle: {
    margin: '8px 0 24px',
    fontSize: '15px',
    color: '#666',
  },
  searchBox: {
    display: 'flex',
    gap: '12px',
  },
  searchInput: {
    flex: 1,
    padding: '16px 20px',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '10px',
    backgroundColor: 'rgba(255,255,255,0.05)',
    color: '#FFF',
    fontSize: '15px',
    outline: 'none',
  },
  searchButton: {
    padding: '16px 32px',
    border: 'none',
    borderRadius: '10px',
    backgroundColor: '#00D26A',
    color: '#000',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  resultsSection: {
    marginBottom: '40px',
  },
  resultsTitle: {
    margin: '0 0 16px',
    fontSize: '16px',
    fontWeight: '600',
    color: '#AAA',
  },
  resultsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  resultCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px',
    borderRadius: '12px',
    backgroundColor: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
  },
  resultInfo: {
    flex: 1,
  },
  resultName: {
    margin: 0,
    fontSize: '15px',
    fontWeight: '600',
    color: '#FFF',
  },
  resultMeta: {
    display: 'flex',
    gap: '16px',
    marginTop: '6px',
  },
  resultPrice: {
    fontSize: '14px',
    color: '#00D26A',
    fontWeight: '600',
  },
  resultAvailability: {
    fontSize: '13px',
  },
  resultRetailers: {
    display: 'flex',
    gap: '6px',
    marginTop: '10px',
  },
  addButton: {
    padding: '12px 24px',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: 'rgba(0,210,106,0.15)',
    color: '#00D26A',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  suggestionsSection: {
    textAlign: 'center',
    padding: '32px 0',
    borderTop: '1px solid rgba(255,255,255,0.06)',
  },
  suggestionsTitle: {
    margin: '0 0 16px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#666',
  },
  suggestionsList: {
    display: 'flex',
    justifyContent: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  suggestionChip: {
    padding: '10px 18px',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '20px',
    backgroundColor: 'transparent',
    color: '#AAA',
    fontSize: '13px',
    cursor: 'pointer',
  },
};
