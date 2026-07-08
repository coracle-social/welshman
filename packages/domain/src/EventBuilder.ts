import {complement, first, partition, randomId, spec} from "@welshman/lib"
import type {MaybeAsync} from "@welshman/lib"
import {stamp, prep, isParameterizedReplaceableKind, normalizeRelayUrl} from "@welshman/util"
import type {EventTemplate, SignedEvent, HashedEvent} from "@welshman/util"
import type {ISigner} from "@welshman/signer"
import type {EventReader} from "./EventReader.js"
import type {AnyKind} from "./Kind.js"

export abstract class EventBuilder<Reader extends EventReader> {
  abstract readonly kind: number

  content: string
  groupTag?: string[]
  // The relay hosting this NIP-29 group (a group is (relay, id)). Publish-only
  // context — set via `setGroup` — that the router turns into a `relay` route.
  groupUrl?: string
  protectTag?: string[]
  expirationTag?: string[]
  identifierTag?: string[]
  extraTags: string[][] = []

  constructor(
    readonly def: AnyKind,
    readonly reader?: Reader,
  ) {
    this.content = reader?.event.content ?? ""
    this.extraTags = reader?.event.tags ?? []
    this.groupTag = first(this.consumeTags("h"))
    this.protectTag = first(this.consumeTags("-"))
    this.expirationTag = first(this.consumeTags("expiration"))
    this.identifierTag = first(this.consumeTags("d"))
  }

  protected consumeTags(key: string): string[][] {
    const [consumed, remaining] = partition(spec([key]), this.extraTags)

    this.extraTags = remaining

    return consumed
  }

  setContent(content: string) {
    this.content = content

    return this
  }

  // A NIP-29 group is identified by (relay, id): `url` is where the event should
  // be published (the router routes to it), `group` is the `h` tag.
  setGroup(url: string, group: string) {
    this.groupUrl = normalizeRelayUrl(url)
    this.groupTag = ["h", group]

    return this
  }

  clearGroup() {
    this.groupUrl = undefined
    this.groupTag = undefined

    return this
  }

  setProtected(protect: boolean) {
    this.protectTag = protect ? ["-"] : undefined

    return this
  }

  setExpiration(expiration: number) {
    this.expirationTag = ["expiration", String(expiration)]

    return this
  }

  clearExpiration() {
    this.expirationTag = undefined

    return this
  }

  setIdentifier(identifier = randomId()) {
    this.identifierTag = ["d", identifier]

    return this
  }

  clearIdentifier() {
    this.identifierTag = undefined

    return this
  }

  addTags(...tags: string[][]) {
    this.extraTags.push(...tags)

    return this
  }

  keepTags(pred: (tag: string[]) => boolean) {
    this.extraTags = this.extraTags.filter(pred)

    return this
  }

  dropTags(pred: (tag: string[]) => boolean) {
    this.extraTags = this.extraTags.filter(complement(pred))

    return this
  }

  protected buildTags(signer?: ISigner): MaybeAsync<string[][]> {
    return []
  }

  protected buildContent(signer?: ISigner): MaybeAsync<string> {
    return this.content
  }

  protected validate(): void {
    if (isParameterizedReplaceableKind(this.kind) && !this.identifierTag) {
      throw new Error(`A d tag is required for kind ${this.kind}`)
    }

    // A NIP-29 group is (relay, id): if the group tag is set (e.g. seeded from a
    // fetched event), the relay must be too, so the router can reach it.
    if (this.groupTag && !this.groupUrl) {
      throw new Error("A group event requires a relay url (set the group via setGroup)")
    }
  }

  private behaviorTags(): string[][] {
    const tags: string[][] = []

    if (this.groupTag) tags.push(this.groupTag)
    if (this.protectTag) tags.push(this.protectTag)
    if (this.expirationTag) tags.push(this.expirationTag)
    if (this.identifierTag) tags.push(this.identifierTag)

    return tags
  }

  // The tags this builder currently holds, as `toTemplate` would emit them but
  // without building content — so no signer is needed. Used for routing.
  async getTags(): Promise<string[][]> {
    const implTags = await this.buildTags()

    return [...implTags, ...this.behaviorTags(), ...this.extraTags]
  }

  async toTemplate(signer?: ISigner): Promise<EventTemplate> {
    this.validate()

    const [content, tags] = await Promise.all([this.buildContent(signer), this.getTags()])

    return {kind: this.kind, content, tags}
  }

  async toRumor(signer: ISigner): Promise<HashedEvent> {
    const [template, pubkey] = await Promise.all([this.toTemplate(signer), signer.getPubkey()])

    return prep(template, pubkey)
  }

  async toEvent(signer: ISigner): Promise<SignedEvent> {
    return signer.sign(stamp(await this.toTemplate(signer)))
  }

  routes() {
    return this.def.router(undefined, this).routes()
  }
}
