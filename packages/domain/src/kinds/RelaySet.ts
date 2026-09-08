import {uniq, spec} from "@welshman/lib"
import {
  NAMED_RELAYS,
  relayTags,
  tagSpec,
  tagValue,
  tagValueMatcher,
  tagValues,
  normalizeRelayUrl,
} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"

const urlSpec = relayTags("relay")

// NIP-51 kind-30002 relay set.
export class RelaySetReader extends EventReader {
  title() {
    return tagValue(tagSpec("title"), this.event.tags)
  }

  description() {
    return tagValue(tagSpec("description"), this.event.tags)
  }

  image() {
    return tagValue(tagSpec("image"), this.event.tags)
  }

  urls() {
    return uniq(tagValues(urlSpec, this.tags()))
  }
}

export class RelaySetWriter extends EventWriter<RelaySetReader> {
  setTitle(title: string) {
    return this.dropTags(spec(["title"])).addTags(["title", title])
  }

  setDescription(description: string) {
    return this.dropTags(spec(["description"])).addTags(["description", description])
  }

  setImage(image: string) {
    return this.dropTags(spec(["image"])).addTags(["image", image])
  }

  addUrl(url: string) {
    const normalized = normalizeRelayUrl(url)

    return this.dropTags(tagValueMatcher(urlSpec, normalized)).addTags(["relay", normalized])
  }

  removeUrl(url: string) {
    return this.dropTags(tagValueMatcher(urlSpec, normalizeRelayUrl(url)))
  }

  setUrls(urls: string[]) {
    return this.dropTags(spec(["relay"])).addTags(
      ...urls.map(url => ["relay", normalizeRelayUrl(url)]),
    )
  }
}

export class RelaySetQuery extends EventQuery {
  protected renderRoutes() {
    return this.authorRoutes()
  }
}

export const RelaySet = new KindFactory({
  kind: NAMED_RELAYS,
  reader: RelaySetReader,
  writer: RelaySetWriter,
  query: RelaySetQuery,
})
