import {uniq, spec, normalizeUrl} from "@welshman/lib"
import {BLOSSOM_SERVERS, getTagValues} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"

// Blossom BUD-03 kind-10063 user server list.
export class BlossomServerListReader extends EventReader {
  urls() {
    return uniq(getTagValues("server", this.tags()).map(url => normalizeUrl(url)))
  }

  includes(url: string) {
    return this.urls().includes(normalizeUrl(url))
  }
}

export class BlossomServerListWriter extends EventWriter<BlossomServerListReader> {
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
  kind: BLOSSOM_SERVERS,
  reader: BlossomServerListReader,
  writer: BlossomServerListWriter,
})
