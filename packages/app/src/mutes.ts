import {MUTES, getListValues, asDecryptedEvent, readList} from '@welshman/util'
import {type TrustedEvent, type PublishedList} from '@welshman/util'
import {type SubscribeRequestWithHandlers} from "@welshman/net"
import {deriveEventsMapped, withGetter} from '@welshman/store'
import {repository, load} from './core'
import {collection} from './collection'
import {ensurePlaintext} from './plaintext'
import {loadRelaySelections} from './relaySelections'

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
  load: async (pubkey: string, request: Partial<SubscribeRequestWithHandlers> = {}) => {
    await loadRelaySelections(pubkey, request)
    await load({...request, filters: [{kinds: [MUTES], authors: [pubkey]}]})
  },
})


export const getMutes = (pubkey: string) =>
  getListValues("p", mutesByPubkey.get().get(pubkey))

