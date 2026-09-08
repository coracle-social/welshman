import {uniq, spec} from "@welshman/lib"
import {EMOJIS, addressTags, tagValues} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"

// NIP-51 kind-10030 user emoji list.
export class EmojiListReader extends EventReader {
  emojiSets() {
    return uniq(tagValues(addressTags("a"), this.tags()))
  }
}

export class EmojiListWriter extends EventWriter<EmojiListReader> {
  addEmojiSet(address: string) {
    return this.addTags(["a", address])
  }

  removeEmojiSet(value: string) {
    return this.dropTags(spec(["a", value]))
  }
}

export class EmojiListQuery extends EventQuery {
  protected renderRoutes() {
    return this.authorRoutes()
  }
}

export const EmojiList = new KindFactory({
  kind: EMOJIS,
  reader: EmojiListReader,
  writer: EmojiListWriter,
  query: EmojiListQuery,
})
