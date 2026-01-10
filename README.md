<p align="center">
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux%20%7C%20Android%20%7C%20iOS-blue?style=for-the-badge" alt="Platforms"/>
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License"/>
  <img src="https://img.shields.io/badge/Encryption-AES--256--GCM-red?style=for-the-badge" alt="Encryption"/>
</p>

<h1 align="center">🔐 OpenVault</h1>

<p align="center">
  <strong>A fully local, zero-internet, open-source password manager</strong>
</p>

<p align="center">
  Your passwords never leave your device. No cloud. No servers. No subscriptions.<br/>
  <em>Complete privacy with military-grade AES-256-GCM encryption.</em>
</p>

---

## 📖 What is OpenVault?

**OpenVault** is an open-source, offline-first password manager designed for users who prioritize **privacy** and **security** above all else. Unlike cloud-based password managers, OpenVault stores all your sensitive data **locally on your device**—encrypted with industry-standard AES-256-GCM encryption.

### Why OpenVault?

| Feature | OpenVault | Cloud-Based Managers |
|---------|-----------|---------------------|
| 🔒 **Data Storage** | 100% Local | Cloud Servers |
| 🌐 **Internet Required** | ❌ Never | ✅ Always |
| 💰 **Subscription** | Free Forever | Monthly/Yearly |
| 🕵️ **Privacy** | Complete | Trust-Based |
| 🔄 **Sync** | LAN Only (Optional) | Cloud Sync |
| 📱 **Cross-Platform** | ✅ Desktop, Mobile, Browser | ✅ |

### Key Highlights

- **🔐 Military-Grade Encryption**: AES-256-GCM with Argon2id key derivation
- **📴 100% Offline**: No internet connection required, ever
- **🚫 Zero Telemetry**: No data collection, no tracking, no analytics
- **📱 Cross-Platform**: Desktop (Windows/macOS/Linux), Mobile (Android/iOS), Browser Extension
- **🔄 LAN Sync**: Securely sync between devices on your local network (no cloud)
- **🛡️ Security Audit**: Built-in security dashboard to identify weak/reused passwords
- **⏱️ TOTP Support**: Generate 2FA codes directly in the app
- **⌨️ Browser Autofill**: Seamless autofill with Chrome/Edge/Firefox extension

---

## 📦 Components

OpenVault consists of three components that work together:

| Component | Description | Required? |
|-----------|-------------|-----------|
| **🖥️ Desktop App** | Main vault application (Electron) | ✅ Required |
| **📱 Mobile App** | Companion mobile app (React Native) | ⭕ Optional |
| **🌐 Browser Extension** | Autofill extension for browsers | ⭕ Optional |

---

## 📥 Installation Guide

### 🖥️ Desktop Application

The desktop app is the core of OpenVault. It stores your encrypted vault and provides the main interface for managing passwords.

#### Option 1: Download Pre-Built Installer (Recommended)

1. Go to the [**Releases**](../../releases) page
2. Download the installer for your operating system:
   
   | OS | File | Notes |
   |----|------|-------|
   | **Windows** | `OpenVault-Setup-x.x.x.exe` | Run the installer |
   | **macOS** | `OpenVault-x.x.x.dmg` | Drag to Applications |
   | **Linux** | `OpenVault-x.x.x.AppImage` | Make executable & run |

3. Launch the application
4. Create your master password and start adding entries!

#### Option 2: Build from Source

```bash
# Clone the repository
git clone https://github.com/yourusername/OpenVault.git
cd OpenVault

# Install dependencies
npm install

# Build the application
npm run build

# Run in development mode
npm run dev

# OR package for distribution
npm run package
```

The packaged installer will be available in the `release/` directory.

---

### 📱 Mobile Application

The mobile app provides secure password access on your Android or iOS device.

#### Option 1: Download Pre-Built APK/IPA

##### Android

1. Go to the [**Releases**](../../releases) page
2. Download `OpenVault-x.x.x.apk`
3. On your Android device:
   - Go to **Settings** → **Security** → Enable **Install from Unknown Sources**
   - Open the downloaded APK file
   - Tap **Install**
   - Launch OpenVault from your app drawer

##### iOS

