# Quick Start: Fighter Wallet Integration

## 🚀 What's New

Your Oryn Finance app now supports **Fighter Wallet** for easy Stellar testnet connection!

## ⚡ Quick Setup (2 Minutes)

### Step 1: Install Fighter Wallet
```bash
# Option A: Chrome Web Store (when available)
Visit: chrome://extensions/
Click "Add Extension" → Search "Fighter Wallet"

# Option B: Manual Install
Visit: https://github.com/stellar-expert/stellar-expert-web
Download and extract the extension
```

### Step 2: Create Testnet Account
1. Click Fighter Wallet icon
2. Click "New Account"
3. Set password and save seed phrase
4. Ensure "Testnet" is selected

### Step 3: Get Test Funds
Visit: https://stellar.expert/testnet
Enter your account address (starts with `G`)
Click "Get 10000 XLM"

### Step 4: Test in Your App
1. Open your Oryn Finance app
2. Click "Connect Wallet"
3. Approve in Fighter Wallet popup
4. ✅ You're connected!

## 📱 How It Works

```
┌─────────────────────────────────┐
│  Click "Connect Wallet"         │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Fighter Wallet popup appears   │
│  User approves connection       │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Fetch balance from Stellar     │
│  Show address & balances        │
└─────────────────────────────────┘
```

## 💻 For Developers

### Use Wallet in Components

```typescript
import { useWallet } from '@/contexts/WalletContext';

function MyComponent() {
  const { 
    isConnected, 
    address, 
    xlmBalance, 
    signTransaction, 
    connect,
    disconnect 
  } = useWallet();

  if (!isConnected) {
    return <button onClick={connect}>Connect</button>;
  }

  return (
    <div>
      <p>Address: {address}</p>
      <p>Balance: {xlmBalance} XLM</p>
      <button onClick={disconnect}>Disconnect</button>
    </div>
  );
}
```

### Sign Transactions

```typescript
const { signTransaction } = useWallet();

try {
  const signedXdr = await signTransaction(xdrTransaction);
  // Send to blockchain
} catch (error) {
  console.error('Signing failed:', error);
}
```

## 🔄 Auto-Reconnect

Your connection persists! 
- Reload page → automatically reconnects
- No need to click "Connect" again
- Uses localStorage for session storage

## ⚙️ Configuration

**Network:** Stellar Testnet
- Passphrase: `Test SDF Network ; September 2015`
- Horizon: `https://horizon-testnet.stellar.org`

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| Wallet not detected | Install Fighter or Freighter extension |
| Connection popup missing | Check browser console, enable extension |
| Balance not showing | Verify account has testnet funds |
| Transaction fails | Ensure wallet is connected, funds available |

## 📚 Documentation

- **Full Guide:** `FIGHTER_WALLET_INTEGRATION.md`
- **Summary:** `WALLET_INTEGRATION_SUMMARY.md`
- **This File:** `QUICK_START_WALLET.md`

## 🔗 Useful Links

- Fighter Wallet: https://github.com/stellar-expert/stellar-expert-web
- Freighter Wallet: https://freighter.app
- Stellar Docs: https://developers.stellar.org
- Get Testnet Funds: https://stellar.expert/testnet

## ✨ Features

✅ One-click wallet connection
✅ Automatic balance fetching
✅ Real-time balance updates
✅ Transaction signing
✅ Session persistence
✅ Automatic fallback to Freighter
✅ Error handling & user feedback

## 🎉 You're Ready!

```
$ npm run dev
# Visit http://localhost:5173
# Click "Connect Wallet"
# 🚀 Start trading!
```

---

**Questions?** Check the full documentation files or open an issue.
