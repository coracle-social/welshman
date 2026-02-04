import {decode, npubEncode, nprofileEncode} from "nostr-tools/nip19"

export class Pubkey {
  constructor(
    readonly pubkey: string,
    readonly relays: string[] = [],
  ) {}

  static from(entity: string, relays: string[] = []) {
    let pubkey: string
    if (entity.match(/^[0-9a-f]{64}$/)) {
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
