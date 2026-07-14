import {spec} from "@welshman/lib"
import type {MaybeAsync} from "@welshman/lib"
import {getTagValue, getAddress, seen, outbox} from "@welshman/util"
import type {TrustedEvent, RelaySelection, RelayScenario} from "@welshman/util"
import type {AnyConfiguredKind} from "./Kind.js"

export abstract class EventReader {
  constructor(
    readonly def: AnyConfiguredKind,
    readonly event: TrustedEvent,
  ) {}

  async parse(): Promise<void> {}

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

  protected routes(): MaybeAsync<RelaySelection[]> {
    return [this.group() ? seen(this.event) : outbox(this.author())]
  }

  async scenario(): Promise<RelayScenario> {
    return this.def.context.resolver.scenario(await this.routes())
  }
}
