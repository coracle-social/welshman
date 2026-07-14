import {complement} from "@welshman/lib"
import {EventWriter} from "./EventWriter.js"
import type {ListReader} from "./ListReader.js"
import type {AnyConfiguredKind} from "./Kind.js"
import type {Tag} from "./Hint.js"

export abstract class ListWriter<
  Reader extends ListReader = ListReader,
> extends EventWriter<Reader> {
  publicTags: Tag[] = []
  privateTags: Tag[] = []

  constructor(def: AnyConfiguredKind, reader?: Reader) {
    super(def, reader)

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

  keepPublic(pred: (tag: Tag) => boolean) {
    this.publicTags = this.publicTags.filter(pred)

    return this
  }

  keepPrivate(pred: (tag: Tag) => boolean) {
    this.privateTags = this.privateTags.filter(pred)

    return this
  }

  keepTags(pred: (tag: Tag) => boolean) {
    this.publicTags = this.publicTags.filter(pred)
    this.privateTags = this.privateTags.filter(pred)

    return this
  }

  dropPublic(pred: (tag: Tag) => boolean) {
    this.publicTags = this.publicTags.filter(complement(pred))

    return this
  }

  dropPrivate(pred: (tag: Tag) => boolean) {
    this.privateTags = this.privateTags.filter(complement(pred))

    return this
  }

  dropTags(pred: (tag: Tag) => boolean) {
    this.publicTags = this.publicTags.filter(complement(pred))
    this.privateTags = this.privateTags.filter(complement(pred))

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

  protected async buildContent(): Promise<string> {
    // Preserve the original ciphertext when we never decrypted it.
    if (this.reader?.decrypted === false) return this.reader.event.content

    // No need to encrypt an empty array
    if (this.privateTags.length === 0) return ""

    const {signer} = this.def.context

    if (!signer) {
      throw new Error("A signer is required to encrypt private tags")
    }

    const pubkey = await signer.getPubkey()

    return signer.nip44.encrypt(pubkey, JSON.stringify(this.privateTags))
  }
}
