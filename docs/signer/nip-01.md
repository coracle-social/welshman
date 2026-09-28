# NIP-01 Signer

`Nip01Signer` implements `ISigner` with a private key held in memory.

```typescript
class Nip01Signer implements ISigner {
  constructor(private secret: string)

  sign: SignWithOptions
  getPubkey: () => Promise<string>
  nip04: { encrypt, decrypt }
  nip44: { encrypt, decrypt }

  static fromSecret(secret: string): Nip01Signer
  static ephemeral(): Nip01Signer
}
```

`fromSecret` is an alias for the constructor, and `ephemeral` creates a signer with a random private key.

### Usage Example

```typescript
import { ISigner, Nip01Signer } from '@welshman/signer'

const signer: ISigner = new Nip01Signer(mySecret)

const ephemeralSigner = Nip01Signer.ephemeral()
const fromExistingKey = Nip01Signer.fromSecret(mySecret)
```
