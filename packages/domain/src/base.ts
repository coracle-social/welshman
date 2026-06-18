import {stamp, prep, getTagValue} from "@welshman/util"
import type {EventTemplate, SignedEvent, HashedEvent, TrustedEvent} from "@welshman/util"
import type {ISigner} from "@welshman/signer"

// The tag keys the base owns as publish-time behavior tags (group/protect/expires).
const BEHAVIOR_TAG_KEYS = ["h", "-", "expiration"]

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

  // Publish-time behavior tags, shared by every kind and applied to the template
  // at serialization time via addBehaviorTags rather than being baked into each
  // subclass's content schema. They are read back from the event on parse.
  group?: string // NIP-29 room scope -> ["h", group]
  protect = false // NIP-70 protected -> ["-"]
  expires?: number // NIP-40 expiration -> ["expiration", expires]

  // Tags not represented by any other domain attribute, carried over verbatim.
  // Handled the same way as the behavior tags above: parsed in the base (minus
  // the behavior keys and the subclass's reserved keys) and re-emitted in
  // addBehaviorTags. Empty unless the subclass opts in via reservedTagKeys().
  extraTags: string[][] = []

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
    this.group = getTagValue("h", event.tags)
    this.protect = event.tags.some(t => t[0] === "-")

    const expiration = parseInt(getTagValue("expiration", event.tags) ?? "")
    this.expires = isNaN(expiration) ? undefined : expiration

    const reserved = this.reservedTagKeys()
    this.extraTags =
      reserved == null
        ? []
        : event.tags.filter(t => ![...BEHAVIOR_TAG_KEYS, ...reserved].includes(t[0]))

    this.values = this.normalizeValues(await this.parseEvent(event, signer))

    return this
  }

  protected abstract normalizeValues(values?: Partial<V>): V

  // Tag keys a subclass parses into dedicated attributes (and rebuilds in
  // toTemplate); the base behavior keys are always reserved too. Return null
  // (the default) to opt out of extra-tag passthrough — the subclass owns all
  // of its tags and `extraTags` stays empty.
  protected reservedTagKeys(): string[] | null {
    return null
  }

  protected abstract parseEvent(
    event: TrustedEvent,
    signer?: ISigner,
  ): Partial<V> | Promise<Partial<V>>

  abstract toTemplate(signer?: ISigner): Promise<EventTemplate>

  // Append the publish-time behavior tags to a freshly built template, just
  // before hashing/signing. A tag is skipped when the subclass's toTemplate
  // already emitted that key, so kinds that own "h" as core content (NIP-29
  // group events) don't get a duplicate.
  private addBehaviorTags(template: EventTemplate): EventTemplate {
    const tags = [...template.tags, ...this.extraTags]
    const has = (key: string) => tags.some(t => t[0] === key)

    if (this.group && !has("h")) tags.push(["h", this.group])
    if (this.protect && !has("-")) tags.push(["-"])
    if (this.expires != null && !has("expiration")) tags.push(["expiration", String(this.expires)])

    return {...template, tags}
  }

  setGroup(group: string) {
    this.group = group

    return this
  }

  setProtect(protect = true) {
    this.protect = protect

    return this
  }

  setExpires(expires: number) {
    this.expires = expires

    return this
  }

  async toRumor(signer: ISigner): Promise<HashedEvent> {
    const [template, pubkey] = await Promise.all([this.toTemplate(signer), signer.getPubkey()])

    return prep(this.addBehaviorTags(template), pubkey)
  }

  async toEvent(signer: ISigner): Promise<SignedEvent> {
    const template = this.addBehaviorTags(await this.toTemplate(signer))

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
