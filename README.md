<p align="center">
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20Android-blue?style=for-the-badge" alt="Platforms"/>
  <img src="https://img.shields.io/badge/License-GPL--3.0-green?style=for-the-badge" alt="License"/>
  <img src="https://img.shields.io/badge/Encryption-AES--256--GCM-red?style=for-the-badge" alt="Encryption"/>
</p>

<h1 align="center">OpenVault</h1>

<p align="center">
  <strong>A fully local, open-source password manager</strong>
</p>

<p align="center">
  Your passwords never leave your device. No cloud. No servers. No subscriptions.<br/>
  Complete privacy with AES-256-GCM encryption.
</p>

---

## What is OpenVault?

OpenVault is an open-source password manager built on a simple principle: your passwords belong on your device, not on someone else's server. Everything stays local and encrypted using industry-standard AES-256-GCM encryption.

I built this because I was tired of trusting cloud services with my most sensitive data. OpenVault doesn't phone home, doesn't collect telemetry, and doesn't require an internet connection. It's just a secure vault that lives on your device.

### Why Choose OpenVault?

**Complete Privacy**: Your data never touches the internet unless you explicitly choose to sync between your own devices over your local network.

**No Subscriptions**: This isn't a service, it's software. Download it, use it forever, no payment required.

**Transparent Security**: The code is open source. You can audit exactly how your passwords are encrypted and stored. No black boxes, no "trust us."

**Full Control**: You own your data. Export it, backup it, move it. The vault file is just a SQLite database on your disk.

### Core Features

- AES-256-GCM encryption with Argon2id key derivation
- Completely offline operation
- Windows desktop application and Android mobile app
- Browser extension for autofill (Chromium-based browsers)
- Optional LAN sync between your devices
- Built-in password strength analysis and security audit
- TOTP two-factor authentication code generation
- No telemetry or data collection of any kind

---

## Components

OpenVault has three parts that work together:

**Desktop Application (Windows)**: The main vault where all your passwords are stored and encrypted. This is the core component.

**Mobile App (Android)**: Companion app for accessing your passwords on your phone. Can sync with the desktop app over your local network.

**Browser Extension**: Autofill extension for Chrome, Edge, Brave, and other Chromium browsers. Communicates with the desktop app to fill login forms.

---

## Installation

### Desktop Application (Windows)

The desktop application is the core of OpenVault. This is where your encrypted vault lives and where you'll manage all your passwords.

**Download the Pre-Built Installer:**

1. Go to the [Releases](../../releases) page
2. Download `PasswordManager-v1.0.0-windows.exe` for Windows
3. Run the installer
4. Launch OpenVault and create your master password

**Build from Source:**

```bash
# Clone the repository
git clone https://github.com/yourusername/OpenVault.git
cd OpenVault

# Install dependencies
npm install

# Run in development
npm run dev

# Build for production
npm run build

# Package installer
npm run package
```

The installer will be in the `release/` directory.

---

### Mobile Application (Android)

The mobile app lets you access your passwords on your Android device. It can sync with your desktop vault over your local network.

**Install the APK:**

1. Download `PasswordManager-v1.0.0-android.apk` from the [Releases](../../releases) page
2. On your Android device, go to **Settings → Security → Unknown Sources** and enable installation from unknown sources
3. Open the APK file and install
4. Launch OpenVault

**Build from Source:**

```bash
cd vault-mobile

# Install dependencies
npm install

# Start development server
npx expo start

# Build APK for Android
eas build --platform android --profile preview
```

---

### Browser Extension

The browser extension enables password autofill on websites. It works with Chrome, Edge, Brave, and other Chromium-based browsers.

**Important:** The desktop app must be running for the extension to work.

**Installation:**
**From Source:**

```bash
# Clone and build
git clone https://github.com/yourusername/OpenVault.git
cd OpenVault
npm run build:extension
```

**From Release:**

Download `extension.zip` from the [Releases](../../releases) page and extract it.

