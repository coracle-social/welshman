import {spec} from "@welshman/lib"
import {ROOM_EDIT_META, getTag, getTagValue} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"
import {ContentRouter} from "../EventRouter.js"
import {Kind} from "../Kind.js"

// NIP-29 kind-9002 edit-room-metadata action op. Carries the same metadata as the
// addressable RoomMeta (kind 39000), but as a regular event scoped to the target
// room via the "h" group tag rather than a "d" identifier.
export class RoomEditReader extends EventReader {
  readonly kind = ROOM_EDIT_META

  name() {
    return getTagValue("name", this.event.tags)
  }

  about() {
    return getTagValue("about", this.event.tags)
  }

  picture() {
    return getTag("picture", this.event.tags)?.[1]
  }

  pictureMeta() {
    const tag = getTag("picture", this.event.tags)

    return tag ? tag.slice(2) : undefined
  }

  isClosed() {
    return this.event.tags.some(t => t[0] === "closed")
  }

  isHidden() {
    return this.event.tags.some(t => t[0] === "hidden")
  }

  isPrivate() {
    return this.event.tags.some(t => t[0] === "private")
  }

  isRestricted() {
    return this.event.tags.some(t => t[0] === "restricted")
  }

  livekit() {
    return this.event.tags.some(t => t[0] === "livekit")
  }
}

export class RoomEditBuilder extends EventBuilder<RoomEditReader> {
  readonly kind = ROOM_EDIT_META

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

  protected validate() {
    super.validate()

    if (!this.groupTag) {
      throw new Error("RoomEdit requires a group")
    }
  }
}

export const RoomEdit = new Kind({
  reader: RoomEditReader,
  builder: RoomEditBuilder,
  router: ContentRouter,
})
