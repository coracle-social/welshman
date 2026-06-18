import {stamp, prep} from "@welshman/util"
import type {EventTemplate, SignedEvent, HashedEvent, TrustedEvent} from "@welshman/util"
import type {ISigner} from "@welshman/signer"

/**
 * The base class for domain objects.
 *
 * A domain object is an in-memory, mutable view of a single nostr event whose
 * state lives in a plain `values` property. The pattern is "decrypt on parse,
 * mutate in memory, encrypt on serialize": concrete subclasses decrypt private
 * content up front (in `parse`), expose synchronous accessors and mutators over
 * `values`, and only touch the signer again when building an event.
 *
 * There are two construction entry points, both of which populate `values` and
 * return `this`:
 *
 *  - `init(values?)` builds a fresh object from raw input
 *  - `parse(event, signer?)` reads (and, when possible, decrypts) an event
 *
 * Subclasses also implement `toTemplate(signer?)` to build (and, when needed,
 * encrypt) the event template; the base provides the signing/wrapping
 * orchestration on top of it.
 */
export abstract class DomainObject<V extends Record<string, unknown>> {
  abstract readonly kind: number
  abstract values: V
  event?: TrustedEvent

  static init<T extends DomainObject<Record<string, unknown>>>(
    this: new () => T,
    values?: Partial<T["values"]>,
  ): T {
    return new this().init(values)
  }

  static parse<T extends DomainObject<Record<string, unknown>>>(
    this: new () => T,
    event: TrustedEvent,
    signer?: ISigner,
  ): Promise<T> {
    return new this().parse(event, signer)
  }

  init(values: Partial<V> = {}) {
    this.values = this.normalizeValues(values)

    return this
  }

  async parse(event: TrustedEvent, signer?: ISigner) {
    if (event.kind !== this.kind) {
      throw new Error(`Expected a kind ${this.kind} event, got kind ${event.kind}`)
    }

    this.event = event
    this.values = this.normalizeValues(await this.parseEvent(event, signer))

    return this
  }

  protected abstract normalizeValues(values?: Partial<V>): V

  protected abstract parseEvent(
    event: TrustedEvent,
    signer?: ISigner,
  ): Partial<V> | Promise<Partial<V>>

  abstract toTemplate(signer?: ISigner): Promise<EventTemplate>

  async toRumor(signer: ISigner): Promise<HashedEvent> {
    const [template, pubkey] = await Promise.all([this.toTemplate(signer), signer.getPubkey()])

    return prep(template, pubkey)
  }

  async toEvent(signer: ISigner): Promise<SignedEvent> {
    const template = await this.toTemplate(signer)

    return signer.sign(stamp(template))
  }

  get<K extends keyof V>(key: K): V[K] {
    return this.values[key]
  }

  set<K extends keyof V>(key: K, value: V[K]) {
    this.values[key] = value

    return this
  }
}
