import {reject, nth, nthNe, nthEq, removeUndefined} from "@welshman/lib"
import {
  RELAYS,
  RelayMode,
  asDecryptedEvent,
  readList,
  getRelaysFromList,
  getRelayTags,
  getListTags,
  getRelayTagValues,
  makeList,
  makeEvent,
} from "@welshman/util"
import type {TrustedEvent, PublishedList} from "@welshman/util"
import {DerivedPlugin} from "./base.js"
import type {Projection} from "./base.js"
import {addMinimalFallbacks} from "@welshman/router"
import {Router} from "./router.js"
import {Network} from "./network.js"
import {User} from "../user.js"
import {Thunks} from "./thunk.js"
import type {IApp} from "../app.js"

/**
 * NIP-65 relay lists, keyed by pubkey. This is the routing substrate every other
 * outbox-model load depends on (see `Network.loadUsingOutbox`).
 */
export class RelayLists extends DerivedPlugin<PublishedList> {
  constructor(app: IApp) {
    super(app, {
      filters: [{kinds: [RELAYS]}],
      eventToItem: (event: TrustedEvent) => readList(asDecryptedEvent(event)),
      getKey: (list: PublishedList) => list.event.pubkey,
    })
  }

  fetch(pubkey: string, relayHints: string[] = []) {
    const filters = [{kinds: [RELAYS], authors: [pubkey], limit: 1}]
    const networking = this.app.use(Network)
    const router = this.app.use(Router)

    return Promise.all([
      networking.load({filters, relays: router.FromRelays(relayHints).getUrls()}),
      networking.load({filters, relays: router.FromPubkey(pubkey).getUrls()}),
      networking.load({filters, relays: router.Index().getUrls()}),
    ])
  }

  urls = (pubkey: string): Projection<string[]> =>
    this.project(pubkey, list => getRelaysFromList(list))

  readUrls = (pubkey: string): Projection<string[]> =>
    this.project(pubkey, list => getRelaysFromList(list, RelayMode.Read))

  writeUrls = (pubkey: string): Projection<string[]> =>
    this.project(pubkey, list => getRelaysFromList(list, RelayMode.Write))

  // NIP-65 relay-list mutations for the app's user

  addRelay = async (url: string, mode: RelayMode) => {
    const user = User.require(this.app)
    const list = (await this.forceLoad(user.pubkey)) || makeList({kind: RELAYS})
    const dup = getRelayTags(getListTags(list)).find(nthEq(1, url))
    const tag = removeUndefined(["r", url, dup && dup[2] !== mode ? undefined : mode])
    const tags = [...list.publicTags.filter(nthNe(1, url)), tag]
    const event = {kind: list.kind, content: list.event?.content || "", tags}

    return this.app.use(Thunks).publishToOutbox({event})
  }

  removeRelay = async (url: string, mode: RelayMode) => {
    const user = User.require(this.app)
    const list = (await this.forceLoad(user.pubkey)) || makeList({kind: RELAYS})
    const dup = getRelayTags(getListTags(list)).find(nthEq(1, url))
    const alt = mode === RelayMode.Read ? RelayMode.Write : RelayMode.Read
    const tags = list.publicTags.filter(nthNe(1, url))

    // If we had a duplicate that was used as the alt mode, keep the alt
    if (dup && (!dup[2] || dup[2] === alt)) {
      tags.push(["r", url, alt])
    }

    const event = {kind: list.kind, content: list.event?.content || "", tags}

    // publishToOutbox is outbox-only, so build relays here to also notify the
    // removed relay of its removal
    const relays = [url, ...this.app.use(Router).FromUser().policy(addMinimalFallbacks).getUrls()]

    return this.app.use(Thunks).publish({event, relays})
  }

  setRelays = (tags: string[][]) => {
    const router = this.app.use(Router)
    const event = makeEvent(RELAYS, {tags})
    const relays = router
      .merge([router.Index(), router.FromRelays(getRelayTagValues(tags))])
      .getUrls()

    return this.app.use(Thunks).publish({event, relays})
  }

  setReadRelays = async (urls: string[]) => {
    const user = User.require(this.app)
    const list = (await this.forceLoad(user.pubkey)) || makeList({kind: RELAYS})
    const writeRelays = reject(nthEq(2, RelayMode.Read), getRelayTags(getListTags(list))).map(nth(1))
    const writeTags = writeRelays.map(url => ["r", url, RelayMode.Write])
    const readTags = urls.map(url => ["r", url, RelayMode.Read])
    const tags = [...writeTags, ...readTags]
    const event = {kind: list.kind, content: list.event?.content || "", tags}

    return this.app.use(Thunks).publishToOutbox({event})
  }

  setWriteRelays = async (urls: string[]) => {
    const user = User.require(this.app)
    const list = (await this.forceLoad(user.pubkey)) || makeList({kind: RELAYS})
    const readRelays = reject(nthEq(2, RelayMode.Write), getRelayTags(getListTags(list))).map(nth(1))
    const readTags = readRelays.map(url => ["r", url, RelayMode.Read])
    const writeTags = urls.map(url => ["r", url, RelayMode.Write])
    const tags = [...readTags, ...writeTags]
    const event = {kind: list.kind, content: list.event?.content || "", tags}

    return this.app.use(Thunks).publishToOutbox({event})
  }
}
