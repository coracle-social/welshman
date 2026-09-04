import {uniq, spec, normalizeUrl} from "@welshman/lib"
import {BLOSSOM_SERVERS, tagSpec, tagValueMatcher, tagValues} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"

const urlSpec = tagSpec("server", undefined, (url: string) => normalizeUrl(url))

// Blossom BUD-03 kind-10063 user server list.
export class BlossomServerListReader extends EventReader {
  urls() {
    return uniq(tagValues(urlSpec, this.tags()))
  }

  includes(url: string) {
    return this.urls().includes(normalizeUrl(url))
  }
}

export class BlossomServerListWriter extends EventWriter<BlossomServerListReader> {
  addUrl(url: string) {
    const normalized = normalizeUrl(url)

    return this.dropTags(tagValueMatcher(urlSpec, normalized)).addTags(["server", normalized])
  }

  removeUrl(url: string) {
    return this.dropTags(tagValueMatcher(urlSpec, normalizeUrl(url)))
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
