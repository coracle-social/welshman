import {uniq} from "@welshman/lib"
import {RELAY_MEMBERS, getPubkeyTagValues} from "@welshman/util"
import {EventReader, EventBuilder} from "./base.js"

// Flotilla relay-wide (space) member-list snapshot, replaceable kind 13534.
// Members are stored as "p" tags. Not addressable (no "d" tag); tags-only
// content, so it extends EventReader/EventBuilder directly.
export class RelayMembers extends EventReader {
  static kind = RELAY_MEMBERS

  protected reservedTagKeys() {
    return ["p"]
  }

  pubkeys() {
    return uniq(getPubkeyTagValues(this.event.tags))
  }

  isMember(pubkey: string) {
    return this.pubkeys().includes(pubkey)
  }

  builder() {
    const builder = new RelayMembersBuilder()

    builder.pubkeys = this.pubkeys()

    return this.seedBuilder(builder)
  }
}

export class RelayMembersBuilder extends EventBuilder {
  static kind = RELAY_MEMBERS

  pubkeys: string[] = []

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
