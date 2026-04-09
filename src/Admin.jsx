import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { engine } from './engineClient';

// ═══════════════════════════════════════════════════════════════════════════════
// DROPWATCH ADMIN PANEL
// Full product management, purchase history, system controls
// ═══════════════════════════════════════════════════════════════════════════════

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState('products');
  const [products, setProducts] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingProduct, setEditingProduct] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [engineStatus, setEngineStatus] = useState('stopped');
  const [engineStats, setEngineStats] = useState({});
  const [engineLoading, setEngineLoading] = useState(false);
  const [settings, setSettings] = useState({
    systemActive: false,
    checkInterval: 30,
    maxQuantityPerProduct: 2,
    alertEmail: 'ryan@radical.company'
  });

  useEffect(() => {
    fetchData();
    fetchEngineStatus();
  }, []);

  const fetchEngineStatus = async () => {
    const status = await engine.getStatus();
    setEngineStatus(status.status);
    setEngineStats(status.stats || {});
    setSettings(prev => ({ ...prev, systemActive: status.status === 'running' }));
  };

  const toggleEngine = async () => {
    setEngineLoading(true);
    try {
      if (settings.systemActive) {
        await engine.stop();
      } else {
        await engine.start();
      }
      // Wait a moment then refresh status
      setTimeout(async () => {
        await fetchEngineStatus();
        setEngineLoading(false);
      }, 1000);
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
    } catch (err) {
      console.error('Error fetching data:', err);
    }
    setLoading(false);
  };

  const deleteProduct = async (id) => {
    if (!confirm('Delete this product?')) return;
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (!error) {
      setProducts(products.filter(p => p.id !== id));
    }
  };

  const toggleProductActive = async (product) => {
    const { error } = await supabase
      .from('products')
      .update({ is_active: !product.is_active })
      .eq('id', product.id);
    
    if (!error) {
      setProducts(products.map(p => 
        p.id === product.id ? { ...p, is_active: !p.is_active } : p
      ));
    }
  };

  const saveProduct = async (productData) => {
    if (editingProduct) {
      const { error } = await supabase
        .from('products')
        .update(productData)
        .eq('id', editingProduct.id);
      
      if (!error) {
        setProducts(products.map(p => 
          p.id === editingProduct.id ? { ...p, ...productData } : p
        ));
        setEditingProduct(null);
      }
    } else {
      const { data, error } = await supabase
        .from('products')
        .insert([productData])
        .select();
      
      if (!error && data) {
        setProducts([data[0], ...products]);
        setShowAddModal(false);
      }
    }
  };

  return (
    <div style={styles.app}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.logo}>
            <span style={styles.logoIcon}>⚡</span>
            DROPWATCH
            <span style={styles.adminBadge}>ADMIN</span>
          </h1>
        </div>
        <div style={styles.headerRight}>
          <a href="/" style={styles.backLink}>← Back to Dashboard</a>
        </div>
      </header>

      {/* Tabs */}
      <div style={styles.tabs}>
        {['products', 'purchases', 'settings'].map(tab => (
          <button
            key={tab}
            style={{
              ...styles.tab,
              ...(activeTab === tab ? styles.tabActive : {})
            }}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'products' && '📦 '}
            {tab === 'purchases' && '🛒 '}
            {tab === 'settings' && '⚙️ '}
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <main style={styles.main}>
        {loading ? (
          <div style={styles.loading}>Loading...</div>
        ) : (
          <>
            {activeTab === 'products' && (
              <ProductsTab 
                products={products}
                onEdit={setEditingProduct}
                onDelete={deleteProduct}
                onToggle={toggleProductActive}
                onAdd={() => setShowAddModal(true)}
              />
            )}
            {activeTab === 'purchases' && (
              <PurchasesTab purchases={purchases} />
            )}
            {activeTab === 'settings' && (
              <SettingsTab settings={settings} setSettings={setSettings} />
            )}
          </>
        )}
      </main>

      {/* Edit/Add Modal */}
      {(editingProduct || showAddModal) && (
        <ProductModal
          product={editingProduct}
          onSave={saveProduct}
          onClose={() => {
            setEditingProduct(null);
            setShowAddModal(false);
          }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCTS TAB
// ═══════════════════════════════════════════════════════════════════════════════

function ProductsTab({ products, onEdit, onDelete, onToggle, onAdd }) {
  return (
    <div>
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>Products ({products.length})</h2>
        <button style={styles.addButton} onClick={onAdd}>
          + Add Product
        </button>
      </div>

      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Name</th>
            <th style={styles.th}>Retailer</th>
            <th style={styles.th}>Target Price</th>
            <th style={styles.th}>Max Qty</th>
            <th style={styles.th}>Purchased</th>
            <th style={styles.th}>Status</th>
            <th style={styles.th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {products.map(product => (
            <tr key={product.id} style={styles.tr}>
              <td style={styles.td}>
                <div style={styles.productName}>{product.name}</div>
                <div style={styles.productUrl}>{product.url?.slice(0, 40)}...</div>
              </td>
              <td style={styles.td}>{product.retailer}</td>
              <td style={styles.td}>${parseFloat(product.target_price).toFixed(2)}</td>
              <td style={styles.td}>{product.max_quantity}</td>
              <td style={styles.td}>{product.purchase_count || 0}</td>
              <td style={styles.td}>
                <button
                  style={{
                    ...styles.statusToggle,
                    backgroundColor: product.is_active ? 'rgba(0,210,106,0.2)' : 'rgba(255,255,255,0.05)',
                    color: product.is_active ? '#00D26A' : '#666'
                  }}
                  onClick={() => onToggle(product)}
                >
                  {product.is_active ? '● Active' : '○ Paused'}
                </button>
              </td>
              <td style={styles.td}>
                <div style={styles.actions}>
                  <button style={styles.actionBtn} onClick={() => onEdit(product)}>Edit</button>
                  <button style={{...styles.actionBtn, ...styles.deleteBtn}} onClick={() => onDelete(product.id)}>Delete</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PURCHASES TAB
// ═══════════════════════════════════════════════════════════════════════════════

function PurchasesTab({ purchases }) {
  const totalSpent = purchases.reduce((sum, p) => sum + parseFloat(p.total || 0), 0);

  return (
    <div>
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>Purchase History ({purchases.length})</h2>
        <div style={styles.totalSpent}>
          Total Spent: <span style={styles.totalAmount}>${totalSpent.toFixed(2)}</span>
        </div>
      </div>

      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Date</th>
            <th style={styles.th}>Product</th>
            <th style={styles.th}>Retailer</th>
            <th style={styles.th}>Qty</th>
            <th style={styles.th}>Price</th>
            <th style={styles.th}>Total</th>
            <th style={styles.th}>Order #</th>
            <th style={styles.th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {purchases.map(purchase => (
            <tr key={purchase.id} style={styles.tr}>
              <td style={styles.td}>
                {new Date(purchase.purchased_at).toLocaleDateString()}
                <div style={styles.timeText}>
                  {new Date(purchase.purchased_at).toLocaleTimeString()}
                </div>
              </td>
              <td style={styles.td}>{purchase.product_name}</td>
              <td style={styles.td}>{purchase.retailer}</td>
              <td style={styles.td}>{purchase.quantity}</td>
              <td style={styles.td}>${parseFloat(purchase.price).toFixed(2)}</td>
              <td style={{...styles.td, color: '#00D26A', fontWeight: '600'}}>
                ${parseFloat(purchase.total).toFixed(2)}
              </td>
              <td style={styles.td}>
                <code style={styles.orderNumber}>{purchase.order_number}</code>
              </td>
              <td style={styles.td}>
                <span style={{
                  ...styles.statusBadge,
                  backgroundColor: purchase.status === 'completed' ? 'rgba(0,210,106,0.2)' : 'rgba(255,193,7,0.2)',
                  color: purchase.status === 'completed' ? '#00D26A' : '#FFC107'
                }}>
                  {purchase.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS TAB
// ═══════════════════════════════════════════════════════════════════════════════

function SettingsTab({ settings, setSettings }) {
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={styles.settingsContainer}>
      <h2 style={styles.sectionTitle}>System Settings</h2>

      <div style={styles.settingGroup}>
        <label style={styles.settingLabel}>System Status</label>
        <button
          style={{
            ...styles.bigToggle,
            backgroundColor: settings.systemActive ? '#00D26A' : '#333'
          }}
          onClick={() => toggleEngine()}
        >
          {engineLoading ? '⏳ ...' : settings.systemActive ? '● ACTIVE' : '○ PAUSED'}
        </button>
        <p style={styles.settingHelp}>
          {settings.systemActive 
            ? 'System is actively monitoring and purchasing' 
            : 'System is paused - no purchases will be made'}
        </p>
      </div>

      <div style={styles.settingGroup}>
        <label style={styles.settingLabel}>Check Interval (seconds)</label>
        <input
          type="number"
          value={settings.checkInterval}
          onChange={(e) => setSettings({ ...settings, checkInterval: parseInt(e.target.value) })}
          style={styles.input}
          min="10"
          max="300"
        />
        <p style={styles.settingHelp}>How often to check retailer sites for stock</p>
      </div>

      <div style={styles.settingGroup}>
        <label style={styles.settingLabel}>Default Max Quantity</label>
        <input
          type="number"
          value={settings.maxQuantityPerProduct}
          onChange={(e) => setSettings({ ...settings, maxQuantityPerProduct: parseInt(e.target.value) })}
          style={styles.input}
          min="1"
          max="10"
        />
        <p style={styles.settingHelp}>Maximum quantity to purchase per product per check</p>
      </div>

      <div style={styles.settingGroup}>
        <label style={styles.settingLabel}>Alert Email</label>
        <input
          type="email"
          value={settings.alertEmail}
          onChange={(e) => setSettings({ ...settings, alertEmail: e.target.value })}
          style={styles.input}
          placeholder="your@email.com"
        />
        <p style={styles.settingHelp}>Email address for purchase notifications</p>
      </div>

      <button style={styles.saveButton} onClick={handleSave}>
        {saved ? '✓ Saved!' : 'Save Settings'}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCT MODAL
// ═══════════════════════════════════════════════════════════════════════════════

function ProductModal({ product, onSave, onClose }) {
  const [form, setForm] = useState({
    name: product?.name || '',
    retailer: product?.retailer || 'Target',
    url: product?.url || '',
    target_price: product?.target_price || '',
    max_quantity: product?.max_quantity || 1,
    is_active: product?.is_active ?? true
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <h2 style={styles.modalTitle}>
          {product ? 'Edit Product' : 'Add Product'}
        </h2>
        
        <form onSubmit={handleSubmit}>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Product Name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              style={styles.formInput}
              placeholder="Surging Sparks Elite Trainer Box"
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Retailer</label>
            <select
              value={form.retailer}
              onChange={e => setForm({ ...form, retailer: e.target.value })}
              style={styles.formInput}
            >
              <option value="Target">Target</option>
              <option value="Walmart">Walmart</option>
              <option value="Best Buy">Best Buy</option>
              <option value="Pokemon Center">Pokemon Center</option>
              <option value="GameStop">GameStop</option>
              <option value="Amazon">Amazon</option>
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Product URL</label>
            <input
              type="url"
              value={form.url}
              onChange={e => setForm({ ...form, url: e.target.value })}
              style={styles.formInput}
              placeholder="https://www.target.com/p/..."
              required
            />
          </div>

          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Target Price</label>
              <input
                type="number"
                step="0.01"
                value={form.target_price}
                onChange={e => setForm({ ...form, target_price: e.target.value })}
                style={styles.formInput}
                placeholder="49.99"
                required
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Max Quantity</label>
              <input
                type="number"
                value={form.max_quantity}
                onChange={e => setForm({ ...form, max_quantity: parseInt(e.target.value) })}
                style={styles.formInput}
                min="1"
                max="10"
              />
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={e => setForm({ ...form, is_active: e.target.checked })}
              />
              Active (start monitoring immediately)
            </label>
          </div>

          <div style={styles.modalActions}>
            <button type="button" style={styles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" style={styles.submitBtn}>
              {product ? 'Save Changes' : 'Add Product'}
            </button>
          </div>
        </form>
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
  adminBadge: {
    marginLeft: '12px',
    padding: '4px 10px',
    backgroundColor: 'rgba(255,68,68,0.2)',
    color: '#FF4444',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '1px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
  },
  backLink: {
    color: '#888',
    textDecoration: 'none',
    fontSize: '14px',
  },
  tabs: {
    display: 'flex',
    gap: '8px',
    padding: '16px 32px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  tab: {
    padding: '12px 24px',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: 'transparent',
    color: '#888',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  tabActive: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: '#FFF',
  },
  main: {
    padding: '32px',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  loading: {
    textAlign: 'center',
    padding: '48px',
    color: '#666',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '24px',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '20px',
    fontWeight: '600',
    color: '#FFF',
  },
  addButton: {
    padding: '12px 24px',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: '#00D26A',
    color: '#000',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: '12px',
    overflow: 'hidden',
  },
  th: {
    textAlign: 'left',
    padding: '16px',
    backgroundColor: 'rgba(255,255,255,0.05)',
    color: '#888',
    fontSize: '12px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  tr: {
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  td: {
    padding: '16px',
    fontSize: '14px',
    color: '#CCC',
  },
  productName: {
    fontWeight: '600',
    color: '#FFF',
  },
  productUrl: {
    fontSize: '12px',
    color: '#666',
    marginTop: '4px',
  },
  statusToggle: {
    padding: '6px 12px',
    border: 'none',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  actions: {
    display: 'flex',
    gap: '8px',
  },
  actionBtn: {
    padding: '6px 12px',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    color: '#AAA',
    fontSize: '12px',
    cursor: 'pointer',
  },
  deleteBtn: {
    borderColor: 'rgba(255,68,68,0.3)',
    color: '#FF4444',
  },
  totalSpent: {
    fontSize: '14px',
    color: '#888',
  },
  totalAmount: {
    color: '#00D26A',
    fontWeight: '700',
    fontSize: '18px',
  },
  timeText: {
    fontSize: '11px',
    color: '#555',
    marginTop: '2px',
  },
  orderNumber: {
    padding: '4px 8px',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: '4px',
    fontSize: '11px',
    fontFamily: 'monospace',
  },
  statusBadge: {
    padding: '4px 10px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: '500',
  },
  settingsContainer: {
    maxWidth: '600px',
  },
  settingGroup: {
    marginBottom: '32px',
  },
  settingLabel: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '600',
    color: '#FFF',
    marginBottom: '8px',
  },
  settingHelp: {
    margin: '8px 0 0',
    fontSize: '12px',
    color: '#666',
  },
  input: {
    width: '100%',
    maxWidth: '300px',
    padding: '12px 16px',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '8px',
    backgroundColor: 'rgba(255,255,255,0.05)',
    color: '#FFF',
    fontSize: '14px',
    outline: 'none',
  },
  bigToggle: {
    padding: '16px 32px',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '700',
    color: '#FFF',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  saveButton: {
    padding: '14px 32px',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: '#00D26A',
    color: '#000',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    width: '500px',
    maxWidth: '90vw',
    backgroundColor: '#1a1a1b',
    borderRadius: '16px',
    padding: '32px',
    border: '1px solid rgba(255,255,255,0.1)',
  },
  modalTitle: {
    margin: '0 0 24px',
    fontSize: '20px',
    fontWeight: '600',
    color: '#FFF',
  },
  formGroup: {
    marginBottom: '20px',
    flex: 1,
  },
  formRow: {
    display: 'flex',
    gap: '16px',
  },
  formLabel: {
    display: 'block',
    fontSize: '13px',
    fontWeight: '500',
    color: '#AAA',
    marginBottom: '8px',
  },
  formInput: {
    width: '100%',
    padding: '12px 16px',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '8px',
    backgroundColor: 'rgba(255,255,255,0.05)',
    color: '#FFF',
    fontSize: '14px',
    outline: 'none',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    color: '#AAA',
    cursor: 'pointer',
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '24px',
    paddingTop: '24px',
    borderTop: '1px solid rgba(255,255,255,0.1)',
  },
  cancelBtn: {
    padding: '12px 24px',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '8px',
    backgroundColor: 'transparent',
    color: '#AAA',
    fontSize: '14px',
    cursor: 'pointer',
  },
  submitBtn: {
    padding: '12px 24px',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: '#00D26A',
    color: '#000',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
};
