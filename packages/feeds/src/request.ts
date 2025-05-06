import {partition, now, nthEq, race} from "@welshman/lib"
import {
  makeEvent,
  Filter,
  getPubkeyTagValues,
  TrustedEvent,
  asDecryptedEvent,
  readList,
  getRelaysFromList,
  RELAYS,
} from "@welshman/util"
import {Nip01Signer, ISigner} from "@welshman/signer"
import {LOCAL_RELAY_URL} from "@welshman/relay"
import {Router, getFilterSelections, addMinimalFallbacks} from "@welshman/router"
import {Tracker, AdapterContext, request} from "@welshman/net"
import {makeDvmRequest} from "@welshman/dvm"

export type RequestPageOptions = {
  filters: Filter[]
  onEvent: (event: TrustedEvent) => void
  relays?: string[]
  tracker?: Tracker
  signal?: AbortSignal
  context?: AdapterContext
}

export const requestPage = async ({
  filters,
  onEvent,
  relays = [],
  tracker = new Tracker(),
  signal,
  context,
}: RequestPageOptions) => {
  if (relays.length > 0) {
    return request({tracker, signal, context, onEvent, relays, filters, autoClose: true})
  }

  const promises: Promise<TrustedEvent[]>[] = []
  const [withSearch, withoutSearch] = partition(f => Boolean(f.search), filters)

  if (withSearch.length > 0) {
    promises.push(
      request({
        tracker,
        signal,
        context,
        onEvent,
        threshold: 0.1,
        autoClose: true,
        filters: withSearch,
        relays: Router.get().Search().getUrls(),
      }),
    )
  }

  if (withoutSearch.length > 0) {
    promises.push(
      ...getFilterSelections(filters).flatMap(({relays, filters}) =>
        request({
          tracker,
          signal,
          context,
          onEvent,
          relays,
          filters,
          threshold: 0.8,
          autoClose: true,
        }),
      ),
    )
  }

  // Break out selections by relay so we can complete early after a certain number
  // of requests complete for faster load times
  await race(withSearch.length > 0 ? 0.1 : 0.8, promises)

  // Wait until after we've queried the network to access our local cache. This results in less
  // snappy response times, but is necessary to prevent stale stuff that the user has already seen
  // from showing up at the top of the feed
  await request({
    tracker,
    signal,
    context,
    onEvent,
    filters,
    relays: [LOCAL_RELAY_URL],
    autoClose: true,
  })
}

export type RequestDVMOptions = {
  kind: number
  tags?: string[][]
  relays?: string[]
  signer?: ISigner
  context?: AdapterContext
  onResult: (event: TrustedEvent) => void
}

export const requestDVM = async ({
  kind,
  onResult,
  tags = [],
  relays = [],
  signer = Nip01Signer.ephemeral(),
  context,
}: RequestDVMOptions) => {
  if (relays.length === 0) {
    const events = await request({
      autoClose: true,
      filters: [{kinds: [RELAYS], authors: getPubkeyTagValues(tags)}],
      relays: Router.get().Index().policy(addMinimalFallbacks).getUrls(),
    })

    relays = Router.get()
      .FromRelays(events.flatMap(e => getRelaysFromList(readList(asDecryptedEvent(e)))))
      .policy(addMinimalFallbacks)
      .getUrls()
  }

  if (!tags.some(nthEq(0, "expiration"))) {
    tags.push(["expiration", String(now() + 60)])
  }

  if (!tags.some(nthEq(0, "relays"))) {
    tags.push(["relays", ...relays])
  }

  if (!tags.some(nthEq(1, "user"))) {
    tags.push(["param", "user", await signer.getPubkey()])
  }

  if (!tags.some(nthEq(1, "max_results"))) {
    tags.push(["param", "max_results", "200"])
  }

  const event = await signer.sign(makeEvent(kind, {tags}))

  await makeDvmRequest({relays, event, context, onResult})
}
