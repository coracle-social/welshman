import {FOLLOWS} from "@welshman/util"
import {FollowList, FollowListReader, FollowListWriter} from "@welshman/domain"
import {DerivedPlugin} from "./base.js"
import {Network} from "./network.js"
import {Domain} from "./domain.js"
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
      eventToItem: app.use(Domain).reader(FollowList),
      getKey: followList => followList.author(),
    })
  }

  fetch(pubkey: string, relayHints: string[] = []) {
    return this.app.use(Network).loadUsingOutbox(pubkey, {kinds: [FOLLOWS]}, relayHints)
  }

  update = async (fn: (writer: FollowListWriter) => void) => {
    const user = User.require(this.app)
    const writer = this.app.use(Domain).writer(FollowList, await this.forceLoad(user.pubkey))

    fn(writer)

    return this.app.use(Domain).command(writer)
  }

  follow = (tag: string[]) => this.update(writer => writer.addTags(tag))

  unfollow = (value: string) => this.update(writer => writer.unfollow(value))
}
