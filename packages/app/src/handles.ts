import {derived} from "svelte/store"
import {tryCatch, fetchJson, uniq, batch, postJson, last} from "@welshman/lib"
import {makeCollection} from "@welshman/store"
import {profiles} from "./profiles.js"
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

export const fetchHandles = async (nip05s: string[]) => {
  const base = appContext.dufflepudUrl!
  const handlesByNip05 = new Map<string, Handle>()

  // Use dufflepud if we it's set up to protect user privacy, otherwise fetch directly
  if (base) {
    const res: any = await tryCatch(
      async () => await postJson(`${base}/handle/info`, {handles: nip05s}),
    )

    for (const {handle: nip05, info} of res?.data || []) {
      if (info) {
        handlesByNip05.set(nip05, info)
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
        handlesByNip05.set(nip05, info)
      }
    }
  }

  return handlesByNip05
}

export const handles = makeCollection<Handle>({
  name: "handles",
  getKey: handle => handle.nip05,
  load: batch(800, async (nip05s: string[]) => {
    const handlesByNip05 = await fetchHandles(uniq(nip05s))

    handles.stream.update(Array.from(handlesByNip05.values()))
  }),
})

export const deriveHandleForPubkey = (pubkey: string, relays: string[] = []) =>
  derived([handles.map$, profiles.one$(pubkey, relays)], ([$map, $profile]) => {
    if (!$profile?.nip05) {
      return undefined
    }

    handles.load($profile.nip05)

    const handle = $map.get($profile.nip05)

    if (handle?.pubkey === pubkey) {
      return handle
    }
  })

export const displayNip05 = (nip05: string) =>
  nip05?.startsWith("_@") ? last(nip05.split("@")) : nip05

export const displayHandle = (handle: Handle) => displayNip05(handle.nip05)
