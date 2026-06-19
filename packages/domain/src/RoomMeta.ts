import {randomId} from "@welshman/lib"
import {ROOM_META, getTag, getTagValue} from "@welshman/util"
import {EventReader, EventBuilder} from "./base.js"

// NIP-29 kind-39000 relay-generated group metadata. Addressable, with the group
// id ("h") stored in the "d" tag. Tags-only content.
export class RoomMeta extends EventReader {
  static kind = ROOM_META

  protected validate() {
    if (!this.identifier()) {
      throw new Error("RoomMeta requires a d tag")
    }
  }

  protected reservedTagKeys() {
    return ["d", "name", "about", "picture", "closed", "hidden", "private", "restricted", "livekit"]
  }

  // The group id is the addressable identifier (the "d" tag).
  h() {
    return this.identifier()
  }

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

  builder() {
    const builder = new RoomMetaBuilder()

    builder.h = this.identifier() || ""
    builder.name = this.name()
    builder.about = this.about()
    builder.picture = this.picture()
    builder.pictureMeta = this.pictureMeta()
    builder.closed = this.isClosed()
    builder.hidden = this.isHidden()
    builder.isPrivate = this.isPrivate()
    builder.restricted = this.isRestricted()
    builder.livekit = this.livekit()

    return this.seedBuilder(builder)
  }
}

export class RoomMetaBuilder extends EventBuilder {
  static kind = ROOM_META

  h = randomId()
  name?: string
  about?: string
  picture?: string
  pictureMeta?: string[]
  closed = false
  hidden = false
  isPrivate = false
  restricted = false
  livekit = false

  setName(name: string) {
    this.name = name

    return this
  }

  setAbout(about: string) {
    this.about = about

    return this
  }

  setPicture(picture: string, meta?: string[]) {
    this.picture = picture
    this.pictureMeta = meta

    return this
  }

  protected validate() {
    if (!this.h) {
      throw new Error("RoomMeta requires an h/d identifier")
    }
  }

  protected buildTags() {
    const tags: string[][] = [["d", this.h]]

    if (this.name) tags.push(["name", this.name])
    if (this.about) tags.push(["about", this.about])
    if (this.picture) tags.push(["picture", this.picture, ...(this.pictureMeta || [])])
    if (this.closed) tags.push(["closed"])
    if (this.hidden) tags.push(["hidden"])
    if (this.isPrivate) tags.push(["private"])
    if (this.restricted) tags.push(["restricted"])
    if (this.livekit) tags.push(["livekit"])

    return tags
  }
}
