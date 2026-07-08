import {spec} from "@welshman/lib"
import {getTagValue, getAddress} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import type {ISigner} from "@welshman/signer"
import type {AnyKind} from "./Kind.js"

export abstract class EventReader {
  abstract readonly kind: number

  constructor(
    readonly def: AnyKind,
    readonly event: TrustedEvent,
  ) {}

  async parse(signer?: ISigner): Promise<void> {}

  id() {
    return this.event.id
  }

  author() {
    return this.event.pubkey
  }

  content() {
    return this.event.content
  }

  tags() {
    return this.event.tags
  }

  createdAt() {
    return this.event.created_at
  }

  identifier() {
    return getTagValue("d", this.event.tags)
  }

  address() {
    return getAddress(this.event)
  }

  group() {
    return getTagValue("h", this.event.tags)
  }

  protect() {
    return this.event.tags.some(spec(["-"]))
  }

  expiration() {
    const expiration = parseInt(getTagValue("expiration", this.event.tags) ?? "")

    return isNaN(expiration) ? undefined : expiration
  }

  routes() {
    return this.def.router(this.event).routes()
  }
}
