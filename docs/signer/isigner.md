# ISigner Interface

A basic interface that each signer must implement.
It includes methods for signing messages, verifying signatures, and encrypting/decrypting data.


```typescript
export type SignOptions = {
  signal?: AbortSignal
}

export type SignWithOptions = (event: StampedEvent, options?: SignOptions) => Promise<SignedEvent>

interface ISigner {
  // Core signing functionality
  sign: SignWithOptions
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
