import {spec} from "@welshman/lib"
import {NAMED_BOOKMARKS, tagSpec, tagValue} from "@welshman/util"
import {BookmarkListReader, BookmarkListWriter} from "./BookmarkList.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"

// NIP-51 kind-30003 bookmark set — a named, addressable bookmark list.
export class BookmarkSetReader extends BookmarkListReader {
  title() {
    return tagValue(tagSpec("title"), this.event.tags)
  }

  description() {
    return tagValue(tagSpec("description"), this.event.tags)
  }

  image() {
    return tagValue(tagSpec("image"), this.event.tags)
  }
}

export class BookmarkSetWriter extends BookmarkListWriter<BookmarkSetReader> {
  setTitle(title: string) {
    return this.dropPublic(spec(["title"])).addPublic(["title", title])
  }

  setDescription(description: string) {
    return this.dropPublic(spec(["description"])).addPublic(["description", description])
  }

  setImage(image: string) {
    return this.dropPublic(spec(["image"])).addPublic(["image", image])
  }
}

export class BookmarkSetQuery extends EventQuery {
  protected renderRoutes() {
    return this.authorRoutes()
  }
}

export const BookmarkSet = new KindFactory({
  kind: NAMED_BOOKMARKS,
  reader: BookmarkSetReader,
  writer: BookmarkSetWriter,
  query: BookmarkSetQuery,
})
