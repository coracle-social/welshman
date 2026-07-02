import {RELAYS, RelayMode, getRelayTagValues} from "@welshman/util"
import {RelayList, RelayListBuilder} from "@welshman/domain"
import {DerivedPlugin} from "./base.js"
import type {Projection} from "./base.js"
import {Router} from "./router.js"
import {Network} from "./network.js"
import {User} from "../user.js"
import {Command} from "../command.js"
import type {IApp} from "../app.js"

/**
 * NIP-65 relay lists, keyed by pubkey. This is the routing substrate every other
 * outbox-model load depends on (see `Network.loadUsingOutbox`).
 */
export class RelayLists extends DerivedPlugin<RelayList> {
  constructor(app: IApp) {
    super(app, {
      filters: [{kinds: [RELAYS]}],
      eventToItem: RelayList.factory(app.user?.signer),
      getKey: (list: RelayList) => list.author(),
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

  urls = (pubkey: string): Projection<string[]> => this.project(pubkey, list => list?.urls() ?? [])

  readUrls = (pubkey: string): Projection<string[]> =>
    this.project(pubkey, list => list?.readUrls() ?? [])

  writeUrls = (pubkey: string): Projection<string[]> =>
    this.project(pubkey, list => list?.writeUrls() ?? [])

  // NIP-65 relay-list mutations for the app's user

  update = async (fn: (builder: RelayListBuilder) => void) => {
    const user = User.require(this.app)
    const builder = new RelayListBuilder(await this.forceLoad(user.pubkey))

    fn(builder)

    const event = await builder.toTemplate(user.signer)
    const relays = this.app.use(Router).FromUser().getUrls()

    return new Command(this.app, event, relays)
  }

  addRelay = (url: string, mode: RelayMode) =>
    this.update(builder =>
      mode === RelayMode.Read ? builder.addReadUrl(url) : builder.addWriteUrl(url),
    )

  setReadRelays = (urls: string[]) => this.update(builder => builder.setReadUrls(urls))

  setWriteRelays = (urls: string[]) => this.update(builder => builder.setWriteUrls(urls))

  removeRelay = async (url: string, mode: RelayMode) => {
    const user = User.require(this.app)
    const builder = new RelayListBuilder(await this.forceLoad(user.pubkey))
    const event = await (
      mode === RelayMode.Read ? builder.removeReadUrl(url) : builder.removeWriteUrl(url)
    ).toTemplate(user.signer)

    // Include the removed relay itself, in addition to the outbox set, so it
    // also gets notified of its own removal
    const relays = [url, ...this.app.use(Router).FromUser().getUrls()]

    return new Command(this.app, event, relays)
  }

  setRelays = async (tags: string[][]) => {
    const user = User.require(this.app)
    const router = this.app.use(Router)
    const builder = new RelayListBuilder(await this.forceLoad(user.pubkey))
    const event = await builder.setTags(tags).toTemplate(user.signer)
    const relays = router
      .merge([router.Index(), router.FromRelays(getRelayTagValues(tags))])
      .getUrls()

    return new Command(this.app, event, relays)
  }
}
