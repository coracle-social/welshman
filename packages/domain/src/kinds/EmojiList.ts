import {uniq, spec, nthEq} from "@welshman/lib"
import {EMOJIS, getAddressTagValues} from "@welshman/util"
import {ListReader} from "../ListReader.js"
import {ListBuilder} from "../ListBuilder.js"

// NIP-51 / NIP-30 kind-10030 user emoji list. Holds references to kind 30030
// emoji sets via `a` tags, plus inline `["emoji", shortcode, url]` tags.
export class EmojiList extends ListReader {
  readonly kind = EMOJIS

  // Addresses of referenced emoji sets (kind 30030).
  addresses() {
    return uniq(getAddressTagValues(this.tags()))
  }

  // Inline emoji tags: ["emoji", shortcode, url].
  emojis() {
    return this.tags().filter(spec(["emoji"]))
  }

  builder() {
    return new EmojiListBuilder(this)
  }
}

export class EmojiListBuilder extends ListBuilder<EmojiList> {
  readonly kind = EMOJIS

  addEmoji(shortcode: string, url: string) {
    return this.addPublic(["emoji", shortcode, url])
  }

  addEmojiSet(address: string) {
    return this.addPublic(["a", address])
  }

  removeEmoji(value: string) {
    return this.drop(nthEq(1, value))
  }
}
