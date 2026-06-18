import {nthEq, parseJson} from "@welshman/lib"
import {uniqTags} from "@welshman/util"
import type {EventTemplate, TrustedEvent} from "@welshman/util"
import {decrypt} from "@welshman/signer"
import type {ISigner} from "@welshman/signer"
import {DomainObject} from "./base.js"

const isValidTag = (tag: unknown): tag is string[] =>
  Array.isArray(tag) && tag.length > 0 && tag.every(v => typeof v === "string")

export type ListValues = {
  publicTags: string[][]
  privateTags: string[][]
  // True when `privateTags` reflects decrypted content; false when we hold
  // ciphertext we couldn't read (so private entries are unknown).
  decrypted: boolean
}

export const makeListValues = (values: Partial<ListValues> = {}): ListValues => ({
  publicTags: [],
  privateTags: [],
  decrypted: true,
  ...values,
})

// Decrypt the private tags in an event's content. Returns decrypted: false when
// there's content but no signer, or decryption fails.
export const decryptListContent = async (
  event: TrustedEvent,
  signer?: ISigner,
): Promise<Pick<ListValues, "privateTags" | "decrypted">> => {
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

// Base for NIP-51 lists: public entries in tags, private entries as an encrypted
// JSON array in content. Subclasses fix the kind and add domain accessors.
export abstract class EncryptableList extends DomainObject<ListValues> {
  values = makeListValues()

  protected normalizeValues(values: Partial<ListValues> = {}) {
    return makeListValues(values)
  }

  protected async parseEvent(event: TrustedEvent, signer?: ISigner): Promise<Partial<ListValues>> {
    const {privateTags, decrypted} = await decryptListContent(event, signer)

    return {publicTags: event.tags, privateTags, decrypted}
  }

  tags() {
    return [...this.values.publicTags, ...this.values.privateTags]
  }

  addPublicTags(...tags: string[][]) {
    this.values.publicTags = uniqTags([...this.values.publicTags, ...tags])

    return this
  }

  addPrivateTags(...tags: string[][]) {
    if (!this.values.decrypted) {
      throw new Error("Cannot modify the private entries of a list that has not been decrypted")
    }

    this.values.privateTags = uniqTags([...this.values.privateTags, ...tags])

    return this
  }

  keepTags(pred: (tag: string[]) => boolean) {
    this.values.publicTags = this.values.publicTags.filter(t => !pred(t))

    if (this.values.decrypted) {
      this.values.privateTags = this.values.privateTags.filter(t => !pred(t))
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
    this.values.publicTags = this.values.publicTags.filter(t => !pred(t))

    if (this.values.decrypted) {
      this.values.privateTags = this.values.privateTags.filter(t => !pred(t))
    }

    return this
  }

  removeTagsWithKey(key: string) {
    return this.removeTags(nthEq(0, key))
  }

  removeTagsWithValue(value: string) {
    return this.removeTags(nthEq(1, value))
  }

  async toTemplate(signer?: ISigner): Promise<EventTemplate> {
    const tags = this.values.publicTags

    // Preserve the original ciphertext when we never decrypted it.
    let content = this.event?.content || ""

    if (this.values.decrypted) {
      if (this.values.privateTags.length === 0) {
        content = ""
      } else {
        if (!signer) {
          throw new Error("A signer is required to encrypt the private entries of a list")
        }

        const pubkey = await signer.getPubkey()

        content = await signer.nip44.encrypt(pubkey, JSON.stringify(this.values.privateTags))
      }
    }

    return {kind: this.kind, tags, content}
  }
}
