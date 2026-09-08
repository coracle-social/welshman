import {spec} from "@welshman/lib"
import {ROOM_EDIT_META, matchTag, tagSpec, tagValue} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"

// NIP-29 kind-9002 edit-room-metadata action op. Carries the same metadata as the
// addressable RoomMeta (kind 39000), but as a regular event scoped to the target
// room via the "h" tag rather than a "d" identifier.
export class RoomEditReader extends EventReader {
  name() {
    return tagValue(tagSpec("name"), this.event.tags)
  }

  about() {
    return tagValue(tagSpec("about"), this.event.tags)
  }

  picture() {
    return tagValue(tagSpec("picture"), this.event.tags)
  }

  pictureMeta() {
    return matchTag(tagSpec("picture"), this.event.tags)?.slice(2)
  }

  isClosed() {
    return this.event.tags.some(spec(["closed"]))
  }

  isHidden() {
    return this.event.tags.some(spec(["hidden"]))
  }

  isPrivate() {
    return this.event.tags.some(spec(["private"]))
  }

  isRestricted() {
    return this.event.tags.some(spec(["restricted"]))
  }

  livekit() {
    return this.event.tags.some(spec(["livekit"]))
  }
}

export class RoomEditWriter extends EventWriter<RoomEditReader> {
  readonly requiresRelays = true

  setName(name: string) {
    return this.dropTags(spec(["name"])).addTags(["name", name])
  }

  setAbout(about: string) {
    return this.dropTags(spec(["about"])).addTags(["about", about])
  }

  setPicture(picture: string, meta: string[] = []) {
    return this.dropTags(spec(["picture"])).addTags(["picture", picture, ...meta])
  }

  setClosed(closed = true) {
    this.dropTags(spec(["closed"]))

    return closed ? this.addTags(["closed"]) : this
  }

  setHidden(hidden = true) {
    this.dropTags(spec(["hidden"]))

    return hidden ? this.addTags(["hidden"]) : this
  }

  setPrivate(isPrivate = true) {
    this.dropTags(spec(["private"]))

    return isPrivate ? this.addTags(["private"]) : this
  }

  setRestricted(restricted = true) {
    this.dropTags(spec(["restricted"]))

    return restricted ? this.addTags(["restricted"]) : this
  }

  setLivekit(livekit = true) {
    this.dropTags(spec(["livekit"]))

    return livekit ? this.addTags(["livekit"]) : this
  }

  validate() {
    super.validate()

    if (!this.roomTag) {
      throw new Error("RoomEdit requires a room")
    }
  }
}

export class RoomEditQuery extends EventQuery {
  protected renderRoutes() {
    return []
  }
}

export const RoomEdit = new KindFactory({
  kind: ROOM_EDIT_META,
  reader: RoomEditReader,
  writer: RoomEditWriter,
  query: RoomEditQuery,
})
