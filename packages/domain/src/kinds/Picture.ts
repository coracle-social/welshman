import {removeUndefined, spec, uniq} from "@welshman/lib"
import {PICTURE_NOTE, tagSpec, tagValue, tagValues, topicTags} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter, TagParser} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"
import type {KindContext} from "../core/Kind.js"

// NIP-68 kind-20 picture event. The content is the description; every image is an
// `imeta` tag, read through the reader's `imeta()`.
export class PictureReader extends EventReader {
  title() {
    return tagValue(tagSpec("title"), this.event.tags)
  }

  topics() {
    return tagValues(topicTags("t"), this.event.tags)
  }

  location() {
    return tagValue(tagSpec("location"), this.event.tags)
  }

  geohash() {
    return tagValue(tagSpec("g"), this.event.tags)
  }
}

export class PictureWriter extends EventWriter<PictureReader> {
  constructor(kind: number, context: KindContext, reader?: PictureReader) {
    super(kind, context, reader)

    const parser = new TagParser(this.extraTags)

    parser.consume("x")
    parser.consume("m")
    this.extraTags = parser.tags
  }

  setTitle(title: string) {
    return this.dropTags(spec(["title"])).addTags(["title", title])
  }

  setTopics(topics: string[]) {
    return this.dropTags(spec(["t"])).addTags(...topics.map(topic => ["t", topic]))
  }

  setLocation(location: string) {
    return this.dropTags(spec(["location"])).addTags(["location", location])
  }

  setGeohash(geohash: string) {
    return this.dropTags(spec(["g"])).addTags(["g", geohash])
  }

  validate() {
    super.validate()

    if (this.imeta().length === 0) {
      throw new Error("A picture event must have at least one image")
    }
  }

  // NIP-68 repeats each image's hash and mime type at the top level so pictures can
  // be found by them without reading every imeta tag.
  protected renderDomainTags() {
    const images = this.imeta()
    const hashes = uniq(removeUndefined(images.map(image => image.hash)))
    const mimeTypes = uniq(removeUndefined(images.map(image => image.mimeType)))

    return [...hashes.map(hash => ["x", hash]), ...mimeTypes.map(mimeType => ["m", mimeType])]
  }
}

export class PictureQuery extends EventQuery {
  protected renderRoutes() {
    return [...this.authorRoutes(), ...this.mentionRoutes()]
  }
}

export const Picture = new KindFactory({
  kind: PICTURE_NOTE,
  reader: PictureReader,
  writer: PictureWriter,
  query: PictureQuery,
})
