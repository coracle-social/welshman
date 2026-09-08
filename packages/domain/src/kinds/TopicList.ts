import {uniq, spec} from "@welshman/lib"
import {TOPICS, addressTags, tagValues, topicTags} from "@welshman/util"
import {ListReader} from "../core/ListReader.js"
import {ListWriter} from "../core/ListWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"

// NIP-51 kind-10015 interests/topics list.
export class TopicListReader extends ListReader {
  topics() {
    return uniq(tagValues(topicTags("t"), this.tags()))
  }

  addresses() {
    return uniq(tagValues(addressTags("a"), this.tags()))
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

export class TopicListQuery extends EventQuery {
  protected renderRoutes() {
    return this.authorRoutes()
  }
}

export const TopicList = new KindFactory({
  kind: TOPICS,
  reader: TopicListReader,
  writer: TopicListWriter,
  query: TopicListQuery,
})
