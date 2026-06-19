import {nthEq, parseJson} from "@welshman/lib"
import {uniqTags} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {decrypt} from "@welshman/signer"
import type {ISigner} from "@welshman/signer"
import {EventReader, EventBuilder} from "./base.js"

const isValidTag = (tag: unknown): tag is string[] =>
  Array.isArray(tag) && tag.length > 0 && tag.every(v => typeof v === "string")

// The decrypted `plain` payload shared by every NIP-51 list. `decrypted` is false
// when there was ciphertext we couldn't read (no signer / decryption failed), so
// the private entries are unknown and must be left untouched.
export type ListPlain = {
  privateTags: string[][]
  decrypted: boolean
}

// Decrypt the private tags in an event's content. Returns decrypted: false when
// there's content but no signer, or decryption fails.
export const decryptListContent = async (
  event: TrustedEvent,
  signer?: ISigner,
): Promise<ListPlain> => {
  if (!event.content) return {privateTags: [], decrypted: true}

  if (!signer) return {privateTags: [], decrypted: false}

  try {
    const plaintext = await decrypt(signer, event.pubkey, event.content)
    const privateTags = (parseJson(plaintext) || []).filter(isValidTag)

    return {privateTags, decrypted: true}
  } catch {
    return {privateTags: [], decrypted: false}
  }
}

// Read side for NIP-51 lists: public entries in tags, private entries decrypted
// from content into `plain`. Subclasses declare the kind and add domain accessors
// over `tags()`.
export abstract class ListReader extends EventReader<ListPlain> {
  protected parsePlain(signer?: ISigner) {
    return decryptListContent(this.event, signer)
  }

  publicTags() {
    return this.event.tags
  }

  privateTags() {
    return this.plain.privateTags
  }

  decrypted() {
    return this.plain.decrypted
  }

  tags() {
    return [...this.event.tags, ...this.plain.privateTags]
  }

  // Seed a list builder from this reader: public tags, decrypted private tags,
  // the original ciphertext (for the undecrypted case) and the behavior tags.
  protected seedList<B extends ListBuilder>(builder: B): B {
    builder.publicTags = [...this.event.tags]
    builder.plain = {privateTags: [...this.plain.privateTags], decrypted: this.plain.decrypted}
    builder.originalContent = this.event.content
    builder.group = this.group()
    builder.protect = this.protect()
    builder.expires = this.expires()

    return builder
  }

  abstract builder(): ListBuilder
}

// Write side for NIP-51 lists: mutate public/private tag sets, re-encrypt the
// private set into content on emit.
export abstract class ListBuilder extends EventBuilder<ListPlain> {
  publicTags: string[][] = []
  plain: ListPlain = {privateTags: [], decrypted: true}
  // Preserved ciphertext when the source list was never decrypted.
  originalContent?: string

  tags() {
    return [...this.publicTags, ...this.plain.privateTags]
  }

  addPublicTags(...tags: string[][]) {
    this.publicTags = uniqTags([...this.publicTags, ...tags])

    return this
  }

  addPrivateTags(...tags: string[][]) {
    if (!this.plain.decrypted) {
      throw new Error("Cannot modify the private entries of a list that has not been decrypted")
    }

    this.plain.privateTags = uniqTags([...this.plain.privateTags, ...tags])

    return this
  }

  keepTags(pred: (tag: string[]) => boolean) {
    this.publicTags = this.publicTags.filter(t => pred(t))

    if (this.plain.decrypted) {
      this.plain.privateTags = this.plain.privateTags.filter(t => pred(t))
    }

    return this
  }

  keepTagsWithKey(key: string) {
    return this.keepTags(nthEq(0, key))
  }

  keepTagsWithValue(value: string) {
    return this.keepTags(nthEq(1, value))
  }

  removeTags(pred: (tag: string[]) => boolean) {
    this.publicTags = this.publicTags.filter(t => !pred(t))

    if (this.plain.decrypted) {
      this.plain.privateTags = this.plain.privateTags.filter(t => !pred(t))
    }

    return this
  }

  removeTagsWithKey(key: string) {
    return this.removeTags(nthEq(0, key))
  }

  removeTagsWithValue(value: string) {
    return this.removeTags(nthEq(1, value))
  }

  clearPublicTags() {
    this.publicTags = []

    return this
  }

  clearPrivateTags() {
    if (!this.plain.decrypted) {
      throw new Error("Cannot modify the private entries of a list that has not been decrypted")
    }

    this.plain.privateTags = []

    return this
  }

  clearTags() {
    this.publicTags = []

    if (this.plain.decrypted) {
      this.plain.privateTags = []
    }

    return this
  }

  protected buildTags() {
    return this.publicTags
  }

  protected async buildContent(signer?: ISigner): Promise<string> {
    // Preserve the original ciphertext when we never decrypted it.
    if (!this.plain.decrypted) return this.originalContent || ""

    if (this.plain.privateTags.length === 0) return ""

    if (!signer) {
      throw new Error("A signer is required to encrypt the private entries of a list")
    }

    const pubkey = await signer.getPubkey()

    return signer.nip44.encrypt(pubkey, JSON.stringify(this.plain.privateTags))
  }
}
