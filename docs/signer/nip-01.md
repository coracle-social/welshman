# NIP-01 Signer

The `Nip01Signer` class implements the `ISigner` interface and extends it with additional static utility methods:

```typescript
class Nip01Signer implements ISigner {
  // Constructor
  constructor(private secret: string)

  // ISigner implementation
  sign: (event: StampedEvent) => Promise<SignedEvent>
  getPubkey: () => Promise<string>
  nip04: { encrypt, decrypt }
  nip44: { encrypt, decrypt }

  // Additional static utility methods
  static fromSecret(secret: string): Nip01Signer
  static ephemeral(): Nip01Signer
}
```

### Additional Methods

The NIP-01 implementation extends the base interface with two static utility methods:

- `static fromSecret(secret: string)`: Alternative constructor for creating a signer from an existing private key
- `static ephemeral()`: Creates a new signer with a randomly generated private key

### Usage Example

```typescript
import { ISigner } from './interfaces'
import { Nip01Signer } from './signers/nip01'

// Using the standard interface
const signer: ISigner = new Nip01Signer(mySecret)

// Using NIP-01 specific utilities
const ephemeralSigner = Nip01Signer.ephemeral()
const fromExistingKey = Nip01Signer.fromSecret(mySecret)
```
