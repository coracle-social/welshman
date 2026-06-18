import {uniq} from "@welshman/lib"
import {EMOJIS, getAddressTagValues} from "@welshman/util"
import {EncryptableList} from "./List.js"

// NIP-51 / NIP-30 kind-10030 user emoji list. Holds references to kind 30030
// emoji sets via `a` tags, plus inline `["emoji", shortcode, url]` tags.
export class EmojiList extends EncryptableList {
  readonly kind = EMOJIS

  addresses() {
    return uniq(getAddressTagValues(this.tags()))
  }

  emojis() {
    return this.tags().filter(t => t[0] === "emoji")
  }

  addEmoji(shortcode: string, url: string) {
    return this.addPublicTags(["emoji", shortcode, url])
  }

  addSet(address: string) {
    return this.addPublicTags(["a", address])
  }

  remove(value: string) {
    return this.removeTagsWithValue(value)
  }
}
