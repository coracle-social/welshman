import {uniq} from "@welshman/lib"
import {BOOKMARKS, addressTags, hexTags, tagSpec, tagValues, topicTags} from "@welshman/util"
import {ListReader} from "../core/ListReader.js"
import {ListWriter} from "../core/ListWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"

// NIP-51 kind-10003 bookmark list.
export class BookmarkListReader extends ListReader {
  ids() {
    return uniq(tagValues(hexTags("e"), this.tags()))
  }

  addresses() {
    return uniq(tagValues(addressTags("a"), this.tags()))
  }

  topics() {
    return uniq(tagValues(topicTags("t"), this.tags()))
  }

  urls() {
    return uniq(tagValues(tagSpec("r"), this.tags()))
  }
}

export class BookmarkListWriter extends ListWriter<BookmarkListReader> {
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

export class BookmarkListQuery extends EventQuery {
  protected renderRoutes() {
    return this.authorRoutes()
  }
}

export const BookmarkList = new KindFactory({
  kind: BOOKMARKS,
  reader: BookmarkListReader,
  writer: BookmarkListWriter,
  query: BookmarkListQuery,
})
