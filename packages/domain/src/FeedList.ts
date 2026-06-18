import {uniq} from "@welshman/lib"
import {FEEDS, getAddressTagValues} from "@welshman/util"
import {EncryptableList} from "./List.js"

// NIP-51 kind-10014 saved feeds list. Entries are `a` tags pointing at kind 31890
// FEED definitions. Extends EncryptableList; exposes the addresses as a merged set.
export class FeedList extends EncryptableList {
  readonly kind = FEEDS

  addresses() {
    return uniq(getAddressTagValues(this.tags()))
  }

  addFeed(address: string, relayHint?: string) {
    return this.addPublicTags(["a", address, relayHint || ""])
  }

  removeFeed(address: string) {
    return this.removeTagsWithValue(address)
  }
}
