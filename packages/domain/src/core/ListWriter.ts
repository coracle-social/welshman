import {complement} from "@welshman/lib"
import {EventWriter} from "./EventWriter.js"
import type {KindContext} from "./Kind.js"
import type {ListReader} from "./ListReader.js"

export abstract class ListWriter<
  Reader extends ListReader = ListReader,
> extends EventWriter<Reader> {
  publicTags: string[][] = []
  privateTags: string[][] = []

  constructor(kind: number, context: KindContext, reader?: Reader) {
    super(kind, context, reader)

    this.publicTags = this.extraTags.splice(0)

    if (reader) {
      this.privateTags = [...reader.privateTags]
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

  keepTags(pred: (tag: string[]) => boolean) {
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

  dropTags(pred: (tag: string[]) => boolean) {
    this.publicTags = this.publicTags.filter(complement(pred))
    this.privateTags = this.privateTags.filter(complement(pred))

    return this
  }

  validate() {
    if (
      this.reader?.decrypted === false &&
      this.reader?.event.content &&
      this.privateTags.length > 0
    ) {
      throw new Error("Unable to modify list when decryption was not performed")
    }
  }

  protected renderDomainTags() {
    return this.publicTags
  }

  async renderContent(): Promise<string> {
    // Preserve the original ciphertext when we never decrypted it.
    if (this.reader?.decrypted === false) return this.reader.event.content

    // No need to encrypt an empty array.
    if (this.privateTags.length === 0) return ""

    const {signer} = this.context

    if (!signer) {
      throw new Error("A signer is required to encrypt private tags")
    }

    const pubkey = await signer.getPubkey()

    return signer.nip44.encrypt(pubkey, JSON.stringify(this.privateTags))
  }
}
