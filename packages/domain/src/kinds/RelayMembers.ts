import {uniq, spec, removeUndefined} from "@welshman/lib"
import {RELAY_MEMBERS, getTagValues} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// Flotilla kind-13534 relay/space member-list snapshot. Members are carried in
// NIP-43 `member` tags, and the event is NIP-70 protected (`-`).
export class RelayMembers extends EventReader {
  readonly kind = RELAY_MEMBERS

  pubkeys() {
    return uniq(getTagValues("member", this.event.tags))
  }

  isMember(pubkey: string) {
    return this.pubkeys().includes(pubkey)
  }

  builder() {
    return new RelayMembersBuilder(this)
  }
}

export class RelayMembersBuilder extends EventBuilder<RelayMembers> {
  readonly kind = RELAY_MEMBERS

  constructor(readonly reader?: RelayMembers) {
    super(reader)

    // NIP-43 requires kind-13534 member lists to be NIP-70 protected.
    this.setProtected(true)
  }

  addPubkey(pubkey: string, role?: string) {
    return this.dropTags(spec(["member", pubkey])).addTags(
      removeUndefined(["member", pubkey, role]),
    )
  }

  removePubkey(pubkey: string) {
    return this.dropTags(spec(["member", pubkey]))
  }

  setPubkeys(pubkeys: string[]) {
    return this.dropTags(spec(["member"])).addTags(...uniq(pubkeys).map(pk => ["member", pk]))
  }
}
