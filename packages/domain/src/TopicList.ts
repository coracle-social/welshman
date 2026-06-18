import {uniq} from "@welshman/lib"
import {TOPICS, getTopicTagValues, getAddressTagValues} from "@welshman/util"
import {EncryptableList} from "./List.js"

// NIP-51 kind-10015 interests/followed-topics list. Followed hashtags are stored
// as `t` tags; the list may also reference interest sets (kind 30015) via `a`
// tags. Extends EncryptableList so entries may be public (tags) or private
// (encrypted content), treated as one merged set by the accessors.
export class TopicList extends EncryptableList {
  readonly kind = TOPICS

  topics() {
    return uniq(getTopicTagValues(this.tags()))
  }

  addresses() {
    return uniq(getAddressTagValues(this.tags()))
  }

  follow(topic: string) {
    return this.addPublicTags(["t", topic])
  }

  unfollow(topic: string) {
    return this.removeTagsWithValue(topic)
  }
}
