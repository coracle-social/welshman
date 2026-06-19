import {uniq} from "@welshman/lib"
import {RELAY_MEMBERS, getPubkeyTagValues} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// Flotilla relay-wide (space) member-list snapshot, replaceable kind 13534.
// Members are stored as "p" tags. Not addressable (no "d" tag); tags-only
// content, so it extends EventReader/EventBuilder directly.
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

  pubkeys: string[] = []

  constructor(readonly reader?: RelayMembers) {
    super(reader)

    this.pubkeys = uniq(this.consumeTags("p").map(t => t[1]))
  }

  addPubkey(pubkey: string) {
    this.pubkeys = uniq([...this.pubkeys, pubkey])

    return this
  }

  removePubkey(pubkey: string) {
    this.pubkeys = this.pubkeys.filter(pk => pk !== pubkey)

    return this
  }

  protected buildTags() {
    return this.pubkeys.map(pk => ["p", pk])
  }
}
