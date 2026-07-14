import {RELAY_MEMBERS} from "@welshman/util"
import {RelayMembers, RelayMembersReader} from "@welshman/domain"
import {Domain} from "./domain.js"
import {RelaySignedDerivedPlugin} from "./relays.js"
import {Network} from "./network.js"
import type {IApp} from "../app.js"

/**
 * Flotilla kind-13534 relay member lists.
 */
export class RelayMemberLists extends RelaySignedDerivedPlugin<RelayMembersReader> {
  constructor(app: IApp) {
    super(app, {
      filters: [{kinds: [RELAY_MEMBERS]}],
      eventToItem: app.use(Domain).reader(RelayMembers),
      getKey: (_members, url) => url,
    })
  }

  fetch(url: string) {
    return this.app.use(Network).load({relays: [url], filters: [{kinds: [RELAY_MEMBERS]}]})
  }

  forUrl = (url: string) => this.one(url)
}
