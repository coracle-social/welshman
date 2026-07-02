import {PINS} from "@welshman/util"
import {PinList, PinListBuilder} from "@welshman/domain"
import {DerivedPlugin} from "./base.js"
import {Network} from "./network.js"
import {Router} from "./router.js"
import {User} from "../user.js"
import {Command} from "../command.js"
import type {IApp} from "../app.js"

/**
 * NIP-51 pin lists (kind 10001), keyed by pubkey. Loaded via the outbox model
 * (the author's write relays), so it depends on the relay-list collection.
 */
export class PinLists extends DerivedPlugin<PinList> {
  constructor(app: IApp) {
    super(app, {
      filters: [{kinds: [PINS]}],
      eventToItem: PinList.factory(app.user?.signer),
      getKey: pins => pins.author(),
    })
  }

  fetch(pubkey: string, relayHints: string[] = []) {
    return this.app.use(Network).loadUsingOutbox(pubkey, {kinds: [PINS]}, relayHints)
  }

  update = async (fn: (builder: PinListBuilder) => void) => {
    const user = User.require(this.app)
    const builder = new PinListBuilder(await this.forceLoad(user.pubkey))

    fn(builder)

    const event = await builder.toTemplate(user.signer)
    const relays = this.app.use(Router).FromUser().getUrls()

    return new Command(this.app, event, relays)
  }

  pin = (tag: string[]) => this.update(builder => builder.pinPublicly(tag))

  unpin = (value: string) => this.update(builder => builder.unpin(value))
}
