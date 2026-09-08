import {remove, complement, first, partition, randomId, removeUndefined, spec} from "@welshman/lib"
import type {MaybeAsync} from "@welshman/lib"
import {
  isParameterizedReplaceableKind,
  normalizeRelayUrl,
  hexTags,
  tagValues,
  outbox,
  userOutbox,
  inboxes,
  relay,
} from "@welshman/util"
import type {EventTemplate, TrustedEvent, RelaySelection, RelayScenario} from "@welshman/util"
import type {BaseEventReader} from "./EventReader.js"
import type {KindContext} from "./Kind.js"

// A cursor over a tag list that splits out tags by key as they're consumed,
// leaving the rest in `tags`. Writers use it to peel behavior/kind-specific tags
// off an event being edited.
export class TagParser {
  tags: string[][]

  constructor(tags: string[][]) {
    this.tags = tags
  }

  consume(key: string) {
    const [consumed, remaining] = partition(spec([key]), this.tags)

    this.tags = remaining

    return consumed
  }
}

export abstract class EventWriter<Reader extends BaseEventReader> {
  content = ""
  roomTag?: string[]
  protectTag?: string[]
  expirationTag?: string[]
  identifierTag?: string[]
  extraTags: string[][] = []
  forcedRoutes?: RelaySelection[]
  pendingResolves: Promise<unknown>[] = []

  // Kinds that must publish to explicit relays (e.g. NIP-29 room events) set this.
  // Annotated `boolean` (not the inferred literal `false`) so subclasses can override.
  readonly requiresRelays: boolean = false

  constructor(
    readonly kind: number,
    readonly context: KindContext,
    readonly reader?: Reader,
  ) {
    if (reader) {
      const parser = new TagParser(reader.event.tags)

      this.content = reader.event.content
      this.roomTag = first(parser.consume("h"))
      this.protectTag = first(parser.consume("-"))
      this.expirationTag = first(parser.consume("expiration"))
      this.identifierTag = first(parser.consume("d"))
      this.extraTags = parser.tags
    }
  }

  setContent(content: string) {
    this.content = content

    return this
  }

  setRoom(url: string, room: string) {
    this.forcedRoutes = [relay(normalizeRelayUrl(url))]
    this.roomTag = ["h", room]

    return this
  }

  clearRoom() {
    this.forcedRoutes = undefined
    this.roomTag = undefined

    return this
  }

  /**
   * Replaces the rendered routes. These are routes rather than urls, so
   * `forceRoutes(userInbox())` pins an event to the user's read relays without
   * resolving them first.
   */
  forceRoutes(...routes: RelaySelection[]) {
    this.forcedRoutes = routes

    return this
  }

  clearForcedRoutes() {
    this.forcedRoutes = undefined

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

  addMention(pubkey: string) {
    const tag = ["p", pubkey, ""]

    this.addTags(tag)

    this.hint(outbox(pubkey)).then(url => {
      tag[2] = url
    })

    return this
  }

  addQuote(event: TrustedEvent) {
    const tag = ["q", event.id, "", event.pubkey]

    this.addTags(tag)

    this.hint(outbox(event.pubkey)).then(url => {
      tag[2] = url
    })

    return this
  }

  addZapSplit(pubkey: string, split = 1) {
    const tag = ["zap", pubkey, "", String(split)]

    this.addTags(tag)

    this.hint(outbox(pubkey)).then(url => {
      tag[2] = url
    })

    return this
  }

  removeZapSplit(pubkey: string) {
    return this.dropTags(spec(["zap", pubkey]))
  }

  addEmoji(shortcode: string, url: string, address?: string) {
    return this.dropTags(spec(["emoji", shortcode])).addTags(
      removeUndefined(["emoji", shortcode, url, address]),
    )
  }

  removeEmoji(shortcode: string) {
    return this.dropTags(spec(["emoji", shortcode]))
  }

  /**
   * Validates a domain object, throwing an error if invalid.
   */
  validate(): void {
    if (isParameterizedReplaceableKind(this.kind) && !this.identifierTag) {
      throw new Error(`A d tag is required for kind ${this.kind}`)
    }

    if (this.roomTag && !this.forcedRoutes?.length) {
      throw new Error("A room event requires a relay url (set the room via setRoom)")
    }

    if (this.requiresRelays && !this.forcedRoutes?.length) {
      throw new Error(
        `A kind ${this.kind} event must publish to explicit relays (via setRoom or forceRoutes)`,
      )
    }
  }

  /**
   * Tracks a promise that must resolve before the event is rendered.
   */
  private trackPending<T>(promise: Promise<T>): Promise<T> {
    this.pendingResolves.push(promise)

    promise.then(() => {
      this.pendingResolves = remove(promise, this.pendingResolves)
    })

    return promise
  }

  /**
   * Resolves one or more relay selections to a single hint url, tracking the
   * in-flight promise so `renderTags` can wait for it. Callers backfill the
   * resolved url into a tag's hint slot.
   */
  protected hint(...routes: RelaySelection[]): Promise<string> {
    return this.trackPending(this.context.resolver.relay(routes).then(url => url ?? ""))
  }

  /**
   * Returns a list of tags that may be attached to any kind.
   */
  protected renderBehaviorTags(): MaybeAsync<string[][]> {
    return removeUndefined([this.roomTag, this.protectTag, this.expirationTag, this.identifierTag])
  }

  /**
   * Returns a list of tags related to the kind.
   */
  protected renderDomainTags(): MaybeAsync<string[][]> {
    return []
  }

  /**
   * Returns the complete tag list for publishing.
   */
  async renderTags(): Promise<string[][]> {
    const behaviorTags = await this.renderBehaviorTags()
    const domainTags = await this.renderDomainTags()

    // Wait for any relay hints to resolve and backfill their tags.
    await Promise.all(this.pendingResolves)

    return [...behaviorTags, ...domainTags, ...this.extraTags]
  }

  /**
   * Returns the content string as defined by the kind.
   */
  renderContent(): MaybeAsync<string> {
    return this.content
  }

  /**
   * Validates and renders an event template.
   */
  async renderTemplate(): Promise<EventTemplate> {
    this.validate()

    return {
      kind: this.kind,
      tags: await this.renderTags(),
      content: await this.renderContent(),
    }
  }

  /**
   * Returns the list of routes this event should be published to. Defaults to
   * the outbox model. Override to implement custom behavior.
   */
  protected async renderRoutes(): Promise<RelaySelection[]> {
    return [userOutbox(), ...inboxes(tagValues(hexTags("p"), await this.renderTags()), 0.5)]
  }

  /**
   * Returns a router scenario for this event. Publishes to the forced routes (e.g. a
   * NIP-29 room's relay) when set, otherwise to the rendered routes.
   */
  async scenario(): Promise<RelayScenario> {
    const routes = this.forcedRoutes?.length ? this.forcedRoutes : await this.renderRoutes()

    return this.context.resolver.scenario(routes)
  }

  /**
   * Shortcut for getting relays from the router scenario.
   */
  async relays(): Promise<string[]> {
    return (await this.scenario()).getUrls()
  }

  /**
   * Returns a rendered event template along with its relays.
   */
  async render(): Promise<{event: EventTemplate; relays: string[]}> {
    const [event, relays] = await Promise.all([this.renderTemplate(), this.relays()])

    return {event, relays}
  }
}
