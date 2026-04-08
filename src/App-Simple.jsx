import React, { useState, useEffect } from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// DROPWATCH - SIMPLIFIED DASHBOARD
// Clean interface focused on products and results
// ═══════════════════════════════════════════════════════════════════════════════

// Mock data
const mockProducts = [
  { 
    id: 1, 
    name: 'Surging Sparks Elite Trainer Box', 
    image: '⚡',
    category: 'Pokemon',
    msrp: 49.99,
    status: 'active',
    purchased: { today: 4, week: 18, month: 47, total: 47 },
    retailers: ['Target', 'Walmart', 'Pokemon Center'],
    lastPurchase: Date.now() - 3600000,
    successRate: 0.78
  },
  { 
    id: 2, 
    name: 'Prismatic Evolutions Booster Bundle', 
    image: '✨',
    category: 'Pokemon',
    msrp: 39.99,
    status: 'active',
    purchased: { today: 2, week: 12, month: 31, total: 31 },
    retailers: ['Target', 'Best Buy'],
    lastPurchase: Date.now() - 7200000,
    successRate: 0.65
  },
  { 
    id: 3, 
    name: 'Topps Series 2 Hobby Box', 
    image: '⚾',
    category: 'Sports',
    msrp: 89.99,
    status: 'active',
    purchased: { today: 1, week: 5, month: 12, total: 12 },
    retailers: ['Target', 'Walmart'],
    lastPurchase: Date.now() - 14400000,
    successRate: 0.82
  },
  { 
    id: 4, 
    name: 'Panini Prizm Basketball Blaster', 
    image: '🏀',
    category: 'Sports',
    msrp: 29.99,
    status: 'watching',
    purchased: { today: 0, week: 0, month: 0, total: 0 },
    retailers: ['Target', 'Walmart', 'Fanatics'],
    lastPurchase: null,
    successRate: 0
  },
];

const mockActivity = [
  { id: 1, product: 'Surging Sparks ETB', retailer: 'Target', quantity: 2, time: Date.now() - 1800000, status: 'success' },
  { id: 2, product: 'Surging Sparks ETB', retailer: 'Walmart', quantity: 1, time: Date.now() - 3600000, status: 'success' },
  { id: 3, product: 'Prismatic Evolutions Bundle', retailer: 'Target', quantity: 2, time: Date.now() - 5400000, status: 'success' },
  { id: 4, product: 'Surging Sparks ETB', retailer: 'Pokemon Center', quantity: 1, time: Date.now() - 7200000, status: 'success' },
  { id: 5, product: 'Topps Series 2 Hobby', retailer: 'Target', quantity: 1, time: Date.now() - 10800000, status: 'success' },
];

