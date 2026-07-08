import {nth, uniq, uniqBy, remove} from "@welshman/lib"
import {RELAYS, getRelayTags, normalizeRelayUrl, relayHints, indexers} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"
import {EventRouter} from "../EventRouter.js"
import {Kind} from "../Kind.js"

const getUrls = (tags: string[][], mode?: string) =>
  uniqBy(
    normalizeRelayUrl,
    getRelayTags(tags)
      .filter(t => !mode || !t[2] || t[2] === mode)
      .map(nth(1)),
  )

// NIP-65 kind-10002 relay list.
export class RelayListReader extends EventReader {
  readonly kind = RELAYS

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

// Kind 10002 is indexed, and publishes to every relay the list references — both
// its current urls and the ones it used to have (via the builder's `before`
// reader), so each relay learns when it's added to or removed from the list.
export class RelayListRouter extends EventRouter<RelayListReader> {
  async routes() {
    const original = this.getReader()?.urls() ?? []
    const current = getUrls(await this.getTags())

    return [this.authorRoute(), indexers(), ...relayHints(uniq([...original, ...current]))]
  }
}

export class RelayListBuilder extends EventBuilder<RelayListReader> {
  readonly kind = RELAYS

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

    return this.extraTags.find(t => t[0] === "r" && normalizeRelayUrl(t[1]) === normalized)
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
    return this.setUrlsForModes(urls, getUrls(this.extraTags, "write"))
  }

  setWriteUrls(urls: string[]) {
    return this.setUrlsForModes(getUrls(this.extraTags, "read"), urls)
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

export const RelayList = new Kind({
  reader: RelayListReader,
  builder: RelayListBuilder,
  router: RelayListRouter,
})
