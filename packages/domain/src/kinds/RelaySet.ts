import {randomId, uniqBy} from "@welshman/lib"
import {NAMED_RELAYS, getTagValue, getTagValues, normalizeRelayUrl} from "@welshman/util"
import {ListReader} from "../ListReader.js"
import {ListBuilder} from "../ListBuilder.js"

// Metadata tag keys re-emitted from the builder's dedicated fields; the d tag is
// the addressable identifier and is handled separately.
const META_TAG_KEYS = ["d", "title", "description", "image"]

// NIP-51 kind-30002 relay set: an addressable, named collection of relays
// identified by its `d` tag. Entries are marker-less ['relay', url] tags (like
// the other NIP-51 relay lists, NOT NIP-65 'r' tags with read/write markers).
// It also carries optional set metadata (title/description/image) used to label
// the set in UIs.
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

  identifier = randomId()
  title?: string
  description?: string
  image?: string

  constructor(readonly reader?: RelaySet) {
    super(reader)

    // The list base splices every non-behavior tag into publicTags. Pull the
    // d/title/description/image metadata into dedicated fields and drop them from
    // publicTags so the marker-less relay entries are all that remain there.
    this.identifier = getTagValue("d", this.publicTags) || randomId()
    this.title = getTagValue("title", this.publicTags)
    this.description = getTagValue("description", this.publicTags)
    this.image = getTagValue("image", this.publicTags)
    this.publicTags = this.publicTags.filter(t => !META_TAG_KEYS.includes(t[0]))
  }

  setIdentifier(identifier: string) {
    this.identifier = identifier

    return this
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

  addRelay(url: string) {
    return this.addPublic(["relay", normalizeRelayUrl(url)])
  }

  removeRelay(url: string) {
    return this.drop(t => t[1] === url)
  }

  setRelays(urls: string[]) {
    // Replace only the relay entries; preserve the set's metadata fields.
    this.dropPublic(t => t[0] === "relay")

    return this.addPublic(...urls.map(url => ["relay", normalizeRelayUrl(url)]))
  }

  protected validate() {
    if (!this.identifier) {
      throw new Error("RelaySet requires a d identifier")
    }
  }

  protected buildTags() {
    const tags: string[][] = [["d", this.identifier]]

    if (this.title) tags.push(["title", this.title])
    if (this.description) tags.push(["description", this.description])
    if (this.image) tags.push(["image", this.image])

    // Append the public list entries (relay tags); the base re-encrypts the
    // private tags into content separately.
    return [...tags, ...this.publicTags]
  }
}
