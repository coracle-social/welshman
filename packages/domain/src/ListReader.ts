import {parseJson} from "@welshman/lib"
import type {TrustedEvent} from "@welshman/util"
import {decrypt} from "@welshman/signer"
import type {ISigner} from "@welshman/signer"
import {EventReader} from "./EventReader.js"
import type {ListBuilder} from "./ListBuilder.js"

export abstract class ListReader extends EventReader {
  decrypted = false
  publicTags: string[][] = []
  privateTags: string[][] = []

  protected async parse(signer?: ISigner) {
    this.publicTags = this.event.tags

    if (!this.event.content) {
      this.decrypted = true
    } else if (signer) {
      try {
        const plaintext = await decrypt(signer, this.event.pubkey, this.event.content)

        this.decrypted = true

        const json = parseJson(plaintext)

        if (Array.isArray(json)) {
          this.privateTags = json.filter(tag => Array.isArray(tag) && tag.length > 0 && tag.every(v => typeof v === "string"))
        }
      } catch {
        // pass
      }
    }
  }

  tags() {
    return [...this.publicTags, ...this.privateTags]
  }

  abstract builder(): ListBuilder
}
