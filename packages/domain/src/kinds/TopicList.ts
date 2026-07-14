import {uniq, spec} from "@welshman/lib"
import {TOPICS, getTopicTagValues, getAddressTagValues} from "@welshman/util"
import {ListReader} from "../core/ListReader.js"
import {ListWriter} from "../core/ListWriter.js"
import {KindFactory} from "../core/Kind.js"

// NIP-51 kind-10015 interests/topics list.
export class TopicListReader extends ListReader {
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

export class TopicListWriter extends ListWriter<TopicListReader> {
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

export const TopicList = new KindFactory({
  kind: TOPICS,
  reader: TopicListReader,
  writer: TopicListWriter,
})
