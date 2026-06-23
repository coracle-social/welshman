import {uniq} from "@welshman/lib"
import {
  BOOKMARKS,
  getEventTagValues,
  getAddressTagValues,
  getTopicTagValues,
  getTagValues,
} from "@welshman/util"
import {ListReader} from "../ListReader.js"
import {ListBuilder} from "../ListBuilder.js"

// NIP-51 kind-10003 bookmark list.
export class BookmarkList extends ListReader {
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

  builder() {
    return new BookmarkListBuilder(this)
  }
}

export class BookmarkListBuilder extends ListBuilder<BookmarkList> {
  readonly kind = BOOKMARKS

  bookmarkPublicly(tag: string[]) {
    return this.addPublic(tag)
  }

  bookmarkPrivately(tag: string[]) {
    return this.addPrivate(tag)
  }

  removeBookmark(value: string) {
    return this.dropTags(t => ["e", "a", "t", "r"].includes(t[0]) && t[1] === value)
  }
}
