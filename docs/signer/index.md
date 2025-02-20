# @welshman/signer

`@welshman/signer` is a comprehensive Nostr signing implementation that supports multiple authentication methods and encryption standards.
It provides a unified interface for working with different signing mechanisms while maintaining compatibility with various Nostr Implementation Possibilities (NIPs).

## ISigner Interface

This package defines a basic interface that each signer must implement.
It includes methods for signing messages, verifying signatures, and encrypting/decrypting data.


```typescript
interface ISigner {
  // Core signing functionality
  sign: (event: StampedEvent) => Promise<SignedEvent>
  getPubkey: () => Promise<string>

  // Encryption capabilities
  nip04: {
    encrypt: (pubkey: string, message: string) => Promise<string>
    decrypt: (pubkey: string, message: string) => Promise<string>
  }
  nip44: {
    encrypt: (pubkey: string, message: string) => Promise<string>
    decrypt: (pubkey: string, message: string) => Promise<string>
  }
}
```
