import {uniq} from "@welshman/lib"
import {TOPICS, getTopicTagValues, getAddressTagValues} from "@welshman/util"
import {ListReader, ListBuilder} from "./List.js"

// NIP-51 kind-10015 interests/followed-topics list. Followed hashtags are stored
// as `t` tags; the list may also reference interest sets (kind 30015) via `a`
// tags. Extends ListReader/ListBuilder so entries may be public (tags) or private
// (encrypted content), treated as one merged set by the accessors.
export class TopicList extends ListReader {
  static kind = TOPICS

  topics() {
    return uniq(getTopicTagValues(this.tags()))
  }

  addresses() {
    return uniq(getAddressTagValues(this.tags()))
  }

  includes(topic: string) {
    return this.topics().includes(topic)
  }

  builder() {
    return this.seedList(new TopicListBuilder())
  }
}

export class TopicListBuilder extends ListBuilder {
  static kind = TOPICS

  followPublicly(topic: string) {
    return this.addPublicTags(["t", topic])
  }

  followPrivately(topic: string) {
    return this.addPrivateTags(["t", topic])
  }

  follow(topic: string) {
    return this.followPublicly(topic)
  }

  unfollow(topic: string) {
    return this.removeTagsWithValue(topic)
  }
}
