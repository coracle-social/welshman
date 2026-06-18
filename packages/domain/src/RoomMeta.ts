import {randomId} from "@welshman/lib"
import {ROOM_META, getIdentifier, getTag, getTagValue} from "@welshman/util"
import type {EventTemplate, TrustedEvent} from "@welshman/util"
import {DomainObject} from "./base.js"

export type RoomMetaValues = {
  h: string
  name?: string
  about?: string
  picture?: string
  pictureMeta?: string[]
  isClosed: boolean
  isHidden: boolean
  isPrivate: boolean
  isRestricted: boolean
  livekit: boolean
}

export const makeRoomMetaValues = (values: Partial<RoomMetaValues> = {}): RoomMetaValues => ({
  h: values.h || randomId(),
  isClosed: false,
  isHidden: false,
  isPrivate: false,
  isRestricted: false,
  livekit: false,
  ...values,
})

// NIP-29 kind-39000 relay-generated group metadata. Addressable, with the group
// id ("h") stored in the "d" tag. Tags-only content, so it extends DomainObject
// directly rather than the encryptable list base.
export class RoomMeta extends DomainObject<RoomMetaValues> {
  readonly kind = ROOM_META
  values = makeRoomMetaValues()

  protected normalizeValues(values: Partial<RoomMetaValues> = {}) {
    return makeRoomMetaValues(values)
  }

  protected parseEvent(event: TrustedEvent): Partial<RoomMetaValues> {
    const pic = getTag("picture", event.tags)

    return {
      h: getIdentifier(event) || "",
      name: getTagValue("name", event.tags),
      about: getTagValue("about", event.tags),
      picture: pic?.[1],
      pictureMeta: pic ? pic.slice(2) : undefined,
      isClosed: Boolean(getTag("closed", event.tags)),
      isHidden: Boolean(getTag("hidden", event.tags)),
      isPrivate: Boolean(getTag("private", event.tags)),
      isRestricted: Boolean(getTag("restricted", event.tags)),
      livekit: Boolean(getTag("livekit", event.tags)),
    }
  }

  h() {
    return this.values.h
  }

  name() {
    return this.values.name
  }

  about() {
    return this.values.about
  }

  picture() {
    return this.values.picture
  }

  pictureMeta() {
    return this.values.pictureMeta
  }

  isClosed() {
    return this.values.isClosed
  }

  isHidden() {
    return this.values.isHidden
  }

  isPrivate() {
    return this.values.isPrivate
  }

  isRestricted() {
    return this.values.isRestricted
  }

  livekit() {
    return this.values.livekit
  }

  async toTemplate(): Promise<EventTemplate> {
    const tags: string[][] = [["d", this.values.h]]

    if (this.values.name) tags.push(["name", this.values.name])
    if (this.values.about) tags.push(["about", this.values.about])

    if (this.values.picture) {
      tags.push(["picture", this.values.picture, ...(this.values.pictureMeta || [])])
    }

    if (this.values.isClosed) tags.push(["closed"])
    if (this.values.isHidden) tags.push(["hidden"])
    if (this.values.isPrivate) tags.push(["private"])
    if (this.values.isRestricted) tags.push(["restricted"])
    if (this.values.livekit) tags.push(["livekit"])

    return {kind: this.kind, tags, content: ""}
  }
}
