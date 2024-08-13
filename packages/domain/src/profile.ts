import {nip19} from "nostr-tools"
import {ellipsize, parseJson} from "@welshman/lib"
import {PROFILE, TrustedEvent} from "@welshman/util"

export type Profile<E extends TrustedEvent> = {
  name?: string
  nip05?: string
  lud06?: string
  lud16?: string
  about?: string
  banner?: string
  picture?: string
  website?: string
  display_name?: string
  event?: E
}

export type PublishedProfile<E extends TrustedEvent> = Omit<Profile<E>, "event"> & {
  event: E
}

export const isPublishedProfile = <E extends TrustedEvent>(profile: Profile<E>): profile is PublishedProfile<E> =>
  Boolean(profile.event)

export const makeProfile = <E extends TrustedEvent>(profile: Partial<Profile<E>> = {}): Profile<E> => ({
  name: "",
  nip05: "",
  lud06: "",
  lud16: "",
  about: "",
  banner: "",
  picture: "",
  website: "",
  display_name: "",
  ...profile,
})

export const readProfile = <E extends TrustedEvent>(event: E) => {
  const profile = parseJson(event.content) || {}

  return {...profile, event} as PublishedProfile<E>
}

export const createProfile = <E extends TrustedEvent>({event, ...profile}: Profile<E>) => ({
  kind: PROFILE,
  content: JSON.stringify(profile),
})

export const editProfile = <E extends TrustedEvent>({event, ...profile}: PublishedProfile<E>) => ({
  kind: PROFILE,
  content: JSON.stringify(profile),
  tags: event.tags,
})

export const displayPubkey = (pubkey: string) => {
  const d = nip19.npubEncode(pubkey)

  return d.slice(0, 8) + "…" + d.slice(-5)
}

export const displayProfile = <E extends TrustedEvent>(profile?: Profile<E>, fallback = "") => {
  const {display_name, name, event} = profile || {}

  if (name) return ellipsize(name, 60)
  if (display_name) return ellipsize(display_name, 60)
  if (event) return displayPubkey(event.pubkey)

  return fallback
}

export const profileHasName = <E extends TrustedEvent>(profile?: Profile<E>) => Boolean(profile?.name || profile?.display_name)
