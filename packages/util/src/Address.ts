import {decode, naddrEncode} from "nostr-tools/nip19"

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
    readonly relays: string[] = [],
  ) {}

  static isAddress(address: string) {
    return Boolean(address.match(/^\d+:\w+:.*$/))
  }

  static from(address: string, relays: string[] = []) {
    const [kind, pubkey, identifier = ""] = address.match(/^(\d+):(\w+):(.*)$/)!.slice(1)

    return new Address(parseInt(kind), pubkey, identifier, relays)
  }

  static fromNaddr(naddr: string) {
    let decoded: any

    try {
      decoded = decode(naddr)
    } catch (e) {
      // pass
    }

    if (decoded?.type !== "naddr") {
      throw new Error(`Invalid naddr ${naddr}`)
    }

    const {kind, pubkey, identifier, relays} = decoded.data

    return new Address(kind, pubkey, identifier, relays)
  }

  static fromEvent(event: AddressableEvent, relays: string[] = []) {
    const identifier = event.tags.find(t => t[0] === "d")?.[1] || ""

    return new Address(event.kind, event.pubkey, identifier, relays)
  }

  toString = () => `${this.kind}:${this.pubkey}:${this.identifier}`

  toNaddr = () => naddrEncode(this)
}

// Utils

export const getAddress = (e: AddressableEvent) => Address.fromEvent(e).toString()
