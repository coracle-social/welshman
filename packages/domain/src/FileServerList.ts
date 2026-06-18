import {uniq} from "@welshman/lib"
import {FILE_SERVERS, getTagValues, normalizeRelayUrl} from "@welshman/util"
import {EncryptableList} from "./List.js"

// NIP-96 file storage server list (kind 10096). Server endpoints are stored as
// `["server", url]` tags (NOT the `r`/`relay` tags used by relay lists), so the
// generic relay-tag helpers would miss them. Structurally identical to
// BlossomServerList; effectively public-only.
export class FileServerList extends EncryptableList {
  readonly kind = FILE_SERVERS

  servers() {
    return uniq(getTagValues("server", this.tags()).map(normalizeRelayUrl))
  }

  includes(url: string) {
    return this.servers().includes(url)
  }

  addServer(url: string) {
    return this.addPublicTags(["server", normalizeRelayUrl(url)])
  }

  removeServer(url: string) {
    return this.removeTagsWithValue(url)
  }

  setServers(urls: string[]) {
    this.keepTagsWithKey("server")

    return this.addPublicTags(...urls.map(url => ["server", normalizeRelayUrl(url)]))
  }
}
