# Vault - Local Password Manager

A fully local, zero-internet password manager with AES-256-GCM encryption. Built with Electron and React, Vault provides secure password storage, TOTP support, and browser autofill capabilities—all without requiring an internet connection.

## 🔐 Features

### Core Security
- **AES-256-GCM Encryption**: Industry-standard encryption for all sensitive data
- **Argon2 Key Derivation**: Secure password-based key derivation with configurable parameters
- **Zero Internet Required**: All data stays on your device—no cloud sync, no external servers
- **Application-Level Encryption**: Sensitive fields encrypted before database storage
- **Auto-Lock**: Automatic vault locking after inactivity (configurable timeout)

### Password Management
- **Secure Password Storage**: Encrypted storage for usernames, passwords, URLs, and notes
- **Password Generator**: Configurable password generator with strength options
- **Password Strength Checker**: Real-time password strength analysis with feedback
- **Favorites System**: Mark frequently used entries as favorites
- **Search & Filter**: Quick search across all entries
- **Folder Organization**: Organize entries into folders (hierarchical support)

### Two-Factor Authentication (2FA)
- **TOTP Support**: Generate time-based one-time passwords (TOTP) for 2FA
- **Real-Time Codes**: Live TOTP code generation with countdown timer
- **Multiple Formats**: Supports both raw secrets and `otpauth://` URLs

### Browser Integration
- **Browser Extension**: Chrome/Edge extension for seamless autofill
- **Native Messaging**: Secure communication between extension and desktop app
- **WebSocket Bridge**: Real-time sync between extension and desktop app
- **URL Matching**: Intelligent domain matching for autofill suggestions
- **Keyboard Shortcuts**: Quick access via `Ctrl+Shift+L` (or `Cmd+Shift+L` on Mac)

### Security Audit
- **Security Dashboard**: Comprehensive security analysis of your vault
- **Issue Detection**: Identifies weak passwords, reused passwords, and security risks
- **Security Score**: Overall security rating with actionable recommendations
- **Issue Categorization**: Critical, High, Medium, and Low severity classifications

### Sync & Sharing
- **LAN Sync**: Optional local network synchronization between devices
- **Bonjour Discovery**: Automatic device discovery on local network
- **Encrypted Sync Protocol**: Secure peer-to-peer synchronization
- **Conflict Resolution**: Handles sync conflicts with version tracking

### User Experience
- **Modern UI**: Clean, responsive interface built with React
- **Dark/Light Themes**: System-aware theme switching
- **System Tray**: Minimize to system tray for quick access
- **Global Shortcuts**: Keyboard shortcuts for quick vault access
- **Auto-Fill Integration**: Seamless browser autofill experience

## 📁 Project Structure

```
local password manager/
├── src/
│   ├── core/              # Core encryption and vault logic
│   │   ├── crypto.ts      # AES-256-GCM encryption, Argon2 KDF
│   │   ├── vault.ts       # High-level vault management API
│   │   ├── totp.ts        # TOTP code generation
│   │   ├── password-strength.ts  # Password strength analysis
│   │   └── security-audit.ts    # Security audit engine
│   ├── db/                # Database layer
│   │   ├── database.ts    # SQLite database operations
│   │   └── schema.sql     # Database schema
│   ├── main/              # Electron main process
│   │   ├── main.ts        # Main entry point, window management
│   │   ├── preload.ts     # IPC bridge for renderer
│   │   ├── tray.ts        # System tray implementation
│   │   ├── native-messaging.ts  # Browser extension communication
│   │   └── ws-bridge.ts   # WebSocket bridge for extension
│   ├── renderer/          # React UI (renderer process)
│   │   ├── App.tsx        # Main React component
│   │   ├── main.tsx       # React entry point
│   │   └── styles/        # CSS styles
│   └── sync/              # LAN sync functionality
│       ├── discovery.ts   # Device discovery (Bonjour)
│       ├── protocol.ts    # Sync protocol implementation
│       └── transport.ts   # Network transport layer
├── extension/             # Browser extension
│   ├── background.ts     # Extension background service worker
│   ├── content.ts        # Content script for autofill
│   ├── popup/            # Extension popup UI
│   └── manifest.json     # Extension manifest
├── scripts/              # Utility scripts
│   └── audit-network.ts  # Network security audit
├── dist/                 # Compiled output
├── release/              # Built installers
└── vault.db              # Encrypted vault database (created on first use)
```

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+ and npm
- **Windows** 10+, **macOS** 10.15+, or **Linux** (Ubuntu 20.04+)
- **Python** (for building native modules, if needed)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd "local password manager"
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the project**
   ```bash
   npm run build
   ```

4. **Start development mode**
   ```bash
   npm run dev
   ```

### Building for Production

```bash
# Build all components
npm run build

# Build browser extension
npm run build:extension

# Package for distribution
npm run package
```

The packaged application will be in the `release/` directory.

## 💻 Usage

### First Time Setup

1. **Launch the application**
   - Run `npm start` or launch the built executable
   - The app will check for an existing vault

