import {uniqBy} from "@welshman/lib"
import {NAMED_RELAYS, getTagValue, getTagValues, normalizeRelayUrl} from "@welshman/util"
import {EncryptableList} from "./List.js"

// NIP-51 kind-30002 relay set: an addressable, named collection of relays
// identified by its `d` tag. Entries are marker-less ['relay', url] tags (like
// the other NIP-51 relay lists, NOT NIP-65 'r' tags with read/write markers).
// It also carries optional set metadata (title/description/image) used to label
// the set in UIs.
export class RelaySet extends EncryptableList {
  readonly kind = NAMED_RELAYS

  identifier() {
    return getTagValue("d", this.tags()) || ""
  }

  title() {
    return getTagValue("title", this.tags())
  }

  description() {
    return getTagValue("description", this.tags())
  }

  image() {
    return getTagValue("image", this.tags())
  }

  urls() {
    return uniqBy(normalizeRelayUrl, getTagValues("relay", this.tags()))
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

  setIdentifier(identifier: string) {
    this.removeTagsWithKey("d")

    return this.addPublicTags(["d", identifier])
  }

  setTitle(title: string) {
    this.removeTagsWithKey("title")

    return this.addPublicTags(["title", title])
  }

  setDescription(description: string) {
    this.removeTagsWithKey("description")

    return this.addPublicTags(["description", description])
  }

  setImage(image: string) {
    this.removeTagsWithKey("image")

    return this.addPublicTags(["image", image])
  }
}
