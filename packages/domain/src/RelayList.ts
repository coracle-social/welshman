import {uniq, uniqBy} from "@welshman/lib"
import {RELAYS, RelayMode, getRelayTags, getRelayTagValues, normalizeRelayUrl} from "@welshman/util"
import {ListReader, ListBuilder} from "./List.js"

// NIP-65 kind-10002 relay list (the outbox-model routing substrate). Entries are
// `["r", url, mode?]` tags where `mode` is RelayMode.Read or RelayMode.Write; a
// missing marker means the relay is used for both read and write. NIP-65 entries
// are public in practice, so mutations target the public tag set.
export class RelayList extends ListReader {
  static kind = RELAYS

  // All relay urls, deduped by normalized url.
  urls() {
    return uniqBy(normalizeRelayUrl, getRelayTagValues(this.tags()))
  }

  // Relays usable for reading: includes modeless (both) entries.
  readUrls() {
    return uniqBy(
      normalizeRelayUrl,
      getRelayTags(this.tags())
        .filter(t => !t[2] || t[2] === RelayMode.Read)
        .map(t => t[1]),
    )
  }

  // Relays usable for writing: includes modeless (both) entries.
  writeUrls() {
    return uniqBy(
      normalizeRelayUrl,
      getRelayTags(this.tags())
        .filter(t => !t[2] || t[2] === RelayMode.Write)
        .map(t => t[1]),
    )
  }

  builder() {
    return this.seedList(new RelayListBuilder())
  }
}

export class RelayListBuilder extends ListBuilder {
  static kind = RELAYS

  // Relays usable for reading: includes modeless (both) entries.
  readUrls() {
    return uniqBy(
      normalizeRelayUrl,
      getRelayTags(this.publicTags)
        .filter(t => !t[2] || t[2] === RelayMode.Read)
        .map(t => t[1]),
    )
  }

  // Relays usable for writing: includes modeless (both) entries.
  writeUrls() {
    return uniqBy(
      normalizeRelayUrl,
      getRelayTags(this.publicTags)
        .filter(t => !t[2] || t[2] === RelayMode.Write)
        .map(t => t[1]),
    )
  }

  // Upsert a relay for a given mode. If an existing entry already covered the
  // complementary mode (or was modeless), collapse to a modeless ["r", url] tag;
  // otherwise store ["r", url, mode].
  addRelay(url: string, mode: RelayMode) {
    const normalized = normalizeRelayUrl(url)
    const existing = getRelayTags(this.publicTags).filter(
      t => normalizeRelayUrl(t[1]) === normalized,
    )

    // Modes already covered by existing entries (undefined marker = both).
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

  // Remove a relay for a given mode while preserving the alternate. A
  // modeless/both entry is downgraded to the alternate mode; an entry that only
  // covered `mode` is fully removed.
  removeRelay(url: string, mode: RelayMode) {
    const normalized = normalizeRelayUrl(url)
    const existing = getRelayTags(this.publicTags).filter(
      t => normalizeRelayUrl(t[1]) === normalized,
    )

    const alt = mode === RelayMode.Read ? RelayMode.Write : RelayMode.Read

    // Keep the alternate if any existing entry was modeless/both or the alt mode.
    const keepAlt = existing.some(t => !t[2] || t[2] === alt)

    this.publicTags = this.publicTags.filter(
      t => !(t[0] === "r" && normalizeRelayUrl(t[1]) === normalized),
    )

    if (keepAlt) {
      this.publicTags.push(["r", url, alt])
    }

    return this
  }

  // Replace the read set while PRESERVING every relay's write capability: a
  // relay that was write-capable (write-marked or modeless) stays writable, and
  // collapses back to a modeless ["r", url] tag if it's also in the new read set.
  setReadRelays(urls: string[]) {
    return this.setRelaysForModes(urls, this.writeUrls())
  }

  // Replace the write set while PRESERVING every relay's read capability.
  setWriteRelays(urls: string[]) {
    return this.setRelaysForModes(this.readUrls(), urls)
  }

  // Rebuild the public 'r' tag set from explicit read/write membership. A relay
  // in both sets is emitted modeless (both); otherwise it carries its single
  // mode marker. Non-'r' public tags are preserved.
  private setRelaysForModes(readUrls: string[], writeUrls: string[]) {
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

  // Replace the entire public tag set.
  setRelays(tags: string[][]) {
    this.publicTags = tags

    return this
  }
}
