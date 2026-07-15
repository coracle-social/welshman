import {uniq, spec, removeUndefined} from "@welshman/lib"
import {RELAY_MEMBERS, getTagValues} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"
import type {KindContext} from "../core/Kind.js"

// Flotilla kind-13534 relay/space member-list snapshot. Members are carried in
// NIP-43 `member` tags, and the event is NIP-70 protected (`-`).
export class RelayMembersReader extends EventReader {
  pubkeys() {
    return uniq(getTagValues("member", this.event.tags))
  }

  isMember(pubkey: string) {
    return this.pubkeys().includes(pubkey)
  }
}

export class RelayMembersWriter extends EventWriter<RelayMembersReader> {
  readonly requiresRelays = true

  constructor(kind: number, context: KindContext, reader?: RelayMembersReader) {
    super(kind, context, reader)

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

export const RelayMembers = new KindFactory({
  kind: RELAY_MEMBERS,
  reader: RelayMembersReader,
  writer: RelayMembersWriter,
})
