import {randomId, uniqBy} from "@welshman/lib"
import {NAMED_RELAYS, getTagValue, getTagValues, normalizeRelayUrl} from "@welshman/util"
import {ListReader, ListBuilder} from "./List.js"

// NIP-51 kind-30002 relay set: an addressable, named collection of relays
// identified by its `d` tag. Entries are marker-less ['relay', url] tags (like
// the other NIP-51 relay lists, NOT NIP-65 'r' tags with read/write markers).
// It also carries optional set metadata (title/description/image) used to label
// the set in UIs.
export class RelaySet extends ListReader {
  static kind = NAMED_RELAYS

  protected validate() {
    if (!this.identifier()) {
      throw new Error("RelaySet requires a d tag")
    }
  }

  protected reservedTagKeys() {
    return ["d", "title", "description", "image", "relay"]
  }

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
    const builder = new RelaySetBuilder()

    builder.identifier = this.identifier() || ""
    builder.title = this.title()
    builder.description = this.description()
    builder.image = this.image()

    this.seedList(builder)

    // The d/title/description/image tags are re-emitted from the dedicated
    // fields above, so drop them from the carried-over public entries to avoid
    // duplication. The marker-less relay entries stay as public list tags.
    builder.publicTags = builder.publicTags.filter(
      t => !["d", "title", "description", "image"].includes(t[0]),
    )

    return builder
  }
}

export class RelaySetBuilder extends ListBuilder {
  static kind = NAMED_RELAYS

  identifier = randomId()
  title?: string
  description?: string
  image?: string

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
    return this.addPublicTags(["relay", normalizeRelayUrl(url)])
  }

  removeRelay(url: string) {
    return this.removeTagsWithValue(url)
  }

  setRelays(urls: string[]) {
    // Replace only the relay entries; preserve the set's d/title/description/image metadata.
    this.removeTagsWithKey("relay")

    return this.addPublicTags(...urls.map(url => ["relay", normalizeRelayUrl(url)]))
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
