import {RELAY_MEMBERS} from "@welshman/util"
import {RelayMembers, RelayMembersReader} from "@welshman/domain"
import {RelaySignedDerivedPlugin} from "./relaySigned.js"
import {Network} from "./network.js"
import type {IApp} from "../app.js"

/**
 * Flotilla kind-13534 relay member lists. This is a plain replaceable (not
 * addressable) published by a relay's self key — exactly one per relay — so the
 * relay url alone is the key, and it's validated as relay-signed.
 */
export class RelayMemberLists extends RelaySignedDerivedPlugin<RelayMembersReader> {
  constructor(app: IApp) {
    super(app, {
      filters: [{kinds: [RELAY_MEMBERS]}],
      eventToItem: RelayMembers.factory(app.user?.signer),
      getKey: (_members, url) => url,
    })
  }

  fetch(url: string) {
    return this.app.use(Network).load({relays: [url], filters: [{kinds: [RELAY_MEMBERS]}]})
  }

  forUrl = (url: string) => this.one(url)
}
