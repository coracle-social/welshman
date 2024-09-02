import {writable} from 'svelte/store'
import {withGetter} from '@welshman/store'
import {uniq, uniqBy, batcher, postJson, last} from '@welshman/lib'
import {env} from './core'
import {collection} from './collection'

export type Handle = {
  nip05: string
  pubkey?: string
  nip46?: string[]
  relays?: string[]
}

export const handles = withGetter(writable<Handle[]>([]))

export const fetchHandles = (handles: string[]) => {
  const base = env.DUFFLEPUD_URL!

  if (!base) {
    throw new Error("DUFFLEPUD_URL is required to fetch nip05 info")
  }

  const res: any = postJson(`${base}/handle/info`, {handles})
  const handlesByNip05 = new Map<string, Handle>()

  for (const {handle, info} of res?.data || []) {
    handlesByNip05.set(handle, info)
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
      const handle = fresh.get(nip05) || stale.get(nip05) || {}

      return {...handle, nip05}
    })

    handles.update($handles => uniqBy($handle => $handle.nip05, [...$handles, ...items]))

    return items
  }),
})

export const displayHandle = (handle: Handle) =>
  handle.nip05.startsWith("_@") ? last(handle.nip05.split("@")) : handle.nip05
