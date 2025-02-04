# Zaps

The Zaps module provides utilities for working with Lightning Network payments (zaps) in Nostr, including LNURL handling, invoice amount parsing, and zap validation.

## Zapper Interface
The Zapper interface represents a Lightning Network payment provider that can process zaps:

```typescript
interface Zapper {
  // LNURL for payment processing
  lnurl: string

  // User's pubkey on the payment service
  pubkey?: string

  // LNURL callback endpoint
  callback?: string

  // Minimum payment amount in millisatoshis
  minSendable?: number

  // Maximum payment amount in millisatoshis
  maxSendable?: number

  // Pubkey used to sign zap receipts
  nostrPubkey?: string

  // Whether provider supports Nostr zaps
  allowsNostr?: boolean
}
```

### Finding Nostr Zappers

#### Getting Lightning Info

First, check the user's profile for Lightning addresses:

```typescript
function getLightningInfo(profile: Profile) {
  // Check for Lightning Address (NIP-57)
  if (profile.lud16) {
    return {
      type: 'lud16',
      address: profile.lud16
    }
  }

  // Check for LNURL
  if (profile.lud06) {
    return {
      type: 'lud06',
      url: profile.lud06
    }
  }

  return null
}
```

#### Fetching LNURL Metadata

Once you have the Lightning address or LNURL, fetch the metadata:

```typescript
async function fetchZapper(address: string): Promise<Zapper | null> {
  // Convert Lightning address to LNURL if needed
  const lnurl = getLnUrl(address)
  if (!lnurl) return null

  try {
    // Decode and fetch LNURL metadata
    const url = new URL(bech32.decode(lnurl).data)
    const response = await fetch(url.toString())
    const metadata = await response.json()

    // Extract zapper details
    return {
      lnurl,
      callback: metadata.callback,
      minSendable: metadata.minSendable,
      maxSendable: metadata.maxSendable,
      nostrPubkey: metadata.nostrPubkey,
      allowsNostr: Boolean(metadata.allowsNostr),
    }
  } catch (error) {
    console.error('Failed to fetch zapper:', error)
    return null
  }
}
```

```typescript
// Example Alby zapper configuration
const albyZapper: Zapper = {
  lnurl: "lnurl1...",
  pubkey: "alby_user_pubkey",
  nostrPubkey: "alby_signing_key",
  allowsNostr: true,
  minSendable: 1000,    // 1 sat minimum
  maxSendable: 100000000 // 100k sats maximum
}

// Example LNbits zapper
const lnbitsZapper: Zapper = {
  lnurl: "lnurl1...",
  callback: "https://lnbits.com/callback",
  nostrPubkey: "lnbits_signing_key",
  allowsNostr: true
}
```

### Zap Structure
```typescript
interface Zap {
  request: TrustedEvent    // Zap request event kind 9734
  response: TrustedEvent   // Zap receipt/response event kind 9735 sent by the zapper
  invoiceAmount: number    // Amount in millisats
}
```

## Core Functions

### Lightning Address Handling
```typescript
// Convert address to LNURL
function getLnUrl(address: string): string | null

// Examples:
getLnUrl("user@domain.com")  // => lnurl1...
getLnUrl("https://domain.com/.well-known/lnurlp/user")  // => lnurl1...
getLnUrl("lnurl1...")  // => returns unchanged
```

### Invoice Processing
```typescript
// Parse amount from BOLT11 invoice
function getInvoiceAmount(bolt11: string): number

// Convert human readable amount to millisats
function hrpToMillisat(hrpString: string): bigint
```

### Zap Validation

The `zapFromEvent` function validates a zap receipt event, against an expected zapper.

It returns a `Zap` object if the zap is valid, or `null` if not.

```typescript
function zapFromEvent(
  response: TrustedEvent,
  zapper: Zapper | undefined
): Zap | null
```

## Usage Examples

### Processing Lightning Addresses
```typescript
// Get LNURL from various formats
const lnurl1 = getLnUrl("user@getalby.com")
const lnurl2 = getLnUrl("https://getalby.com/.well-known/lnurlp/user")
const lnurl3 = getLnUrl("lnurl1...")

// Check if conversion was successful
if (lnurl1) {
  // Process LNURL
  processLnurl(lnurl1)
}
```

### Invoice Amount Handling
```typescript
// Get invoice amount in millisats
const amount = getInvoiceAmount(bolt11Invoice)

// Convert string amount to millisats
const millisats = hrpToMillisat("1000")  // 1000 sats
const millisats = hrpToMillisat("1m")    // 1 million sats
```

### Zap Validation
```typescript
// Validate zap event
const zap = zapFromEvent(zapResponse, albyZapper)

if (zap) {
  // Process valid zap
  processZap(zap)
}
```
