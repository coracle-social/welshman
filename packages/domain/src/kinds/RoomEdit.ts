import {first} from "@welshman/lib"
import {ROOM_EDIT_META, getTag, getTagValue} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-29 kind-9002 edit-room-metadata action op. Carries the same metadata as the
// addressable RoomMeta (kind 39000), but as a regular event scoped to the target
// room via the "h" group tag rather than a "d" identifier.
export class RoomEdit extends EventReader {
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

  builder() {
    return new RoomEditBuilder(this)
  }
}

export class RoomEditBuilder extends EventBuilder<RoomEdit> {
  readonly kind = ROOM_EDIT_META

  nameTag?: string[]
  aboutTag?: string[]
  pictureTag?: string[]
  closedTag?: string[]
  hiddenTag?: string[]
  privateTag?: string[]
  restrictedTag?: string[]
  livekitTag?: string[]

  constructor(readonly reader?: RoomEdit) {
    super(reader)

    this.nameTag = first(this.consumeTags("name"))
    this.aboutTag = first(this.consumeTags("about"))
    this.pictureTag = first(this.consumeTags("picture"))
    this.closedTag = first(this.consumeTags("closed"))
    this.hiddenTag = first(this.consumeTags("hidden"))
    this.privateTag = first(this.consumeTags("private"))
    this.restrictedTag = first(this.consumeTags("restricted"))
    this.livekitTag = first(this.consumeTags("livekit"))
  }

  setName(name: string) {
    this.nameTag = ["name", name]

    return this
  }

  setAbout(about: string) {
    this.aboutTag = ["about", about]

    return this
  }

  setPicture(picture: string, meta: string[] = []) {
    this.pictureTag = ["picture", picture, ...meta]

    return this
  }

  setClosed(closed = true) {
    this.closedTag = closed ? ["closed"] : undefined

    return this
  }

  setHidden(hidden = true) {
    this.hiddenTag = hidden ? ["hidden"] : undefined

    return this
  }

  setPrivate(isPrivate = true) {
    this.privateTag = isPrivate ? ["private"] : undefined

    return this
  }

  setRestricted(restricted = true) {
    this.restrictedTag = restricted ? ["restricted"] : undefined

    return this
  }

  setLivekit(livekit = true) {
    this.livekitTag = livekit ? ["livekit"] : undefined

    return this
  }

  protected buildTags() {
    const tags: string[][] = []

    if (this.nameTag) tags.push(this.nameTag)
    if (this.aboutTag) tags.push(this.aboutTag)
    if (this.pictureTag) tags.push(this.pictureTag)
    if (this.closedTag) tags.push(this.closedTag)
    if (this.hiddenTag) tags.push(this.hiddenTag)
    if (this.privateTag) tags.push(this.privateTag)
    if (this.restrictedTag) tags.push(this.restrictedTag)
    if (this.livekitTag) tags.push(this.livekitTag)

    return tags
  }
}
