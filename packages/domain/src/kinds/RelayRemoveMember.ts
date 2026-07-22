import {uniq, spec, removeUndefined} from "@welshman/lib"
import {RELAY_REMOVE_MEMBER, hexTags, tagValues} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"

// Flotilla relay/space remove-member op (kind 8001).
export class RelayRemoveMemberReader extends EventReader {
  pubkeys() {
    return uniq(tagValues(hexTags("p"), this.event.tags))
  }
}

export class RelayRemoveMemberWriter extends EventWriter<RelayRemoveMemberReader> {
  readonly requiresRelays = true

  addPubkey(pubkey: string) {
    return this.dropTags(spec(["p", pubkey])).addTags(removeUndefined(["p", pubkey]))
  }
}

export const RelayRemoveMember = new KindFactory({
  kind: RELAY_REMOVE_MEMBER,
  reader: RelayRemoveMemberReader,
  writer: RelayRemoveMemberWriter,
})
