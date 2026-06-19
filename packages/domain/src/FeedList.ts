import {uniq} from "@welshman/lib"
import {FEEDS, getAddressTagValues} from "@welshman/util"
import {ListReader, ListBuilder} from "./List.js"

// NIP-51 kind-10014 saved feeds list. Entries are `a` tags pointing at kind 31890
// FEED definitions, stored publicly (tags) or privately (encrypted content); the
// reader treats both as one merged set.
export class FeedList extends ListReader {
  static kind = FEEDS

  addresses() {
    return uniq(getAddressTagValues(this.tags()))
  }

  includes(address: string) {
    return this.addresses().includes(address)
  }

  builder() {
    return this.seedList(new FeedListBuilder())
  }
}

export class FeedListBuilder extends ListBuilder {
  static kind = FEEDS

  addFeed(address: string, relayHint?: string) {
    return this.addPublicTags(["a", address, relayHint || ""])
  }

  addFeedPrivately(address: string, relayHint?: string) {
    return this.addPrivateTags(["a", address, relayHint || ""])
  }

  removeFeed(address: string) {
    return this.removeTagsWithValue(address)
  }
}
