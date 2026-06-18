import {
  MUTES,
  asDecryptedEvent,
  readList,
  makeList,
  addToListPublicly,
  addToListPrivately,
  removeFromList,
  updateList,
} from "@welshman/util"
import type {TrustedEvent, PublishedList} from "@welshman/util"
import {DerivedPlugin} from "./base.js"
import type {IApp} from "../app.js"
import {Network} from "./network.js"
import {Thunks} from "./thunk.js"
import {Plaintext} from "./plaintext.js"
import {User} from "../user.js"

/**
 * Kind-10000 mute lists, keyed by pubkey. Mute lists carry private entries in
 * encrypted content, so decoding goes through the plaintext cache.
 */
export class MuteLists extends DerivedPlugin<PublishedList> {
  constructor(app: IApp) {
    super(app, {
      filters: [{kinds: [MUTES]}],
      eventToItem: async (event: TrustedEvent) => {
        const content = await app.use(Plaintext).ensure(event)

        return readList(asDecryptedEvent(event, {content}))
      },
      getKey: mute => mute.event.pubkey,
    })
  }

  fetch(pubkey: string, relayHints: string[] = []) {
    return this.app.use(Network).loadUsingOutbox(pubkey, {kinds: [MUTES]}, relayHints)
  }

  mutePublicly = async (tag: string[]) => {
    const user = User.require(this.app)
    const list = (await this.forceLoad(user.pubkey)) || makeList({kind: MUTES})
    const event = await addToListPublicly(list, tag).reconcile(user.nip44EncryptToSelf)

    return this.app.use(Thunks).publishToOutbox({event})
  }

  mutePrivately = async (tag: string[]) => {
    const user = User.require(this.app)
    const list = (await this.forceLoad(user.pubkey)) || makeList({kind: MUTES})
    const event = await addToListPrivately(list, tag).reconcile(user.nip44EncryptToSelf)

    return this.app.use(Thunks).publishToOutbox({event})
  }

  unmute = async (value: string) => {
    const user = User.require(this.app)
    const list = (await this.forceLoad(user.pubkey)) || makeList({kind: MUTES})
    const event = await removeFromList(list, value).reconcile(user.nip44EncryptToSelf)

    return this.app.use(Thunks).publishToOutbox({event})
  }

  setMutes = async (updates: {publicTags?: string[][]; privateTags?: string[][]}) => {
    const user = User.require(this.app)
    const list = (await this.forceLoad(user.pubkey)) || makeList({kind: MUTES})
    const event = await updateList(list, updates).reconcile(user.nip44EncryptToSelf)

    return this.app.use(Thunks).publishToOutbox({event})
  }
}
