import {writable, derived, Subscriber} from "svelte/store"
import {tryCatch, fetchJson, batcher, postJson, last} from "@welshman/lib"
import {getter, deriveItems, makeForceLoadItem, makeLoadItem, makeDeriveItem} from "@welshman/store"
import {deriveProfile, loadProfile} from "./profiles.js"
import {appContext} from "./context.js"

export type Handle = {
  nip05: string
  pubkey?: string
  nip46?: string[]
  relays?: string[]
}

export async function queryProfile(nip05: string) {
  const parts = nip05.split("@")
  const name = parts.length > 1 ? parts[0] : "_"
  const domain = last(parts)

  try {
    const {
      names,
      relays = {},
      nip46 = {},
    } = await fetchJson(`https://${domain}/.well-known/nostr.json?name=${name}`)

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

export const handlesByNip05 = writable(new Map<string, Handle>())

export const handles = deriveItems(handlesByNip05)

export const getHandlesByNip05 = getter(handlesByNip05)

export const getHandles = getter(handles)

export const getHandle = (nip05: string) => getHandlesByNip05().get(nip05)

export const handleSubscribers: Subscriber<Handle>[] = []

export const notifyHandle = (handle: Handle) => handleSubscribers.forEach(sub => sub(handle))

export const onHandle = (sub: (handle: Handle) => void) => {
  handleSubscribers.push(sub)

  return () =>
    handleSubscribers.splice(
      handleSubscribers.findIndex(s => s === sub),
      1,
    )
}

export const fetchHandle = batcher(800, async (nip05s: string[]) => {
  const result = new Map<string, Handle>()

  // Use dufflepud if we it's set up to protect user privacy, otherwise fetch directly
  if (appContext.dufflepudUrl) {
    const res: any = await tryCatch(
      async () => await postJson(`${appContext.dufflepudUrl}/handle/info`, {handles: nip05s}),
    )

    for (const {handle: nip05, info} of res?.data || []) {
      if (info) {
        result.set(nip05, {...info, nip05})
      }
    }
  } else {
    const results = await Promise.all(
      nip05s.map(async nip05 => ({
        nip05,
        info: await tryCatch(async () => await queryProfile(nip05)),
      })),
    )

    for (const {nip05, info} of results) {
      if (info) {
        result.set(nip05, {...info, nip05})
      }
    }
  }

  handlesByNip05.update($handlesByNip05 => {
    for (const [nip05, info] of result) {
      $handlesByNip05.set(nip05, info)
    }

    return $handlesByNip05
  })

  for (const info of result.values()) {
    notifyHandle(info)
  }

  return nip05s.map(nip05 => result.get(nip05))
})

export const forceLoadHandle = makeForceLoadItem(fetchHandle, getHandle)

export const loadHandle = makeLoadItem(fetchHandle, getHandle)

export const deriveHandle = makeDeriveItem(handlesByNip05, loadHandle)

export const loadHandleForPubkey = async (pubkey: string, relays: string[] = []) => {
  const $profile = await loadProfile(pubkey, relays)

  return $profile?.nip05 ? loadHandle($profile.nip05) : undefined
}

export const deriveHandleForPubkey = (pubkey: string, relays: string[] = []) => {
  loadHandleForPubkey(pubkey, relays)

  return derived([handlesByNip05, deriveProfile(pubkey, relays)], ([$handlesByNip05, $profile]) => {
    if (!$profile?.nip05) return undefined

    const handle = $handlesByNip05.get($profile.nip05)

    if (handle?.pubkey !== pubkey) return undefined

    return handle
  })
}

export const displayNip05 = (nip05: string) =>
  nip05?.startsWith("_@") ? last(nip05.split("@")) : nip05

export const displayHandle = (handle: Handle) => displayNip05(handle.nip05)
