import {RelayScopedDerivedPlugin} from "./base.js"
import type {RelayScopedDerivedPluginOptions} from "./base.js"
import {Relays} from "./relays.js"
import type {IApp} from "../app.js"

// Items must expose their author (the event pubkey) so it can be checked
// against the relay's self pubkey. Domain readers satisfy this via `author()`.
export type RelaySignedItem = {author(): string}

/**
 * A `RelayScopedDerivedPlugin` that additionally validates provenance: an item
 * is only keyed on a relay when the relay ITSELF signed it — i.e. the event's
 * author matches the relay's NIP-11 `self` pubkey. This is the trust model for
 * relay-hosted, relay-signed content (NIP-29 group state, relay membership and
 * roles), and rejects events of these kinds forged by other pubkeys.
 *
 * Relay self pubkeys load from NIP-11 and can arrive after the events, so the
 * collection re-evaluates whenever the relay-profile collection changes.
 */
export abstract class RelaySignedDerivedPlugin<
  T extends RelaySignedItem,
> extends RelayScopedDerivedPlugin<T> {
  constructor(app: IApp, options: RelayScopedDerivedPluginOptions<T>) {
    super(app, {
      ...options,
      getKey: (item, url) =>
        item.author() === app.use(Relays).get(url)?.self ? options.getKey(item, url) : undefined,
      revalidateOn: app.use(Relays).index.$,
    })
  }
}
