import {npubEncode} from "nostr-tools/nip19"
import {ellipsize, parseJson} from "@welshman/lib"
import {TrustedEvent} from "./Events.js"
import {getLnUrl} from "./Zaps.js"
import {PROFILE} from "./Kinds.js"

export type Profile = {
  name?: string
  nip05?: string
  lud06?: string
  lud16?: string
  lnurl?: string
  about?: string
  banner?: string
  picture?: string
  website?: string
  display_name?: string
  event?: TrustedEvent
}

export type PublishedProfile = Omit<Profile, "event"> & {
  event: TrustedEvent
}

export const isPublishedProfile = (profile: Profile): profile is PublishedProfile =>
  Boolean(profile.event)

export const makeProfile = (profile: Partial<Profile> = {}): Profile => {
  const address = profile.lud06 || profile.lud16
  const lnurl = typeof address === "string" ? getLnUrl(address) : null

  return lnurl ? {lnurl, ...profile} : profile
}

export const readProfile = (event: TrustedEvent): PublishedProfile => ({
  ...makeProfile(parseJson(event.content) || {}),
  event,
})

export const createProfile = ({event, ...profile}: Profile) => ({
  kind: PROFILE,
  content: JSON.stringify(profile),
})

export const editProfile = ({event, ...profile}: PublishedProfile) => ({
  kind: PROFILE,
  content: JSON.stringify(profile),
  tags: event.tags,
})

export const displayPubkey = (pubkey: string) => {
  const d = npubEncode(pubkey)

  return d.slice(0, 8) + "…" + d.slice(-5)
}

export const displayProfile = (profile?: Profile, fallback = "") => {
  const {display_name, name, event} = profile || {}

  if (name) return ellipsize(name, 60).trim()
  if (display_name) return ellipsize(display_name, 60).trim()
  if (event) return displayPubkey(event.pubkey).trim()

  return fallback.trim()
}

export const profileHasName = (profile?: Profile) => Boolean(profile?.name || profile?.display_name)
