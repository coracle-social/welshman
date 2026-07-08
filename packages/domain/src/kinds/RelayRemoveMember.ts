import {uniq, spec, removeUndefined} from "@welshman/lib"
import {RELAY_REMOVE_MEMBER, getPubkeyTagValues} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"
import {ContentRouter} from "../EventRouter.js"
import {Kind} from "../Kind.js"

// Flotilla relay/space remove-member op (kind 8001).
export class RelayRemoveMemberReader extends EventReader {
  readonly kind = RELAY_REMOVE_MEMBER

  pubkeys() {
    return uniq(getPubkeyTagValues(this.event.tags))
  }
}

export class RelayRemoveMemberBuilder extends EventBuilder<RelayRemoveMemberReader> {
  readonly kind = RELAY_REMOVE_MEMBER

  addPubkey(pubkey: string) {
    return this.dropTags(spec(["p", pubkey])).addTags(removeUndefined(["p", pubkey]))
  }
}

export const RelayRemoveMember = new Kind({
  reader: RelayRemoveMemberReader,
  builder: RelayRemoveMemberBuilder,
  router: ContentRouter,
})
