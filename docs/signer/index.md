# @welshman/signer

[![version](https://badgen.net/npm/v/@welshman/signer)](https://npmjs.com/package/@welshman/signer)

A Nostr signer implementation that supports multiple authentication methods and encryption standards.

## What's Included

- **ISigner Interface** - Unified API across all authentication methods
- **NIP-01 Signer** - Core implementation using key-pair cryptography
- **NIP-07 Signer** - Browser extension support (nos2x, Alby, etc.)
- **NIP-46 Signer** - Remote signing with Nostr Connect protocol
- **NIP-55 Signer** - Native app integration via Capacitor
- **NIP-59 Utils** - Gift Wrap protocol for secure event encryption

## Quick Example

```typescript
import { makeEvent } from '@welshman/util'
import { ISigner, Nip01Signer, makeSecret } from '@welshman/signer'

const signer: ISigner = new Nip01Signer(makeSecret())

signer.sign(makeEvent(1)).then(signedEvent => console.log(signedEvent))
```

## Installation

```bash
npm install @welshman/signer
```
