import {
  PINS,
  asDecryptedEvent,
  readList,
  makeList,
  addToListPublicly,
  removeFromList,
} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {DerivedPlugin} from "./base.js"
import {Network} from "./network.js"
import {Thunks} from "./thunk.js"
import {User} from "../user.js"
import type {IApp} from "../app.js"

/**
 * NIP-51 pin lists (kind 10001), keyed by pubkey. Loaded via the outbox model
 * (the author's write relays), so it depends on the relay-list collection.
 */
export class PinLists extends DerivedPlugin<ReturnType<typeof readList>> {
  constructor(app: IApp) {
    super(app, {
      filters: [{kinds: [PINS]}],
      eventToItem: (event: TrustedEvent) => readList(asDecryptedEvent(event)),
      getKey: pins => pins.event.pubkey,
    })
  }

  fetch(pubkey: string, relayHints: string[] = []) {
    return this.app.use(Network).loadUsingOutbox(pubkey, {kinds: [PINS]}, relayHints)
  }

  pin = async (tag: string[]) => {
    const user = User.require(this.app)
    const list = (await this.forceLoad(user.pubkey)) || makeList({kind: PINS})
    const event = await addToListPublicly(list, tag).reconcile(user.nip44EncryptToSelf)

    return this.app.use(Thunks).publishToOutbox({event})
  }

  unpin = async (value: string) => {
    const user = User.require(this.app)
    const list = (await this.forceLoad(user.pubkey)) || makeList({kind: PINS})
    const event = await removeFromList(list, value).reconcile(user.nip44EncryptToSelf)

    return this.app.use(Thunks).publishToOutbox({event})
  }
}
