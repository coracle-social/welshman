import {first, randomId} from "@welshman/lib"
import {ROOM_META, getTag, getTagValue} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-29 kind-39000 relay-generated group metadata. Addressable, with the group
// id ("h") stored in the "d" tag. Tags-only content.
export class RoomMeta extends EventReader {
  readonly kind = ROOM_META

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
    return new RoomMetaBuilder(this)
  }
}

export class RoomMetaBuilder extends EventBuilder<RoomMeta> {
  readonly kind = ROOM_META

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

  constructor(readonly reader?: RoomMeta) {
    super(reader)

    // Consume the represented tags out of the carried-over extraTags so they
    // round-trip through the structured fields below rather than being emitted
    // twice (once from buildTags, once from the base's extraTags pass-through).
    const d = first(this.consumeTags("d"))
    const picture = first(this.consumeTags("picture"))

    this.h = d?.[1] || randomId()
    this.name = first(this.consumeTags("name"))?.[1]
    this.about = first(this.consumeTags("about"))?.[1]
    this.picture = picture?.[1]
    this.pictureMeta = picture ? picture.slice(2) : undefined
    this.closed = this.consumeTags("closed").length > 0
    this.hidden = this.consumeTags("hidden").length > 0
    this.isPrivate = this.consumeTags("private").length > 0
    this.restricted = this.consumeTags("restricted").length > 0
    this.livekit = this.consumeTags("livekit").length > 0
  }

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
