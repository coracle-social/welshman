import {spec} from "@welshman/lib"
import {getTagValue, getAddress} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import type {ISigner} from "@welshman/signer"
import type {EventBuilder} from "./EventBuilder.js"

export abstract class EventReader {
  abstract readonly kind: number

  constructor(readonly event: TrustedEvent) {}

  private static async fromEventUsingSubclass<T extends EventReader>(
    Reader: new (event: TrustedEvent) => T,
    event: TrustedEvent,
    signer?: ISigner,
  ): Promise<T> {
    const reader = new Reader(event)

    if (event.kind !== reader.kind) {
      throw new Error(`Expected a kind ${reader.kind} event, got kind ${event.kind}`)
    }

    await reader.parse(signer)

    return reader
  }

  static fromEvent<T extends EventReader>(
    this: new (event: TrustedEvent) => T,
    event: TrustedEvent,
    signer?: ISigner,
  ): Promise<T> {
    return EventReader.fromEventUsingSubclass(this, event, signer)
  }

  static factory<T extends EventReader>(this: new (event: TrustedEvent) => T, signer?: ISigner) {
    const Reader = this

    return (event: TrustedEvent) => EventReader.fromEventUsingSubclass(Reader, event, signer)
  }

  protected async parse(signer?: ISigner): Promise<void> {}

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

  abstract builder(): EventBuilder<EventReader>
}
