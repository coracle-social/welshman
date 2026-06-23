import {uniq, spec, removeUndefined} from "@welshman/lib"
import {RELAY_REMOVE_MEMBER, getPubkeyTagValues} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// Flotilla relay/space remove-member op (kind 8001).
export class RelayRemoveMember extends EventReader {
  readonly kind = RELAY_REMOVE_MEMBER

  pubkeys() {
    return uniq(getPubkeyTagValues(this.event.tags))
  }

  builder() {
    return new RelayRemoveMemberBuilder(this)
  }
}

export class RelayRemoveMemberBuilder extends EventBuilder<RelayRemoveMember> {
  readonly kind = RELAY_REMOVE_MEMBER

  addPubkey(pubkey: string) {
    return this.dropTags(spec(["p", pubkey])).addTags(removeUndefined(["p", pubkey]))
  }
}
