import {uniq, spec, removeUndefined} from "@welshman/lib"
import {RELAY_REMOVE_MEMBER, getPubkeyTagValues} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"

// Flotilla relay/space remove-member op (kind 8001).
export class RelayRemoveMemberReader extends EventReader {
  readonly kind = RELAY_REMOVE_MEMBER

  pubkeys() {
    return uniq(getPubkeyTagValues(this.event.tags))
  }
}

export class RelayRemoveMemberWriter extends EventWriter<RelayRemoveMemberReader> {
  readonly kind = RELAY_REMOVE_MEMBER
  readonly requiresRelays = true

  addPubkey(pubkey: string) {
    return this.dropTags(spec(["p", pubkey])).addTags(removeUndefined(["p", pubkey]))
  }
}

export const RelayRemoveMember = new KindFactory({
  reader: RelayRemoveMemberReader,
  writer: RelayRemoveMemberWriter,
})
