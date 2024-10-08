import {derived} from "svelte/store"
import {ctx, memoize, omit, equals, assoc} from "@welshman/lib"
import {createEvent} from "@welshman/util"
import {withGetter, synced} from "@welshman/store"
import {type Nip46Handler} from "@welshman/signer"
import {Nip46Broker, Nip46Signer, Nip07Signer, Nip01Signer, Nip55Signer} from "@welshman/signer"

export type Session = {
  method: string
  pubkey: string
  token?: string
  secret?: string
  handler?: Nip46Handler
  signer?: string
}

export const pubkey = withGetter(synced<string | null>("pubkey", null))

export const sessions = withGetter(synced<Record<string, Session>>("sessions", {}))

export const session = withGetter(
  derived([pubkey, sessions], ([$pubkey, $sessions]) => ($pubkey ? $sessions[$pubkey] : null)),
)

export const getSession = (pubkey: string) => sessions.get()[pubkey]

export const addSession = (session: Session) => {
  sessions.update(assoc(session.pubkey, session))
  pubkey.set(session.pubkey)
}

export const putSession = (session: Session) => {
  if (!equals(getSession(session.pubkey), session)) {
    sessions.update(assoc(session.pubkey, session))
  }
}

export const updateSession = (pubkey: string, f: (session: Session) => Session) =>
  putSession(f(getSession(pubkey)))

export const dropSession = (pubkey: string) =>
  sessions.update($sessions => omit([pubkey], $sessions))

export const nip46Perms = "sign_event:22242,nip04_encrypt,nip04_decrypt,nip44_encrypt,nip44_decrypt"

export const getSigner = memoize((session: Session) => {
  switch (session?.method) {
    case "nip07":
      return new Nip07Signer()
    case "nip01":
      return new Nip01Signer(session.secret!)
    case "nip46":
      return new Nip46Signer(Nip46Broker.get(session.pubkey, session.secret!, session.handler!))
    case "nip55":
      return new Nip55Signer(session.signer!)
    default:
      return null
  }
})

export const signer = withGetter(derived(session, getSigner))

export const authChallenges = new Set()

export const onAuth = async (url: string, challenge: string) => {
  if (authChallenges.has(challenge) || !signer.get()) {
    return
  }

  authChallenges.add(challenge)

  const event = await signer.get()!.sign(
    createEvent(22242, {
      tags: [
        ["relay", url],
        ["challenge", challenge],
      ],
    }),
  )

  ctx.net.pool.get(url).send(["AUTH", event])

  return event
}

export const nip44EncryptToSelf = (payload: string) => {
  const $pubkey = pubkey.get()
  const $signer = signer.get()

  if (!$signer) {
    throw new Error("Unable to encrypt to self without valid signer")
  }

  return $signer.nip44.encrypt($pubkey!, payload)
}
