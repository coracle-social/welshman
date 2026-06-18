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

const vowels = "a,e,i,o,u,ay,ey,oy,ou,ia,ea,ough,oo,ee,argh".split(",")

const consonants =
  "p,b,t,d,k,g,ch,sh,th,f,v,s,z,l,r,m,n,pl,bl,cl,gl,pr,br,tr,dr,kr,gr,fl,sl,fr,thr,str,sk,sp,st".split(
    ",",
  )

// Generate a random NIP-29 group id ("h" / "d" tag value).
export const generateH = () => {
  const n = (6 + Math.random() * 2) | 0
  const s = [consonants, vowels]

  if (Math.random() < 0.5) {
    s.reverse()
  }

  return (
    Array.from({length: n}, (_, i) =>
      s[i % 2].splice((Math.random() * s[i % 2].length) | 0, 1),
    ).join("") +
    (1 + Math.floor(Math.random() * 9))
  )
}

export const makeRoomMetaValues = (values: Partial<RoomMetaValues> = {}): RoomMetaValues => ({
  h: values.h || generateH(),
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