2. **Create a new vault**
   - If no vault exists, you'll be prompted to create one
   - Set a strong master password (minimum 8 characters)
   - Confirm your master password
   - Click "Initialize" to create your vault

3. **Unlock your vault**
   - Enter your master password
   - Click "Unlock Access"
   - Your vault will unlock and display your password entries

### Managing Passwords

1. **Add a new entry**
   - Click the "New Entry" button
   - Fill in the service name, username, password, and optional fields
   - Add a TOTP secret if you use 2FA
   - Click "Save Now"

2. **Edit an entry**
   - Click on an entry in the list
   - Click "Edit" in the detail panel
   - Make your changes
   - Click "Save"

3. **Delete an entry**
   - Select the entry
   - Click "Delete" in the detail panel
   - Confirm deletion

4. **Search entries**
   - Use the search bar in the sidebar
   - Search by title, username, or URL

5. **Mark as favorite**
   - Select an entry
   - Click the "Favorite" button
   - Access favorites via the "Favorites" sidebar item

### Browser Extension

1. **Install the extension**
   - Build the extension: `npm run build:extension`
   - Open Chrome/Edge and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `extension/` directory

2. **Connect to desktop app**
   - Make sure the desktop app is running
   - The extension will automatically connect via native messaging

3. **Use autofill**
   - Navigate to a login page
   - The extension will detect matching entries
   - Click the extension icon or use `Ctrl+Shift+F` to autofill

### Security Audit

1. **Access Security Dashboard**
   - Click "Security" in the sidebar
   - View your security score and issues

2. **Review issues**
   - Issues are categorized by severity
   - Each issue includes recommendations
   - Fix issues by updating weak or reused passwords

### TOTP (2FA) Codes

1. **Add TOTP secret**
   - When creating/editing an entry, add a TOTP secret
   - Supports raw secrets (e.g., `JBSWY3DPEHPK3PXP`) or `otpauth://` URLs

2. **View codes**
   - Select an entry with a TOTP secret
   - View the live code in the detail panel
   - Codes refresh every 30 seconds
   - Click "Copy" to copy the code

## 🔒 Security Features

### Encryption

- **Algorithm**: AES-256-GCM (Galois/Counter Mode)
- **Key Derivation**: Argon2id with configurable iterations
- **Key Management**: Separate keys for vault encryption, sync, and export
- **Memory Security**: Sensitive keys wiped from memory after use

### Database Security

- **Application-Level Encryption**: All sensitive fields encrypted before storage
- **SQLite Database**: Uses `better-sqlite3` for local storage
- **Future**: SQLCipher support for page-level encryption (planned)

### Best Practices

- **No Cloud Storage**: All data remains on your device
- **No Telemetry**: Zero data collection or external communication
- **Context Isolation**: Electron security best practices enforced
- **Sandboxing**: Renderer process runs in sandboxed environment
- **Auto-Lock**: Automatic vault locking after inactivity

## 🛠️ Development

### Project Structure

The project follows a modular architecture:

- **Core**: Encryption, vault logic, and security utilities
- **Database**: SQLite operations and schema management
- **Main Process**: Electron main process (window management, IPC)
- **Renderer**: React UI components
- **Sync**: LAN synchronization protocol
- **Extension**: Browser extension for autofill

### Scripts

```bash
# Development
npm run dev              # Start dev server with hot reload
npm run dev:renderer     # Start Vite dev server only
npm run dev:main         # Watch TypeScript compilation
npm run dev:electron     # Start Electron

# Building
npm run build            # Build all components
npm run build:renderer   # Build React app
npm run build:main       # Compile TypeScript
npm run build:extension  # Build browser extension

# Testing
npm test                 # Run all tests
npm run test:unit        # Run unit tests with coverage
npm run test:integration # Run integration tests

# Utilities
npm run audit:network   # Audit network security
npm run lint            # Lint code
```

### Technology Stack

- **Framework**: Electron 28+
- **UI**: React 18+ with TypeScript
- **Build Tool**: Vite 5+
- **Database**: better-sqlite3
- **Encryption**: Node.js crypto (AES-256-GCM, Argon2)
- **Testing**: Vitest
- **Package**: electron-builder

## 📝 License

[Add your license here]

## 🤝 Contributing

[Add contribution guidelines here]

## ⚠️ Security Notice

This is a local password manager. While it implements strong encryption and security best practices:

- **Keep your master password secure** - If lost, your vault cannot be recovered
- **Backup your vault** - Regularly backup `vault.db` to a secure location
- **Use a strong master password** - Minimum 12+ characters recommended
- **Keep the app updated** - Security updates are important

## 🐛 Known Issues

- SQLCipher integration pending (currently uses application-level encryption)
- LAN sync requires both devices on the same network
- Browser extension requires desktop app to be running

## 📚 Additional Resources

- [Electron Security Guide](https://www.electronjs.org/docs/latest/tutorial/security)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [RFC 6238 - TOTP](https://tools.ietf.org/html/rfc6238)

---

**Built with ❤️ for privacy and security**
