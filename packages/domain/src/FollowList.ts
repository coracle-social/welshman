import {uniq} from "@welshman/lib"
import {FOLLOWS, getPubkeyTagValues} from "@welshman/util"
import {EncryptableList} from "./List.js"

// NIP-02 kind-3 follow list. Structurally a 'p'-tag list; follows are public in
// practice, but the encryptable-list machinery is inherited unchanged (private
// tags simply go unused). Follow targets may also be non-pubkey tags (e.g. 't'
// hashtags), so `follow` accepts a full tag and `unfollow` removes by value.
export class FollowList extends EncryptableList {
  readonly kind = FOLLOWS

  pubkeys() {
    return uniq(getPubkeyTagValues(this.tags()))
  }

  includes(pubkey: string) {
    return this.pubkeys().includes(pubkey)
  }

  follow(tag: string[]) {
    return this.addPublicTags(tag)
  }

  unfollow(value: string) {
    return this.removeTagsWithValue(value)
  }
}
