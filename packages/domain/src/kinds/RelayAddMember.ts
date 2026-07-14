import {uniq, spec, removeUndefined} from "@welshman/lib"
import {RELAY_ADD_MEMBER, getPubkeyTagValues} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"

// Flotilla relay/space add-member op (kind 8000).
export class RelayAddMemberReader extends EventReader {
  pubkeys() {
    return uniq(getPubkeyTagValues(this.event.tags))
  }
}

export class RelayAddMemberWriter extends EventWriter<RelayAddMemberReader> {
  readonly requiresRelays = true

  addPubkey(pubkey: string) {
    return this.dropTags(spec(["p", pubkey])).addTags(removeUndefined(["p", pubkey]))
  }
}

export const RelayAddMember = new KindFactory({
  kind: RELAY_ADD_MEMBER,
  reader: RelayAddMemberReader,
  writer: RelayAddMemberWriter,
})
