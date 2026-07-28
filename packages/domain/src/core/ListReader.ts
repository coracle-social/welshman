import {parseJson} from "@welshman/lib"
import {decrypt} from "@welshman/signer"
import {AsyncEventReader} from "./EventReader.js"

export abstract class ListReader extends AsyncEventReader {
  decrypted = false
  publicTags: string[][] = []
  privateTags: string[][] = []

  async parse() {
    const {signer} = this.context

    this.publicTags = this.event.tags

    if (!this.event.content) {
      this.decrypted = true
    } else if (signer && (await signer.getPubkey()) === this.event.pubkey) {
      try {
        const plaintext = await decrypt(signer, this.event.pubkey, this.event.content)

        this.decrypted = true

        const json = parseJson(plaintext)

        if (Array.isArray(json)) {
          this.privateTags = json.filter(
            tag => Array.isArray(tag) && tag.length > 0 && tag.every(v => typeof v === "string"),
          )
        }
      } catch {
        // pass
      }
    }

    return this
  }

  tags() {
    return [...this.publicTags, ...this.privateTags]
  }
}
