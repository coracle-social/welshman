import type {UnsignedEvent} from 'nostr-tools'
import {nip19} from 'nostr-tools'
import {GROUP_DEFINITION, COMMUNITY_DEFINITION} from './Kinds'
import {Tags} from './Tags'

export const isGroupAddress = (a: string) => a.startsWith(`${GROUP_DEFINITION}:`)

export const isCommunityAddress = (a: string) => a.startsWith(`${COMMUNITY_DEFINITION}:`)

export const isCommunityOrGroupAddress = (a: string) => isCommunityAddress(a) || isGroupAddress(a)

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
    new Address(e.kind, e.pubkey, Tags.fromEvent(e).whereKey("d").values().first(), relays)

  static fromTagValue = (a: string, relays: string[] = []) => {
    const [kind, pubkey, identifier] = a.split(":")

    return new Address(kind, pubkey, identifier, relays)
  }

  static fromTag = (tag: string[], relays: string[] = []) => {
    const [a, hint] = tag.slice(1)

    if (hint) {
      relays = relays.concat(hint)
    }

    return this.fromTagValue(a, relays)
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

  asTagValue = () => [this.kind, this.pubkey, this.identifier].join(":")

  asTag = (mark?: string) => {
    const tag = ["a", this.asTagValue(), this.relays[0] || ""]

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
