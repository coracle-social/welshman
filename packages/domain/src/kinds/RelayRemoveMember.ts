import {uniq, nth, uniqBy} from "@welshman/lib"
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

  pubkeyTags: string[][] = []

  constructor(readonly reader?: RelayRemoveMember) {
    super(reader)

    this.pubkeyTags = uniqBy(nth(1), this.consumeTags("p"))
  }

  addPubkey(pubkey: string) {
    this.pubkeyTags = uniqBy(nth(1), [...this.pubkeyTags, ["p", pubkey]])

    return this
  }

  protected buildTags() {
    return this.pubkeyTags
  }
}
