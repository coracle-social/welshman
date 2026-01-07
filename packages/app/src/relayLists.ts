import {
  RELAYS,
  asDecryptedEvent,
  readList,
  TrustedEvent,
  getRelaysFromList,
  RelayMode,
} from "@welshman/util"
import {
  deriveItemsByKey,
  deriveItems,
  makeForceLoadItem,
  makeLoadItem,
  makeDeriveItem,
  getter,
} from "@welshman/store"
import {load} from "@welshman/net"
import {Router, addMinimalFallbacks} from "@welshman/router"
import {repository} from "./core.js"

export const fetchRelayList = async (pubkey: string, relayHints: string[] = []) => {
  const filters = [{kinds: [RELAYS], authors: [pubkey]}]

  await Promise.all([
    load({filters, relays: Router.get().FromRelays(relayHints).getUrls()}),
    load({filters, relays: Router.get().FromPubkey(pubkey).getUrls()}),
    load({filters, relays: Router.get().Index().getUrls()}),
  ])
}

export const relayListsByPubkey = deriveItemsByKey({
  repository,
  eventToItem: (event: TrustedEvent) => readList(asDecryptedEvent(event)),
  filters: [{kinds: [RELAYS]}],
  getKey: relayList => relayList.event.pubkey,
})

export const relayLists = deriveItems(relayListsByPubkey)

export const getRelayListsByPubkey = getter(relayListsByPubkey)

export const getRelayLists = getter(relayLists)

export const getRelayList = (pubkey: string) => getRelayListsByPubkey().get(pubkey)

export const forceLoadRelayList = makeForceLoadItem(fetchRelayList, getRelayList)

export const loadRelayList = makeLoadItem(fetchRelayList, getRelayList)

export const deriveRelayList = makeDeriveItem(relayListsByPubkey, loadRelayList)

// Outbox loader

export const makeOutboxLoader =
  (kind: number) =>
  async (pubkey: string, relayHints: string[] = []) => {
    const filters = [{kinds: [kind], authors: [pubkey]}]
    const relays = Router.get().FromRelays(relayHints).policy(addMinimalFallbacks).getUrls()

    await Promise.all([
      load({filters, relays}),
      loadRelayList(pubkey).then(async () => {
        const relayList = getRelayList(pubkey)
        const writeRelays = getRelaysFromList(relayList, RelayMode.Write)
        const relays = Router.get().FromRelays(writeRelays).getUrls()

        await load({filters, relays})
      }),
    ])
  }
