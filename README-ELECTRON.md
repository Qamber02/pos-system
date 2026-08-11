# POS SHOPPING - Electron Desktop App

## Building the Desktop Application

### Prerequisites
- Node.js 18+ installed
- All dependencies installed (`npm install`)

### Development Mode
Run the app in development mode with hot reload:

```bash
# Terminal 1 - Start Vite dev server
npm run dev

# Terminal 2 - Start Electron
npm run electron:dev
```

### Production Build

#### Build for Windows (EXE)
```bash
# Build the web app
npm run build

# Build Windows installer
npm run electron:build:win
```

This creates a single `.exe` installer in `dist-electron/` directory.

#### Build for macOS
```bash
npm run build
npm run electron:build:mac
```

#### Build for Linux
```bash
npm run build
npm run electron:build:linux
```

### Package Scripts

Add these scripts to your `package.json`:

```json
{
  "scripts": {
    "electron:dev": "NODE_ENV=development electron electron/main.js",
    "electron:build": "electron-builder",
    "electron:build:win": "electron-builder --win --x64",
    "electron:build:mac": "electron-builder --mac",
    "electron:build:linux": "electron-builder --linux"
  },
  "main": "electron/main.js"
}
```

### Offline Mode with SQLite

**Important Note**: The current app uses Supabase (cloud database). To run fully offline:

1. **Option A - Use Local Supabase** (Recommended):
   - Install Docker Desktop
   - Run: `npx supabase start`
   - Update `.env` with local Supabase URL

2. **Option B - Switch to SQLite** (Full offline):
   - Install: `npm install better-sqlite3 knex`
   - Replace Supabase client with SQLite connection
   - Migrate database schema to SQLite
   - Update all queries to use SQLite syntax

### Current Setup

The app currently:
- ✅ Runs as desktop application
- ✅ Custom logo and branding
- ✅ Professional receipts with logo
- ✅ Comprehensive Excel reports
- ⚠️ Requires internet for Supabase database

### Converting to Full Offline

To make the app work without internet, you need to:

1. Replace Supabase with SQLite database
2. Store all data locally
3. Remove authentication (or use local auth)
4. Update all database queries

This is a significant architectural change that would require refactoring the entire data layer.

### File Locations

After building:
- Windows: `dist-electron/POS SHOPPING Setup.exe`
- macOS: `dist-electron/POS SHOPPING.dmg`
- Linux: `dist-electron/POS SHOPPING.AppImage`

### App Features

- Custom business logo in app and receipts
- Configurable business name
- Monthly sales reports with profit analysis
- Product-level profit tracking
- Excel export with multiple sheets
- Offline-capable (with SQLite setup)

### Troubleshooting

**"Cannot find module" error**:
- Run `npm install` again
- Check that `electron` folder exists

**Build fails**:
- Clear cache: `rm -rf dist dist-electron`
- Rebuild: `npm run build && npm run electron:build`

**Database not working offline**:
- The app needs internet for Supabase
- Follow "Converting to Full Offline" steps above
