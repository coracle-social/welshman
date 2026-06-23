import {uniq, spec, removeUndefined} from "@welshman/lib"
import {RELAY_ADD_MEMBER, getPubkeyTagValues} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// Flotilla relay/space add-member op (kind 8000).
export class RelayAddMember extends EventReader {
  readonly kind = RELAY_ADD_MEMBER

  pubkeys() {
    return uniq(getPubkeyTagValues(this.event.tags))
  }

  builder() {
    return new RelayAddMemberBuilder(this)
  }
}

export class RelayAddMemberBuilder extends EventBuilder<RelayAddMember> {
  readonly kind = RELAY_ADD_MEMBER

  addPubkey(pubkey: string) {
    return this.dropTags(spec(["p", pubkey])).addTags(removeUndefined(["p", pubkey]))
  }
}