**Load in Your Browser:**

1. Open your browser and go to:
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
   - Brave: `brave://extensions/`

2. Enable **Developer mode** (toggle in top-right)

3. Click **Load unpacked**

4. Select the `extension/` folder

5. The OpenVault icon will appear in your toolbar

**Using the Extension:**

Make sure the desktop app is running, then:
- Click the extension icon to view and select credentials
- Press `Ctrl+Shift+L` to open the popup
- Press `Ctrl+Shift+F` to autofill on the current page

---

## Security

OpenVault uses standard, well-tested cryptography. Nothing clever, just proven algorithms implemented correctly.

**Encryption Stack:**

- **AES-256-GCM** for encrypting vault data
- **Argon2id** for deriving encryption keys from your master password
- **HMAC-SHA1** for TOTP two-factor codes
- **TLS 1.3** for encrypted LAN sync

**How It Works:**

When you create a vault, your master password is run through Argon2id (a memory-hard key derivation function designed to resist brute force attacks). This produces a 256-bit encryption key. All your passwords and data are encrypted with AES-256-GCM using this key before being written to disk.

The vault file (`vault.db`) is just a SQLite database containing encrypted data. Without your master password, it's useless. The encryption key is never stored anywhere—it's derived fresh from your master password each time you unlock the vault.

**Important Security Notes:**

- **Your master password cannot be recovered.** If you forget it, your vault is permanently locked. There's no backdoor, no recovery mechanism.
- **Backup your vault file.** Copy `vault.db` to a secure location regularly. This is your only backup.
- **Use a strong master password.** At least 12 characters. Consider using a passphrase—multiple random words are both strong and memorable.
- **LAN sync is encrypted**, but it still transmits data over your network. Only use it on networks you trust.

---

## What You Can Do

**Password Management:**
- Store usernames, passwords, URLs, and notes
- Generate strong random passwords
- Organize entries with favorites and folders
- Search across all entries

**Security Features:**
- Password strength analysis
- Identify weak or reused passwords
- Security score dashboard
- Local breach database checking

**Two-Factor Authentication:**
- Generate TOTP codes
- Support for otpauth:// URLs
- One-click copy with countdown timer

**Synchronization:**
- Optional LAN sync between your Windows and Android devices
- Automatic device discovery
- End-to-end encrypted sync protocol
- Conflict resolution

**User Interface:**
- Dark and light themes
- System tray integration (Windows)
- Auto-lock after inactivity
- Keyboard shortcuts

---

## Development

If you want to contribute or modify OpenVault, here's what you need to know.

**Tech Stack:**
- Desktop: Electron, React, TypeScript, better-sqlite3
- Mobile: React Native, Expo
- Extension: Chrome Extension Manifest V3
- Encryption: Node.js crypto module, Argon2

**Available Commands:**

```bash
# Desktop development
npm run dev              # Start in dev mode
npm run build            # Build all components  
npm run package          # Create installer

# Extension
npm run build:extension  # Build extension

# Mobile
cd vault-mobile
npm run dev              # Start Expo dev server
npm run build:android    # Build Android APK
```

**Contributing:**

Pull requests are welcome. For major changes, open an issue first to discuss what you'd like to change.

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'Add some feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a pull request

---


## License

This project is licensed under the MIT License.

This means:
- ✅ You can use this software for any purpose, including commercial use
- ✅ You can modify and distribute this software freely
- ✅ You can use it in proprietary software
- ✅ The only requirement is to include the original copyright and license notice

See the [LICENSE](LICENSE) file for full details.

**Why MIT?** We believe in maximum freedom. Use OpenVault however you want—fork it, modify it, integrate it into your own projects. The MIT license ensures you have complete flexibility while keeping the software open and accessible to everyone.

---

## Security Disclosure

If you discover a security vulnerability, please email arya instead of opening a public issue. I'll respond as quickly as possible.

---

<p align="center">
  <em>Your passwords. Your device. Your control.</em>
</p>
