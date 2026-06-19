import {uniq, spec} from "@welshman/lib"
import {EMOJIS, getAddressTagValues} from "@welshman/util"
import {ListReader, ListBuilder} from "./List.js"

// NIP-51 / NIP-30 kind-10030 user emoji list. Holds references to kind 30030
// emoji sets via `a` tags, plus inline `["emoji", shortcode, url]` tags.
export class EmojiList extends ListReader {
  static kind = EMOJIS

  // Addresses of referenced emoji sets (kind 30030).
  addresses() {
    return uniq(getAddressTagValues(this.tags()))
  }

  // Inline emoji tags: ["emoji", shortcode, url].
  emojis() {
    return this.tags().filter(spec(["emoji"]))
  }

  builder() {
    return this.seedList(new EmojiListBuilder())
  }
}

export class EmojiListBuilder extends ListBuilder {
  static kind = EMOJIS

  addEmoji(shortcode: string, url: string) {
    return this.addPublicTags(["emoji", shortcode, url])
  }

  addEmojiSet(address: string) {
    return this.addPublicTags(["a", address])
  }

  removeEmoji(value: string) {
    return this.removeTagsWithValue(value)
  }
}
