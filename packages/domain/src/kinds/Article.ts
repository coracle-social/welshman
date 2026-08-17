import {spec} from "@welshman/lib"
import {LONG_FORM, tagSpec, tagValue, tagValues, topicTags} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"

// NIP-23 kind-30023 long-form article.
export class ArticleReader extends EventReader {
  title() {
    return tagValue(tagSpec("title"), this.event.tags)
  }

  summary() {
    return tagValue(tagSpec("summary"), this.event.tags)
  }

  image() {
    return tagValue(tagSpec("image"), this.event.tags)
  }

  // Articles are addressable, so created_at moves on every edit. published_at is when the
  // article first went out, which is what a reader cares about.
  publishedAt() {
    const value = parseInt(tagValue(tagSpec("published_at"), this.event.tags) || "")

    return isNaN(value) ? this.event.created_at : value
  }

  topics() {
    return tagValues(topicTags("t"), this.event.tags)
  }
}

export class ArticleWriter extends EventWriter<ArticleReader> {
  setTitle(title: string) {
    return this.dropTags(spec(["title"])).addTags(["title", title])
  }

  setSummary(summary: string) {
    return this.dropTags(spec(["summary"])).addTags(["summary", summary])
  }

  setImage(image: string) {
    return this.dropTags(spec(["image"])).addTags(["image", image])
  }

  setPublishedAt(publishedAt: number) {
    return this.dropTags(spec(["published_at"])).addTags(["published_at", String(publishedAt)])
  }

  setTopics(topics: string[]) {
    return this.dropTags(spec(["t"])).addTags(...topics.map(topic => ["t", topic]))
  }
}

export const Article = new KindFactory({
  kind: LONG_FORM,
  reader: ArticleReader,
  writer: ArticleWriter,
})
