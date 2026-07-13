import {uniq, spec} from "@welshman/lib"
import {EMOJIS, getAddressTagValues} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"

// NIP-51 kind-10030 user emoji list.
export class EmojiListReader extends EventReader {
  readonly kind = EMOJIS

  emojis() {
    return this.tags().filter(spec(["emoji"]))
  }

  emojiSets() {
    return uniq(getAddressTagValues(this.tags()))
  }
}

export class EmojiListWriter extends EventWriter<EmojiListReader> {
  readonly kind = EMOJIS

  addEmoji(shortcode: string, url: string) {
    return this.addTags(["emoji", shortcode, url])
  }

  removeEmoji(value: string) {
    return this.dropTags(spec(["emoji", value]))
  }

  addEmojiSet(address: string) {
    return this.addTags(["a", address])
  }

  removeEmojiSet(value: string) {
    return this.dropTags(spec(["a", value]))
  }
}

export const EmojiList = new KindFactory({
  reader: EmojiListReader,
  writer: EmojiListWriter,
})
