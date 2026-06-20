import {uniq, nthEq, normalizeUrl} from "@welshman/lib"
import {BLOSSOM_SERVERS, getTagValues} from "@welshman/util"
import {ListReader} from "../ListReader.js"
import {ListBuilder} from "../ListBuilder.js"

// Blossom BUD-03 kind-10063 user server list.
export class BlossomServerList extends ListReader {
  readonly kind = BLOSSOM_SERVERS

  urls() {
    return uniq(getTagValues("server", this.tags()).map(url => normalizeUrl(url)))
  }

  includes(url: string) {
    return this.urls().includes(normalizeUrl(url))
  }

  builder() {
    return new BlossomServerListBuilder(this)
  }
}

export class BlossomServerListBuilder extends ListBuilder<BlossomServerList> {
  readonly kind = BLOSSOM_SERVERS

  addUrl(url: string) {
    return this.addPublic(["server", normalizeUrl(url)])
  }

  removeUrl(url: string) {
    return this.drop(nthEq(1, normalizeUrl(url)))
  }

  setUrls(urls: string[]) {
    this.clear()

    return this.addPublic(...urls.map(url => ["server", normalizeUrl(url)]))
  }
}
