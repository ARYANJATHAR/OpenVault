# Vault Mobile (Expo)

React Native + Expo mobile application for Vault Password Manager. Syncs with desktop app via LAN.

## Features

- ✅ Same color theme as desktop (Carbon & Emerald)
- ✅ Create/Unlock vault with master password
- ✅ View all password entries
- ✅ Search and filter entries
- ✅ Favorites system
- ✅ Entry details with copy functionality
- ✅ Edit entries
- ✅ Add new entries
- ✅ TOTP (2FA) code generation
- ✅ Delete entries
- ✅ Password generator with strength meter
- ✅ Dark/Light theme support
- ✅ Haptic feedback

## Setup

### Prerequisites

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- Expo Go app on your phone (for development)

### Installation

```bash
cd vault-mobile
npm install
```

### Run

**Development (Expo Go):**
```bash
npm start
```

Then scan the QR code with Expo Go (Android) or Camera app (iOS).

**Android Emulator:**
```bash
npm run android
```

**iOS Simulator (macOS only):**
```bash
npm run ios
```

## Project Structure

```
vault-mobile/
├── app/                    # Expo Router pages
│   ├── _layout.tsx         # Root layout with providers
│   ├── index.tsx           # Unlock screen
│   ├── vault.tsx           # Main vault screen
│   ├── add-entry.tsx       # Add new entry
│   └── entry/
│       └── [id].tsx        # Entry detail screen
├── src/
│   ├── components/         # Reusable UI components
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   └── EntryCard.tsx
│   ├── context/            # React Context providers
│   │   ├── ThemeContext.tsx
│   │   └── VaultContext.tsx
│   ├── services/           # Business logic
│   │   ├── cryptoService.ts
│   │   ├── vaultService.ts
│   │   ├── totpService.ts
│   │   └── passwordService.ts
│   └── theme/              # Theme configuration
│       ├── colors.ts
│       ├── typography.ts
│       └── index.ts
├── assets/                 # App icons and images
├── app.json                # Expo configuration
├── package.json
└── tsconfig.json
```

## Tech Stack

- **Framework:** React Native + Expo SDK 52
- **Navigation:** Expo Router v4
- **Database:** expo-sqlite
- **Encryption:** crypto-js (AES-256-CBC, PBKDF2)
- **TOTP:** otpauth library
- **Secure Storage:** expo-secure-store

## Security Notes

- Uses AES-256-CBC encryption for sensitive data
- PBKDF2 with 100,000 iterations for key derivation
- Master password never stored, only derived key hash
- All entry fields encrypted at rest

## Next Steps

- [ ] Implement LAN sync with desktop
- [ ] Add biometric authentication
- [ ] Add security audit screen
- [ ] Add folder organization
- [ ] Add export/import functionality
- [ ] Add password breach checking
