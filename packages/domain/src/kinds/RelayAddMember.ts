import {uniq, spec, removeUndefined} from "@welshman/lib"
import {RELAY_ADD_MEMBER, getPubkeyTagValues} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"
import {ContentRouter} from "../EventRouter.js"
import {Kind} from "../Kind.js"

// Flotilla relay/space add-member op (kind 8000).
export class RelayAddMemberReader extends EventReader {
  readonly kind = RELAY_ADD_MEMBER

  pubkeys() {
    return uniq(getPubkeyTagValues(this.event.tags))
  }
}

export class RelayAddMemberBuilder extends EventBuilder<RelayAddMemberReader> {
  readonly kind = RELAY_ADD_MEMBER

  addPubkey(pubkey: string) {
    return this.dropTags(spec(["p", pubkey])).addTags(removeUndefined(["p", pubkey]))
  }
}

export const RelayAddMember = new Kind({
  reader: RelayAddMemberReader,
  builder: RelayAddMemberBuilder,
  router: ContentRouter,
})
