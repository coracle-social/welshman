import {nth, uniq, uniqBy, remove} from "@welshman/lib"
import {RELAYS, getRelayTags, normalizeRelayUrl} from "@welshman/util"
import {ListReader} from "../ListReader.js"
import {ListBuilder} from "../ListBuilder.js"

const getUrls = (tags: string[][], mode?: string) =>
  uniqBy(
    normalizeRelayUrl,
    getRelayTags(tags)
      .filter(t => !mode || !t[2] || t[2] === mode)
      .map(nth(1)),
  )

// NIP-65 kind-10002 relay list.
export class RelayList extends ListReader {
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

  builder() {
    return new RelayListBuilder(this)
  }
}

export class RelayListBuilder extends ListBuilder<RelayList> {
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

    return this.publicTags.find(t => t[0] === "r" && normalizeRelayUrl(t[1]) === normalized)
  }

  private addUrlForMode(url: string, mode: "read" | "write") {
    const existing = this.findUrlTag(url)
    const alt = mode === "read" ? "write" : "read"

    if (!existing) {
      this.publicTags.push(["r", normalizeRelayUrl(url), mode])
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
        this.publicTags = remove(existing, this.publicTags)
      }
    }

    return this
  }

  setReadUrls(urls: string[]) {
    return this.setUrlsForModes(urls, getUrls(this.publicTags, "write"))
  }

  setWriteUrls(urls: string[]) {
    return this.setUrlsForModes(getUrls(this.publicTags, "read"), urls)
  }

  private setUrlsForModes(readUrls: string[], writeUrls: string[]) {
    const read = new Set(readUrls.map(normalizeRelayUrl))
    const write = new Set(writeUrls.map(normalizeRelayUrl))
    const otherTags = this.publicTags.filter(t => t[0] !== "r")
    const relayTags = uniq([...read, ...write]).map(url =>
      read.has(url) && write.has(url)
        ? ["r", url]
        : read.has(url)
          ? ["r", url, "read"]
          : ["r", url, "write"],
    )

    this.publicTags = [...otherTags, ...relayTags]

    return this
  }

  setTags(tags: string[][]) {
    this.publicTags = tags

    return this
  }
}
