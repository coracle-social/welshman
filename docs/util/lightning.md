# Lightning

`@welshman/util` keeps the low-level Lightning Network primitives used by the zap flow ([NIP-57](https://github.com/nostr-protocol/nips/blob/master/57.md)): LNURL encoding and BOLT11 amount parsing.

The higher-level modeling — the `Zapper` service class (LNURL info, receipt validation, response filters), the `Zap` result type, the `ZapRequest` / `ZapReceipt` / `ZapGoal` event kinds, and zap-split resolution — lives in `@welshman/domain`. See [domain/Zaps](../domain/zaps).

## Protocol Overview

Zaps associate Lightning Network payments with Nostr events through a standardized flow:

1. **Zap Request** (kind 9734): Client creates a request specifying the amount and target
2. **Lightning Invoice**: LNURL service generates an invoice with the request embedded
3. **Zap Receipt** (kind 9735): Zapper publishes proof of payment to Nostr

## API

### Amount conversion

```typescript
// Sats <-> millisats
export declare const toMsats: (sats: number) => number;
export declare const fromMsats: (msats: number) => number;

// Convert a BOLT11 human-readable part to millisatoshis
export declare const hrpToMillisat: (hrpString: string) => bigint;

// Extract the amount (in millisats) from a BOLT11 lightning invoice
export declare const getInvoiceAmount: (bolt11: string) => number;
```

### LNURL

```typescript
// Convert a lightning address (LUD-16) or URL to an encoded LNURL
export declare const getLnUrl: (address: string) => string | undefined;
```

## Examples

### Converting Lightning Addresses

```typescript
import {getLnUrl} from '@welshman/util';

// Lightning address (LUD-16)
getLnUrl('satoshi@getalby.com');            // 'lnurl1...' (encoded URL)

// Regular URL
getLnUrl('https://getalby.com/.well-known/lnurlp/satoshi'); // 'lnurl1...'

// Already-encoded LNURL is returned as-is
getLnUrl('lnurl1dp68gurn8ghj7...');         // 'lnurl1...' (same as input)

// Invalid address
getLnUrl('not-a-valid-address');            // undefined
```

### Parsing Invoice Amounts

```typescript
import {getInvoiceAmount, hrpToMillisat} from '@welshman/util';

// Extract amount from a BOLT11 invoice
getInvoiceAmount('lnbc1500n1...');          // 1500 (millisatoshis)

// Convert human-readable amounts
hrpToMillisat('1000');                      // 100000000000n (1000 BTC in millisats)
hrpToMillisat('1000m');                     // 100000000n   (1000 mBTC = 1 BTC)
hrpToMillisat('1000u');                     // 100000n      (1000 µBTC = 1 mBTC)
hrpToMillisat('1000n');                     // 100n         (1000 nBTC = 1000 sats)
hrpToMillisat('1000p');                     // 0.1n         (1000 pBTC = 1 msat)
```

### Validating and requesting zaps

Zap-receipt validation, invoice requests, and zap-split resolution moved to `@welshman/domain`:

```typescript
import {Zapper, ZapRequest} from '@welshman/domain';

const zapper = new Zapper({lnurl, pubkey, nostrPubkey, callback, allowsNostr: true});

// Validate a parsed kind-9735 receipt -> Zap | undefined
const receipt = await app.use(Domain).reader(ZapReceipt)(zapReceipt);
const zap = zapper.validate(receipt);

// Build, sign, and request an invoice for a zap
const {invoice, error} = await app.use(Domain).writer(ZapRequest)
  .setAmount(5000)
  .setRecipient(recipientPubkey)
  .setLnurl(zapper.lnurl)
  .requestInvoice(zapper);                  // {event, invoice?, error?}
```

See [domain/Zaps](../domain/zaps) for the full `Zapper`, kind, and zap-split API.
