import {nthEq, parseJson} from "@welshman/lib"
import {uniqTags} from "@welshman/util"
import type {EventTemplate, TrustedEvent} from "@welshman/util"
import {decrypt} from "@welshman/signer"
import type {ISigner} from "@welshman/signer"
import {DomainObject} from "./base.js"

const isValidTag = (tag: unknown): tag is string[] =>
  Array.isArray(tag) && tag.length > 0 && tag.every(v => typeof v === "string")

export type DecryptedTags = {
  privateTags: string[][]
  // True when the private content was read (or there was none), false when we
  // hold ciphertext we couldn't decrypt. See `EncryptableList.isDecrypted`.
  decrypted: boolean
}

/**
 * Read and decrypt the private tags stored in an event's content. Returns
 * `decrypted: false` (and leaves `privateTags` empty) when there is encrypted
 * content but no signer, or when decryption fails — in that case the original
 * ciphertext is preserved verbatim on serialization.
 */
export const decryptListContent = async (
  event: TrustedEvent,
  signer?: ISigner,
): Promise<DecryptedTags> => {
  // No private content to read.
  if (!event.content) return {privateTags: [], decrypted: true}

  // No signer to read it with — keep the ciphertext, mark it undecrypted.
  if (!signer) return {privateTags: [], decrypted: false}

  try {
    const plaintext = await decrypt(signer, event.pubkey, event.content)
    const privateTags = (parseJson(plaintext) || []).filter(isValidTag)

    return {privateTags, decrypted: true}
  } catch {
    return {privateTags: [], decrypted: false}
  }
}

export type EncryptableListParams = {
  publicTags?: string[][]
  privateTags?: string[][]
  decrypted?: boolean
  event?: TrustedEvent
}

/**
 * Base class for replaceable lists that carry public entries in tags and
 * private entries as an encrypted JSON array in content (NIP-51 style). The
 * private entries are decrypted to plaintext on `parse` and re-encrypted on
 * `getTemplate`, so all in-between reads and writes are synchronous.
 *
 * Subclasses fix the `kind` and add domain-specific accessors (see
 * `MuteList`). The generic tag mechanics live here.
 */
export abstract class EncryptableList extends DomainObject {
  abstract readonly kind: number

  publicTags: string[][]
  privateTags: string[][]
  readonly event?: TrustedEvent

  // Whether `privateTags` reflects the real (decrypted) private content. False
  // means we're holding ciphertext we couldn't read, so private entries are
  // unknown and must not be mutated.
  protected decrypted: boolean

  constructor({
    publicTags = [],
    privateTags = [],
    decrypted = true,
    event,
  }: EncryptableListParams = {}) {
    super()

    this.publicTags = publicTags
    this.privateTags = privateTags
    this.decrypted = decrypted
    this.event = event
  }

  /**
   * Whether the private entries were successfully decrypted (or there were
   * none). When false, only public entries are available and private mutations
   * throw.
   */
  get isDecrypted() {
    return this.decrypted
  }

  /** All entries, merging public and (when decrypted) private tags. */
  getTags() {
    return [...this.publicTags, ...this.privateTags]
  }

  getPublicTags() {
    return this.publicTags
  }

  getPrivateTags() {
    return this.privateTags
  }

  /** Add one or more tags to the public (cleartext) entries. */
  addPublicTags(...tags: string[][]) {
    this.publicTags = uniqTags([...this.publicTags, ...tags])

    return this
  }

  /** Add one or more tags to the private (encrypted) entries. */
  addPrivateTags(...tags: string[][]) {
    this.assertDecrypted()

    this.privateTags = uniqTags([...this.privateTags, ...tags])

    return this
  }

  /** Remove every tag matching `pred` from both public and private entries. */
  removeTagsBy(pred: (tag: string[]) => boolean) {
    this.publicTags = this.publicTags.filter(t => !pred(t))

    if (this.decrypted) {
      this.privateTags = this.privateTags.filter(t => !pred(t))
    }

    return this
  }

  /** Remove every tag whose value (index 1) equals `value`, public or private. */
  removeTagsByValue(value: string) {
    return this.removeTagsBy(nthEq(1, value))
  }

  protected assertDecrypted() {
    if (!this.decrypted) {
      throw new Error("Cannot modify the private entries of a list that has not been decrypted")
    }
  }

  async getTemplate(signer?: ISigner): Promise<EventTemplate> {
    const tags = this.publicTags

    // Preserve the original ciphertext when we never decrypted it, so a
    // pass-through round trip doesn't destroy private entries we can't read.
    let content = this.event?.content || ""

    if (this.decrypted) {
      if (this.privateTags.length === 0) {
        content = ""
      } else {
        if (!signer) {
          throw new Error("A signer is required to encrypt the private entries of a list")
        }

        const pubkey = await signer.getPubkey()

        content = await signer.nip44.encrypt(pubkey, JSON.stringify(this.privateTags))
      }
    }

    return {kind: this.kind, tags, content}
  }

  toJSON() {
    return {
      kind: this.kind,
      publicTags: this.publicTags,
      privateTags: this.privateTags,
      decrypted: this.decrypted,
      event: this.event,
    }
  }
}
