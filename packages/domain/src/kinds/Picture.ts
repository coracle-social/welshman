import {removeUndefined, spec, uniq} from "@welshman/lib"
import {PICTURE_NOTE, matchTags, tagSpec, tagValue, tagValues, topicTags} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter, TagParser} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"
import type {KindContext} from "../core/Kind.js"

/**
 * One image, as described by a NIP-92 `imeta` tag. `fallbacks` and `extra` are
 * always present when read; `extra` holds the `key value` entries this type
 * doesn't model (NIP-68's `annotate-user`, say) so editing a picture doesn't drop
 * what another client wrote.
 */
export type PictureImage = {
  url: string
  mimeType?: string
  blurhash?: string
  dim?: string
  alt?: string
  hash?: string
  fallbacks?: string[]
  extra?: string[]
}

// An imeta entry is a single string, its key separated from its value by a space —
// and the value may itself contain spaces, as alt text does.
const parseEntry = (entry: string): [string, string] => {
  const index = entry.indexOf(" ")

  return index === -1 ? [entry, ""] : [entry.slice(0, index), entry.slice(index + 1)]
}

const parseImage = (tag: string[]): PictureImage | undefined => {
  const fallbacks: string[] = []
  const extra: string[] = []
  const image: PictureImage = {url: "", fallbacks, extra}

  for (const entry of tag.slice(1)) {
    const [key, value] = parseEntry(entry)

    switch (key) {
      case "url":
        image.url = value
        break
      case "m":
        image.mimeType = value
        break
      case "blurhash":
        image.blurhash = value
        break
      case "dim":
        image.dim = value
        break
      case "alt":
        image.alt = value
        break
      case "x":
        image.hash = value
        break
      case "fallback":
        fallbacks.push(value)
        break
      default:
        extra.push(entry)
    }
  }

  if (image.url) {
    return image
  }
}

const parseImages = (tags: string[][]) =>
  removeUndefined(matchTags(tagSpec("imeta"), tags).map(parseImage))

const renderImage = (image: PictureImage) => {
  const entries: [string, string | undefined][] = [
    ["url", image.url],
    ["m", image.mimeType],
    ["blurhash", image.blurhash],
    ["dim", image.dim],
    ["alt", image.alt],
    ["x", image.hash],
  ]

  return [
    "imeta",
    ...entries.filter(([, value]) => value).map(([key, value]) => `${key} ${value}`),
    ...(image.fallbacks ?? []).map(url => `fallback ${url}`),
    ...(image.extra ?? []),
  ]
}

// NIP-68 kind-20 picture event. The content is the description; every image is an
// `imeta` tag.
export class PictureReader extends EventReader {
  title() {
    return tagValue(tagSpec("title"), this.event.tags)
  }

  images(): PictureImage[] {
    return parseImages(this.event.tags)
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

  setImages(images: PictureImage[]) {
    return this.dropTags(spec(["imeta"])).addTags(...images.map(renderImage))
  }

  addImage(image: PictureImage) {
    return this.setImages([...this.imagesWithout(image.url), image])
  }

  removeImage(url: string) {
    return this.setImages(this.imagesWithout(url))
  }

  private imagesWithout(url: string) {
    return parseImages(this.extraTags).filter(image => image.url !== url)
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

    if (!this.extraTags.some(spec(["imeta"]))) {
      throw new Error("A picture event must have at least one image")
    }
  }

  // NIP-68 repeats each image's hash and mime type at the top level so pictures can
  // be found by them without reading every imeta tag.
  protected renderDomainTags() {
    const images = parseImages(this.extraTags)
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
