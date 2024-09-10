import {FOLLOWS, asDecryptedEvent, readList} from '@welshman/util'
import {type TrustedEvent, type PublishedList} from '@welshman/util'
import {type SubscribeRequestWithHandlers} from "@welshman/net"
import {deriveEventsMapped, withGetter} from '@welshman/store'
import {repository, load} from './core'
import {collection} from './collection'
import {ensurePlaintext} from './plaintext'
import {loadRelaySelections} from './relaySelections'

export const follows = withGetter(
  deriveEventsMapped<PublishedList>(repository, {
    filters: [{kinds: [FOLLOWS]}],
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
  indexStore: followsByPubkey,
  deriveItem: deriveFollows,
  loadItem: loadFollows,
} = collection({
  name: "follows",
  store: follows,
  getKey: follows => follows.event.pubkey,
  load: async (pubkey: string, request: Partial<SubscribeRequestWithHandlers> = {}) => {
    await loadRelaySelections(pubkey, request)
    await load({...request, filters: [{kinds: [FOLLOWS], authors: [pubkey]}]})
  },
})