export default function Dashboard() {
  const [view, setView] = useState('dashboard');
  const [products, setProducts] = useState(mockProducts);
  const [activity, setActivity] = useState(mockActivity);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [timePeriod, setTimePeriod] = useState('today');
  const [systemActive, setSystemActive] = useState(true);

  // Calculate totals
  const totals = {
    today: products.reduce((sum, p) => sum + p.purchased.today, 0),
    week: products.reduce((sum, p) => sum + p.purchased.week, 0),
    month: products.reduce((sum, p) => sum + p.purchased.month, 0),
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
    
    // Simulate search - in real app this would search retailer APIs
    setTimeout(() => {
      setSearchResults([
        { name: searchQuery, retailers: ['Target', 'Walmart', 'Best Buy'], msrp: 49.99, available: true },
        { name: `${searchQuery} Bundle`, retailers: ['Pokemon Center'], msrp: 39.99, available: true },
        { name: `${searchQuery} Collection`, retailers: ['GameStop'], msrp: 119.99, available: false },
      ]);
      setIsSearching(false);
    }, 1000);
  };

  const addProduct = (product) => {
    const newProduct = {
      id: products.length + 1,
      name: product.name,
      image: '📦',
      category: 'New',
      msrp: product.msrp,
      status: 'active',
      purchased: { today: 0, week: 0, month: 0, total: 0 },
      retailers: product.retailers,
      lastPurchase: null,
      successRate: 0
    };
    setProducts([...products, newProduct]);
    setSearchResults([]);
    setSearchQuery('');
    setView('dashboard');
  };

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
        </div>

        <div style={styles.headerRight}>
          <div style={styles.systemStatus}>
            <span style={{...styles.statusDot, backgroundColor: systemActive ? '#00D26A' : '#666'}} />
            <span style={styles.statusText}>{systemActive ? 'Active' : 'Paused'}</span>
          </div>
          <button 
            style={styles.adminLink}
            onClick={() => window.location.href = '/admin'}
          >
            Admin
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main style={styles.main}>
        {view === 'dashboard' && (
          <DashboardView 
            products={products}
            activity={activity}
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

function DashboardView({ products, activity, totals, timePeriod, setTimePeriod, formatTime }) {
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
            <div style={styles.filterTabs}>
              <button style={{...styles.filterTab, ...styles.filterTabActive}}>All</button>
              <button style={styles.filterTab}>Pokemon</button>
              <button style={styles.filterTab}>Sports</button>
            </div>
          </div>
          
          <div style={styles.productsList}>
            {products.map(product => (
              <ProductCard 
                key={product.id} 
                product={product} 
                timePeriod={timePeriod}
                formatTime={formatTime}
              />
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div style={styles.activitySection}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Recent Purchases</h2>
          </div>
          
          <div style={styles.activityList}>
            {activity.map(item => (
              <ActivityItem key={item.id} item={item} formatTime={formatTime} />
            ))}
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
  const purchaseCount = product.purchased[timePeriod] || product.purchased.today;
  
  return (
    <div style={styles.productCard}>
      <div style={styles.productIcon}>{product.image}</div>
      
      <div style={styles.productInfo}>
        <h3 style={styles.productName}>{product.name}</h3>
        <div style={styles.productMeta}>
          <span style={styles.productCategory}>{product.category}</span>
          <span style={styles.productPrice}>${product.msrp}</span>
        </div>
        <div style={styles.productRetailers}>
          {product.retailers.map(r => (
            <span key={r} style={styles.retailerTag}>{r}</span>
          ))}
        </div>
      </div>

      <div style={styles.productStats}>
        <div style={styles.purchaseCount}>
          <span style={styles.purchaseNumber}>{purchaseCount}</span>
          <span style={styles.purchaseLabel}>purchased</span>
        </div>
        {product.lastPurchase && (
          <span style={styles.lastPurchase}>Last: {formatTime(product.lastPurchase)}</span>
        )}
        {product.successRate > 0 && (
          <div style={styles.successRate}>
            <div style={styles.successBar}>
              <div style={{...styles.successFill, width: `${product.successRate * 100}%`}} />
            </div>
            <span style={styles.successText}>{Math.round(product.successRate * 100)}% success</span>
          </div>
        )}
      </div>

      <div style={styles.productStatus}>
        <span style={{
          ...styles.statusBadge,
          backgroundColor: product.status === 'active' ? 'rgba(0,210,106,0.15)' : 'rgba(255,255,255,0.1)',
          color: product.status === 'active' ? '#00D26A' : '#888'
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
      <div style={styles.activityIcon}>✓</div>
      <div style={styles.activityContent}>
        <span style={styles.activityProduct}>{item.product}</span>
        <span style={styles.activityDetails}>
          {item.quantity}x from {item.retailer}
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
        <h2 style={styles.addTitle}>Add New Product</h2>
        <p style={styles.addSubtitle}>Search for products across all retailers</p>
        
        <div style={styles.searchBox}>
          <input
            type="text"
            placeholder="Search for a product (e.g., 'Surging Sparks ETB')"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            style={styles.searchInput}
          />
          <button 
            style={styles.searchButton}
            onClick={handleSearch}
            disabled={isSearching}
          >
            {isSearching ? 'Searching...' : 'Search'}
          </button>
        </div>
      </div>

      {searchResults.length > 0 && (
        <div style={styles.resultsSection}>
          <h3 style={styles.resultsTitle}>Search Results</h3>
          <div style={styles.resultsList}>
            {searchResults.map((result, idx) => (
              <div key={idx} style={styles.resultCard}>
                <div style={styles.resultInfo}>
                  <h4 style={styles.resultName}>{result.name}</h4>
                  <div style={styles.resultMeta}>
                    <span style={styles.resultPrice}>${result.msrp}</span>
                    <span style={{
                      ...styles.resultAvailability,
                      color: result.available ? '#00D26A' : '#FF6B6B'
                    }}>
                      {result.available ? '● Available' : '○ Not Available'}
                    </span>
                  </div>
                  <div style={styles.resultRetailers}>
                    {result.retailers.map(r => (
                      <span key={r} style={styles.retailerTag}>{r}</span>
                    ))}
                  </div>
                </div>
                <button 
                  style={{
                    ...styles.addButton,
                    opacity: result.available ? 1 : 0.5
                  }}
                  onClick={() => result.available && addProduct(result)}
                  disabled={!result.available}
                >
                  + Add to Tracking
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Add Suggestions */}
      <div style={styles.suggestionsSection}>
        <h3 style={styles.suggestionsTitle}>Popular Products</h3>
        <div style={styles.suggestionsList}>
          {['Surging Sparks', 'Prismatic Evolutions', 'Topps Chrome', 'Panini Prizm'].map(term => (
            <button 
              key={term}
              style={styles.suggestionChip}
              onClick={() => setSearchQuery(term)}
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
    backgroundColor: '#0D0D0F',
    color: '#FFFFFF',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  
  // Header
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 32px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    backgroundColor: '#0D0D0F',
    position: 'sticky',
    top: 0,
    zIndex: 100,
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
    letterSpacing: '-0.5px',
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
    borderLeft: '1px solid #333',
  },
  headerCenter: {
    display: 'flex',
    gap: '8px',
  },
  navBtn: {
    padding: '10px 20px',
    border: 'none',
    borderRadius: '8px',
    background: 'transparent',
    color: '#888',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  navBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: '#FFF',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
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
  adminLink: {
    padding: '8px 16px',
    border: '1px solid #333',
    borderRadius: '6px',
    background: 'transparent',
    color: '#888',
    fontSize: '13px',
    cursor: 'pointer',
  },

  // Main
  main: {
    padding: '32px',
    maxWidth: '1400px',
    margin: '0 auto',
  },

  // Dashboard
  dashboard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
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
    alignItems: 'center',
    transition: 'all 0.2s',
  },
  summaryCardActive: {
    backgroundColor: 'rgba(0,210,106,0.1)',
    borderColor: 'rgba(0,210,106,0.3)',
  },
  summaryValue: {
    fontSize: '36px',
    fontWeight: '700',
    color: '#FFF',
    lineHeight: 1,
  },
  summaryLabel: {
    fontSize: '14px',
    color: '#888',
    marginTop: '8px',
  },
  summarySubtitle: {
    fontSize: '12px',
    color: '#555',
    marginTop: '2px',
  },

  // Content Grid
  contentGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 380px',
    gap: '24px',
  },
  
  // Products Section
  productsSection: {
    display: 'flex',
    flexDirection: 'column',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '18px',
    fontWeight: '600',
    color: '#FFF',
  },
  filterTabs: {
    display: 'flex',
    gap: '4px',
  },
  filterTab: {
    padding: '6px 14px',
    border: 'none',
    borderRadius: '6px',
    background: 'transparent',
    color: '#666',
    fontSize: '13px',
    cursor: 'pointer',
  },
  filterTabActive: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: '#FFF',
  },
  productsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
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
  successRate: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '4px',
  },
  successBar: {
    width: '50px',
    height: '4px',
    borderRadius: '2px',
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  successFill: {
    height: '100%',
    backgroundColor: '#00D26A',
    borderRadius: '2px',
  },
  successText: {
    fontSize: '11px',
    color: '#666',
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

  // Activity Section
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

  // Add Product View
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
