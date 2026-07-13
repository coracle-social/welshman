import {complement, first, nth, partition, randomId, spec, uniq} from "@welshman/lib"
import type {MaybeAsync} from "@welshman/lib"
import {
  isParameterizedReplaceableKind,
  normalizeRelayUrl,
  getAncestorTags,
  getPubkeyTags,
  getPubkeyTagValues,
  isRelayUrl,
  outbox,
  userOutbox,
  inboxes,
  relays,
} from "@welshman/util"
import type {EventTemplate, TrustedEvent, RelaySelection, RelayScenario} from "@welshman/util"
import type {ISigner} from "@welshman/signer"
import type {EventReader} from "./EventReader.js"
import type {AnyConfiguredKind} from "./Kind.js"
import {Hint, hint} from "./Hint.js"
import type {Tag} from "./Hint.js"

export abstract class EventWriter<Reader extends EventReader> {
  abstract readonly kind: number

  content: string
  groupTag?: Tag
  protectTag?: Tag
  expirationTag?: Tag
  identifierTag?: Tag
  extraTags: Tag[] = []
  forcedRelays?: string[]

  // Kinds that must publish to explicit relays (e.g. NIP-29 group events) set this.
  // Annotated `boolean` (not the inferred literal `false`) so subclasses can override.
  readonly requiresRelays: boolean = false

  constructor(
    readonly def: AnyConfiguredKind,
    readonly reader?: Reader,
  ) {
    this.content = reader?.event.content ?? ""
    this.extraTags = reader?.event.tags ?? []
    this.groupTag = first(this.consumeTags("h"))
    this.protectTag = first(this.consumeTags("-"))
    this.expirationTag = first(this.consumeTags("expiration"))
    this.identifierTag = first(this.consumeTags("d"))
  }

  protected consumeTags(key: string): Tag[] {
    const [consumed, remaining] = partition(spec([key]), this.extraTags)

    this.extraTags = remaining

    return consumed
  }

  setContent(content: string) {
    this.content = content

    return this
  }

  setGroup(url: string, group: string) {
    this.forcedRelays = [normalizeRelayUrl(url)]
    this.groupTag = ["h", group]

    return this
  }

  clearGroup() {
    this.forcedRelays = undefined
    this.groupTag = undefined

    return this
  }

  forceRelays(...urls: string[]) {
    this.forcedRelays = urls.map(normalizeRelayUrl)

    return this
  }

  clearForcedRelays() {
    this.forcedRelays = undefined

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

  addTags(...tags: Tag[]) {
    this.extraTags.push(...tags)

    return this
  }

  keepTags(pred: (tag: Tag) => boolean) {
    this.extraTags = this.extraTags.filter(pred)

    return this
  }

  dropTags(pred: (tag: Tag) => boolean) {
    this.extraTags = this.extraTags.filter(complement(pred))

    return this
  }

  // Relay-hint helpers — deferred `Hint`s that `render` dereferences to a url.

  protected eventRootsHint(event: TrustedEvent): Hint {
    const {roots} = getAncestorTags(event)
    const mentions = getPubkeyTags(event.tags)
    const authors = roots.map(nth(3)).filter(p => p?.length === 64)
    const others = mentions.map(nth(1)).filter(p => p?.length === 64)
    const relayUrls = uniq([...roots, ...mentions].map(nth(2)).filter(r => r && isRelayUrl(r)))

    return hint(
      ...authors.map(pubkey => outbox(pubkey, 10)),
      ...others.map(pubkey => outbox(pubkey)),
      ...relays(relayUrls),
    )
  }

  // Shared tag builders.

  tagPubkey(pubkey: string, petname = ""): Tag {
    return ["p", pubkey, hint(outbox(pubkey)), petname]
  }

  addQuote(event: TrustedEvent, relay?: string) {
    return this.addTags(["q", event.id, relay ?? hint(outbox(event.pubkey)), event.pubkey])
  }

  addZapSplit(pubkey: string, split = 1) {
    return this.addTags(["zap", pubkey, hint(outbox(pubkey)), String(split)])
  }

  protected buildTags(signer?: ISigner): MaybeAsync<Tag[]> {
    return []
  }

  protected buildContent(signer?: ISigner): MaybeAsync<string> {
    return this.content
  }

  protected validate(): void {
    if (isParameterizedReplaceableKind(this.kind) && !this.identifierTag) {
      throw new Error(`A d tag is required for kind ${this.kind}`)
    }

    if (this.groupTag && !this.forcedRelays?.length) {
      throw new Error("A group event requires a relay url (set the group via setGroup)")
    }

    if (this.requiresRelays && !this.forcedRelays?.length) {
      throw new Error(
        `A kind ${this.kind} event must publish to explicit relays (via setGroup or forceRelays)`,
      )
    }
  }

  private behaviorTags(): Tag[] {
    const tags: Tag[] = []

    if (this.groupTag) tags.push(this.groupTag)
    if (this.protectTag) tags.push(this.protectTag)
    if (this.expirationTag) tags.push(this.expirationTag)
    if (this.identifierTag) tags.push(this.identifierTag)

    return tags
  }

  private async rawTags(signer?: ISigner): Promise<Tag[]> {
    const implTags = await this.buildTags(signer)

    return [...implTags, ...this.behaviorTags(), ...this.extraTags]
  }

  async getTags(): Promise<string[][]> {
    const tags = await this.rawTags()

    return tags.map(tag => tag.map(part => (part instanceof Hint ? "" : part)))
  }

  protected async routes(): Promise<RelaySelection[]> {
    return [userOutbox(), ...inboxes(getPubkeyTagValues(await this.getTags()), 0.5)]
  }

  async scenario(): Promise<RelayScenario> {
    const routes = this.forcedRelays?.length ? relays(this.forcedRelays) : await this.routes()

    return this.def.context.resolver.scenario(routes)
  }

  async relays(): Promise<string[]> {
    return (await this.scenario()).getUrls()
  }

  async render(): Promise<EventTemplate> {
    const {signer, resolver} = this.def.context

    this.validate()

    const rawTags = await this.rawTags(signer)
    const tags = await Promise.all(
      rawTags.map(tag =>
        Promise.all(
          tag.map(async part =>
            part instanceof Hint ? ((await resolver.relay(part.selections)) ?? "") : part,
          ),
        ),
      ),
    )

    const content = await this.buildContent(signer)

    return {kind: this.kind, content, tags}
  }

  async finalize(): Promise<{event: EventTemplate; relays: string[]}> {
    const [event, relays] = await Promise.all([this.render(), this.relays()])

    return {event, relays}
  }
}
