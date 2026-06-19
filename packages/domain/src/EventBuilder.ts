import {first, partition, spec} from "@welshman/lib"
import type {Maybe, MaybeAsync} from "@welshman/lib"
import {stamp, prep} from "@welshman/util"
import type {EventTemplate, SignedEvent, HashedEvent} from "@welshman/util"
import type {ISigner} from "@welshman/signer"
import type {EventReader} from "./EventReader.js"

export abstract class EventBuilder<Reader extends EventReader> {
  abstract readonly kind: number
  groupTag?: string[]
  protectTag?: string[]
  expiresTag?: string[]
  extraTags: string[][] = []

  constructor(readonly reader?: Reader) {
    this.extraTags = reader?.event.tags ?? []
    this.groupTag = first(this.consumeTags("h"))
    this.protectTag = first(this.consumeTags("-"))
    this.expiresTag = first(this.consumeTags("expiration"))
  }

  protected consumeTags(key: string): string[][] {
    const [consumed, remaining] = partition(spec([key]), this.extraTags)

    this.extraTags = remaining

    return consumed
  }

  group(group: Maybe<string>) {
    this.groupTag = group ? ["h", group] : undefined

    return this
  }

  protect(protect: boolean) {
    this.protectTag = protect ? ["-"] : undefined

    return this
  }

  expires(expires: Maybe<number>) {
    this.expiresTag = expires ? ["expiration", String(expires)] : undefined

    return this
  }

  protected buildTags(signer?: ISigner): MaybeAsync<string[][]> {
    return []
  }

  protected buildContent(signer?: ISigner): MaybeAsync<string> {
    return ""
  }

  protected validate(): void {}

  private behaviorTags(): string[][] {
    const tags: string[][] = []

    if (this.groupTag) tags.push(this.groupTag)
    if (this.protectTag) tags.push(this.protectTag)
    if (this.expiresTag) tags.push(this.expiresTag)

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
