import {uniq, spec} from "@welshman/lib"
import {TOPICS, getTopicTagValues, getAddressTagValues} from "@welshman/util"
import {ListReader} from "../ListReader.js"
import {ListBuilder} from "../ListBuilder.js"

// NIP-51 kind-10015 interests/topics list.
export class TopicList extends ListReader {
  readonly kind = TOPICS

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
    return new TopicListBuilder(this)
  }
}

export class TopicListBuilder extends ListBuilder<TopicList> {
  readonly kind = TOPICS

  followPublicly(topic: string) {
    return this.addPublic(["t", topic])
  }

  followPrivately(topic: string) {
    return this.addPrivate(["t", topic])
  }

  follow(topic: string) {
    return this.followPublicly(topic)
  }

  unfollow(topic: string) {
    return this.dropTags(spec(["t", topic]))
  }
}
