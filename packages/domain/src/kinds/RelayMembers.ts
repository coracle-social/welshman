import {uniq, nth, nthNe, uniqBy} from "@welshman/lib"
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

  pubkeyTags: string[][] = []

  constructor(readonly reader?: RelayMembers) {
    super(reader)

    this.pubkeyTags = uniqBy(nth(1), this.consumeTags("member"))

    // NIP-43 requires kind-13534 member lists to be NIP-70 protected.
    this.setProtected(true)
  }

  addPubkey(pubkey: string) {
    this.pubkeyTags = uniqBy(nth(1), [...this.pubkeyTags, ["member", pubkey]])

    return this
  }

  removePubkey(pubkey: string) {
    this.pubkeyTags = this.pubkeyTags.filter(nthNe(1, pubkey))

    return this
  }

  protected buildTags() {
    return this.pubkeyTags
  }
}
