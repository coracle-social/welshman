import {uniq, nthEq} from "@welshman/lib"
import {BLOSSOM_SERVERS, getTagValues, normalizeRelayUrl} from "@welshman/util"
import {ListReader} from "../ListReader.js"
import {ListBuilder} from "../ListBuilder.js"

// Blossom BUD-03 user server list (kind 10063). Server endpoints are stored as
// `["server", url]` tags (NOT the `r`/`relay` tags used by relay lists), so the
// generic relay-tag helpers would miss them. Effectively public-only.
export class BlossomServerList extends ListReader {
  readonly kind = BLOSSOM_SERVERS

  servers() {
    return uniq(getTagValues("server", this.tags()).map(normalizeRelayUrl))
  }

  includes(url: string) {
    return this.servers().includes(normalizeRelayUrl(url))
  }

  builder() {
    return new BlossomServerListBuilder(this)
  }
}

export class BlossomServerListBuilder extends ListBuilder<BlossomServerList> {
  readonly kind = BLOSSOM_SERVERS

  addServer(url: string) {
    return this.addPublic(["server", normalizeRelayUrl(url)])
  }

  removeServer(url: string) {
    return this.drop(nthEq(1, normalizeRelayUrl(url)))
  }

  setServers(urls: string[]) {
    this.clear()

    return this.addPublic(...urls.map(url => ["server", normalizeRelayUrl(url)]))
  }
}
