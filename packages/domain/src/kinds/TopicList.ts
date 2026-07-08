import {uniq, spec} from "@welshman/lib"
import {TOPICS, getTopicTagValues, getAddressTagValues} from "@welshman/util"
import {ListReader} from "../ListReader.js"
import {ListBuilder} from "../ListBuilder.js"
import {OutboxRouter} from "../EventRouter.js"
import {Kind} from "../Kind.js"

// NIP-51 kind-10015 interests/topics list.
export class TopicListReader extends ListReader {
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
}

export class TopicListBuilder extends ListBuilder<TopicListReader> {
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

export const TopicList = new Kind({
  reader: TopicListReader,
  builder: TopicListBuilder,
  router: OutboxRouter,
})
