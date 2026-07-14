import {nth, uniq} from "@welshman/lib"
import {
  ROOMS,
  getGroupTags,
  getGroupTagValues,
  getTagValues,
  isRelayUrl,
  normalizeRelayUrl,
  relays,
  userOutbox,
} from "@welshman/util"
import {ListReader} from "../core/ListReader.js"
import {ListWriter} from "../core/ListWriter.js"
import {KindFactory} from "../core/Kind.js"

const matchesUrl = (normalized: string, value = "") =>
  isRelayUrl(value) && normalizeRelayUrl(value) === normalized

// Every relay a room list references: its `r` relays plus the relay hints on its
// group tags, normalized and deduped.
const getUrls = (tags: string[][]) =>
  uniq(
    [...getTagValues("r", tags), ...getGroupTags(tags).map(nth(2))]
      .filter(isRelayUrl)
      .map(normalizeRelayUrl),
  )

// NIP-51 kind-10009 simple-groups membership list.
export class RoomListReader extends ListReader {
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
    return getUrls(this.tags())
  }

  groupsForUrl(url: string) {
    const normalized = normalizeRelayUrl(url)

    return getGroupTags(this.tags())
      .filter(t => matchesUrl(normalized, t[2]))
      .map(nth(1))
  }
}

export class RoomListWriter extends ListWriter<RoomListReader> {
  // Publishes to every relay this list references — both its current urls and the
  // ones it used to have (via the seed `reader`) — so each relay learns of the
  // user's membership changes.
  protected async routes() {
    const original = this.reader?.urls() ?? []
    const current = getUrls(await this.getTags())

    return [userOutbox(), ...relays(uniq([...original, ...current]))]
  }

  addGroup(groupId: string, url: string) {
    return this.addRelay(url).addPublic(["group", groupId, url])
  }

  removeGroup(groupId: string, url?: string) {
    const normalized = url ? normalizeRelayUrl(url) : undefined

    return this.dropTags(
      t =>
        t[0] === "group" &&
        t[1] === groupId &&
        (!normalized || matchesUrl(normalized, t[2] as string)),
    )
  }

  addRelay(url: string) {
    const normalized = normalizeRelayUrl(url)
    const tags = [...this.publicTags, ...this.privateTags]

    if (!tags.some(t => t[0] === "r" && matchesUrl(normalized, t[1] as string))) {
      this.addPublic(["r", normalized])
    }

    return this
  }

  removeRelay(url: string) {
    const normalized = normalizeRelayUrl(url)

    return this.dropTags(
      t =>
        (t[0] === "r" && matchesUrl(normalized, t[1] as string)) ||
        (t[0] === "group" && matchesUrl(normalized, t[2] as string)),
    )
  }
}

export const RoomList = new KindFactory({
  kind: ROOMS,
  reader: RoomListReader,
  writer: RoomListWriter,
})
