// ═══════════════════════════════════════════════════════════════════════════════
// POKEMON CENTER RETAILER ADAPTER
// Full implementation with queue/waiting room handling
// ═══════════════════════════════════════════════════════════════════════════════

import { 
  BaseRetailerAdapter, 
  CheckoutFlowType, 
  InventoryStatus, 
  ProductStatus,
  CheckoutResult,
  adapterRegistry 
} from './base.js';

export class PokemonCenterAdapter extends BaseRetailerAdapter {
  constructor(config = {}) {
    super(config);
    
    this.name = 'Pokemon Center';
    this.baseUrl = 'https://www.pokemoncenter.com';
    this.checkoutFlowType = CheckoutFlowType.QUEUE;
    
    // Pokemon Center specific settings
    this.queueTimeout = config.queueTimeout || 600000; // 10 minutes
    this.checkoutWindowMs = 600000; // 10 minutes to complete once through queue
    this.maxQuantityPerItem = 2;
    
    // Selectors
    this.selectors = {
      // Product page
      productTitle: '.product-name h1, [data-testid="product-name"]',
      productPrice: '.product-price, [data-testid="product-price"]',
      addToCartButton: '.add-to-cart-button, [data-testid="add-to-cart"]',
      outOfStockIndicator: '.out-of-stock-message, .sold-out',
      preOrderIndicator: '.pre-order-badge',
      
      // Stock
      availabilityMessage: '.availability-message',
      limitMessage: '.limit-message',
      
      // Quantity
      quantitySelect: '.quantity-select, [data-testid="quantity-selector"]',
      
      // Queue/Waiting Room (Cloudflare)
      queueContainer: '#challenge-stage, .waitingroom, #cf-wrapper',
      queueMessage: '.queue-message, #challenge-running',
      queuePosition: '.queue-position',
      
      // Cart
      cartIcon: '.cart-icon, [data-testid="cart-icon"]',
      cartCount: '.cart-count, [data-testid="cart-count"]',
      cartDrawer: '.cart-drawer, .mini-cart',
      cartItems: '.cart-item, .line-item',
      cartTotal: '.cart-total, .order-total',
      checkoutButton: '.checkout-button, [data-testid="checkout"]',
      
      // Checkout
      guestCheckoutButton: '.guest-checkout, [data-testid="guest-checkout"]',
      
      // Shipping
      shippingForm: '.shipping-form, [data-testid="shipping-form"]',
      emailInput: '#email, [name="email"]',
      firstNameInput: '#firstName, [name="firstName"]',
      lastNameInput: '#lastName, [name="lastName"]',
      addressInput: '#address1, [name="address1"]',
      address2Input: '#address2, [name="address2"]',
      cityInput: '#city, [name="city"]',
      stateSelect: '#state, [name="state"]',
      zipInput: '#postalCode, [name="postalCode"]',
      phoneInput: '#phone, [name="phone"]',
      continueToPayment: '.continue-to-payment, [data-testid="continue-payment"]',
      
      // Payment
      paymentForm: '.payment-form, [data-testid="payment-form"]',
      cardNumberFrame: 'iframe[name*="card-number"], iframe[title*="card number"]',
      expiryFrame: 'iframe[name*="expiry"], iframe[title*="expiry"]',
      cvvFrame: 'iframe[name*="cvv"], iframe[title*="cvv"]',
      cardNumberInput: '#cardNumber, [name="cardNumber"]',
      expiryInput: '#expiry, [name="expiry"]',
      cvvInput: '#cvv, [name="cvv"]',
      
      // Review
      placeOrderButton: '.place-order, [data-testid="place-order"]',
      orderConfirmation: '.order-confirmation, [data-testid="confirmation"]',
      orderNumber: '.order-number, [data-testid="order-number"]',
      
      // Auth
      signInLink: '.sign-in-link, [data-testid="sign-in"]',
      emailLoginInput: '#login-email',
      passwordLoginInput: '#login-password',
      loginButton: '.login-button, [data-testid="login-submit"]',
      accountMenu: '.account-menu, [data-testid="account-menu"]',
      signOutLink: '.sign-out, [data-testid="sign-out"]',
      
      // Errors
      errorMessage: '.error-message, .alert-danger',
      itemUnavailable: '.item-unavailable-error',
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // QUEUE HANDLING
  // ─────────────────────────────────────────────────────────────────────────────

  async isInQueue() {
    try {
      // Check for Cloudflare waiting room indicators
      const queueContainer = await this.page.$(this.selectors.queueContainer);
      if (queueContainer) {
        return true;
      }
      
      // Check URL for queue indicators
      const url = this.page.url();
      if (url.includes('queue') || url.includes('waiting') || url.includes('challenge')) {
        return true;
      }
      
      // Check for challenge message
      const challengeRunning = await this.page.$('#challenge-running');
      if (challengeRunning) {
        return true;
      }
      
      return false;
    } catch {
      return false;
    }
  }

  async waitForQueue() {
    this.emit('queueEntered');
    const startTime = Date.now();
    let lastPosition = null;
    
    while (Date.now() - startTime < this.queueTimeout) {
      // Check if still in queue
      const inQueue = await this.isInQueue();
      
      if (!inQueue) {
        this.emit('queuePassed', { 
          waitTime: Date.now() - startTime 
        });
        return true;
      }
      
      // Try to get queue position
      const position = await this.utils.getText(this.selectors.queuePosition);
      if (position && position !== lastPosition) {
        lastPosition = position;
        this.emit('queueProgress', { position });
      }
      
      // Wait before checking again
      await this.utils.humanDelay(3000, 5000);
    }
    
    this.emit('queueTimeout');
    throw new Error('Queue timeout exceeded');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // AUTHENTICATION
  // ─────────────────────────────────────────────────────────────────────────────

  async login(credentials) {
    this.emit('loginStarted');
    
    try {
      await this.navigateTo(`${this.baseUrl}/account`);
      
      // Handle queue if present
      if (await this.isInQueue()) {
        await this.waitForQueue();
      }
      
      if (await this.isLoggedIn()) {
        this.emit('loginSkipped', { reason: 'Already logged in' });
        return { success: true, skipped: true };
      }
      
      // Click sign in
      await this.utils.waitAndClick(this.selectors.signInLink);
      await this.utils.humanDelay(500, 1000);
      
      // Enter credentials
      await this.utils.waitAndFill(this.selectors.emailLoginInput, credentials.email);
      await this.utils.humanDelay(200, 400);
      
      await this.utils.waitAndFill(this.selectors.passwordLoginInput, credentials.password);
      await this.utils.humanDelay(200, 400);
      
      // Submit
      await this.utils.waitAndClick(this.selectors.loginButton);
      
      // Wait for redirect
      await this.page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 });
      
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
      const accountMenu = await this.page.$(this.selectors.accountMenu);
      if (accountMenu) {
        const text = await accountMenu.textContent();
        return text && !text.toLowerCase().includes('sign in');
      }
      return false;
    } catch {
      return false;
    }
  }

  async logout() {
    await this.utils.waitAndClick(this.selectors.accountMenu);
    await this.utils.humanDelay(300, 500);
    await this.utils.waitAndClick(this.selectors.signOutLink);
    await this.utils.waitForNavigation();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PRODUCT MONITORING
  // ─────────────────────────────────────────────────────────────────────────────

  async checkProduct(productUrl) {
    this.emit('checkingProduct', { url: productUrl });
    
    try {
      await this.navigateTo(productUrl);
      
      // Handle queue if present
      if (await this.isInQueue()) {
        await this.waitForQueue();
      }
      
      const result = {
        url: productUrl,
        timestamp: Date.now(),
        status: ProductStatus.LIVE,
        inventory: InventoryStatus.UNKNOWN,
        price: null,
        title: null,
        canAddToCart: false,
        isPreOrder: false,
      };
      
      // Get title
      result.title = await this.utils.getText(this.selectors.productTitle);
      
      // Get price
      const priceText = await this.utils.getText(this.selectors.productPrice);
      result.price = await this.extractPrice(priceText);
      
      // Check for pre-order
      result.isPreOrder = await this.utils.isVisible(this.selectors.preOrderIndicator, 1000);
      if (result.isPreOrder) {
        result.status = ProductStatus.COMING_SOON;
      }
      
      // Check stock status
      const outOfStock = await this.utils.isVisible(this.selectors.outOfStockIndicator, 2000);
      
      if (outOfStock) {
        result.inventory = InventoryStatus.OOS;
        result.status = ProductStatus.SOLD_OUT;
      } else {
        // Check add to cart button
        const addToCartBtn = await this.page.$(this.selectors.addToCartButton);
        if (addToCartBtn) {
          const isDisabled = await addToCartBtn.getAttribute('disabled');
          result.canAddToCart = !isDisabled;
        }
        
        if (result.canAddToCart) {
          result.inventory = InventoryStatus.IN_STOCK;
        }
        
        // Check for limit message
        const limitMsg = await this.utils.getText(this.selectors.limitMessage);
        if (limitMsg && limitMsg.toLowerCase().includes('limit')) {
          result.inventory = InventoryStatus.LIMITED;
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
    
    const details = {
      ...basic,
      productId: await this.extractProductId(),
    };
    
    return details;
  }

  async extractProductId() {
    try {
      const url = this.page.url();
      // Pokemon Center URLs typically have product ID in the path
      const match = url.match(/\/product\/([^\/\?]+)/);
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
        
        // Handle queue
        if (await this.isInQueue()) {
          await this.waitForQueue();
        }
      }
      
      // Set quantity
      if (quantity > 1) {
        const qtySelect = await this.page.$(this.selectors.quantitySelect);
        if (qtySelect) {
          await qtySelect.selectOption(String(Math.min(quantity, this.maxQuantityPerItem)));
        }
      }
      
      // Click add to cart
      await this.utils.waitAndClick(this.selectors.addToCartButton);
      
      // Wait for cart update
      await this.utils.humanDelay(1500, 2500);
      
      // Check for errors
      const error = await this.utils.getText(this.selectors.errorMessage);
      if (error) {
        throw new Error(error);
      }
      
      // Verify cart drawer appeared or count increased
      const cartDrawer = await this.utils.isVisible(this.selectors.cartDrawer, 3000);
      
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
    
    // Handle queue
    if (await this.isInQueue()) {
      await this.waitForQueue();
    }
    
    const items = [];
    const cartItems = await this.page.$$(this.selectors.cartItems);
    
    for (const item of cartItems) {
      const title = await item.$eval('.product-name, .item-name', el => el.textContent).catch(() => null);
      const price = await item.$eval('.product-price, .item-price', el => el.textContent).catch(() => null);
      const quantity = await item.$eval('.quantity-value, .item-quantity', el => el.textContent).catch(() => '1');
      
      items.push({
        title: title?.trim(),
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
    
    if (await this.isInQueue()) {
      await this.waitForQueue();
    }
    
    const removeButtons = await this.page.$$('.remove-item, [data-testid="remove-item"]');
    
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
      // Go to cart
      await this.navigateTo(`${this.baseUrl}/cart`);
      
      // Handle queue - this is critical for Pokemon Center
      if (await this.isInQueue()) {
        await this.waitForQueue();
      }
      
      // Verify cart
      const cart = await this.getCartContents();
      if (cart.count === 0) {
        throw new Error('Cart is empty');
      }
      
      // Click checkout
      await this.utils.waitAndClick(this.selectors.checkoutButton);
      
      // Handle queue again if needed
      if (await this.isInQueue()) {
        await this.waitForQueue();
      }
      
      // Guest checkout or logged in
      const guestBtn = await this.page.$(this.selectors.guestCheckoutButton);
      if (guestBtn && !await this.isLoggedIn()) {
        await guestBtn.click();
        await this.utils.humanDelay(500, 1000);
      }
      
      // Enter shipping
      await this.handleShipping(profile.shipping);
      
      // Enter payment
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
    
    // Wait for shipping form
    await this.waitForSelector(this.selectors.shippingForm, { timeout: 10000 });
    
    // Enter email
    await this.utils.waitAndFill(this.selectors.emailInput, shippingInfo.email);
    await this.utils.humanDelay(100, 200);
    
    // Enter shipping details
    await this.enterShipping(shippingInfo);
    
    // Continue to payment
    await this.utils.waitAndClick(this.selectors.continueToPayment);
    await this.utils.humanDelay(1000, 2000);
    
    this.emit('shippingHandled');
  }

  async enterShipping(shippingInfo) {
    const fields = [
      { selector: this.selectors.firstNameInput, value: shippingInfo.firstName },
      { selector: this.selectors.lastNameInput, value: shippingInfo.lastName },
      { selector: this.selectors.addressInput, value: shippingInfo.address1 },
      { selector: this.selectors.address2Input, value: shippingInfo.address2 || '' },
      { selector: this.selectors.cityInput, value: shippingInfo.city },
      { selector: this.selectors.zipInput, value: shippingInfo.zip },
      { selector: this.selectors.phoneInput, value: shippingInfo.phone },
    ];
    
    for (const field of fields) {
      if (field.value) {
        await this.utils.waitAndFill(field.selector, field.value);
        await this.utils.humanDelay(100, 200);
      }
    }
    
    // State select
    const stateSelect = await this.page.$(this.selectors.stateSelect);
    if (stateSelect) {
      await stateSelect.selectOption(shippingInfo.state);
    }
  }

  async handlePayment(paymentInfo) {
    this.emit('handlingPayment');
    
    // Wait for payment form
    await this.waitForSelector(this.selectors.paymentForm, { timeout: 10000 });
    
    // Pokemon Center typically uses iframes for card entry
    await this.enterPayment(paymentInfo);
    
    this.emit('paymentHandled');
  }

  async enterPayment(paymentInfo) {
    // Card number iframe
    const cardFrame = await this.page.frameLocator(this.selectors.cardNumberFrame).first();
    if (cardFrame) {
      await cardFrame.locator('input').fill(paymentInfo.cardNumber);
    }
    
    // Expiry iframe
    const expiryFrame = await this.page.frameLocator(this.selectors.expiryFrame).first();
    if (expiryFrame) {
      await expiryFrame.locator('input').fill(paymentInfo.expiry);
    }
    
    // CVV iframe
    const cvvFrame = await this.page.frameLocator(this.selectors.cvvFrame).first();
    if (cvvFrame) {
      await cvvFrame.locator('input').fill(paymentInfo.cvv);
    }
  }

  async placeOrder() {
    this.emit('placingOrder');
    
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
adapterRegistry.register('pokemon center', PokemonCenterAdapter);
adapterRegistry.register('pokemoncenter', PokemonCenterAdapter);

export default PokemonCenterAdapter;
