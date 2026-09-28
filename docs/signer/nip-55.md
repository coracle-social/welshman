# NIP-55 (Native App) Signer

`Nip55Signer` implements `ISigner` by talking to a native signing app on the device through a Capacitor plugin.

## Prerequisites

The signer requires the Capacitor plugin to be installed:

```bash
npm install nostr-signer-capacitor-plugin
```

`@welshman/signer` does not import the plugin. It declares the shape it needs as the `Nip55` type, so apps without NIP-55 never resolve a package they haven't installed. Register the plugin once at startup:

```typescript
import { NostrSignerPlugin } from 'nostr-signer-capacitor-plugin'
import { setNip55Plugin } from '@welshman/signer'

setNip55Plugin(NostrSignerPlugin)
```

Until then, `getNip55()` returns an empty list and `Nip55Signer` operations reject with `"Nip55 is not enabled"`.

## Getting Started

```typescript
import { Nip55Signer, getNip55 } from '@welshman/signer'

const apps = await getNip55()
if (apps.length > 0) {
  const optionalSavedPubkey = localStorage.getItem('my-saved-pubkey') ?? undefined
  const signer = new Nip55Signer(apps[0].packageName, optionalSavedPubkey)
}
```

## API Reference

### Registering the Plugin

```typescript
setNip55Plugin(plugin: Nip55 | undefined): void
getNip55Plugin(): Nip55 | undefined
```

### Detecting Available Signers

```typescript
// Returns information about installed signing apps, or [] if no plugin is registered
getNip55(): Promise<Nip55AppInfo[]>

interface Nip55AppInfo {
  name: string
  packageName: string
  iconUrl?: string
}
```

### Constructor

```typescript
constructor(packageName: string, pubkey?: string)
```
- `packageName`: The package identifier of the native signing app
- `pubkey`: The user's pubkey, if known. Pass it when resuming a session with a signer that manages multiple accounts.

## Complete Example

```typescript
import { NostrSignerPlugin } from 'nostr-signer-capacitor-plugin'
import { Nip55Signer, getNip55, setNip55Plugin } from '@welshman/signer'
import { makeEvent, NOTE } from '@welshman/util'

setNip55Plugin(NostrSignerPlugin)

async function example() {
  try {
    const apps = await getNip55()
    if (apps.length === 0) {
      throw new Error('No native signing apps available')
    }

    const signer = new Nip55Signer(apps[0].packageName)

    const pubkey = await signer.getPubkey()
    console.log('Public key:', pubkey)

    const event = makeEvent(NOTE, {
      content: "Hello from native app!",
      tags: [["t", "test"]]
    })
    const signedEvent = await signer.sign(event)
    console.log('Signed event:', signedEvent)

    const encrypted = await signer.nip44.encrypt(
      recipientPubkey,
      "Secret message"
    )
    console.log('Encrypted:', encrypted)
  } catch (error) {
    console.error('Native signer error:', error)
  }
}
```
