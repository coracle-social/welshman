import {uniq, remove} from "@welshman/lib"
import {
  RELAYS,
  matchTags,
  relayTags,
  tagValueExtractor,
  normalizeRelayUrl,
  relays,
  indexers,
} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"

const urlSpec = relayTags(["r", "relay"])

const getUrls = (tags: string[][], mode?: string) =>
  uniq(
    matchTags(urlSpec, tags)
      .filter(t => !mode || !t[2] || t[2] === mode)
      .map(tagValueExtractor(urlSpec)),
  )

// NIP-65 kind-10002 relay list.
export class RelayListReader extends EventReader {
  urls() {
    return getUrls(this.tags())
  }

  readUrls() {
    return getUrls(this.tags(), "read")
  }

  writeUrls() {
    return getUrls(this.tags(), "write")
  }
}

export class RelayListWriter extends EventWriter<RelayListReader> {
  // Every relay this event routes to has to receive it, so lift the scenario's
  // default limit, which is tuned for reads and would drop most of them.
  async scenario() {
    return (await super.scenario()).limit(Infinity)
  }

  // Kind 10002 is indexed, and publishes to every relay the list references — both
  // its current urls and the ones it used to have (via the seed reader) — so each
  // relay learns when it's added to or removed from the list. The user's outbox is
  // read off this same list, so it needs no separate route.
  protected async renderRoutes() {
    const original = this.reader?.urls() ?? []
    const current = getUrls(await this.renderTags())

    return [indexers(), ...relays(uniq([...original, ...current]))]
  }

  addReadUrl(url: string) {
    return this.addUrlForMode(url, "read")
  }

  addWriteUrl(url: string) {
    return this.addUrlForMode(url, "write")
  }

  removeReadUrl(url: string) {
    return this.removeUrlForMode(url, "read")
  }

  removeWriteUrl(url: string) {
    return this.removeUrlForMode(url, "write")
  }

  private findUrlTag(url: string) {
    const normalized = normalizeRelayUrl(url)

    return this.extraTags.find(
      t => t[0] === "r" && normalizeRelayUrl(t[1] as string) === normalized,
    )
  }

  private addUrlForMode(url: string, mode: "read" | "write") {
    const existing = this.findUrlTag(url)
    const alt = mode === "read" ? "write" : "read"

    if (!existing) {
      this.extraTags.push(["r", normalizeRelayUrl(url), mode])
    } else if (existing[2] === alt) {
      existing.splice(2)
    }

    return this
  }

  private removeUrlForMode(url: string, mode: "read" | "write") {
    const existing = this.findUrlTag(url)
    const alt = mode === "read" ? "write" : "read"

    if (existing) {
      if (!existing[2]) {
        existing[2] = alt
      } else if (existing[2] === mode) {
        this.extraTags = remove(existing, this.extraTags)
      }
    }

    return this
  }

  setReadUrls(urls: string[]) {
    return this.setUrlsForModes(urls, getUrls(this.extraTags as string[][], "write"))
  }

  setWriteUrls(urls: string[]) {
    return this.setUrlsForModes(getUrls(this.extraTags as string[][], "read"), urls)
  }

  private setUrlsForModes(readUrls: string[], writeUrls: string[]) {
    const read = new Set(readUrls.map(normalizeRelayUrl))
    const write = new Set(writeUrls.map(normalizeRelayUrl))
    const otherTags = this.extraTags.filter(t => t[0] !== "r")
    const relayTags = uniq([...read, ...write]).map(url =>
      read.has(url) && write.has(url)
        ? ["r", url]
        : read.has(url)
          ? ["r", url, "read"]
          : ["r", url, "write"],
    )

    this.extraTags = [...otherTags, ...relayTags]

    return this
  }

  setTags(tags: string[][]) {
    this.extraTags = tags

    return this
  }
}

export class RelayListQuery extends EventQuery {
  protected renderRoutes() {
    return [...this.authorRoutes(), indexers()]
  }
}

export const RelayList = new KindFactory({
  kind: RELAYS,
  reader: RelayListReader,
  writer: RelayListWriter,
  query: RelayListQuery,
})
