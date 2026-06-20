import {complement} from "@welshman/lib"
import type {ISigner} from "@welshman/signer"
import {EventBuilder} from "./EventBuilder.js"
import type {ListReader} from "./ListReader.js"

export abstract class ListBuilder<
  Reader extends ListReader = ListReader,
> extends EventBuilder<Reader> {
  publicTags: string[][] = []
  privateTags: string[][] = []

  constructor(readonly reader?: Reader) {
    super(reader)

    this.publicTags = this.extraTags.splice(0)

    if (reader) {
      this.privateTags = reader.privateTags
    }
  }

  addPublic(...tags: string[][]) {
    this.publicTags.push(...tags)

    return this
  }

  addPrivate(...tags: string[][]) {
    this.privateTags.push(...tags)

    return this
  }

  keepPublic(pred: (tag: string[]) => boolean) {
    this.publicTags = this.publicTags.filter(pred)

    return this
  }

  keepPrivate(pred: (tag: string[]) => boolean) {
    this.privateTags = this.privateTags.filter(pred)

    return this
  }

  keep(pred: (tag: string[]) => boolean) {
    this.publicTags = this.publicTags.filter(pred)
    this.privateTags = this.privateTags.filter(pred)

    return this
  }

  dropPublic(pred: (tag: string[]) => boolean) {
    this.publicTags = this.publicTags.filter(complement(pred))

    return this
  }

  dropPrivate(pred: (tag: string[]) => boolean) {
    this.privateTags = this.privateTags.filter(complement(pred))

    return this
  }

  drop(pred: (tag: string[]) => boolean) {
    this.publicTags = this.publicTags.filter(complement(pred))
    this.privateTags = this.privateTags.filter(complement(pred))

    return this
  }

  clearPublic() {
    this.publicTags = []

    return this
  }

  clearPrivate() {
    this.privateTags = []

    return this
  }

  clear() {
    this.publicTags = []
    this.privateTags = []

    return this
  }

  protected validate() {
    if (
      this.reader?.event.content &&
      this.reader?.decrypted === false &&
      this.privateTags.length > 0
    ) {
      throw new Error("Unable to modify list when decryption was not performed")
    }
  }

  protected buildTags() {
    return this.publicTags
  }

  protected async buildContent(signer?: ISigner): Promise<string> {
    // Preserve the original ciphertext when we never decrypted it.
    if (this.reader?.decrypted === false) return this.reader.event.content

    // No need to encrypt an empty array
    if (this.privateTags.length === 0) return ""

    if (!signer) {
      throw new Error("A signer is required to encrypt private tags")
    }

    const pubkey = await signer.getPubkey()

    return signer.nip44.encrypt(pubkey, JSON.stringify(this.privateTags))
  }
}
