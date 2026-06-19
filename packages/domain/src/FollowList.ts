import {uniq} from "@welshman/lib"
import {FOLLOWS, getPubkeyTagValues} from "@welshman/util"
import {ListReader, ListBuilder} from "./List.js"

// NIP-02 kind-3 follow list. Structurally a 'p'-tag list; follows are public in
// practice, but the encryptable-list machinery is inherited unchanged (private
// tags simply go unused). Follow targets may also be non-pubkey tags (e.g. 't'
// hashtags), so `addFollow` accepts a full tag and `removeFollow` removes by value.
export class FollowList extends ListReader {
  static kind = FOLLOWS

  pubkeys() {
    return uniq(getPubkeyTagValues(this.tags()))
  }

  includes(pubkey: string) {
    return this.pubkeys().includes(pubkey)
  }

  builder() {
    return this.seedList(new FollowListBuilder())
  }
}

export class FollowListBuilder extends ListBuilder {
  static kind = FOLLOWS

  addFollow(tag: string[]) {
    return this.addPublicTags(tag)
  }

  removeFollow(value: string) {
    return this.removeTagsWithValue(value)
  }
}
