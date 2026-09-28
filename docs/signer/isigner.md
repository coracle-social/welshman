# ISigner Interface

Every signer implements `ISigner`, which covers signing events, reporting the pubkey, and NIP-04 and NIP-44 encryption.

```typescript
export type SignOptions = {
  signal?: AbortSignal
}

export type SignWithOptions = (event: StampedEvent, options?: SignOptions) => Promise<SignedEvent>

interface ISigner {
  sign: SignWithOptions
  getPubkey: () => Promise<string>
  cleanup?: () => Promise<void>

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
