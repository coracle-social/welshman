import {RELAY_INVITE, getTagValue} from "@welshman/util"
import {EventReader, EventBuilder} from "./base.js"

// NIP-29 kind-28935 ephemeral relay invite event. Its "claim" tag carries the
// invite code, which flotilla turns into a /join?r=&c= link. Flotilla only reads
// this event (see app/relays.ts requestRelayClaim), so `claim` is the sole field.
// Tags-only content, so it extends EventReader/EventBuilder directly.
export class RelayInvite extends EventReader {
  static kind = RELAY_INVITE

  protected reservedTagKeys() {
    return ["claim"]
  }

  claim() {
    return getTagValue("claim", this.event.tags)
  }

  builder() {
    const builder = new RelayInviteBuilder()

    builder.claim = this.claim()

    return this.seedBuilder(builder)
  }
}

export class RelayInviteBuilder extends EventBuilder {
  static kind = RELAY_INVITE

  claim?: string

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
