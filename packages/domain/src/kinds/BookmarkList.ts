import {uniq} from "@welshman/lib"
import {
  BOOKMARKS,
  getEventTagValues,
  getAddressTagValues,
  getTopicTagValues,
  getTagValues,
} from "@welshman/util"
import {ListReader} from "../core/ListReader.js"
import {ListWriter} from "../core/ListWriter.js"
import {KindFactory} from "../core/Kind.js"

// NIP-51 kind-10003 bookmark list.
export class BookmarkListReader extends ListReader {
  readonly kind = BOOKMARKS

  ids() {
    return uniq(getEventTagValues(this.tags()))
  }

  addresses() {
    return uniq(getAddressTagValues(this.tags()))
  }

  topics() {
    return uniq(getTopicTagValues(this.tags()))
  }

  urls() {
    return uniq(getTagValues("r", this.tags()))
  }
}

export class BookmarkListWriter extends ListWriter<BookmarkListReader> {
  readonly kind = BOOKMARKS

  bookmarkPublicly(tag: string[]) {
    return this.addPublic(tag)
  }

  bookmarkPrivately(tag: string[]) {
    return this.addPrivate(tag)
  }

  removeBookmark(value: string) {
    return this.dropTags(t => ["e", "a", "t", "r"].includes(t[0] as string) && t[1] === value)
  }
}

export const BookmarkList = new KindFactory({
  reader: BookmarkListReader,
  writer: BookmarkListWriter,
})
