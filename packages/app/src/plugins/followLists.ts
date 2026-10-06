import {FOLLOWS} from "@welshman/util"
import {FollowList, FollowListReader, FollowListWriter} from "@welshman/domain"
import {DerivedPlugin} from "./base.js"
import {Network} from "./network.js"
import {Domain} from "./domain.js"
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

  update = (fn: (writer: FollowListWriter) => void) =>
    this.app.use(Domain).update(FollowList, this.forceLoad, fn)

  follow = (tag: string[]) => this.update(writer => writer.addTags(tag))

  unfollow = (value: string) => this.update(writer => writer.unfollow(value))
}
