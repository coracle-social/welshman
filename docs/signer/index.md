# @welshman/signer

A comprehensive Nostr signing implementation that supports multiple authentication methods and encryption standards.
It provides a unified interface for working with different signing mechanisms while maintaining compatibility with various Nostr Implementation Possibilities (NIPs).


## What's Included

- **ISigner Interface** - Unified API across all authentication methods
- **NIP-01 Signer** - Core implementation using key-pair cryptography
- **NIP-07 Signer** - Browser extension support (nos2x, Alby, etc.)
- **NIP-46 Signer** - Remote signing with Nostr Connect protocol
- **NIP-55 Signer** - Native app integration via Capacitor
- **NIP-59 Utils** - Gift Wrap protocol for secure event encryption



## Installation


```bash
npm install @welshman/signer
```
