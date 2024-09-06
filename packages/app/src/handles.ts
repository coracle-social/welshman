import {writable, derived} from 'svelte/store'
import {withGetter} from '@welshman/store'
import {type SubscribeRequest} from "@welshman/net"
import {ctx, fetchJson, uniq, batcher, postJson, last} from '@welshman/lib'
import {collection} from './collection'
import {deriveProfile} from './profiles'

export type Handle = {
  nip05: string
  pubkey?: string
  nip46?: string[]
  relays?: string[]
}

export const NIP05_REGEX = /^(?:([\w.+-]+)@)?([\w_-]+(\.[\w_-]+)+)$/

export async function queryProfile(nip05: string) {
  const match = nip05.match(NIP05_REGEX)

  if (!match) return undefined

  const [_, name = '_', domain] = match

  try {
    const {names, relays = {}, nip46 = {}} = await fetchJson(`https://${domain}/.well-known/nostr.json?name=${name}`)

    const pubkey = names[name]

    if (!pubkey) {
      return undefined
    }

    return {
      nip05,
      pubkey,
      nip46: nip46[pubkey],
      relays: relays[pubkey],
    }
  } catch (_e) {
    return undefined
  }
}

export const handles = withGetter(writable<Handle[]>([]))

export const fetchHandles = async (nip05s: string[]) => {
  const base = ctx.app.dufflepudUrl!
  const handlesByNip05 = new Map<string, Handle>()

  // Use dufflepud if we it's set up to protect user privacy, otherwise fetch directly
  if (base) {
    const res: any = await postJson(`${base}/handle/info`, {handles: nip05s})

    for (const {handle: nip05, info} of res?.data || []) {
      handlesByNip05.set(nip05, info)
    }
  } else {
    const results = await Promise.all(
      nip05s.map(async nip05 => ({nip05, info: await queryProfile(nip05)}))
    )

    for (const {nip05, info} of results) {
      if (info) {
        handlesByNip05.set(nip05, info)
      }
    }
  }

  return handlesByNip05
}

export const {
  indexStore: handlesByNip05,
  deriveItem: deriveHandle,
  loadItem: loadHandle,
} = collection({
  name: "handles",
  store: handles,
  getKey: (handle: Handle) => handle.nip05,
  load: batcher(800, async (nip05s: string[]) => {
    const fresh = await fetchHandles(uniq(nip05s))
    const stale = handlesByNip05.get()
    const items: Handle[] = nip05s.map(nip05 => {
      const newHandle = fresh.get(nip05)
      const oldHandle = stale.get(nip05)

      if (newHandle) {
        stale.set(nip05, {...newHandle, nip05})
      }

      return {...oldHandle, ...newHandle, nip05}
    })

    handles.set(Array.from(stale.values()))

    return items
  }),
})

export const deriveHandleForPubkey = (pubkey: string, request: Partial<SubscribeRequest> = {}) =>
  derived(
    [handlesByNip05, deriveProfile(pubkey, request)],
    ([$handlesByNip05, $profile]) => {
      if (!$profile?.nip05) {
        return undefined
      }

      loadHandle($profile.nip05)

      return $handlesByNip05.get($profile.nip05)
    }
  )

export const displayHandle = (handle: Handle) =>
  handle.nip05.startsWith("_@") ? last(handle.nip05.split("@")) : handle.nip05