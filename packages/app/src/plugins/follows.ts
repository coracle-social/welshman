import {FOLLOWS} from "@welshman/util"
import {FollowList, FollowListReader, FollowListBuilder} from "@welshman/domain"
import {DerivedPlugin} from "./base.js"
import {Network} from "./network.js"
import {Router} from "./router.js"
import {User} from "../user.js"
import type {IApp} from "../app.js"

/**
 * Kind-3 follow lists, keyed by pubkey. Loaded via the outbox model (the
 * author's write relays), so it depends on the relay-list collection.
 */
export class FollowLists extends DerivedPlugin<FollowListReader> {
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
    const builder = FollowList.builder(await this.forceLoad(user.pubkey))

    fn(builder)

    return this.app.use(Router).commandFromBuilder(builder)
  }

  follow = (tag: string[]) => this.update(builder => builder.addTags(tag))

  unfollow = (value: string) => this.update(builder => builder.unfollow(value))
}
