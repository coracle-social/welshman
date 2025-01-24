# @welshman/dvm [![version](https://badgen.net/npm/v/@welshman/dvm)](https://npmjs.com/package/@welshman/dvm)

Utilities for building nostr DVMs.

# Request example

```javascript
import type {Publish, Subscription} from '@welshman/net'
import {makeDvmRequest, DVMEvent} from '@welshman/dvm'

const req = makeDvmRequest({
  // Create and sign a dvm request event, including any desired tags
  event: createAndSign({kind: 5300}),
  // Publish and subscribe to these relays
  relays: ['wss://relay.damus.io', 'wss://dvms.f7z.io'],
  // Timeout defaults to 30 seconds
  timeout: 30_000,
  // Auto close on first result (defaults to true)
  autoClose: true,
  // Listen for and emit `progress` events
  reportProgress: true,
})

// Listen for progress, result, etc
req.emitter.on(DVMEvent.Progress, (url, event) => console.log(event))
req.emitter.on(DVMEvent.Result, (url, event) => console.log(event))
```

# Handler example

```javascript
import {bytesToHex} from '@noble/hashes/utils'
import {generateSecretKey} from 'nostr-tools'
import {createEvent} from '@welshman/util'
import {subscribe} from '@welshman/net'
import {DVM} from '@welshman/dvm'

// Your DVM's private key. Store this somewhere safe
// const hexPrivateKey = bytesToHex(generateSecretKey())
const hexPrivateKey = '9cd387a3aa0c1abc2ef517c8402f29c069b4174e02a426491aec7566501bee67'

// Tags that we'll return as content discovery suggestions
const tags = []

// Populate the tags with music by Ainsley Costello
const sub = subscribe({
  timeout: 30_000,
  relays: ["wss://relay.wavlake.com"],
  filters: [{
    kinds: [31337],
    '#p': ['8806372af51515bf4aef807291b96487ea1826c966a5596bca86697b5d8b23bc'],
  }],
})

// Push event ids to our suggestions
sub.on('event', (url, e) => tags.push(["e", e.id, url]))

const dvm = new DVM({
  // The private key used to sign events
  sk: hexPrivateKey,
  // Relays that the DVM will listen on
  relays: ['wss://relay.damus.io', 'wss://dvms.f7z.io'],
  // Only listen to requests tagging our dvm
  requireMention: true,
  // Expire results after 1 hour (the default)
  expireAfter: 60 * 60,
  // Handlers for various kinds
  handlers: {
    5300: dvm => ({
      handleEvent: async function* (event) {
        // DVM responses are stringified into the content
        const content = JSON.stringify(tags)

        // Yield our response. Kind 7000 can be used for partial results too
        yield createEvent(event.kind + 1000, {content})
      },
    }),
  }
})

// Enable logging
dvm.logEvents = true

// When you're ready
dvm.start()

// When you're done
dvm.stop()
```
