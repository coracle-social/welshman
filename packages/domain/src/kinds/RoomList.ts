import {nth, uniq, spec, partition, indexBy} from "@welshman/lib"
import {
  ROOMS,
  matchTags,
  tagSpec,
  tagValues,
  isRelayUrl,
  normalizeRelayUrl,
  relays,
  userOutbox,
} from "@welshman/util"
import {ListReader} from "../core/ListReader.js"
import {ListWriter} from "../core/ListWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"

// Room tags (`h`, and the `group` tag NIP-51 uses for this list) carry the room
// id at t[1] and a relay hint at t[2].
const roomSpec = tagSpec(["h", "group"])

const matchesUrl = (normalized: string, value = "") =>
  isRelayUrl(value) && normalizeRelayUrl(value) === normalized

// Every relay a room list references: its `r` relays plus the relay hints on its
// room tags, normalized and deduped.
const getUrls = (tags: string[][]) =>
  uniq(
    [...tagValues(tagSpec("r"), tags), ...matchTags(roomSpec, tags).map(nth(2))]
      .filter(isRelayUrl)
      .map(normalizeRelayUrl),
  )

// NIP-51 kind-10009 room membership list (NIP-29 "simple groups").
export class RoomListReader extends ListReader {
  rooms() {
    return tagValues(roomSpec, this.tags())
  }

  roomTags() {
    return matchTags(roomSpec, this.tags())
  }

  relays() {
    return tagValues(tagSpec("r"), this.tags())
  }

  urls() {
    return getUrls(this.tags())
  }

  roomsForUrl(url: string) {
    const normalized = normalizeRelayUrl(url)

    return matchTags(roomSpec, this.tags())
      .filter(t => matchesUrl(normalized, t[2]))
      .map(nth(1))
  }
}

export class RoomListWriter extends ListWriter<RoomListReader> {
  // Every relay this event routes to has to receive it, so lift the scenario's
  // default limit, which is tuned for reads and would drop most of them.
  async scenario() {
    return (await super.scenario()).limit(Infinity)
  }

  // Publishes to every relay this list references — both its current urls and the
  // ones it used to have (via the seed reader) — so each relay learns of the user's
  // membership changes.
  protected async renderRoutes() {
    const original = this.reader?.urls() ?? []
    const current = getUrls(await this.renderTags())

    return [userOutbox(), ...relays(uniq([...original, ...current]))]
  }

  addRoom(roomId: string, url: string) {
    return this.addRelay(url).addPublic(["group", roomId, url])
  }

  removeRoom(roomId: string, url?: string) {
    const normalized = url ? normalizeRelayUrl(url) : undefined

    return this.dropTags(
      t =>
        t[0] === "group" &&
        t[1] === roomId &&
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

  // Replace the relay set, in the given order. Existing tags are reused so any extra values
  // they carry survive a reorder, and non-relay tags are left alone.
  setRelays(urls: string[]) {
    const orderedUrls = uniq(urls.map(normalizeRelayUrl))
    const [relayTags, otherTags] = partition(spec(["r"]), this.publicTags)
    const relayTagByUrl = indexBy(t => normalizeRelayUrl(t[1]), relayTags)

    this.publicTags = [
      ...orderedUrls.map(url => relayTagByUrl.get(url) ?? ["r", url]),
      ...otherTags,
    ]

    return this
  }

  // Point every reference to a relay at its new url, keeping the rooms listed under it.
  migrateRelay(oldUrl: string, newUrl: string) {
    const from = normalizeRelayUrl(oldUrl)
    const to = normalizeRelayUrl(newUrl)

    const rewrite = (tags: string[][]) =>
      tags.map(t => {
        if (t[0] === "r" && matchesUrl(from, t[1])) return ["r", to]
        if (t[0] === "group" && matchesUrl(from, t[2])) return ["group", t[1], to]

        return t
      })

    this.publicTags = rewrite(this.publicTags)
    this.privateTags = rewrite(this.privateTags)

    return this
  }
}

export class RoomListQuery extends EventQuery {
  protected renderRoutes() {
    return this.authorRoutes()
  }
}

export const RoomList = new KindFactory({
  kind: ROOMS,
  reader: RoomListReader,
  writer: RoomListWriter,
  query: RoomListQuery,
})
