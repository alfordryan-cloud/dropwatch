// ═══════════════════════════════════════════════════════════════════════════════
// TARGET RETAILER ADAPTER
// Full implementation for Target.com checkout automation
// ═══════════════════════════════════════════════════════════════════════════════

import { 
  BaseRetailerAdapter, 
  CheckoutFlowType, 
  InventoryStatus, 
  ProductStatus,
  CheckoutResult,
  adapterRegistry 
} from './base.js';

export class TargetAdapter extends BaseRetailerAdapter {
  constructor(config = {}) {
    super(config);
    
    this.name = 'Target';
    this.baseUrl = 'https://www.target.com';
    this.checkoutFlowType = CheckoutFlowType.STANDARD;
    
    // Target-specific timeouts
    this.cartExpiryMs = 900000; // 15 minutes
    this.maxQuantityPerItem = 2;
    
    // Selectors
    this.selectors = {
      // Product page
      productTitle: '[data-test="product-title"], h1[class*="Heading"]',
      productPrice: '[data-test="product-price"], [class*="CurrentPrice"]',
      addToCartButton: '[data-test="addToCartButton"], button[data-test="shippingButton"]',
      outOfStockIndicator: '[data-test="outOfStockMessage"], [class*="OutOfStock"]',
      pickupButton: '[data-test="orderPickupButton"]',
      deliveryButton: '[data-test="shipItButton"]',
      quantitySelector: '[data-test="quantitySelector"]',
      
      // Stock status
      inStockIndicator: '[data-test="fulfillment-cell-Shipping"]',
      limitedStockIndicator: '[class*="LimitedStock"]',
      soldOutBadge: '[data-test="soldOutBlock"]',
      
      // Cart
      cartIcon: '[data-test="@web/CartIcon"]',
      cartCount: '[data-test="@web/CartLink"] span',
      cartSidebar: '[data-test="cartDetailsSidebar"]',
      cartItems: '[data-test="cartItem"]',
      cartTotal: '[data-test="cart-summary-total"]',
      checkoutButton: '[data-test="checkout-button"], [data-test="checkout-btn"]',
      removeItemButton: '[data-test="cart-item-remove"]',
      
      // Checkout - Shipping
      shippingSection: '[data-test="shipping-address-section"]',
      savedAddressCard: '[data-test="savedAddressCard"]',
      useThisAddressButton: '[data-test="verify-button"]',
      
      // Checkout - Payment
      paymentSection: '[data-test="payment-section"]',
      savedPaymentCard: '[data-test="savedPaymentCard"]',
      cvvInput: '[data-test="credit-card-cvv-input"]',
      
      // Checkout - Review
      placeOrderButton: '[data-test="place-your-order-button"], [data-test="placeOrderButton"]',
      orderConfirmation: '[data-test="order-confirmation-heading"]',
      orderNumber: '[data-test="order-number"]',
      
      // Auth
      loginLink: '[data-test="accountNav-signIn"]',
      emailInput: '#username',
      passwordInput: '#password',
      loginButton: '#login',
      accountMenu: '[data-test="accountNav-container"]',
      signOutLink: '[data-test="accountNav-signOut"]',
      
      // Errors
      errorMessage: '[data-test="error-message"], [class*="ErrorMessage"]',
      itemUnavailableError: '[data-test="itemUnavailableError"]',
    };
    
    // API endpoints
    this.api = {
      inventory: '/api/inventory/v2/stores',
      cart: '/api/checkout/v1/cart',
      checkout: '/api/checkout/v1/checkout',
      addToCart: '/cart_items',
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // AUTHENTICATION
  // ─────────────────────────────────────────────────────────────────────────────

  async login(credentials) {
    this.emit('loginStarted');
    
    try {
      // Navigate to login
      await this.navigateTo(`${this.baseUrl}/account`);
      
      // Check if already logged in
      if (await this.isLoggedIn()) {
        this.emit('loginSkipped', { reason: 'Already logged in' });
        return { success: true, skipped: true };
      }
      
      // Click sign in link
      await this.utils.waitAndClick(this.selectors.loginLink);
      await this.utils.humanDelay(500, 1000);
      
      // Enter credentials
      await this.utils.waitAndFill(this.selectors.emailInput, credentials.email);
      await this.utils.humanDelay(200, 400);
      
      await this.utils.waitAndFill(this.selectors.passwordInput, credentials.password);
      await this.utils.humanDelay(200, 400);
      
      // Submit
      await this.utils.waitAndClick(this.selectors.loginButton);
      
      // Wait for redirect
      await this.page.waitForNavigation({ waitUntil: 'networkidle' });
      
      // Verify login success
      const loggedIn = await this.isLoggedIn();
      
      if (loggedIn) {
        this.emit('loginSuccess');
        return { success: true };
      } else {
        throw new Error('Login verification failed');
      }
      
    } catch (error) {
      this.emit('loginFailed', { error: error.message });
      await this.screenshot('login_failed');
      throw error;
    }
  }

  async isLoggedIn() {
    try {
      // Check for account menu or sign out link
      const accountMenu = await this.page.$(this.selectors.accountMenu);
      if (accountMenu) {
        const text = await accountMenu.textContent();
        return !text?.includes('Sign in');
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
      
      const result = {
        url: productUrl,
        timestamp: Date.now(),
        status: ProductStatus.LIVE,
        inventory: InventoryStatus.UNKNOWN,
        price: null,
        title: null,
        canAddToCart: false,
      };
      
      // Get title
      result.title = await this.utils.getText(this.selectors.productTitle);
      
      // Get price
      const priceText = await this.utils.getText(this.selectors.productPrice);
      result.price = await this.extractPrice(priceText);
      
      // Check stock status
      const soldOut = await this.utils.isVisible(this.selectors.soldOutBadge, 2000);
      const outOfStock = await this.utils.isVisible(this.selectors.outOfStockIndicator, 2000);
      
      if (soldOut || outOfStock) {
        result.inventory = InventoryStatus.OOS;
        result.status = ProductStatus.SOLD_OUT;
      } else {
        // Check if add to cart is available
        const addToCartBtn = await this.page.$(this.selectors.addToCartButton);
        if (addToCartBtn) {
          const isDisabled = await addToCartBtn.getAttribute('disabled');
          result.canAddToCart = !isDisabled;
          result.inventory = result.canAddToCart ? InventoryStatus.IN_STOCK : InventoryStatus.OOS;
        }
        
        // Check for limited stock
        const limited = await this.utils.isVisible(this.selectors.limitedStockIndicator, 1000);
        if (limited) {
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
    
    // Extract additional details
    const details = {
      ...basic,
      dpci: await this.extractDPCI(),
      tcin: await this.extractTCIN(),
      fulfillment: await this.checkFulfillmentOptions(),
    };
    
    return details;
  }

  async extractDPCI() {
    try {
      // DPCI is often in the URL or page data
      const url = this.page.url();
      const match = url.match(/A-(\d{8})/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  async extractTCIN() {
    try {
      const url = this.page.url();
      const match = url.match(/\/A-(\d+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  async checkFulfillmentOptions() {
    const options = {
      shipping: false,
      pickup: false,
      sameDay: false,
    };
    
    options.shipping = await this.utils.isVisible(this.selectors.deliveryButton, 2000);
    options.pickup = await this.utils.isVisible(this.selectors.pickupButton, 2000);
    
    return options;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CART OPERATIONS
  // ─────────────────────────────────────────────────────────────────────────────

  async addToCart(productUrl, quantity = 1) {
    this.emit('addingToCart', { url: productUrl, quantity });
    
    try {
      // Navigate to product if not already there
      if (!this.page.url().includes(productUrl)) {
        await this.navigateTo(productUrl);
      }
      
      // Check if add to cart is available
      const addToCartBtn = await this.waitForSelector(this.selectors.addToCartButton, { timeout: 5000 });
      
      if (!addToCartBtn) {
        throw new Error('Add to cart button not found');
      }
      
      // Check if disabled
      const isDisabled = await addToCartBtn.getAttribute('disabled');
      if (isDisabled) {
        throw new Error('Product is out of stock');
      }
      
      // Set quantity if > 1
      if (quantity > 1) {
        const quantitySelect = await this.page.$(this.selectors.quantitySelector);
        if (quantitySelect) {
          await quantitySelect.selectOption(String(Math.min(quantity, this.maxQuantityPerItem)));
        }
      }
      
      // Click add to cart
      await this.utils.waitAndClick(this.selectors.addToCartButton);
      
      // Wait for cart sidebar or confirmation
      await this.utils.humanDelay(1000, 2000);
      
      // Verify item was added
      const cartSidebar = await this.utils.isVisible(this.selectors.cartSidebar, 3000);
      
      if (cartSidebar) {
        this.emit('addedToCart', { url: productUrl, quantity });
        return { success: true };
      }
      
      // Check for error
      const error = await this.utils.getText(this.selectors.errorMessage);
      if (error) {
        throw new Error(error);
      }
      
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
      const title = await item.$eval('[data-test="cartItem-title"]', el => el.textContent).catch(() => null);
      const price = await item.$eval('[data-test="cartItem-price"]', el => el.textContent).catch(() => null);
      const quantity = await item.$eval('[data-test="cartItem-qty"]', el => el.textContent).catch(() => '1');
      
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
    
    const removeButtons = await this.page.$$(this.selectors.removeItemButton);
    
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
        await this.login(profile.credentials.target);
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
    await this.waitForSelector(this.selectors.shippingSection, { timeout: 10000 });
    
    // Check for saved address
    const savedAddress = await this.utils.isVisible(this.selectors.savedAddressCard, 3000);
    
    if (savedAddress) {
      // Use saved address
      await this.utils.waitAndClick(this.selectors.savedAddressCard);
      await this.utils.humanDelay(300, 500);
    } else {
      // Enter new address
      await this.enterShipping(shippingInfo);
    }
    
    // Confirm shipping selection
    const useThisBtn = await this.page.$(this.selectors.useThisAddressButton);
    if (useThisBtn) {
      await useThisBtn.click();
      await this.utils.humanDelay(500, 1000);
    }
    
    this.emit('shippingHandled');
  }

  async enterShipping(shippingInfo) {
    // Enter shipping address form fields
    const fields = [
      { selector: '[data-test="shipping-first-name"]', value: shippingInfo.firstName },
      { selector: '[data-test="shipping-last-name"]', value: shippingInfo.lastName },
      { selector: '[data-test="shipping-address-line1"]', value: shippingInfo.address1 },
      { selector: '[data-test="shipping-address-line2"]', value: shippingInfo.address2 || '' },
      { selector: '[data-test="shipping-city"]', value: shippingInfo.city },
      { selector: '[data-test="shipping-state"]', value: shippingInfo.state },
      { selector: '[data-test="shipping-zip-code"]', value: shippingInfo.zip },
      { selector: '[data-test="shipping-phone"]', value: shippingInfo.phone },
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
    const savedPayment = await this.utils.isVisible(this.selectors.savedPaymentCard, 3000);
    
    if (savedPayment) {
      // Use saved payment - just need CVV
      await this.utils.waitAndClick(this.selectors.savedPaymentCard);
      await this.utils.humanDelay(300, 500);
      
      // Enter CVV if required
      const cvvInput = await this.page.$(this.selectors.cvvInput);
      if (cvvInput) {
        await this.utils.waitAndFill(this.selectors.cvvInput, paymentInfo.cvv);
      }
    } else {
      // Enter new payment
      await this.enterPayment(paymentInfo);
    }
    
    this.emit('paymentHandled');
  }

  async enterPayment(paymentInfo) {
    // Target uses iframe for card entry
    const cardFrame = await this.page.frameLocator('[data-test="credit-card-iframe"]');
    
    if (cardFrame) {
      await cardFrame.locator('[name="cardNumber"]').fill(paymentInfo.cardNumber);
      await cardFrame.locator('[name="expDate"]').fill(paymentInfo.expiry);
      await cardFrame.locator('[name="cvv"]').fill(paymentInfo.cvv);
    }
  }

  async placeOrder() {
    this.emit('placingOrder');
    
    // Click place order button
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
adapterRegistry.register('target', TargetAdapter);

export default TargetAdapter;
