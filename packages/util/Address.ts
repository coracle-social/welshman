import {nip19} from 'nostr-tools'
import {GROUP, COMMUNITY} from './Kinds'

// Define this locally to avoid circular dependencies
type AddressableEvent = {
  kind: number
  pubkey: string
  tags: string[][]
}

export class Address {
  constructor(
    readonly kind: number,
    readonly pubkey: string,
    readonly identifier: string,
    readonly relays: string[] = []
  ) {}

  static isAddress(address: string) {
    return Boolean(address.match(/^\d+:\w+:.*$/))
  }

  static from(address: string, relays: string[] = []) {
    const [kind, pubkey, identifier = ""] = address.match(/^(\d+):(\w+):(.*)$/)!.slice(1)

    return new Address(parseInt(kind), pubkey, identifier, relays)
  }

  static fromNaddr(naddr: string) {
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

  static fromEvent(event: AddressableEvent, relays: string[] = []) {
    const identifier = event.tags.find(t => t[0] === "d")?.[1] || ""

    return new Address(event.kind, event.pubkey, identifier, relays)
  }

  toString = () => [this.kind, this.pubkey, this.identifier].join(":")

  toNaddr = () => nip19.naddrEncode(this)
}

// Utils

export const getAddress = (e: AddressableEvent) => Address.fromEvent(e).toString()

export const isGroupAddress = (a: string, ...args: unknown[]) => Address.from(a).kind === GROUP

export const isCommunityAddress = (a: string, ...args: unknown[]) => Address.from(a).kind === COMMUNITY

export const isContextAddress = (a: string, ...args: unknown[]) => [GROUP, COMMUNITY].includes(Address.from(a).kind)
