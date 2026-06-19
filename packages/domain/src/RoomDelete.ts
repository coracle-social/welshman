import {ROOM_DELETE, getTagValues} from "@welshman/util"
import {EventReader, EventBuilder} from "./base.js"

// NIP-29 kind-9008 delete-room/tombstone op. A regular event that may carry
// MULTIPLE group id ("h") tags, allowing a single delete event to tombstone
// several rooms at once. Tags-only content.
//
// Note: unlike most kinds, "h" here is a repeatable identity tag (the rooms to
// delete), not the base's single behavior group. So we handle "h" explicitly —
// hs() reads them all, the builder emits one tag per id, and "h" is reserved —
// and we do NOT use the base group accessor/setter.
export class RoomDelete extends EventReader {
  static kind = ROOM_DELETE

  protected validate() {
    if (this.hs().length === 0) {
      throw new Error("RoomDelete requires at least one h tag")
    }
  }

  protected reservedTagKeys() {
    return ["h"]
  }

  // All group ids tombstoned by this event.
  hs() {
    return getTagValues("h", this.event.tags)
  }

  // Convenience accessor for the first group id.
  h() {
    return this.hs()[0]
  }

  builder() {
    const builder = new RoomDeleteBuilder()

    builder.hs = this.hs()

    this.seedBuilder(builder)

    // "h" here is a repeatable room-id tag emitted by buildTags(), not the base's
    // single behavior group. seedBuilder copies the first "h" into builder.group,
    // which would make the base emit a duplicate "h" tag — so clear it.
    builder.group = undefined

    return builder
  }
}

export class RoomDeleteBuilder extends EventBuilder {
  static kind = ROOM_DELETE

  hs: string[] = []

  addRoom(h: string) {
    if (!this.hs.includes(h)) {
      this.hs.push(h)
    }

    return this
  }

  removeRoom(h: string) {
    this.hs = this.hs.filter(value => value !== h)

    return this
  }

  protected validate() {
    if (this.hs.length === 0) {
      throw new Error("RoomDelete requires at least one h tag")
    }
  }

  protected buildTags() {
    return this.hs.map(h => ["h", h])
  }
}
