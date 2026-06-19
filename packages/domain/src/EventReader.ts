import {spec} from "@welshman/lib"
import {getTagValue, getAddress} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import type {ISigner} from "@welshman/signer"
import type {EventBuilder} from "./EventBuilder.js"

export abstract class EventReader {
  abstract readonly kind: number

  constructor(readonly event: TrustedEvent) {}

  // Returns a reusable, class-bound reader factory over a fixed signer. Unlike a
  // detached `fromEvent` (which would lose its binding, since it does
  // `new this(event)`), this is invoked on the class up front, so it's safe
  // point-free — e.g. `eventToItem: Profile.factory(signer)`. Pass the signer
  // whenever you have one; the reader decides whether it needs it, so callers
  // stay decoupled from which kinds carry encrypted content.
  static factory<T extends EventReader>(this: new (event: TrustedEvent) => T, signer?: ISigner) {
    const Reader = this

    return async (event: TrustedEvent): Promise<T> => {
      const reader = new Reader(event)

      if (event.kind !== reader.kind) {
        throw new Error(`Expected a kind ${reader.kind} event, got kind ${event.kind}`)
      }

      await reader.parse(signer)

      return reader
    }
  }

  static async fromEvent<T extends EventReader>(
    this: new (event: TrustedEvent) => T,
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

  expires() {
    const expiration = parseInt(getTagValue("expiration", this.event.tags) ?? "")

    return isNaN(expiration) ? undefined : expiration
  }

  abstract builder(): EventBuilder<EventReader>
}