1. Go to the [**Releases**](../../releases) page
2. Download `OpenVault-x.x.x.ipa`
3. Install using one of these methods:
   - **AltStore**: Use AltStore to sideload the IPA
   - **TestFlight**: Join our TestFlight beta (link in releases)
   - **Xcode**: Install via Xcode with a developer account

#### Option 2: Build from Source

```bash
# Navigate to mobile directory
cd vault-mobile

# Install dependencies
npm install

# Start Expo development server
npx expo start

# Build for Android
npx expo run:android
# OR build APK
eas build --platform android --profile preview

# Build for iOS
npx expo run:ios
# OR build IPA
eas build --platform ios --profile preview
```

---

### 🌐 Browser Extension

The browser extension enables seamless autofill on websites. It communicates with the desktop app to securely fill login forms.

> ⚠️ **Note**: The browser extension requires the desktop app to be running.

#### Supported Browsers

- ✅ Google Chrome
- ✅ Microsoft Edge
- ✅ Brave Browser
- ✅ Opera
- ✅ Any Chromium-based browser
- 🔜 Firefox (coming soon)

#### Installation (Load Unpacked - Development)

Since this is an open-source project, you'll need to load the extension manually:

##### Step 1: Get the Extension Files

**Option A: From Source**
```bash
# Clone the repository (if not done already)
git clone https://github.com/yourusername/OpenVault.git
cd OpenVault

# Build the extension
npm run build:extension
```

**Option B: From Release**
1. Go to the [**Releases**](../../releases) page
2. Download `extension.zip`
3. Extract the ZIP file to a folder

##### Step 2: Load in Browser

###### Google Chrome / Microsoft Edge / Brave

1. Open your browser and navigate to:
   - **Chrome**: `chrome://extensions/`
   - **Edge**: `edge://extensions/`
   - **Brave**: `brave://extensions/`

2. Enable **Developer mode** (toggle in the top-right corner)

3. Click **"Load unpacked"**

4. Navigate to and select the `extension/` folder from the project

5. The extension icon should now appear in your toolbar!

<details>
<summary>📸 Click to see visual guide</summary>

```
┌─────────────────────────────────────────────────────────────┐
│  Extensions                                    [Developer mode] ☑ │
├─────────────────────────────────────────────────────────────┤
│                                                                    │
│  [Load unpacked]  [Pack extension]  [Update]                      │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │  🔐 Vault Password Manager                                │     │
│  │  Version: 1.0.0                                           │     │
│  │  ID: xxxxxxxxxxxxxxxxxxxxxxxxxx                           │     │
│  │  ☑ Enabled                                [Remove] [Details]   │
│  └──────────────────────────────────────────────────────────┘     │
└────────────────────────────────────────────────────────────────────┘
```

</details>

##### Step 3: Using the Extension

1. **Make sure the OpenVault desktop app is running**
2. Click the extension icon in your browser toolbar
3. The extension will automatically connect to your desktop vault
4. Navigate to any login page
5. Use one of these methods to autofill:
   - Click the extension icon and select a credential
   - Press `Ctrl+Shift+F` (or `Cmd+Shift+F` on Mac) to autofill
   - Press `Ctrl+Shift+L` (or `Cmd+Shift+L` on Mac) to open the popup

---

## 🔐 Security Architecture

### Encryption Details

| Component | Algorithm | Purpose |
|-----------|-----------|---------|
| **Vault Encryption** | AES-256-GCM | Encrypts all stored passwords |
| **Key Derivation** | Argon2id | Derives encryption key from master password |
| **TOTP Generation** | HMAC-SHA1 | Generates 2FA codes |
| **Sync Protocol** | TLS 1.3 + Custom | Encrypted LAN synchronization |

### How Your Data is Protected

```
┌────────────────────────────────────────────────────────────────────┐
│                         YOUR DEVICE                                 │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   Master Password ──► Argon2id KDF ──► 256-bit Encryption Key      │
│                                              │                      │
│                                              ▼                      │
│   ┌─────────────┐      AES-256-GCM      ┌─────────────┐            │
│   │  Your Data  │ ───────────────────► │ Encrypted   │            │
│   │  (Plain)    │                       │ (vault.db)  │            │
│   └─────────────┘                       └─────────────┘            │
│                                                                     │
│   ❌ Never leaves your device                                       │
│   ❌ No cloud upload                                                │
│   ❌ No telemetry                                                   │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
```

