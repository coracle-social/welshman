import {MUTES, asDecryptedEvent, readList} from '@welshman/util'
import {type TrustedEvent, type PublishedList} from '@welshman/util'
import {type SubscribeRequest} from "@welshman/net"
import {deriveEventsMapped, withGetter} from '@welshman/store'
import {repository, load} from './core'
import {collection} from './collection'
import {ensurePlaintext} from './plaintext'
import {getWriteRelayUrls, loadRelaySelections} from './relaySelections'

export const mutes = withGetter(
  deriveEventsMapped<PublishedList>(repository, {
    filters: [{kinds: [MUTES]}],
    itemToEvent: item => item.event,
    eventToItem: async (event: TrustedEvent) =>
      readList(
        asDecryptedEvent(event, {
          content: await ensurePlaintext(event),
        }),
      ),
  })
)

export const {
  indexStore: mutesByPubkey,
  deriveItem: deriveMutes,
  loadItem: loadMutes,
} = collection({
  name: "mutes",
  store: mutes,
  getKey: mute => mute.event.pubkey,
  load: async (pubkey: string, hints = [], request: Partial<SubscribeRequest> = {}) => {
    const relays = getWriteRelayUrls(await loadRelaySelections(pubkey, hints))

    return load({
      ...request,
      relays: [...relays, ...hints],
      filters: [{kinds: [MUTES], authors: [pubkey]}],
    })
  },
})
