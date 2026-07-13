import {spec} from "@welshman/lib"
import {ROOM_META, getTag, getTagValue} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventWriter} from "../EventWriter.js"
import {KindFactory} from "../Kind.js"

// NIP-29 kind-39000 room metadata.
export class RoomMetaReader extends EventReader {
  readonly kind = ROOM_META

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

  hasLivekit() {
    return this.event.tags.some(spec(["livekit"]))
  }
}

export class RoomMetaWriter extends EventWriter<RoomMetaReader> {
  readonly kind = ROOM_META
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
}

export const RoomMeta = new KindFactory({
  reader: RoomMetaReader,
  writer: RoomMetaWriter,
})
