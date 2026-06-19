import {uniq} from "@welshman/lib"
import {BLOSSOM_SERVERS, getTagValues, normalizeRelayUrl} from "@welshman/util"
import {ListReader, ListBuilder} from "./List.js"

// Blossom BUD-03 user server list (kind 10063). Server endpoints are stored as
// `["server", url]` tags (NOT the `r`/`relay` tags used by relay lists), so the
// generic relay-tag helpers would miss them. Effectively public-only.
export class BlossomServerList extends ListReader {
  static kind = BLOSSOM_SERVERS

  servers() {
    return uniq(getTagValues("server", this.tags()).map(normalizeRelayUrl))
  }

  includes(url: string) {
    return this.servers().includes(normalizeRelayUrl(url))
  }

  builder() {
    return this.seedList(new BlossomServerListBuilder())
  }
}

export class BlossomServerListBuilder extends ListBuilder {
  static kind = BLOSSOM_SERVERS

  addServer(url: string) {
    return this.addPublicTags(["server", normalizeRelayUrl(url)])
  }

  removeServer(url: string) {
    return this.removeTagsWithValue(normalizeRelayUrl(url))
  }

  setServers(urls: string[]) {
    this.clearTags()

    return this.addPublicTags(...urls.map(url => ["server", normalizeRelayUrl(url)]))
  }
}
