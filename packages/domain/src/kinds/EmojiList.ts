import {uniq, spec, nthEq} from "@welshman/lib"
import {EMOJIS, getAddressTagValues} from "@welshman/util"
import {ListReader} from "../ListReader.js"
import {ListBuilder} from "../ListBuilder.js"

// NIP-51 kind-10030 user emoji list.
export class EmojiList extends ListReader {
  readonly kind = EMOJIS

  emojis() {
    return this.tags().filter(spec(["emoji"]))
  }

  emojiSets() {
    return uniq(getAddressTagValues(this.tags()))
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

  removeEmoji(value: string) {
    return this.drop(nthEq(1, value))
  }

  addEmojiSet(address: string) {
    return this.addPublic(["a", address])
  }

  removeEmojiSet(value: string) {
    return this.drop(nthEq(1, value))
  }
}
