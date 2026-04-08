# DROPWATCH Setup & Operations Manual
## Collector Station Automated Purchasing System

### Version 1.0 | Complete Guide for Non-Developers

---

# TABLE OF CONTENTS

1. [What You Need Before Starting](#part-1-what-you-need-before-starting)
2. [Setting Up Your Computer](#part-2-setting-up-your-computer)
3. [Installing DROPWATCH](#part-3-installing-dropwatch)
4. [Creating Retailer Accounts](#part-4-creating-retailer-accounts)
5. [Configuring the System](#part-5-configuring-the-system)
6. [Adding Products to Track](#part-6-adding-products-to-track)
7. [Setting Up Alerts](#part-7-setting-up-alerts)
8. [Daily Operations](#part-8-daily-operations)
9. [Troubleshooting](#part-9-troubleshooting)
10. [Glossary](#part-10-glossary)

---

# PART 1: WHAT YOU NEED BEFORE STARTING

## 1.1 Hardware Requirements

You will need a computer that meets these minimum specifications:

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **Operating System** | Windows 10, macOS 10.15, or Ubuntu 20.04 | Windows 11 or macOS 13+ |
| **RAM (Memory)** | 8 GB | 16 GB or more |
| **Storage** | 20 GB free space | 50 GB free SSD |
| **Internet** | 25 Mbps download | 100+ Mbps fiber |
| **Processor** | Intel i5 / AMD Ryzen 5 | Intel i7 / AMD Ryzen 7 |

> **💡 TIP:** For best results, use a desktop computer with a wired ethernet connection. WiFi can cause delays during high-traffic drop times.

---

## 1.2 Accounts You Need to Create

Before installing DROPWATCH, you need to set up accounts with the following services:

### RETAILER ACCOUNTS (Create 2-3 accounts per retailer)

For each retailer, you will need **multiple separate accounts**. This provides backup options if one account has issues.

| Retailer | Website | Accounts Needed |
|----------|---------|-----------------|
| **Target** | target.com | 2-3 accounts |
| **Walmart** | walmart.com | 2-3 accounts |
| **Best Buy** | bestbuy.com | 2-3 accounts |
| **Pokemon Center** | pokemoncenter.com | 2-3 accounts |
| **GameStop** | gamestop.com | 2-3 accounts |
| **Amazon** | amazon.com | 1-2 accounts |

### THIRD-PARTY SERVICE ACCOUNTS (Required)

| Service | Purpose | Website | Cost |
|---------|---------|---------|------|
| **Twilio** | SMS text alerts | twilio.com | ~$1/month + $0.0075/text |
| **Slack** | Team notifications | slack.com | Free |
| **Gmail** | Email alerts | gmail.com | Free |

### OPTIONAL BUT RECOMMENDED

| Service | Purpose | Website | Cost |
|---------|---------|---------|------|
| **GitHub** | Code backup | github.com | Free |
| **DigitalOcean** or **AWS** | Cloud hosting | digitalocean.com | $20-50/month |

---

## 1.3 Payment Methods

For each retailer account, you need a saved payment method. We recommend:

- **Primary accounts**: Your main credit card
- **Backup accounts**: A different credit card OR the same card (most retailers allow this)
- **Consider**: Virtual card numbers from services like Privacy.com for extra security

> **⚠️ IMPORTANT:** DROPWATCH never stores your full credit card numbers. It uses the payment methods you have saved in your retailer accounts.

---

## 1.4 Information to Gather

Before starting, collect this information and write it down:

**For Each Retailer Account:**
```
Email address: _______________________
Password: ___________________________
Phone number on account: _____________
Last 4 digits of saved card: _________
```

**For Shipping:**
```
Full Name: __________________________
Street Address: _____________________
Apartment/Suite: ____________________
City: ______________________________
State: _____________________________
ZIP Code: __________________________
Phone: _____________________________
```

**For Alerts (Twilio):**
```
Account SID: ________________________
Auth Token: _________________________
Twilio Phone Number: ________________
Your Cell Phone: ____________________
```

---

# PART 2: SETTING UP YOUR COMPUTER

## 2.1 Installing Docker Desktop

Docker is the software that runs DROPWATCH. Think of it as a "container" that holds all the pieces of the system.

### For Windows:

1. **Open your web browser** and go to: `https://www.docker.com/products/docker-desktop`

2. **Click the blue "Download for Windows" button**

3. **Find the downloaded file** (usually in your Downloads folder)
   - It will be named something like `Docker Desktop Installer.exe`

4. **Double-click the file** to start installation

5. **When prompted:**
   - Check the box for "Use WSL 2 instead of Hyper-V"
   - Click "OK"

6. **Wait for installation** (this takes 5-10 minutes)

7. **Restart your computer** when asked

8. **After restart:**
   - Docker Desktop should start automatically
   - You'll see a whale icon in your system tray (bottom right)
   - If asked to "Accept the terms", click Accept

9. **Verify installation:**
   - Open Command Prompt (search for "cmd" in Start menu)
   - Type: `docker --version`
   - Press Enter
   - You should see something like: `Docker version 24.0.0`

### For Mac:

1. **Open your web browser** and go to: `https://www.docker.com/products/docker-desktop`

2. **Click "Download for Mac"**
   - Choose "Apple Chip" if you have M1/M2/M3 Mac
   - Choose "Intel Chip" if you have an older Mac

3. **Open the downloaded .dmg file**

4. **Drag Docker to your Applications folder**

5. **Open Docker from Applications**
   - Click "Open" if you see a security warning
   - Enter your Mac password when asked

6. **Wait for Docker to start** (whale icon appears in menu bar)

7. **Verify installation:**
   - Open Terminal (search in Spotlight)
   - Type: `docker --version`
   - Press Enter

---

## 2.2 Installing Git (For Updates)

Git allows you to download and update DROPWATCH.

### For Windows:

1. Go to: `https://git-scm.com/download/win`
2. Download will start automatically
3. Run the installer
4. **Click "Next" through all screens** (default options are fine)
5. Click "Install"

### For Mac:

1. Open Terminal
2. Type: `git --version`
3. If not installed, a popup will ask to install - click "Install"

---

## 2.3 Installing a Text Editor

You'll need a text editor to modify configuration files. We recommend Visual Studio Code:

1. Go to: `https://code.visualstudio.com`
2. Download for your operating system
3. Install by running the downloaded file
4. Open Visual Studio Code after installation

---

# PART 3: INSTALLING DROPWATCH

## 3.1 Downloading DROPWATCH

### Option A: From ZIP File (Easiest)

1. **Locate the `dropwatch-v1.0.zip`** file you received

2. **Create a folder** for DROPWATCH:
   - Windows: `C:\dropwatch`
   - Mac: `/Users/[yourname]/dropwatch`

3. **Extract the ZIP file** to that folder:
   - Windows: Right-click → "Extract All" → Choose `C:\dropwatch`
   - Mac: Double-click the ZIP, then move contents to your dropwatch folder

### Option B: From GitHub (For Updates)

1. **Open Terminal** (Mac) or **Command Prompt** (Windows)

2. **Navigate to where you want to install:**
   ```
   cd C:\
   ```
   (Windows) or
   ```
   cd ~
   ```
   (Mac)

3. **Download DROPWATCH:**
   ```
   git clone https://github.com/collectorstation/dropwatch.git
   ```

4. **Enter the folder:**
   ```
   cd dropwatch
   ```

---

## 3.2 Configuring Your Settings

This is the most important step. You'll create a file with all your personal settings.

### Step 1: Create your configuration file

1. **Open Visual Studio Code**

2. **Open the dropwatch folder:**
   - File → Open Folder → Select your dropwatch folder

3. **In the left sidebar, find the file named `.env.example`**

4. **Right-click on it → "Copy"**

5. **Right-click in the sidebar → "Paste"**

6. **Rename the copy to `.env`** (remove the `.example` part)
   - Right-click → Rename → Type `.env`

### Step 2: Edit your configuration

Open the `.env` file and change these values:

```bash
# ═══════════════════════════════════════════════════════════════════════════════
# DATABASE SETTINGS
# ═══════════════════════════════════════════════════════════════════════════════

# Choose a strong password (mix of letters, numbers, symbols)
# Example: Tr@dingC@rds2024!Secure
DB_PASSWORD=YOUR_SECURE_PASSWORD_HERE

# ═══════════════════════════════════════════════════════════════════════════════
# SECURITY KEYS
# ═══════════════════════════════════════════════════════════════════════════════

# These will be generated automatically when you run the deploy script
# Leave them as-is for now
ENCRYPTION_KEY=CHANGE_ME_GENERATE_RANDOM_STRING
JWT_SECRET=CHANGE_ME_GENERATE_RANDOM_STRING

# ═══════════════════════════════════════════════════════════════════════════════
# ALERT SETTINGS - TWILIO (for text message alerts)
# ═══════════════════════════════════════════════════════════════════════════════

# Get these from your Twilio dashboard (see Section 7.1)
TWILIO_ACCOUNT_SID=AC1234567890abcdef1234567890abcdef
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_FROM_NUMBER=+15551234567

# Your cell phone number to receive alerts
ALERT_PHONE_NUMBER=+1XXXXXXXXXX

# ═══════════════════════════════════════════════════════════════════════════════
# ALERT SETTINGS - SLACK (for team notifications)
# ═══════════════════════════════════════════════════════════════════════════════

# Get this from your Slack app (see Section 7.2)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# ═══════════════════════════════════════════════════════════════════════════════
# ALERT SETTINGS - EMAIL
# ═══════════════════════════════════════════════════════════════════════════════

# Gmail SMTP settings (see Section 7.3)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your.email@gmail.com
SMTP_PASSWORD=your_app_specific_password
ALERT_EMAIL=your.email@gmail.com
```

### Step 3: Save the file

Press `Ctrl+S` (Windows) or `Cmd+S` (Mac)

---

## 3.3 Starting DROPWATCH

### Step 1: Open Terminal/Command Prompt

- **Windows:** Search for "Command Prompt" in Start menu, right-click, "Run as Administrator"
- **Mac:** Open Terminal from Applications → Utilities

### Step 2: Navigate to DROPWATCH folder

```bash
cd C:\dropwatch
```
(Windows) or
```bash
cd ~/dropwatch
```
(Mac)

### Step 3: Run the deployment script

**Windows:**
```bash
bash scripts/deploy.sh deploy
```

**Mac:**
```bash
./scripts/deploy.sh deploy
```

### Step 4: Wait for installation

This will take 10-20 minutes the first time. You'll see lots of text scrolling by - this is normal.

When complete, you'll see:
```
═══════════════════════════════════════════════════════════════
[SUCCESS] DROPWATCH Deployment Complete!
═══════════════════════════════════════════════════════════════

Access Points:
  • Dashboard:  http://localhost:80
  • API:        http://localhost:3000
```

### Step 5: Open the Dashboard

Open your web browser and go to: `http://localhost`

You should see the DROPWATCH dashboard!

---

# PART 4: CREATING RETAILER ACCOUNTS

## 4.1 Guidelines for Multiple Accounts

To effectively use DROPWATCH, you need multiple accounts per retailer. Here's how to set them up properly:

### Email Addresses

You need a unique email for each account. Options:

**Option 1: Gmail "Plus" Trick (Easiest)**
If your email is `yourname@gmail.com`, you can use:
- `yourname+target1@gmail.com`
- `yourname+target2@gmail.com`
- `yourname+walmart1@gmail.com`

All emails go to your main inbox, but retailers see them as different addresses.

**Option 2: Create Separate Emails**
Create actual separate Gmail accounts for each profile.

### Phone Numbers

Most retailers require phone verification. Options:
- Use your main number for primary accounts
- Use Google Voice numbers for additional accounts (free)
- Use family members' numbers (with permission)

---

## 4.2 Target Account Setup

### Creating Account 1 (Primary):

1. Go to `target.com`
2. Click "Account" (top right)
3. Click "Create account"
4. Fill in:
   - Email: `yourname+target1@gmail.com`
   - Password: Create a strong, unique password
   - Phone: Your main phone number
5. Verify your email
6. **Add shipping address:**
   - Account → Addresses → Add address
   - Enter your full shipping address
   - Click "Save"
7. **Add payment method:**
   - Account → Payments → Add payment
   - Enter your credit card
   - Click "Save"
8. **Enable notifications:**
   - Account → Settings → Communication preferences
   - Turn ON order updates

### Creating Account 2 (Backup):

Repeat the above with:
- Email: `yourname+target2@gmail.com`
- Different password
- Same or different payment method

### Creating Account 3 (Reserve):

Repeat again with:
- Email: `yourname+target3@gmail.com`
- Different password

---

## 4.3 Walmart Account Setup

### Creating Account 1 (Primary):

1. Go to `walmart.com`
2. Click "Sign In" → "Create account"
3. Fill in:
   - First name, Last name
   - Email: `yourname+walmart1@gmail.com`
   - Password: Create a strong password
4. Verify your email
5. **Add shipping address:**
   - Account → Addresses → Add address
6. **Add payment method:**
   - Account → Wallet → Add payment method
   - For faster checkout, also set up Walmart Pay if desired
7. **Join Walmart+ (Optional but Recommended):**
   - Free delivery on orders $35+
   - Early access to some deals
   - Cost: $12.95/month or $98/year

Repeat for Accounts 2 and 3.

---

## 4.4 Pokemon Center Account Setup

> **⚠️ IMPORTANT:** Pokemon Center uses queue systems during high-demand drops. Having multiple accounts helps ensure at least one gets through.

### Creating Account 1 (Primary):

1. Go to `pokemoncenter.com`
2. Click the person icon (top right)
3. Click "Create Account"
4. Fill in:
   - Email: `yourname+pokemon1@gmail.com`
   - Password: Create a strong password
   - Check "I'm not a robot"
5. **Add shipping address:**
   - Account → Address Book → Add New Address
6. **Add payment method:**
   - Payment is entered at checkout (not saved beforehand)
   - Keep your card info handy

> **💡 TIP:** Pokemon Center doesn't save payment methods permanently, so DROPWATCH will need your card details configured in the system for auto-checkout.

Repeat for Accounts 2 and 3.

---

## 4.5 Best Buy Account Setup

### Creating Account 1 (Primary):

1. Go to `bestbuy.com`
2. Click "Account" → "Create Account"
3. Fill in your information
4. **Add shipping address:**
   - Account → Address Book
5. **Add payment method:**
   - Account → Payment Methods → Add
6. **Join My Best Buy (Free):**
   - Get points on purchases
   - Member-only deals
7. **Consider Best Buy TotalTech:**
   - $199.99/year
   - Sometimes includes early access to drops
   - Free shipping on everything

Repeat for Accounts 2 and 3.

---

## 4.6 GameStop Account Setup

### Creating Account 1 (Primary):

1. Go to `gamestop.com`
2. Click person icon → "Create Account"
3. Fill in your information
4. **Add shipping address:**
   - Account → Addresses
5. **Add payment method:**
   - Account → Payment Methods
6. **Join PowerUp Rewards ($14.99/year):**
   - Early access to some releases
   - Points on purchases
   - Recommended for serious collectors

Repeat for Accounts 2 and 3.

---

## 4.7 Keeping Track of Your Accounts

Create a secure document (password-protected) with all your account information:

```
═══════════════════════════════════════════════════════════════════════════════
DROPWATCH ACCOUNT REGISTRY
═══════════════════════════════════════════════════════════════════════════════

TARGET ACCOUNTS
───────────────────────────────────────────────────────────────────────────────
Account 1 (Primary):
  Email: yourname+target1@gmail.com
  Password: [stored in password manager]
  Phone: (555) 123-4567
  Card on file: Visa ending 1234
  Status: ACTIVE

Account 2 (Backup):
  Email: yourname+target2@gmail.com
  Password: [stored in password manager]
  Phone: (555) 987-6543
  Card on file: Mastercard ending 5678
  Status: ACTIVE

[Continue for all retailers...]
```

> **🔐 SECURITY TIP:** Use a password manager like 1Password, LastPass, or Bitwarden to securely store all your account credentials.

---

# PART 5: CONFIGURING THE SYSTEM

## 5.1 Accessing the Dashboard

1. Make sure Docker Desktop is running (whale icon in system tray/menu bar)
2. Open your web browser
3. Go to: `http://localhost`
4. You should see the DROPWATCH dashboard

---

## 5.2 Adding Your Profiles (Buyer Identities)

Each "profile" in DROPWATCH represents one buyer identity with linked accounts.

### Step 1: Go to Profiles Tab

Click "PROFILES" in the top navigation

### Step 2: Click "Add Profile"

Click the "+ Add Profile" card

### Step 3: Fill in Profile Details

```
Profile Name: Primary
Status: VIRGIN (new, never used)

SHIPPING INFORMATION:
First Name: Ryan
Last Name: [Your Last Name]
Address: 210 E Main St
City: Easley
State: SC
ZIP: 29640
Phone: (864) XXX-XXXX
```

### Step 4: Add Retailer Credentials

For each retailer you want this profile to use:

**Target:**
```
Email: yourname+target1@gmail.com
Password: [your Target password]
Payment Last 4: 1234
```

**Walmart:**
```
Email: yourname+walmart1@gmail.com
Password: [your Walmart password]
Payment Last 4: 1234
```

**Pokemon Center:**
```
Email: yourname+pokemon1@gmail.com
Password: [your Pokemon Center password]
Card Number: [full card number - encrypted in system]
Expiry: 12/25
CVV: 123
```

### Step 5: Save Profile

Click "SAVE"

### Step 6: Create Additional Profiles

Repeat Steps 2-5 for:
- **Backup Alpha** (using your second set of accounts)
- **Backup Beta** (using your third set of accounts)
- **Reserve** (optional fourth profile)

---

## 5.3 Configuring Retailer Settings

### Step 1: Go to Settings Tab

Click "SETTINGS" in the top navigation

### Step 2: Enable/Disable Retailers

Under "RETAILER CONFIG", toggle each retailer ON or OFF:

| Retailer | Recommended Setting |
|----------|-------------------|
| Target | ✅ ON |
| Walmart | ✅ ON |
| Best Buy | ✅ ON |
| Pokemon Center | ✅ ON |
| GameStop | ⚠️ ON (if you have accounts) |
| Amazon | ❌ OFF (more complex, enable later) |

### Step 3: Configure Throttle Settings

Under "THROTTLE CONTROLS":

| Setting | Recommended Value | What It Means |
|---------|------------------|---------------|
| Max Concurrency | 3 | How many checkouts can run at once |
| Request Delay (ms) | 500 | Wait time between actions (prevents rate limiting) |
| Auto-throttle Threshold | 85% | System slows down when this busy |

### Step 4: Configure Safety Controls

Under "SAFETY CONTROLS":

| Setting | Recommended | What It Means |
|---------|-------------|---------------|
| Auto-abort on 3+ failures | ✅ ON | Stop trying after 3 fails |
| Profile rotation | ✅ ON | Switch profiles automatically |
| Flapping detection | ✅ ON | Detect fake "in stock" signals |
| Cascade isolation | ✅ ON | One failure doesn't break everything |

---

## 5.4 Understanding System Modes

DROPWATCH has two main modes:

### STANDBY Mode (Gray)
- System is monitoring but NOT buying
- Use this for testing or when you're not ready
- Safe mode - nothing will be purchased

### ARMED Mode (Red)
- System is active and WILL attempt purchases
- Only enable when you're ready to buy
- Checkbox at top right: "🔴 DISARM" / "🟢 ARM SYSTEM"

> **⚠️ WARNING:** Only ARM the system when you are ready for it to make purchases. It will attempt to checkout automatically when conditions are met.

---

# PART 6: ADDING PRODUCTS TO TRACK

## 6.1 Finding Product URLs

For each product you want to track, you need the exact product page URL.

### Target:
1. Go to target.com
2. Search for the product (e.g., "Pokemon Surging Sparks ETB")
3. Click on the exact product
4. Copy the URL from your browser
   - Example: `https://www.target.com/p/pokemon-trading-card-game-surging-sparks-elite-trainer-box/-/A-12345678`

### Walmart:
1. Go to walmart.com
2. Search for the product
3. Click on the exact product
4. Copy the URL
   - Example: `https://www.walmart.com/ip/Pokemon-TCG-Surging-Sparks-ETB/123456789`

### Pokemon Center:
1. Go to pokemoncenter.com
2. Find the product
3. Copy the URL
   - Example: `https://www.pokemoncenter.com/product/12345/pokemon-tcg-surging-sparks-elite-trainer-box`

---

## 6.2 Adding a SKU to Track

### Step 1: Go to Monitor Tab

Click "MONITOR" in the top navigation

### Step 2: Click "ADD SKU"

Click the "+ ADD SKU" button in the top right of the SKU panel

### Step 3: Fill in Product Details

```
SKU ID: PKM-SS-ETB-TGT
  (Create your own ID system - make it memorable)

Product Name: Surging Sparks Elite Trainer Box

Retailer: Target
  (Select from dropdown)

MSRP: 49.99
  (The regular retail price)

Priority: 1
  (1 = High, 2 = Medium, 3 = Low)
```

### Step 4: Click "SAVE"

### Step 5: Repeat for Each Product

Add the same product at different retailers:
- `PKM-SS-ETB-WMT` - Surging Sparks ETB at Walmart
- `PKM-SS-ETB-PC` - Surging Sparks ETB at Pokemon Center
- `PKM-SS-ETB-BB` - Surging Sparks ETB at Best Buy

---

## 6.3 Understanding SKU Statuses

| Status | Color | Meaning |
|--------|-------|---------|
| **COMING_SOON** | 🟡 Yellow | Product exists but not available yet |
| **SOFT_LAUNCH** | 🔵 Blue | Product quietly available (early access window!) |
| **LIVE** | 🟢 Green | Product is fully available |
| **FLAPPING** | 🔴 Red | Stock going on/off rapidly (be careful) |
| **OOS** | ⚫ Gray | Out of stock |

---

## 6.4 Understanding Stock Indicators

| Stock Status | Meaning |
|--------------|---------|
| **IN_STOCK** | Definitely available |
| **LIMITED** | Low quantity available |
| **REGIONAL** | Only available in certain areas |
| **OOS** | Out of stock |

---

## 6.5 Setting Trigger Conditions

The system will only attempt checkout when ALL conditions are met:

| Condition | What It Checks |
|-----------|---------------|
| Price ≤ MSRP | Won't buy if price is above MSRP |
| Stock = IN_STOCK or LIMITED | Must be available |
| Status = LIVE or SOFT_LAUNCH | Must be purchasable |
| Profile Health ≥ 70% | Profile must not have too many failures |
| Throttle < 90% | System must not be overloaded |

---

# PART 7: SETTING UP ALERTS

## 7.1 Setting Up Twilio (SMS Text Alerts)

Twilio sends you text messages when important events happen.

### Step 1: Create Twilio Account

1. Go to `https://www.twilio.com/try-twilio`
2. Sign up with your email
3. Verify your email and phone number
4. Complete the onboarding questions:
   - "What do you want to do?" → Send SMS
   - "What programming language?" → Other
   - "What's your project?" → Personal project

### Step 2: Get Your Credentials

1. In Twilio Console, look for "Account Info" box
2. Copy these values:
   - **Account SID**: Starts with "AC..."
   - **Auth Token**: Click eye icon to reveal, then copy

### Step 3: Get a Phone Number

1. Click "Get a phone number" button
2. Twilio will assign you a number
3. Copy this number (include the +1)

### Step 4: Add Credits

1. Click "Billing" in left sidebar
2. Add a payment method
3. Add $10-20 in credits (texts cost ~$0.0075 each)

### Step 5: Update Your .env File

Open your `.env` file and update:
```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_FROM_NUMBER=+15551234567
ALERT_PHONE_NUMBER=+1XXXXXXXXXX
```

Save the file.

### Step 6: Restart DROPWATCH

In Terminal/Command Prompt:
```bash
cd C:\dropwatch
docker-compose restart
```

---

## 7.2 Setting Up Slack Notifications

Slack is great for team notifications or keeping alerts organized.

### Step 1: Create Slack Workspace (if needed)

1. Go to `https://slack.com`
2. Click "Create a new workspace"
3. Follow the setup wizard

### Step 2: Create a Channel for Alerts

1. Click "+" next to Channels
2. Name it `#dropwatch-alerts`
3. Set to Private (recommended)

### Step 3: Create Incoming Webhook

1. Go to `https://api.slack.com/apps`
2. Click "Create New App"
3. Select "From scratch"
4. Name: "DROPWATCH Alerts"
5. Select your workspace
6. Click "Create App"

### Step 4: Enable Incoming Webhooks

1. In left sidebar, click "Incoming Webhooks"
2. Toggle "Activate Incoming Webhooks" to ON
3. Click "Add New Webhook to Workspace"
4. Select your `#dropwatch-alerts` channel
5. Click "Allow"
6. Copy the Webhook URL (looks like `https://hooks.slack.com/services/...`)

### Step 5: Update Your .env File

```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

Save and restart DROPWATCH.

---

## 7.3 Setting Up Email Alerts

### Step 1: Create Gmail App Password

1. Go to `https://myaccount.google.com/security`
2. Enable "2-Step Verification" if not already
3. Click "App passwords"
4. Select "Mail" and "Windows Computer"
5. Click "Generate"
6. Copy the 16-character password

### Step 2: Update Your .env File

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your.email@gmail.com
SMTP_PASSWORD=xxxx xxxx xxxx xxxx
ALERT_EMAIL=your.email@gmail.com
```

Save and restart DROPWATCH.

---

## 7.4 Understanding Alert Types

| Alert Type | Channels | When It Fires |
|------------|----------|---------------|
| 🔵 **DROP** | SMS, Slack, Push | Product goes from COMING_SOON → LIVE |
| ✅ **SUCCESS** | Slack, Push | Checkout completed successfully |
| ❌ **FAIL** | Push | Checkout failed |
| ⚠️ **WARN** | Dashboard only | System warning (profile cooling, etc.) |

---

# PART 8: DAILY OPERATIONS

## 8.1 Starting Your Day

### Morning Checklist:

1. **Verify Docker is Running**
   - Look for whale icon in system tray/menu bar
   - If not running, open Docker Desktop

2. **Open DROPWATCH Dashboard**
   - Go to `http://localhost` in your browser

3. **Check System Status**
   - Look at top indicators:
     - MODE: Should say STANDBY (or ARMED if you left it running)
     - THROTTLE: Should be < 80%
     - ACTIVE: Number of current tasks
     - QUEUE: Actions waiting

4. **Review Profile Health**
   - Go to PROFILES tab
   - All profiles should be READY with health > 70%
   - If any show COOLING, wait for cooldown to expire

5. **Check Tracked SKUs**
   - Go to MONITOR tab
   - Verify all SKUs are being tracked
   - Check "Last checked" times - should be recent

---

## 8.2 Preparing for a Known Drop

When you know a product is releasing (e.g., new Pokemon set):

### 1 Day Before:

1. **Add the SKU to all retailers:**
   - Target, Walmart, Pokemon Center, Best Buy, GameStop
   - Use Priority: 1 (highest)

2. **Verify all profiles are healthy:**
   - All should show READY status
   - Health should be > 80%

3. **Test your alert channels:**
   - In Settings, there should be a "Test Alert" button
   - Verify you receive SMS, Slack, and/or email

4. **Check your payment methods:**
   - Log into each retailer account
   - Verify saved payment methods haven't expired

### Morning of Drop:

1. **Start DROPWATCH early** (at least 30 minutes before expected drop)

2. **ARM the system** when ready:
   - Click "🟢 ARM SYSTEM" button
   - Button will turn red: "🔴 DISARM"

3. **Monitor the dashboard:**
   - Watch for status changes
   - SKUs will change from COMING_SOON → LIVE when available

4. **Keep your phone nearby** for SMS alerts

---

## 8.3 During a Drop

When products go LIVE:

1. **Watch the Action Queue**
   - Right panel shows "READY TO EXECUTE" items
   - System automatically starts checkout

2. **Monitor the Logs**
   - Go to LOGS tab for real-time updates
   - Watch for SUCCESS or FAIL messages

3. **Don't interfere unless necessary**
   - Let the system work
   - Only intervene if something is clearly wrong

4. **If successful:**
   - You'll see SUCCESS in logs
   - SMS/Slack alert will fire
   - Order confirmation will show

5. **If failed:**
   - Note the error message
   - System will automatically retry (up to 2 times)
   - Profile may go to COOLING status

---

## 8.4 After a Drop

### Immediately After:

1. **DISARM the system** if done for the day
   - Click "🔴 DISARM"

2. **Check order confirmations:**
   - Log into each retailer where SUCCESS was reported
   - Verify orders are showing in "Order History"

3. **Review performance:**
   - Go to LOGS tab
   - Note any failures and reasons

### End of Day:

1. **Check profile health:**
   - Profiles with failures will have lower health
   - If any are COOLING, note when they'll be ready

2. **Review metrics:**
   - Success rate
   - Which retailers worked best
   - Any patterns in failures

---

## 8.5 Weekly Maintenance

Every week:

1. **Update retailer accounts:**
   - Log into each account manually
   - Ensure no security holds or verification needed
   - Confirm payment methods are current

2. **Check for DROPWATCH updates:**
   ```bash
   cd C:\dropwatch
   git pull origin main
   docker-compose up -d --build
   ```

3. **Review logs:**
   - Look for patterns in failures
   - Identify any profiles that consistently fail

4. **Clear old data:**
   - Old logs are auto-cleaned after 30 days
   - Remove tracked SKUs you no longer need

---

## 8.6 Shutting Down

To stop DROPWATCH:

**Quick stop (preserves data):**
```bash
cd C:\dropwatch
docker-compose stop
```

**Full shutdown (still preserves data):**
```bash
cd C:\dropwatch
docker-compose down
```

**Starting again:**
```bash
cd C:\dropwatch
docker-compose up -d
```

---

# PART 9: TROUBLESHOOTING

## 9.1 Common Problems & Solutions

### Problem: Dashboard won't load

**Check Docker is running:**
1. Look for whale icon
2. If not running, open Docker Desktop
3. Wait 2-3 minutes for it to fully start

**Check containers are running:**
```bash
cd C:\dropwatch
docker-compose ps
```
All services should show "Up" status.

**Restart everything:**
```bash
docker-compose down
docker-compose up -d
```

---

### Problem: "Profile marked COOLING"

**What it means:** Profile had multiple failures and is on a timeout.

**Solution:**
1. Wait for cooldown (usually 5 minutes)
2. Check the retailer account manually:
   - Is there a security hold?
   - Has the password changed?
   - Is payment method valid?
3. If issues found, fix them in retailer account
4. Reset profile manually:
   - Go to PROFILES tab
   - Click RESET on the affected profile

---

### Problem: "OOS During Checkout"

**What it means:** Product was available when detected but sold out before checkout completed.

**This is normal during high-demand drops.** Solutions:

1. Increase system speed:
   - Settings → Throttle → Reduce Request Delay to 300ms
2. Add more profiles for redundancy
3. Track product at multiple retailers
4. Be ready earlier (product tracking before drop)

---

### Problem: Not receiving SMS alerts

**Check Twilio credits:**
1. Log into Twilio console
2. Check balance (you need credits to send texts)
3. Add more if needed

**Verify phone number:**
1. Check `.env` file
2. Phone number must include +1 country code
3. Example: `+15551234567`

**Test manually:**
```bash
cd C:\dropwatch
docker-compose logs api | grep -i twilio
```
Look for errors.

---

### Problem: Login failing for retailer

**Common causes:**
1. **Password changed** - Update in DROPWATCH profile settings
2. **2FA/MFA enabled** - Retailers may have added verification
3. **Account locked** - Too many automated attempts
4. **CAPTCHA required** - Log in manually first

**Solution:**
1. Log into retailer account manually in your browser
2. Complete any verification steps
3. Check if password still works
4. Update credentials in DROPWATCH if needed

---

### Problem: "Rate limited" errors

**What it means:** Retailer detected too many requests and blocked temporarily.

**Solutions:**
1. Increase Request Delay in Settings (try 1000ms)
2. Reduce Max Concurrency (try 2)
3. Wait 15-30 minutes before trying again
4. Use different profiles (rotate)

---

## 9.2 Viewing Logs

### In the Dashboard:

Go to LOGS tab - shows last 100 entries

### In Terminal:

**All logs:**
```bash
docker-compose logs -f
```

**Just API logs:**
```bash
docker-compose logs -f api
```

**Just Worker logs:**
```bash
docker-compose logs -f worker
```

**Last 50 lines:**
```bash
docker-compose logs --tail 50
```

---

## 9.3 Resetting the System

### Soft Reset (Keeps all data):
```bash
docker-compose restart
```

### Hard Reset (Keeps database, rebuilds containers):
```bash
docker-compose down
docker-compose up -d --build
```

### Full Reset (Clears EVERYTHING - use carefully):
```bash
docker-compose down -v
docker-compose up -d
```

> **⚠️ WARNING:** Full reset deletes all your profiles, tracked SKUs, and history. You'll need to set everything up again.

---

## 9.4 Getting Help

If you can't solve a problem:

1. **Check the logs** for specific error messages
2. **Take screenshots** of the dashboard and any errors
3. **Note the exact steps** that led to the problem
4. **Contact Collector Station support** with this information

---

# PART 10: GLOSSARY

| Term | Definition |
|------|------------|
| **ARM** | Enable the system to make automatic purchases |
| **Checkout** | The process of completing a purchase |
| **COOLING** | Profile status when temporarily disabled after failures |
| **Dashboard** | The web interface where you control DROPWATCH |
| **Docker** | Software that runs DROPWATCH in containers |
| **Drop** | When a product becomes available for purchase |
| **Flapping** | When inventory rapidly goes in/out of stock (unreliable) |
| **Health Score** | Rating 0-100 showing how reliable a profile is |
| **MSRP** | Manufacturer's Suggested Retail Price (normal price) |
| **Profile** | A buyer identity with linked retailer accounts |
| **Queue** | Waiting room system used by some retailers (Pokemon Center) |
| **Retailer** | Store where products are sold (Target, Walmart, etc.) |
| **SKU** | Stock Keeping Unit - a unique product identifier |
| **Soft Launch** | When a product quietly becomes available before official release |
| **STANDBY** | System is monitoring but won't make purchases |
| **Throttle** | System speed control to avoid being blocked |
| **Trigger** | Conditions that must be met for purchase attempt |
| **VIRGIN** | Profile status for new, never-used profiles |
| **Worker** | Background process that controls the web browser |

---

# APPENDIX A: RECOMMENDED EXTERNAL SERVICES

## Required Services

| Service | Purpose | Monthly Cost | Sign Up |
|---------|---------|--------------|---------|
| Twilio | SMS Alerts | ~$1-5 | twilio.com |

## Optional but Recommended

| Service | Purpose | Monthly Cost | Sign Up |
|---------|---------|--------------|---------|
| Slack | Team alerts | Free | slack.com |
| Privacy.com | Virtual cards | Free | privacy.com |
| 1Password | Password manager | $3 | 1password.com |
| Google Voice | Extra phone # | Free | voice.google.com |

## For Cloud Hosting (Advanced)

| Service | Purpose | Monthly Cost | Sign Up |
|---------|---------|--------------|---------|
| DigitalOcean | Cloud server | $24-48 | digitalocean.com |
| AWS EC2 | Cloud server | $20-100 | aws.amazon.com |
| Vultr | Cloud server | $24-48 | vultr.com |

---

# APPENDIX B: QUICK REFERENCE CARD

## Starting DROPWATCH
```bash
cd C:\dropwatch
docker-compose up -d
```
Open browser to: `http://localhost`

## Stopping DROPWATCH
```bash
cd C:\dropwatch
docker-compose down
```

## Viewing Logs
```bash
docker-compose logs -f
```

## Restarting
```bash
docker-compose restart
```

## Updating
```bash
git pull origin main
docker-compose up -d --build
```

---

# APPENDIX C: RELEASE TIMING PATTERNS

Based on historical data, here are typical release patterns:

| Retailer | Typical Drop Time (Eastern) | Notes |
|----------|---------------------------|-------|
| Target | 7:00 AM - 8:00 AM | Often Wednesday |
| Walmart | 12:00 PM - 3:00 PM | Variable |
| Pokemon Center | 12:00 PM - 1:00 PM | Release day |
| Best Buy | 10:00 AM - 12:00 PM | Variable |
| GameStop | 11:00 AM - 1:00 PM | Variable |

> **Note:** These are general patterns and may vary. Always check official announcements.

---

# APPENDIX D: SUPPORT CHECKLIST

Before requesting support, verify:

- [ ] Docker Desktop is running
- [ ] All containers show "Up" in `docker-compose ps`
- [ ] You can access `http://localhost` in browser
- [ ] Your `.env` file has all required values filled in
- [ ] Twilio has credits (if using SMS)
- [ ] Retailer accounts work when logged in manually
- [ ] You have the exact error message or screenshot

---

*Document Version 1.0 | Last Updated: 2024*
*For Collector Station Internal Use*
