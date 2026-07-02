import {FOLLOWS} from "@welshman/util"
import {FollowList, FollowListBuilder} from "@welshman/domain"
import {DerivedPlugin} from "./base.js"
import {Network} from "./network.js"
import {Router} from "./router.js"
import {User} from "../user.js"
import {Command} from "../command.js"
import type {IApp} from "../app.js"

/**
 * Kind-3 follow lists, keyed by pubkey. Loaded via the outbox model (the
 * author's write relays), so it depends on the relay-list collection.
 */
export class FollowLists extends DerivedPlugin<FollowList> {
  constructor(app: IApp) {
    super(app, {
      filters: [{kinds: [FOLLOWS]}],
      eventToItem: FollowList.factory(app.user?.signer),
      getKey: followList => followList.author(),
    })
  }

  fetch(pubkey: string, relayHints: string[] = []) {
    return this.app.use(Network).loadUsingOutbox(pubkey, {kinds: [FOLLOWS]}, relayHints)
  }

  update = async (fn: (builder: FollowListBuilder) => void) => {
    const user = User.require(this.app)
    const builder = new FollowListBuilder(await this.forceLoad(user.pubkey))

    fn(builder)

    const event = await builder.toTemplate(user.signer)
    const relays = this.app.use(Router).FromUser().getUrls()

    return new Command(this.app, event, relays)
  }

  follow = (tag: string[]) => this.update(builder => builder.addTags(tag))

  unfollow = (value: string) => this.update(builder => builder.unfollow(value))
}
