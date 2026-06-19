import {spec} from "@welshman/lib"
import {getTagValue, getAddress} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import type {ISigner} from "@welshman/signer"
import type {EventBuilder} from "./EventBuilder.js"

export abstract class EventReader {
  abstract readonly kind: number

  constructor(readonly event: TrustedEvent) {}

  static async fromEvent<T extends EventReader>(
    this: (new (event: TrustedEvent) => T),
    event: TrustedEvent,
    signer?: ISigner,
  ): Promise<T> {
    const reader = new this(event)

    if (event.kind !== reader.kind) {
      throw new Error(`Expected a kind ${reader.kind} event, got kind ${event.kind}`)
    }

    await reader.parse(signer)

    return reader
  }

  protected async parse(signer?: ISigner): Promise<void> {}

  id() {
    return this.event.id
  }

  pubkey() {
    return this.event.pubkey
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

  expires() {
    const expiration = parseInt(getTagValue("expiration", this.event.tags) ?? "")

    return isNaN(expiration) ? undefined : expiration
  }

  abstract builder(): EventBuilder<EventReader>
}
