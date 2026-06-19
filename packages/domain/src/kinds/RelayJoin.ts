import {first} from "@welshman/lib"
import {RELAY_JOIN, getTagValue} from "@welshman/util"
import type {ISigner} from "@welshman/signer"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// Ephemeral kind-28934 relay/space join request.
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

  claimTag?: string[]
  reason?: string

  constructor(readonly reader?: RelayJoin) {
    super(reader)

    this.claimTag = first(this.consumeTags("claim"))
    this.reason = reader?.event.content || undefined
  }

  setClaim(claim: string) {
    this.claimTag = ["claim", claim]

    return this
  }

  setReason(reason: string) {
    this.reason = reason

    return this
  }

  protected buildTags() {
    const tags: string[][] = []

    if (this.claimTag) tags.push(this.claimTag)

    return tags
  }

  protected buildContent(_signer?: ISigner) {
    return this.reason || ""
  }
}
