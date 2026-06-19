import {ROOM_DELETE, getTagValues} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-29 kind-9008 delete-room/tombstone op. A regular event that may carry
// MULTIPLE group id ("h") tags, allowing a single delete event to tombstone
// several rooms at once. Tags-only content.
//
// Note: unlike most kinds, "h" here is a repeatable identity tag (the rooms to
// delete), not the base's single behavior group. So we handle "h" explicitly —
// hs() reads them all, the builder emits one tag per id, and the base group is
// cleared — and we do NOT use the base group accessor/setter.
export class RoomDelete extends EventReader {
  readonly kind = ROOM_DELETE

  // All group ids tombstoned by this event.
  hs() {
    return getTagValues("h", this.event.tags)
  }

  // Convenience accessor for the first group id.
  h() {
    return this.hs()[0]
  }

  builder() {
    return new RoomDeleteBuilder(this)
  }
}

export class RoomDeleteBuilder extends EventBuilder<RoomDelete> {
  readonly kind = ROOM_DELETE

  hs: string[] = []

  constructor(readonly reader?: RoomDelete) {
    super(reader)

    // "h" here is a repeatable room-id tag emitted by buildTags(), not the base's
    // single behavior group. The base's constructor already consumed EVERY "h" out
    // of extraTags but kept only the first as groupTag, so recover the full set
    // from the reader and clear groupTag so the base doesn't emit a duplicate "h".
    this.hs = reader?.hs() ?? []
    this.groupTag = undefined
  }

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
