# Zaps

The Zaps module provides utilities for working with Lightning Network payments (zaps) in Nostr, following [NIP-57](https://github.com/nostr-protocol/nips/blob/master/57.md). It includes LNURL handling, invoice amount parsing, and zap validation.

## Protocol Overview

Zaps enable Lightning Network payments to be associated with Nostr events through a standardized flow:

1. **Zap Request** (kind 9734): Client creates a request specifying the amount and target
2. **Lightning Invoice**: LNURL service generates an invoice with the request embedded
3. **Zap Receipt** (kind 9735): Zapper publishes proof of payment to Nostr

## API

### Types

```typescript
// Zapper service information
export type Zapper = {
  lnurl: string;
  pubkey?: string;
  callback?: string;
  minSendable?: number;
  maxSendable?: number;
  nostrPubkey?: string;
  allowsNostr?: boolean;
};

// Complete zap with request and receipt
export type Zap = {
  request: TrustedEvent;  // kind 9734 (zap request)
  response: TrustedEvent; // kind 9735 (zap receipt)
  invoiceAmount: number;  // amount in millisatoshis
};
```

### Lightning Network Utilities

```typescript
// Convert human-readable amount to millisatoshis
export declare const hrpToMillisat: (hrpString: string) => bigint;

// Extract amount from BOLT11 lightning invoice
export declare const getInvoiceAmount: (bolt11: string) => number;

// Convert lightning address or URL to LNURL
export declare const getLnUrl: (address: string) => string | null;
```

### Zap Validation

```typescript
// Create validated Zap from zap receipt event
export declare const zapFromEvent: (response: TrustedEvent, zapper?: Zapper) => Zap | null;
```

## Examples

### Converting Lightning Addresses

```typescript
import { getLnUrl } from '@welshman/util';

// Lightning address (LUD-16)
const lnurl1 = getLnUrl('satoshi@getalby.com');
console.log(lnurl1); // 'lnurl1...' (encoded URL)

// Regular URL
const lnurl2 = getLnUrl('https://getalby.com/.well-known/lnurlp/satoshi');
console.log(lnurl2); // 'lnurl1...' (encoded URL)

// Already encoded LNURL
const lnurl3 = getLnUrl('lnurl1dp68gurn8ghj7mr0vdskc6r0wd6z7mrww4excttsv9un7um9wdekjmmw84jxywf5x43rvv35xgmr2enrxanr2cfcvsmnwe3jxcukvde48qukgdec89snwde3vfjxvepjxpjnjvtpxd3kvdnxx5crxwpjvyunsephsz36jf');
console.log(lnurl3); // 'lnurl1...' (same as input)

// Invalid address
const invalid = getLnUrl('not-a-valid-address');
console.log(invalid); // null
```

### Parsing Invoice Amounts

```typescript
import { getInvoiceAmount, hrpToMillisat } from '@welshman/util';

// Extract amount from BOLT11 invoice
const invoice = 'lnbc1500n1...'; // 1500 nanosats = 1.5 sats
const amount = getInvoiceAmount(invoice);
console.log(amount); // 1500 (millisatoshis)

// Convert human-readable amounts
console.log(hrpToMillisat('1000')); // 100000000000n (1000 BTC in millisats)
console.log(hrpToMillisat('1000m')); // 100000000n (1000 mBTC = 1 BTC in millisats)
console.log(hrpToMillisat('1000u')); // 100000n (1000 µBTC = 1 mBTC in millisats)
console.log(hrpToMillisat('1000n')); // 100n (1000 nBTC = 1000 sats in millisats)
console.log(hrpToMillisat('1000p')); // 0.1n (1000 pBTC = 1 msat, but must be divisible by 10)
```

### Validating Zaps

```typescript
import { zapFromEvent, ZAP_RESPONSE } from '@welshman/util';

// Zapper service configuration
const zapper: Zapper = {
  lnurl: 'lnurl1dp68gurn8ghj7mr0vdskc6r0wd6z7mrww4excttsv9un7um9wdekjmmw84jxywf5x43rvv35xgmr2enrxanr2cfcvsmnwe3jxcukvde48qukgdec89snwde3vfjxvepjxpjnjvtpxd3kvdnxx5crxwpjvyunsephsz36jf',
  nostrPubkey: 'zapper-pubkey-hex',
  allowsNostr: true,
  minSendable: 1000,
  maxSendable: 10000000
};

// Zap receipt event (kind 9735)
const zapReceipt = {
  kind: ZAP_RESPONSE,
  pubkey: 'zapper-pubkey-hex',
  tags: [
    ['bolt11', 'lnbc1500n1...'],
    ['description', '{"kind":9734,"pubkey":"sender-pubkey","tags":[["p","recipient-pubkey"],["amount","1500"],["relays","wss://relay.com"]],"content":"Great post!","created_at":1234567890}'],
    ['p', 'recipient-pubkey']
  ],
  // ... other event fields
};

// Validate the zap
const validZap = zapFromEvent(zapReceipt, zapper);

if (validZap) {
  console.log('Amount:', validZap.invoiceAmount); // 1500 millisats
  console.log('Request:', validZap.request.content); // "Great post!"
  console.log('Recipient:', validZap.request.tags.find(t => t[0] === 'p')?.[1]);
} else {
  console.log('Invalid zap - failed validation');
}
```

### Complete Zap Flow Example

```typescript
import { getLnUrl, zapFromEvent, makeEvent, ZAP_REQUEST } from '@welshman/util';

// Step 1: Get LNURL from lightning address
const lightningAddress = 'satoshi@getalby.com';
const lnurl = getLnUrl(lightningAddress);

if (!lnurl) {
  throw new Error('Invalid lightning address');
}

// Step 2: Create zap request (kind 9734)
const zapRequest = makeEvent(ZAP_REQUEST, {
  content: 'Amazing content!',
  tags: [
    ['p', 'recipient-pubkey-hex'], // recipient
    ['amount', '5000'], // 5000 millisats = 5 sats
    ['lnurl', lnurl],
    ['relays', 'wss://relay.damus.io', 'wss://relay.snort.social']
  ]
});

// Step 3: Send to LNURL service (implementation specific)
// The service will generate an invoice with the zap request in description

// Step 4: Pay the invoice (using Lightning wallet)

// Step 5: Validate received zap receipt
const zapperInfo = {
  lnurl,
  nostrPubkey: 'zapper-service-pubkey',
  allowsNostr: true
};

// When zap receipt arrives (kind 9735)
function handleZapReceipt(zapReceipt: TrustedEvent) {
  const validatedZap = zapFromEvent(zapReceipt, zapperInfo);

  if (validatedZap) {
    console.log(`Received ${validatedZap.invoiceAmount} msat zap!`);
    console.log(`Message: ${validatedZap.request.content}`);
    return validatedZap;
  } else {
    console.log('Invalid zap receipt');
    return null;
  }
}
```

### Zap Validation Rules

The `zapFromEvent` function validates several aspects of a zap according to NIP-57:

```typescript
import { zapFromEvent } from '@welshman/util';

// Validation checks performed:
// 1. Invoice amount matches requested amount (if specified)
// 2. Zap request is properly embedded in invoice description
// 3. Zapper pubkey matches the expected zapper service
// 4. LNURL matches the expected service (if provided in request)
// 5. Self-zaps are filtered out (sender != zapper)

const zapReceipt = {
  // ... zap receipt event
};

const zapper = {
  nostrPubkey: 'expected-zapper-pubkey',
  lnurl: 'expected-lnurl'
};

const validZap = zapFromEvent(zapReceipt, zapper);

// Returns null if any validation fails:
// - Malformed bolt11 invoice
// - Amount mismatch
// - Wrong zapper pubkey
// - LNURL mismatch
// - Self-zap detection
```