---

## ⚡ Features

### Password Management
- ✅ Secure storage for usernames, passwords, URLs, and notes
- ✅ Password generator with customizable settings
- ✅ Password strength analyzer
- ✅ Favorites and folder organization
- ✅ Quick search across all entries

### Two-Factor Authentication (TOTP)
- ✅ Generate time-based one-time passwords
- ✅ Supports otpauth:// URLs and raw secrets
- ✅ Live countdown timer
- ✅ One-click copy

### Security Dashboard
- ✅ Overall security score
- ✅ Weak password detection
- ✅ Reused password detection
- ✅ Breach check (local database)
- ✅ Actionable recommendations

### LAN Sync (Optional)
- ✅ Sync between devices on local network
- ✅ Automatic device discovery (Bonjour/mDNS)
- ✅ End-to-end encrypted sync protocol
- ✅ Conflict resolution

### User Experience
- ✅ Dark/Light theme (system-aware)
- ✅ System tray integration
- ✅ Global keyboard shortcuts
- ✅ Auto-lock after inactivity

---

## 🛠️ Development

### Project Structure

```
OpenVault/
├── src/                    # Desktop app source
│   ├── core/               # Encryption & vault logic
│   ├── db/                 # Database layer (SQLite)
│   ├── main/               # Electron main process
│   ├── renderer/           # React UI
│   └── sync/               # LAN sync protocol
├── extension/              # Browser extension
│   ├── background.ts       # Service worker
│   ├── content.ts          # Content script
│   ├── popup/              # Extension popup UI
│   └── manifest.json       # Extension manifest (MV3)
├── vault-mobile/           # Mobile app (React Native/Expo)
│   ├── app/                # App routes
│   └── src/                # Source code
├── release/                # Built installers
└── vault.db                # Encrypted vault (created on first use)
```

### Available Scripts

```bash
# Desktop App
npm run dev              # Start development mode
npm run build            # Build all components
npm run package          # Package for distribution

# Browser Extension
npm run build:extension  # Build extension

# Mobile App
cd vault-mobile
npm run dev              # Start Expo dev server
npm run build:android    # Build Android APK
npm run build:ios        # Build iOS IPA
```

### Tech Stack

| Component | Technologies |
|-----------|--------------|
| **Desktop** | Electron, React, TypeScript, Vite, better-sqlite3 |
| **Mobile** | React Native, Expo, TypeScript |
| **Extension** | Chrome Extension Manifest V3, TypeScript |
| **Encryption** | Node.js crypto (AES-256-GCM), Argon2 |

---

## 🤝 Contributing

We welcome contributions! Here's how you can help:

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Commit** your changes: `git commit -m 'Add amazing feature'`
4. **Push** to the branch: `git push origin feature/amazing-feature`
5. **Open** a Pull Request

### Contribution Ideas
- 🐛 Bug fixes
- ✨ New features
- 📖 Documentation improvements
- 🌐 Translations
- 🧪 Tests
- 🎨 UI/UX improvements

---

## ⚠️ Security Notice

While OpenVault implements strong encryption and security best practices, please note:

- **🔑 Your master password is your responsibility** — If lost, your vault **cannot** be recovered
- **💾 Backup your vault** — Regularly backup `vault.db` to a secure location
- **💪 Use a strong master password** — Minimum 12+ characters recommended
- **🔄 Keep the app updated** — Security updates are important
- **🚨 Report vulnerabilities** — If you discover a security issue, please report it responsibly

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

## 📚 Resources

- [Electron Security Guide](https://www.electronjs.org/docs/latest/tutorial/security)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [RFC 6238 - TOTP Algorithm](https://tools.ietf.org/html/rfc6238)

---

## 💬 Support

- 📝 [Open an Issue](../../issues) for bugs or feature requests
- 💬 [Start a Discussion](../../discussions) for questions

---

<p align="center">
  <strong>Built with ❤️ for privacy and security</strong>
</p>

<p align="center">
  <em>Your passwords. Your device. Your control.</em>
</p>
