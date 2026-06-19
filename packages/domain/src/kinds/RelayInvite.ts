import {first} from "@welshman/lib"
import {RELAY_INVITE, getTagValue} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-29 kind-28935 ephemeral relay invite event. Its "claim" tag carries the
// invite code, which flotilla turns into a /join?r=&c= link. Flotilla only reads
// this event (see app/relays.ts requestRelayClaim), so `claim` is the sole field.
// Tags-only content, so it extends EventReader/EventBuilder directly.
export class RelayInvite extends EventReader {
  readonly kind = RELAY_INVITE

  claim() {
    return getTagValue("claim", this.event.tags)
  }

  builder() {
    return new RelayInviteBuilder(this)
  }
}

export class RelayInviteBuilder extends EventBuilder<RelayInvite> {
  readonly kind = RELAY_INVITE

  claim?: string

  constructor(readonly reader?: RelayInvite) {
    super(reader)

    const claim = first(this.consumeTags("claim"))

    this.claim = claim?.[1]
  }

  setClaim(claim: string) {
    this.claim = claim

    return this
  }

  protected buildTags() {
    const tags: string[][] = []

    if (this.claim) tags.push(["claim", this.claim])

    return tags
  }
}
