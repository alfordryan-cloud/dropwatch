// ═══════════════════════════════════════════════════════════════════════════════
// WALMART RETAILER ADAPTER
// Full implementation for Walmart.com checkout automation
// ═══════════════════════════════════════════════════════════════════════════════

import { 
  BaseRetailerAdapter, 
  CheckoutFlowType, 
  InventoryStatus, 
  ProductStatus,
  CheckoutResult,
  adapterRegistry 
} from './base.js';

export class WalmartAdapter extends BaseRetailerAdapter {
  constructor(config = {}) {
    super(config);
    
    this.name = 'Walmart';
    this.baseUrl = 'https://www.walmart.com';
    this.checkoutFlowType = CheckoutFlowType.STANDARD;
    
    // Walmart-specific settings
    this.maxQuantityPerItem = 3;
    
    // Selectors
    this.selectors = {
      // Product page
      productTitle: '[itemprop="name"], h1[data-automation="product-title"]',
      productPrice: '[itemprop="price"], [data-automation="buybox-price"]',
      addToCartButton: '[data-automation="cta-button"], button[data-tl-id="ProductPrimaryCTA-cta_add_to_cart_button"]',
      outOfStockIndicator: '[data-automation="out-of-stock-message"]',
      
      // Stock indicators
      inStoreOnly: '[data-automation="in-store-only"]',
      pickupAvailable: '[data-automation="pickup-available"]',
      deliveryAvailable: '[data-automation="delivery-available"]',
      shippingAvailable: '[data-automation="shipping-available"]',
      
      // Quantity
      quantityInput: '[data-automation="quantity-input"]',
      quantityIncrease: '[data-automation="quantity-increase"]',
      
      // Cart
      cartIcon: '[data-automation="cart-button"]',
      cartCount: '[data-automation="cart-count"]',
      cartFlyout: '[data-automation="cart-flyout"]',
      cartItems: '[data-automation="cart-item"]',
      cartTotal: '[data-automation="cart-total"]',
      checkoutButton: '[data-automation="checkout-button"], [data-tl-id="CartCheckoutButton"]',
      
      // Checkout
      continueButton: '[data-automation="continue-button"]',
      
      // Shipping
      shippingAddressForm: '[data-automation="shipping-address-form"]',
      savedAddresses: '[data-automation="saved-address"]',
      selectAddressButton: '[data-automation="select-address"]',
      
      // Payment
      paymentSection: '[data-automation="payment-section"]',
      savedPayments: '[data-automation="saved-payment"]',
      selectPaymentButton: '[data-automation="select-payment"]',
      cvvInput: '[data-automation="cvv-input"]',
      
      // Review & Place Order
      reviewSection: '[data-automation="review-section"]',
      placeOrderButton: '[data-automation="place-order-button"]',
      orderConfirmation: '[data-automation="order-confirmation"]',
      orderNumber: '[data-automation="order-number"]',
      
      // Auth
      signInButton: '[data-automation="sign-in-button"]',
      emailInput: '#email',
      passwordInput: '#password',
      loginSubmit: '[data-automation="signin-submit"]',
      accountButton: '[data-automation="account-button"]',
      signOutButton: '[data-automation="sign-out-button"]',
      
      // Errors & Alerts
      errorAlert: '[data-automation="error-alert"]',
      outOfStockError: '[data-automation="oos-error"]',
      quantityError: '[data-automation="quantity-error"]',
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // AUTHENTICATION
  // ─────────────────────────────────────────────────────────────────────────────

  async login(credentials) {
    this.emit('loginStarted');
    
    try {
      await this.navigateTo(`${this.baseUrl}/account/login`);
      
      if (await this.isLoggedIn()) {
        this.emit('loginSkipped', { reason: 'Already logged in' });
        return { success: true, skipped: true };
      }
      
      // Enter email
      await this.utils.waitAndFill(this.selectors.emailInput, credentials.email);
      await this.utils.humanDelay(200, 400);
      
      // Enter password
      await this.utils.waitAndFill(this.selectors.passwordInput, credentials.password);
      await this.utils.humanDelay(200, 400);
      
      // Submit
      await this.utils.waitAndClick(this.selectors.loginSubmit);
      
      // Wait for redirect
      await this.page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 });
      
      // Verify
      if (await this.isLoggedIn()) {
        this.emit('loginSuccess');
        return { success: true };
      }
      
      throw new Error('Login verification failed');
      
    } catch (error) {
      this.emit('loginFailed', { error: error.message });
      await this.screenshot('login_failed');
      throw error;
    }
  }

