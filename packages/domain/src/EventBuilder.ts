import {complement, first, partition, randomId, spec} from "@welshman/lib"
import type {MaybeAsync} from "@welshman/lib"
import {stamp, prep, isParameterizedReplaceableKind} from "@welshman/util"
import type {EventTemplate, SignedEvent, HashedEvent} from "@welshman/util"
import type {ISigner} from "@welshman/signer"
import type {EventReader} from "./EventReader.js"

export abstract class EventBuilder<Reader extends EventReader> {
  abstract readonly kind: number
  content: string
  groupTag?: string[]
  protectTag?: string[]
  expirationTag?: string[]
  identifierTag?: string[]
  extraTags: string[][] = []

  constructor(readonly reader?: Reader) {
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

  setGroup(group: string) {
    this.groupTag = ["h", group]

    return this
  }

  clearGroup() {
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
  }

  private behaviorTags(): string[][] {
    const tags: string[][] = []

    if (this.groupTag) tags.push(this.groupTag)
    if (this.protectTag) tags.push(this.protectTag)
    if (this.expirationTag) tags.push(this.expirationTag)
    if (this.identifierTag) tags.push(this.identifierTag)

    return tags
  }

  async toTemplate(signer?: ISigner): Promise<EventTemplate> {
    this.validate()

    const kind = this.kind
    const [content, implTags, behaviorTags] = await Promise.all([
      this.buildContent(signer),
      this.buildTags(signer),
      this.behaviorTags(),
    ])
    const tags = [...implTags, ...behaviorTags, ...this.extraTags]

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
