import {uniq, spec, normalizeUrl} from "@welshman/lib"
import {BLOSSOM_SERVERS, getTagValues} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventWriter} from "../EventWriter.js"
import {KindFactory} from "../Kind.js"

// Blossom BUD-03 kind-10063 user server list.
export class BlossomServerListReader extends EventReader {
  readonly kind = BLOSSOM_SERVERS

  urls() {
    return uniq(getTagValues("server", this.tags()).map(url => normalizeUrl(url)))
  }

  includes(url: string) {
    return this.urls().includes(normalizeUrl(url))
  }
}

export class BlossomServerListWriter extends EventWriter<BlossomServerListReader> {
  readonly kind = BLOSSOM_SERVERS

  addUrl(url: string) {
    return this.addTags(["server", normalizeUrl(url)])
  }

  removeUrl(url: string) {
    return this.dropTags(spec(["server", normalizeUrl(url)]))
  }

  setUrls(urls: string[]) {
    return this.dropTags(spec(["server"])).addTags(
      ...urls.map(url => ["server", normalizeUrl(url)]),
    )
  }
}

export const BlossomServerList = new KindFactory({
  reader: BlossomServerListReader,
  writer: BlossomServerListWriter,
})
