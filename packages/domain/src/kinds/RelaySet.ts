import {uniqBy} from "@welshman/lib"
import {NAMED_RELAYS, getTagValue, getTagValues, normalizeRelayUrl} from "@welshman/util"
import {ListReader} from "../ListReader.js"
import {ListBuilder} from "../ListBuilder.js"

const META_TAG_KEYS = ["title", "description", "image"]

// NIP-51 kind-30002 relay set.
export class RelaySet extends ListReader {
  readonly kind = NAMED_RELAYS

  title() {
    return getTagValue("title", this.event.tags)
  }

  description() {
    return getTagValue("description", this.event.tags)
  }

  image() {
    return getTagValue("image", this.event.tags)
  }

  urls() {
    return uniqBy(normalizeRelayUrl, getTagValues("relay", this.tags()))
  }

  builder() {
    return new RelaySetBuilder(this)
  }
}

export class RelaySetBuilder extends ListBuilder<RelaySet> {
  readonly kind = NAMED_RELAYS

  title?: string
  description?: string
  image?: string

  constructor(readonly reader?: RelaySet) {
    super(reader)

    this.title = getTagValue("title", this.publicTags)
    this.description = getTagValue("description", this.publicTags)
    this.image = getTagValue("image", this.publicTags)
    this.publicTags = this.publicTags.filter(t => !META_TAG_KEYS.includes(t[0]))
  }

  setTitle(title: string) {
    this.title = title

    return this
  }

  setDescription(description: string) {
    this.description = description

    return this
  }

  setImage(image: string) {
    this.image = image

    return this
  }

  addUrl(url: string) {
    return this.addPublic(["relay", normalizeRelayUrl(url)])
  }

  removeUrl(url: string) {
    return this.drop(t => t[1] === url)
  }

  setUrls(urls: string[]) {
    this.dropPublic(t => t[0] === "relay")

    return this.addPublic(...urls.map(url => ["relay", normalizeRelayUrl(url)]))
  }

  protected buildTags() {
    const tags: string[][] = []

    if (this.title) tags.push(["title", this.title])
    if (this.description) tags.push(["description", this.description])
    if (this.image) tags.push(["image", this.image])

    return [...tags, ...this.publicTags]
  }
}
