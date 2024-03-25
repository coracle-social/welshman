import type {UnsignedEvent} from 'nostr-tools'
import {nip19} from 'nostr-tools'
import {GROUP_DEFINITION, COMMUNITY_DEFINITION} from './Kinds'

export type Address = {
  kind: number,
  pubkey: string
  identifier: string
  relays: string[]
}

// Plain text format

export const decodeAddress = (a: string, relays: string[] = []): Address => {
  const [kind, pubkey, identifier = ""] = a.split(":")

  return {kind: parseInt(kind), pubkey, identifier, relays}
}

export const encodeAddress = (a: Address) => [a.kind, a.pubkey, a.identifier].join(":")

// Naddr encoding

export const addressFromNaddr = (naddr: string): Address => {
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

  return data
}

export const addressToNaddr = (a: Address): string => nip19.naddrEncode(a)

// Get from event, encode to filter

export const getIdentifier = (e: UnsignedEvent) => e.tags.find(t => t[0] === "d")?.[1] || ""

export const addressFromEvent = (e: UnsignedEvent, relays: string[] = []) =>
  ({kind: e.kind, pubkey: e.pubkey, identifier: getIdentifier(e), relays})

export const addressToFilter = (a: Address) =>
  ({kinds: [a.kind], authors: [a.pubkey], "#d": [a.identifier]})

// Utils

export const isGroupAddress = (a: Address) => a.kind === GROUP_DEFINITION

export const isCommunityAddress = (a: Address) => a.kind === COMMUNITY_DEFINITION

export const isContextAddress = (a: Address) => [GROUP_DEFINITION, COMMUNITY_DEFINITION].includes(a.kind)
