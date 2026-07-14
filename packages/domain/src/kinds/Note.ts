import {uniq} from "@welshman/lib"
import {
  NOTE,
  getReplyTags,
  getPubkeyTagValues,
  getAddress,
  isReplaceable,
  isShareableRelayUrl,
  outbox,
} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {hint} from "../core/Hint.js"
import {KindFactory} from "../core/Kind.js"

// NIP-01 kind-1 short text note.
export class NoteReader extends EventReader {}

export class NoteWriter extends EventWriter<NoteReader> {
  // NIP-10 reply threading: p-tag the parent's participants, then e/a-tag the
  // parent (and thread root) with the appropriate markers and relay hints.
  setParent(event: TrustedEvent) {
    for (const pubkey of uniq([event.pubkey, ...getPubkeyTagValues(event.tags)])) {
      this.addTags(this.tagPubkey(pubkey))
    }

    const {roots, replies} = getReplyTags(event.tags)
    const parents = roots.length > 0 ? roots : replies
    const mark = parents.length > 0 ? "reply" : "root"

    // If the parent carried roots use them, otherwise fall back to its replies.
    for (const [k, id, originalHint = "", , pubkey = ""] of parents) {
      const rootHint = isShareableRelayUrl(originalHint) ? originalHint : this.eventRootsHint(event)

      this.addTags([k, id, rootHint, "root", pubkey])
    }

    this.addTags(["e", event.id, hint(outbox(event.pubkey)), mark, event.pubkey])

    if (isReplaceable(event)) {
      this.addTags(["a", getAddress(event), hint(outbox(event.pubkey)), mark, event.pubkey])
    }

    return this
  }
}

export const Note = new KindFactory({
  kind: NOTE,
  reader: NoteReader,
  writer: NoteWriter,
})
