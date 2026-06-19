import {RELAY_JOIN, getTagValue} from "@welshman/util"
import type {ISigner} from "@welshman/signer"
import {EventReader, EventBuilder} from "./base.js"

// Ephemeral kind-28934 relay/space join request. Both written (the join flow)
// and read (membership status): it carries an optional invite "claim" tag and a
// free-text reason in the event content, driving the space membership state
// machine (RELAY_JOIN -> Pending/Granted). The content is the plain free-text
// reason, so `plain` is the (possibly undefined) reason string.
export class RelayJoin extends EventReader<string | undefined> {
  static kind = RELAY_JOIN

  protected async parsePlain() {
    return this.event.content || undefined
  }

  protected reservedTagKeys() {
    return ["claim"]
  }

  claim() {
    return getTagValue("claim", this.event.tags)
  }

  reason() {
    return this.plain
  }

  builder() {
    const builder = new RelayJoinBuilder()

    builder.claim = this.claim()
    builder.reason = this.reason()

    builder.plain = this.plain

    return this.seedBuilder(builder)
  }
}

export class RelayJoinBuilder extends EventBuilder<string | undefined> {
  static kind = RELAY_JOIN

  claim?: string
  reason?: string

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
