import {uniq, nth, nthNe, uniqBy} from "@welshman/lib"
import {RELAY_MEMBERS, getPubkeyTagValues} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// Flotilla kind-13534 relay/space member-list snapshot.
export class RelayMembers extends EventReader {
  readonly kind = RELAY_MEMBERS

  pubkeys() {
    return uniq(getPubkeyTagValues(this.event.tags))
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

    this.pubkeyTags = uniqBy(nth(1), this.consumeTags("p"))
  }

  addPubkey(pubkey: string) {
    this.pubkeyTags = uniqBy(nth(1), [...this.pubkeyTags, ["p", pubkey]])

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