  async isLoggedIn() {
    try {
      const accountBtn = await this.page.$(this.selectors.accountButton);
      if (accountBtn) {
        const text = await accountBtn.textContent();
        return text && !text.toLowerCase().includes('sign in');
      }
      return false;
    } catch {
      return false;
    }
  }

  async logout() {
    await this.utils.waitAndClick(this.selectors.accountButton);
    await this.utils.humanDelay(300, 500);
    await this.utils.waitAndClick(this.selectors.signOutButton);
    await this.utils.waitForNavigation();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PRODUCT MONITORING
  // ─────────────────────────────────────────────────────────────────────────────

  async checkProduct(productUrl) {
    this.emit('checkingProduct', { url: productUrl });
    
    try {
      await this.navigateTo(productUrl);
      
      const result = {
        url: productUrl,
        timestamp: Date.now(),
        status: ProductStatus.LIVE,
        inventory: InventoryStatus.UNKNOWN,
        price: null,
        title: null,
        canAddToCart: false,
        fulfillment: {
          shipping: false,
          pickup: false,
          delivery: false,
        },
      };
      
      // Get title
      result.title = await this.utils.getText(this.selectors.productTitle);
      
      // Get price
      const priceText = await this.utils.getText(this.selectors.productPrice);
      result.price = await this.extractPrice(priceText);
      
      // Check stock status
      const outOfStock = await this.utils.isVisible(this.selectors.outOfStockIndicator, 2000);
      
      if (outOfStock) {
        result.inventory = InventoryStatus.OOS;
        result.status = ProductStatus.SOLD_OUT;
      } else {
        // Check add to cart availability
        const addToCartBtn = await this.page.$(this.selectors.addToCartButton);
        if (addToCartBtn) {
          const isDisabled = await addToCartBtn.getAttribute('disabled');
          const ariaDisabled = await addToCartBtn.getAttribute('aria-disabled');
          result.canAddToCart = !isDisabled && ariaDisabled !== 'true';
        }
        
        if (result.canAddToCart) {
          result.inventory = InventoryStatus.IN_STOCK;
        }
        
        // Check fulfillment options
        result.fulfillment.shipping = await this.utils.isVisible(this.selectors.shippingAvailable, 1000);
        result.fulfillment.pickup = await this.utils.isVisible(this.selectors.pickupAvailable, 1000);
        result.fulfillment.delivery = await this.utils.isVisible(this.selectors.deliveryAvailable, 1000);
        
        // In-store only?
        const inStoreOnly = await this.utils.isVisible(this.selectors.inStoreOnly, 1000);
        if (inStoreOnly) {
          result.inventory = InventoryStatus.REGIONAL;
        }
      }
      
      this.emit('productChecked', result);
      return result;
      
    } catch (error) {
      this.emit('checkFailed', { url: productUrl, error: error.message });
      throw error;
    }
  }

  async getProductDetails(productUrl) {
    const basic = await this.checkProduct(productUrl);
    
    // Extract additional details from page
    const details = {
      ...basic,
      upc: await this.extractUPC(),
      itemId: await this.extractItemId(),
    };
    
    return details;
  }

  async extractUPC() {
    try {
      // UPC is often in page data or specifications
      const specs = await this.page.$('[data-automation="product-specifications"]');
      if (specs) {
        const text = await specs.textContent();
        const match = text?.match(/UPC[:\s]*(\d{12,14})/i);
        return match ? match[1] : null;
      }
      return null;
    } catch {
      return null;
    }
  }

  async extractItemId() {
    try {
      const url = this.page.url();
      const match = url.match(/\/ip\/[^\/]+\/(\d+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CART OPERATIONS
  // ─────────────────────────────────────────────────────────────────────────────

  async addToCart(productUrl, quantity = 1) {
    this.emit('addingToCart', { url: productUrl, quantity });
    
    try {
      if (!this.page.url().includes(productUrl)) {
        await this.navigateTo(productUrl);
      }
      
      // Set quantity if needed
      if (quantity > 1) {
        const qtyInput = await this.page.$(this.selectors.quantityInput);
        if (qtyInput) {
          await qtyInput.fill(String(Math.min(quantity, this.maxQuantityPerItem)));
        }
      }
      
      // Click add to cart
      await this.utils.waitAndClick(this.selectors.addToCartButton);
      
      // Wait for cart flyout or redirect
      await this.utils.humanDelay(1500, 2500);
      
      // Check for errors
      const error = await this.utils.getText(this.selectors.errorAlert);
      if (error) {
        throw new Error(error);
      }
      
      // Verify cart flyout appeared
      const flyout = await this.utils.isVisible(this.selectors.cartFlyout, 3000);
      
      this.emit('addedToCart', { url: productUrl, quantity });
      return { success: true };
      
    } catch (error) {
      this.emit('addToCartFailed', { url: productUrl, error: error.message });
      await this.screenshot('add_to_cart_failed');
      throw error;
    }
  }

  async getCartContents() {
    await this.navigateTo(`${this.baseUrl}/cart`);
    
    const items = [];
    const cartItems = await this.page.$$(this.selectors.cartItems);
    
    for (const item of cartItems) {
      const title = await item.$eval('[data-automation="product-title"]', el => el.textContent).catch(() => null);
      const price = await item.$eval('[data-automation="product-price"]', el => el.textContent).catch(() => null);
      const quantity = await item.$eval('[data-automation="quantity-value"]', el => el.textContent).catch(() => '1');
      
      items.push({
        title,
        price: await this.extractPrice(price),
        quantity: parseInt(quantity) || 1,
      });
    }
    
    const total = await this.utils.getText(this.selectors.cartTotal);
    
    return {
      items,
      total: await this.extractPrice(total),
      count: items.length,
    };
  }

  async clearCart() {
    await this.navigateTo(`${this.baseUrl}/cart`);
    
    // Walmart has a remove all option or individual remove
    const removeButtons = await this.page.$$('[data-automation="remove-item"]');
    
    for (const button of removeButtons) {
      await button.click();
      await this.utils.humanDelay(500, 1000);
    }
    
    return { success: true };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CHECKOUT
  // ─────────────────────────────────────────────────────────────────────────────

  async checkout(profile) {
    this.emit('checkoutStarted', { profileId: profile.id });
    const startTime = Date.now();
    
    try {
      // Ensure logged in
      if (!await this.isLoggedIn()) {
        await this.login(profile.credentials.walmart);
      }
      
      // Go to cart
      await this.navigateTo(`${this.baseUrl}/cart`);
      
      // Verify cart has items
      const cart = await this.getCartContents();
      if (cart.count === 0) {
        throw new Error('Cart is empty');
      }
      
      // Click checkout
      await this.utils.waitAndClick(this.selectors.checkoutButton);
      await this.utils.waitForNavigation();
      
      // Handle shipping
      await this.handleShipping(profile.shipping);
      
      // Handle payment
      await this.handlePayment(profile.payment);
      
      // Place order
      const orderResult = await this.placeOrder();
      
      const duration = Date.now() - startTime;
      
      this.emit('checkoutComplete', {
        profileId: profile.id,
        orderId: orderResult.orderId,
        duration,
      });
      
      return {
        success: true,
        result: CheckoutResult.SUCCESS,
        orderId: orderResult.orderId,
        duration,
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      const result = this.classifyError(error);
      
      this.emit('checkoutFailed', {
        profileId: profile.id,
        error: error.message,
        result,
        duration,
      });
      
      await this.screenshot('checkout_failed');
      
      return {
        success: false,
        result,
        error: error.message,
        duration,
      };
    }
  }

  async handleShipping(shippingInfo) {
    this.emit('handlingShipping');
    
    // Wait for shipping section
    await this.waitForSelector(this.selectors.shippingAddressForm, { timeout: 10000 });
    
    // Check for saved addresses
    const savedAddress = await this.utils.isVisible(this.selectors.savedAddresses, 3000);
    
    if (savedAddress) {
      // Select first saved address
      await this.utils.waitAndClick(this.selectors.savedAddresses);
      await this.utils.humanDelay(300, 500);
    } else {
      await this.enterShipping(shippingInfo);
    }
    
    // Continue to next step
    await this.utils.waitAndClick(this.selectors.continueButton);
    await this.utils.humanDelay(500, 1000);
    
    this.emit('shippingHandled');
  }

  async enterShipping(shippingInfo) {
    const fields = [
      { selector: '#firstName', value: shippingInfo.firstName },
      { selector: '#lastName', value: shippingInfo.lastName },
      { selector: '#addressLineOne', value: shippingInfo.address1 },
      { selector: '#addressLineTwo', value: shippingInfo.address2 || '' },
      { selector: '#city', value: shippingInfo.city },
      { selector: '#state', value: shippingInfo.state },
      { selector: '#postalCode', value: shippingInfo.zip },
      { selector: '#phone', value: shippingInfo.phone },
    ];
    
    for (const field of fields) {
      if (field.value) {
        await this.utils.waitAndFill(field.selector, field.value);
        await this.utils.humanDelay(100, 200);
      }
    }
  }

  async handlePayment(paymentInfo) {
    this.emit('handlingPayment');
    
    // Wait for payment section
    await this.waitForSelector(this.selectors.paymentSection, { timeout: 10000 });
    
    // Check for saved payment
    const savedPayment = await this.utils.isVisible(this.selectors.savedPayments, 3000);
    
    if (savedPayment) {
      await this.utils.waitAndClick(this.selectors.savedPayments);
      await this.utils.humanDelay(300, 500);
      
      // Enter CVV
      const cvvInput = await this.page.$(this.selectors.cvvInput);
      if (cvvInput) {
        await this.utils.waitAndFill(this.selectors.cvvInput, paymentInfo.cvv);
      }
    } else {
      await this.enterPayment(paymentInfo);
    }
    
    // Continue
    await this.utils.waitAndClick(this.selectors.continueButton);
    await this.utils.humanDelay(500, 1000);
    
    this.emit('paymentHandled');
  }

  async enterPayment(paymentInfo) {
    // Walmart may use iframes for card entry
    const cardFrame = await this.page.frameLocator('iframe[title*="card"]').first();
    
    if (cardFrame) {
      await cardFrame.locator('#cardNumber').fill(paymentInfo.cardNumber);
      await cardFrame.locator('#expirationDate').fill(paymentInfo.expiry);
      await cardFrame.locator('#cvv').fill(paymentInfo.cvv);
    } else {
      // Fallback to direct inputs
      await this.utils.waitAndFill('#cardNumber', paymentInfo.cardNumber);
      await this.utils.waitAndFill('#expirationDate', paymentInfo.expiry);
      await this.utils.waitAndFill('#cvv', paymentInfo.cvv);
    }
  }

  async placeOrder() {
    this.emit('placingOrder');
    
    // Wait for review section
    await this.waitForSelector(this.selectors.reviewSection, { timeout: 10000 });
    
    // Click place order
    await this.utils.waitAndClick(this.selectors.placeOrderButton);
    
    // Wait for confirmation
    await this.waitForSelector(this.selectors.orderConfirmation, { timeout: 30000 });
    
    // Extract order number
    const orderNumber = await this.utils.getText(this.selectors.orderNumber);
    
    this.emit('orderPlaced', { orderId: orderNumber });
    
    return {
      success: true,
      orderId: orderNumber,
    };
  }
}

// Register adapter
adapterRegistry.register('walmart', WalmartAdapter);

export default WalmartAdapter;
