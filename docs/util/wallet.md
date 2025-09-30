# Wallet

Types and utilities for working with Lightning wallet integrations in Nostr applications.

## Types

```typescript
export enum WalletType {
  WebLN = "webln",
  NWC = "nwc",
}

export type WebLNInfo = {
  enabled: boolean
}

export type NWCInfo = {
  pubkey: string
  relay: string
  secret: string
}

export type WebLNWallet = {
  type: WalletType.WebLN
  info: WebLNInfo
}

export type NWCWallet = {
  type: WalletType.NWC
  info: NWCInfo
}

export type Wallet = WebLNWallet | NWCWallet
```

## Type Guards

```typescript
// Check if a wallet is a WebLN wallet
export declare const isWebLNWallet: (wallet: Wallet) => wallet is WebLNWallet

// Check if a wallet is a Nostr Wallet Connect wallet
export declare const isNWCWallet: (wallet: Wallet) => wallet is NWCWallet
```

## Usage

```typescript
import { Wallet, WalletType, isWebLNWallet, isNWCWallet } from '@welshman/util'

function handleWallet(wallet: Wallet) {
  if (isWebLNWallet(wallet)) {
    // TypeScript knows wallet.info is WebLNInfo
    console.log('WebLN enabled:', wallet.info.enabled)
  } else if (isNWCWallet(wallet)) {
    // TypeScript knows wallet.info is NWCInfo
    console.log('NWC relay:', wallet.info.relay)
  }
}

// Create a WebLN wallet
const weblnWallet: Wallet = {
  type: WalletType.WebLN,
  info: { enabled: true }
}

// Create an NWC wallet
const nwcWallet: Wallet = {
  type: WalletType.NWC,
  info: {
    pubkey: "...",
    relay: "wss://relay.example.com",
    secret: "..."
  }
}
```