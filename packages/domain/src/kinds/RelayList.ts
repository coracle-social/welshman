import {uniq, uniqBy} from "@welshman/lib"
import {RELAYS, RelayMode, getRelayTags, getRelayTagValues, normalizeRelayUrl} from "@welshman/util"
import {ListReader} from "../ListReader.js"
import {ListBuilder} from "../ListBuilder.js"

// NIP-65 kind-10002 relay list.
export class RelayList extends ListReader {
  readonly kind = RELAYS

  urls() {
    return uniqBy(normalizeRelayUrl, getRelayTagValues(this.tags()))
  }

  readUrls() {
    return uniqBy(
      normalizeRelayUrl,
      getRelayTags(this.tags())
        .filter(t => !t[2] || t[2] === RelayMode.Read)
        .map(t => t[1]),
    )
  }

  writeUrls() {
    return uniqBy(
      normalizeRelayUrl,
      getRelayTags(this.tags())
        .filter(t => !t[2] || t[2] === RelayMode.Write)
        .map(t => t[1]),
    )
  }

  builder() {
    return new RelayListBuilder(this)
  }
}

export class RelayListBuilder extends ListBuilder<RelayList> {
  readonly kind = RELAYS

  readUrls() {
    return uniqBy(
      normalizeRelayUrl,
      getRelayTags(this.publicTags)
        .filter(t => !t[2] || t[2] === RelayMode.Read)
        .map(t => t[1]),
    )
  }

  writeUrls() {
    return uniqBy(
      normalizeRelayUrl,
      getRelayTags(this.publicTags)
        .filter(t => !t[2] || t[2] === RelayMode.Write)
        .map(t => t[1]),
    )
  }

  addUrl(url: string, mode: RelayMode) {
    const normalized = normalizeRelayUrl(url)
    const existing = getRelayTags(this.publicTags).filter(
      t => normalizeRelayUrl(t[1]) === normalized,
    )

    const priorModes = new Set<RelayMode | undefined>(
      existing.map(t => t[2] as RelayMode | undefined),
    )

    const alt = mode === RelayMode.Read ? RelayMode.Write : RelayMode.Read
    const coversAlt = priorModes.has(undefined) || priorModes.has(alt)

    this.publicTags = this.publicTags.filter(
      t => !(t[0] === "r" && normalizeRelayUrl(t[1]) === normalized),
    )

    this.publicTags.push(coversAlt ? ["r", url] : ["r", url, mode])

    return this
  }

  removeUrl(url: string, mode: RelayMode) {
    const normalized = normalizeRelayUrl(url)
    const existing = getRelayTags(this.publicTags).filter(
      t => normalizeRelayUrl(t[1]) === normalized,
    )

    const alt = mode === RelayMode.Read ? RelayMode.Write : RelayMode.Read

    const keepAlt = existing.some(t => !t[2] || t[2] === alt)

    this.publicTags = this.publicTags.filter(
      t => !(t[0] === "r" && normalizeRelayUrl(t[1]) === normalized),
    )

    if (keepAlt) {
      this.publicTags.push(["r", url, alt])
    }

    return this
  }

  setReadUrls(urls: string[]) {
    return this.setUrlsForModes(urls, this.writeUrls())
  }

  setWriteUrls(urls: string[]) {
    return this.setUrlsForModes(this.readUrls(), urls)
  }

  private setUrlsForModes(readUrls: string[], writeUrls: string[]) {
    const read = new Set(readUrls.map(normalizeRelayUrl))
    const write = new Set(writeUrls.map(normalizeRelayUrl))
    const otherTags = this.publicTags.filter(t => t[0] !== "r")
    const relayTags = uniq([...read, ...write]).map(url =>
      read.has(url) && write.has(url)
        ? ["r", url]
        : read.has(url)
          ? ["r", url, RelayMode.Read]
          : ["r", url, RelayMode.Write],
    )

    this.publicTags = [...otherTags, ...relayTags]

    return this
  }

  setTags(tags: string[][]) {
    this.publicTags = tags

    return this
  }
}
