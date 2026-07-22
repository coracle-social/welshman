import {decode, npubEncode, nprofileEncode} from "nostr-tools/nip19"
import {isHex32} from "@welshman/lib"

export class Pubkey {
  constructor(
    readonly pubkey: string,
    readonly relays: string[] = [],
  ) {}

  static from(entity: string, relays: string[] = []) {
    let pubkey: string
    if (isHex32(entity)) {
      pubkey = entity
    } else {
      const {type, data} = decode(entity) as any

      if (type === "npub") {
        pubkey = data
      } else if (type === "nprofile") {
        pubkey = data.pubkey
      } else {
        throw new Error(`Invalid pubkey: ${entity}`)
      }
    }

    return new Pubkey(pubkey, relays)
  }

  toString = () => this.pubkey

  toNpub = () => npubEncode(this.pubkey)

  toNprofile = () => nprofileEncode(this)
}
