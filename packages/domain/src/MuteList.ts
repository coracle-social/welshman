import {uniq} from "@welshman/lib"
import {MUTES, getPubkeyTagValues} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import type {ISigner} from "@welshman/signer"
import {EncryptableList, decryptListContent} from "./List.js"

/**
 * A NIP-51 kind-10000 mute list. Pubkeys can be muted publicly (in tags) or
 * privately (in encrypted content); the convenience accessors here treat both
 * as one merged set.
 *
 * @example
 * const mutes = await MuteList.parse(event, signer) // decrypts if able
 * mutes.addPrivately(pubkey1)
 * mutes.remove(pubkey2)                              // public and private
 * mutes.pubkeys                                      // merged
 * mutes.includes(pubkey)
 * const signed = await mutes.toEvent(signer)         // encrypts + signs
 */
export class MuteList extends EncryptableList {
  readonly kind = MUTES

  /** Create an empty, decrypted mute list (e.g. for a user with none yet). */
  static make() {
    return new MuteList()
  }

  /**
   * Parse a kind-10000 event into a `MuteList`, decrypting its private entries
   * when a capable signer is supplied. Throws on the wrong kind.
   */
  static async parse(event: TrustedEvent, signer?: ISigner) {
    if (event.kind !== MUTES) {
      throw new Error(`Expected a kind ${MUTES} event, got kind ${event.kind}`)
    }

    const {privateTags, decrypted} = await decryptListContent(event, signer)

    return new MuteList({event, publicTags: event.tags, privateTags, decrypted})
  }

  /** The muted pubkeys, merging public and (when decrypted) private entries. */
  get pubkeys() {
    return uniq(getPubkeyTagValues(this.getTags()))
  }

  /** Whether `pubkey` is muted, publicly or privately. */
  includes(pubkey: string) {
    return this.pubkeys.includes(pubkey)
  }

  /** Mute a pubkey publicly (visible to anyone who reads the event). */
  addPublicly(pubkey: string) {
    return this.addPublicTags(["p", pubkey])
  }

  /** Mute a pubkey privately (stored in encrypted content). */
  addPrivately(pubkey: string) {
    return this.addPrivateTags(["p", pubkey])
  }

  /** Unmute a pubkey, removing it from both public and private entries. */
  remove(pubkey: string) {
    return this.removeTagsByValue(pubkey)
  }
}
