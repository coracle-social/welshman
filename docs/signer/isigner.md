# ISigner Interface

Every signer implements `ISigner`, which covers signing events, reporting the pubkey, and NIP-04 and NIP-44 encryption.

```typescript
export type SignerOptions = {
  signal?: AbortSignal
  priority?: number
}

export type SignWithOptions = (
  event: StampedEvent,
  options?: SignerOptions,
) => Promise<SignedEvent>

interface ISigner {
  sign: SignWithOptions
  getPubkey: (options?: SignerOptions) => Promise<string>
  cleanup?: () => Promise<void>

  nip04: {
    encrypt: (pubkey: string, message: string, options?: SignerOptions) => Promise<string>
    decrypt: (pubkey: string, message: string, options?: SignerOptions) => Promise<string>
  }
  nip44: {
    encrypt: (pubkey: string, message: string, options?: SignerOptions) => Promise<string>
    decrypt: (pubkey: string, message: string, options?: SignerOptions) => Promise<string>
  }
}
```

## Options

Every method takes the same options, since every one of them is a request to the same signer.

`signal` gives up waiting when the caller aborts it. `priority` orders the requests that are waiting, highest first, defaulting to 0 — so bulk work behind the user, like unwrapping a stored backlog of gift wraps, asks for a negative priority and leaves the user's own requests ahead of it. Neither recalls a request the signer is already working on.

## One request at a time

A browser extension and a native signer app each answer one request at a time, so `Nip07Signer` and `Nip55Signer` put every request through a [`SignerQueue`](#signerqueue). A bunker answers over relays instead, so `Nip46Signer` queues nothing and a priority there orders nothing. `Nip01Signer` holds the key itself and answers synchronously, so it takes no options at all.

## SignerQueue

```typescript
class SignerQueue {
  push<T>(thunk: () => Promise<T>, options?: SignerOptions): Promise<T>
}
```

The lane one signer's requests go down, in descending priority order and one at a time. A request is bounded by `SIGNER_TIMEOUT` (30 seconds) and by the caller's `signal`; either one gives the lane back to the next request, which is not the same as cancelling the one that lost it — nothing recalls a request from an extension or a native app, so it may still answer with nobody listening.

`signerCall(call, options)` applies that same bound to a single request, and is what `Nip46Signer` uses in place of a queue.
