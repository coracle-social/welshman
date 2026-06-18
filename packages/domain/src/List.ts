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
  // Private entries as plaintext. Empty when there are none or when we couldn't
  // decrypt them (see `decrypted`).
  privateTags: string[][]
  // True when `privateTags` reflects the real (decrypted) private content. False
  // means we're holding ciphertext we couldn't read, so private entries are
  // unknown and must not be mutated.
  decrypted: boolean
}

export const makeListValues = (values: Partial<ListValues> = {}): ListValues => ({
  publicTags: [],
  privateTags: [],
  decrypted: true,
  ...values,
})

/**
 * Read and decrypt the private tags stored in an event's content. Returns
 * `decrypted: false` (and leaves `privateTags` empty) when there is encrypted
 * content but no signer, or when decryption fails — in that case the original
 * ciphertext is preserved verbatim on serialization.
 */
export const decryptListContent = async (
  event: TrustedEvent,
  signer?: ISigner,
): Promise<Pick<ListValues, "privateTags" | "decrypted">> => {
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

/**
 * Base class for replaceable lists that carry public entries in tags and
 * private entries as an encrypted JSON array in content (NIP-51 style). The
 * private entries are decrypted to plaintext on `parse` and re-encrypted on
 * `toTemplate`, so all in-between reads and writes are synchronous.
 *
 * Subclasses fix the `kind` and add domain-specific accessors (see
 * `MuteList`). The generic tag mechanics live here.
 */
export abstract class EncryptableList extends DomainObject<ListValues> {
  constructor(values: Partial<ListValues> = {}, event?: TrustedEvent) {
    super(makeListValues(values), event)
  }

  /**
   * Whether the private entries were successfully decrypted (or there were
   * none). When false, only public entries are available and private mutations
   * throw.
   */
  get isDecrypted() {
    return this.values.decrypted
  }

  /** All entries, merging public and (when decrypted) private tags. */
  getTags() {
    return [...this.values.publicTags, ...this.values.privateTags]
  }

  getPublicTags() {
    return this.values.publicTags
  }

  getPrivateTags() {
    return this.values.privateTags
  }

  /** Add one or more tags to the public (cleartext) entries. */
  addPublicTags(...tags: string[][]) {
    this.values.publicTags = uniqTags([...this.values.publicTags, ...tags])

    return this
  }

  /** Add one or more tags to the private (encrypted) entries. */
  addPrivateTags(...tags: string[][]) {
    this.assertDecrypted()

    this.values.privateTags = uniqTags([...this.values.privateTags, ...tags])

    return this
  }

  /** Remove every tag matching `pred` from both public and private entries. */
  removeTagsBy(pred: (tag: string[]) => boolean) {
    this.values.publicTags = this.values.publicTags.filter(t => !pred(t))

    if (this.values.decrypted) {
      this.values.privateTags = this.values.privateTags.filter(t => !pred(t))
    }

    return this
  }

  /** Remove every tag whose value (index 1) equals `value`, public or private. */
  removeTagsByValue(value: string) {
    return this.removeTagsBy(nthEq(1, value))
  }

  protected assertDecrypted() {
    if (!this.values.decrypted) {
      throw new Error("Cannot modify the private entries of a list that has not been decrypted")
    }
  }

  async toTemplate(signer?: ISigner): Promise<EventTemplate> {
    const tags = this.values.publicTags

    // Preserve the original ciphertext when we never decrypted it, so a
    // pass-through round trip doesn't destroy private entries we can't read.
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
