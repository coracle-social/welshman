import {stamp, prep, getTagValue, getAddress} from "@welshman/util"
import type {EventTemplate, SignedEvent, HashedEvent, TrustedEvent} from "@welshman/util"
import type {ISigner} from "@welshman/signer"

// Tag keys the base owns as publish-time behavior tags (group/protect/expires).
export const BEHAVIOR_TAG_KEYS = ["h", "-", "expiration"]

/**
 * Read side of a domain object: a lazy, read-only view over a single nostr event.
 *
 * Construct via the static `fromEvent(event, signer?)`, which validates the kind,
 * eagerly computes the `plain` representation (decrypting and/or parsing the
 * event content — the one thing that must happen up front, since it can be
 * async), runs `validate()` (throws on missing *required* tags, lenient
 * otherwise) and returns the reader. The event is always present, so identity
 * accessors (`id`/`identifier`/`address`/…) are total — no optional handling.
 *
 * Everything else is read lazily through methods rather than parsed into fields.
 * Subclasses:
 *  - declare `static kind`
 *  - add domain accessors over `this.event.tags` (and `this.plain`)
 *  - override `parsePlain` when the event has encrypted/JSON content
 *  - override `validate` to enforce required tags
 *  - implement `builder()` to return the matching mutable builder
 *
 * `plain` is generic: its shape varies per kind (decrypted private tags for
 * lists, a parsed metadata object for JSON kinds, undefined for tag-only kinds),
 * so each reader/builder knows what to do with it.
 */
export abstract class EventReader<P = undefined> {
  // Concrete subclasses declare `static kind = SOME_KIND`.
  plain!: P

  constructor(readonly event: TrustedEvent) {}

  static async fromEvent<T extends EventReader<unknown>>(
    this: (new (event: TrustedEvent) => T) & {kind: number},
    event: TrustedEvent,
    signer?: ISigner,
  ): Promise<T> {
    if (event.kind !== this.kind) {
      throw new Error(`Expected a kind ${this.kind} event, got kind ${event.kind}`)
    }

    const reader = new this(event)

    reader.plain = (await reader.parsePlain(signer)) as T["plain"]
    reader.validate()

    return reader
  }

  // Eagerly compute the `plain` representation (decrypt and/or parse content).
  // Default: nothing to compute. Runs once in fromEvent.
  protected async parsePlain(_signer?: ISigner): Promise<P> {
    return undefined as P
  }

  // Throw on missing required tags. Lenient by default — keep "required" narrow.
  protected validate(): void {}

  // Tag keys this kind represents via dedicated accessors; combined with the
  // behavior keys, these are excluded from extraTags() so a reader -> builder ->
  // event round-trip doesn't lose or duplicate unknown tags. Default: none.
  protected reservedTagKeys(): string[] {
    return []
  }

  // Tags not represented by any accessor, for lossless carry-over into a builder.
  extraTags(): string[][] {
    const reserved = [...BEHAVIOR_TAG_KEYS, ...this.reservedTagKeys()]

    return this.event.tags.filter(t => !reserved.includes(t[0]))
  }

  // Identity accessors — total, since the event is always present.
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

  // Behavior-tag accessors.
  group() {
    return getTagValue("h", this.event.tags)
  }

  protect() {
    return this.event.tags.some(t => t[0] === "-")
  }

  expires() {
    const expiration = parseInt(getTagValue("expiration", this.event.tags) ?? "")

    return isNaN(expiration) ? undefined : expiration
  }

  // Copy the behavior tags + carry-over tags onto a freshly created builder.
  // Concrete readers call this from builder() after setting kind-specific fields.
  protected seedBuilder<B extends EventBuilder<P>>(builder: B): B {
    builder.group = this.group()
    builder.protect = this.protect()
    builder.expires = this.expires()
    builder.extraTags = this.extraTags()

    return builder
  }

  abstract builder(): EventBuilder<P>
}

/**
 * Write side of a domain object: a mutable draft assembled via setters and
 * emitted via `toTemplate`/`toRumor`/`toEvent`.
 *
 * A builder may sit in an invalid/incomplete state for as long as you like;
 * validation only runs at emit time (`validate()` throws then). Construct a
 * fresh builder with `new XBuilder()` and required params, or seed one from a
 * reader via `reader.builder()` to edit a replaceable event.
 *
 * Subclasses:
 *  - declare `static kind`
 *  - hold draft fields + chainable setters
 *  - implement `buildTags()` (the represented tags; do NOT emit behavior tags)
 *  - override `buildContent` for JSON/encrypted content
 *  - override `validate` to throw on an invalid draft
 */
export abstract class EventBuilder<P = undefined> {
  // Concrete subclasses declare `static kind = SOME_KIND`.
  group?: string
  protect = false
  expires?: number
  extraTags: string[][] = []
  plain!: P

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

  // The tags built from this kind's own fields. Must NOT include behavior tags
  // (h/-/expiration) or the carried-over extraTags — the base appends those.
  // Receives the signer (like buildContent) for kinds that need to encrypt tags.
  protected abstract buildTags(signer?: ISigner): string[][] | Promise<string[][]>

  // The event content. Override for JSON metadata or encrypted content.
  protected buildContent(_signer?: ISigner): string | Promise<string> {
    return ""
  }

  // Throw on an invalid draft. Runs only at emit time.
  protected validate(): void {}

  private behaviorTags(): string[][] {
    const tags: string[][] = []

    if (this.group) tags.push(["h", this.group])
    if (this.protect) tags.push(["-"])
    if (this.expires != null) tags.push(["expiration", String(this.expires)])

    return tags
  }

  async toTemplate(signer?: ISigner): Promise<EventTemplate> {
    this.validate()

    const kind = (this.constructor as unknown as {kind: number}).kind
    const content = await this.buildContent(signer)
    const tags = [...(await this.buildTags(signer)), ...this.extraTags, ...this.behaviorTags()]

    return {kind, content, tags}
  }

  async toRumor(signer: ISigner): Promise<HashedEvent> {
    const [template, pubkey] = await Promise.all([this.toTemplate(signer), signer.getPubkey()])

    return prep(template, pubkey)
  }

  async toEvent(signer: ISigner): Promise<SignedEvent> {
    return signer.sign(stamp(await this.toTemplate(signer)))
  }
}
