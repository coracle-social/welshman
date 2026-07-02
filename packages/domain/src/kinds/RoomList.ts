import {nth, uniq} from "@welshman/lib"
import {
  ROOMS,
  getGroupTags,
  getGroupTagValues,
  getTagValues,
  isRelayUrl,
  normalizeRelayUrl,
} from "@welshman/util"
import {ListReader} from "../ListReader.js"
import {ListBuilder} from "../ListBuilder.js"

const matchesUrl = (normalized: string, value = "") =>
  isRelayUrl(value) && normalizeRelayUrl(value) === normalized

// NIP-51 kind-10009 simple-groups membership list.
export class RoomList extends ListReader {
  readonly kind = ROOMS

  groups() {
    return getGroupTagValues(this.tags())
  }

  groupTags() {
    return getGroupTags(this.tags())
  }

  relays() {
    return getTagValues("r", this.tags())
  }

  urls() {
    const hints = getGroupTags(this.tags()).map(nth(2))

    return uniq([...this.relays(), ...hints].filter(isRelayUrl).map(normalizeRelayUrl))
  }

  groupsForUrl(url: string) {
    const normalized = normalizeRelayUrl(url)

    return getGroupTags(this.tags())
      .filter(t => matchesUrl(normalized, t[2]))
      .map(nth(1))
  }

  builder() {
    return new RoomListBuilder(this)
  }
}

export class RoomListBuilder extends ListBuilder<RoomList> {
  readonly kind = ROOMS

  addGroup(groupId: string, url: string) {
    return this.addPublic(["group", groupId, url])
  }

  removeGroup(groupId: string, url?: string) {
    const normalized = url ? normalizeRelayUrl(url) : undefined

    return this.dropTags(
      t => t[0] === "group" && t[1] === groupId && (!normalized || matchesUrl(normalized, t[2])),
    )
  }

  addRelay(url: string) {
    const normalized = normalizeRelayUrl(url)
    const tags = [...this.publicTags, ...this.privateTags]

    if (!tags.some(t => t[0] === "r" && matchesUrl(normalized, t[1]))) {
      this.addPublic(["r", normalized])
    }

    return this
  }

  removeRelay(url: string) {
    const normalized = normalizeRelayUrl(url)

    return this.dropTags(
      t =>
        (t[0] === "r" && matchesUrl(normalized, t[1])) ||
        (t[0] === "group" && matchesUrl(normalized, t[2])),
    )
  }

  setRelays(urls: string[]) {
    const orderedUrls = uniq(urls.map(normalizeRelayUrl))
    const relayTags = orderedUrls.map(
      url => this.publicTags.find(t => t[0] === "r" && matchesUrl(url, t[1])) || ["r", url],
    )

    this.publicTags = [...relayTags, ...this.publicTags.filter(t => t[0] !== "r")]

    return this
  }
}
