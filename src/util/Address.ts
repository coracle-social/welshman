import type {UnsignedEvent} from 'nostr-tools'
import {nip19} from 'nostr-tools'
import {GROUP_DEFINITION, COMMUNITY_DEFINITION} from './Kinds'
import {Tags} from './Tags'

export const isGroupAddress = (a: string) => a.startsWith(`${GROUP_DEFINITION}:`)

export const isCommunityAddress = (a: string) => a.startsWith(`${COMMUNITY_DEFINITION}:`)

export const isContextAddress = (a: string) => isCommunityAddress(a) || isGroupAddress(a)

export class Address {
  readonly kind: number

  constructor(
    kind: string | number,
    readonly pubkey: string,
    readonly identifier: string,
    readonly relays: string[],
  ) {
    this.kind = parseInt(kind as string)
    this.identifier = identifier || ""
  }

  static fromEvent = (e: UnsignedEvent, relays: string[] = []) =>
    new Address(e.kind, e.pubkey, Tags.fromEvent(e).get("d")?.value() || "", relays)

  static fromRaw = (a: string, relays: string[] = []) => {
    const [kind, pubkey, identifier] = a.split(":")

    return new Address(kind, pubkey, identifier, relays)
  }

  static fromNaddr = (naddr: string) => {
    let type
    let data = {} as any
    try {
      ({type, data} = nip19.decode(naddr) as {
        type: "naddr"
        data: any
      })
    } catch (e) {
      // pass
    }

    if (type !== "naddr") {
      throw new Error(`Invalid naddr ${naddr}`)
    }

    return new Address(data.kind, data.pubkey, data.identifier, data.relays)
  }

  asRaw = () => [this.kind, this.pubkey, this.identifier].join(":")

  asTag = (mark?: string) => {
    const tag = ["a", this.asRaw(), this.relays[0] || ""]

    if (mark) {
      tag.push(mark)
    }

    return tag
  }

  asNaddr = () => nip19.naddrEncode(this)

  asFilter = () => ({
    kinds: [this.kind],
    authors: [this.pubkey],
    "#d": [this.identifier],
  })
}
