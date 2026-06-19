import {first} from "@welshman/lib"
import {RELAY_JOIN, getTagValue} from "@welshman/util"
import type {ISigner} from "@welshman/signer"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// Ephemeral kind-28934 relay/space join request. Both written (the join flow)
// and read (membership status): it carries an optional invite "claim" tag and a
// free-text reason in the event content, driving the space membership state
// machine (RELAY_JOIN -> Pending/Granted). The content is the plain free-text
// reason.
export class RelayJoin extends EventReader {
  readonly kind = RELAY_JOIN

  claim() {
    return getTagValue("claim", this.event.tags)
  }

  reason() {
    return this.event.content || undefined
  }

  builder() {
    return new RelayJoinBuilder(this)
  }
}

export class RelayJoinBuilder extends EventBuilder<RelayJoin> {
  readonly kind = RELAY_JOIN

  claim?: string
  reason?: string

  constructor(readonly reader?: RelayJoin) {
    super(reader)

    const claim = first(this.consumeTags("claim"))

    this.claim = claim?.[1]
    this.reason = reader?.event.content || undefined
  }

  setClaim(claim: string) {
    this.claim = claim

    return this
  }

  setReason(reason: string) {
    this.reason = reason

    return this
  }

  protected buildTags() {
    const tags: string[][] = []

    if (this.claim) tags.push(["claim", this.claim])

    return tags
  }

  protected buildContent(_signer?: ISigner) {
    return this.reason || ""
  }
}
