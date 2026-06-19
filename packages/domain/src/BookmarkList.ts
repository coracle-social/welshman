import {uniq} from "@welshman/lib"
import {
  BOOKMARKS,
  getEventTagValues,
  getAddressTagValues,
  getTopicTagValues,
  getTagValues,
} from "@welshman/util"
import {ListReader, ListBuilder} from "./List.js"

// NIP-51 kind-10003 bookmark list. Mixed entries (notes via 'e', articles via
// 'a', hashtags via 't', urls via 'r') can be bookmarked publicly (tags) or
// privately (encrypted content); accessors treat both as one merged set.
export class BookmarkList extends ListReader {
  static kind = BOOKMARKS

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
    return this.seedList(new BookmarkListBuilder())
  }
}

export class BookmarkListBuilder extends ListBuilder {
  static kind = BOOKMARKS

  bookmarkPublicly(tag: string[]) {
    return this.addPublicTags(tag)
  }

  bookmarkPrivately(tag: string[]) {
    return this.addPrivateTags(tag)
  }

  removeBookmark(value: string) {
    return this.removeTagsWithValue(value)
  }
}
