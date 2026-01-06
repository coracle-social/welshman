import {Client, ClientOptions} from "@pomade/core"
import {derived, writable} from "svelte/store"
import {cached, randomId, append, omit, equals, assoc} from "@welshman/lib"
import {withGetter} from "@welshman/store"
import {
  Wallet,
  WRAP,
  getPubkeyTagValues,
  HashedEvent,
  StampedEvent,
  SignedEvent,
  getPubkey,
} from "@welshman/util"
import {
  Nip59,
  WrappedSigner,
  PomadeSigner,
  Nip46Broker,
  Nip46Signer,
  Nip07Signer,
  Nip01Signer,
  Nip55Signer,
  ISigner,
} from "@welshman/signer"
import {WrapManager} from "@welshman/net"
import {tracker, repository} from "./core.js"

export enum SessionMethod {
  Nip01 = "nip01",
  Nip07 = "nip07",
  Nip46 = "nip46",
  Nip55 = "nip55",
  Pomade = "pomade",
  Pubkey = "pubkey",
  Anonymous = "anonymous",
}

export type SessionNip01 = {
  method: SessionMethod.Nip01
  pubkey: string
  secret: string
}

export type SessionNip07 = {
  method: SessionMethod.Nip07
  pubkey: string
}

export type SessionNip46 = {
  method: SessionMethod.Nip46
  pubkey: string
  secret: string
  handler: {
    pubkey: string
    relays: string[]
  }
}

export type SessionNip55 = {
  method: SessionMethod.Nip55
  pubkey: string
  signer: string
}

export type SessionPomade = {
  method: SessionMethod.Pomade
  pubkey: string
  clientOptions: ClientOptions
}

export type SessionPubkey = {
  method: SessionMethod.Pubkey
  pubkey: string
}

export type SessionAnonymous = {
  method: SessionMethod.Anonymous
}

export type SessionAnyMethod =
  | SessionNip01
  | SessionNip07
  | SessionNip46
  | SessionNip55
  | SessionPomade
  | SessionPubkey
  | SessionAnonymous

export type Session = SessionAnyMethod & {wallet?: Wallet} & Record<string, any>

export const pubkey = withGetter(writable<string | undefined>(undefined))

export const sessions = withGetter(writable<Record<string, Session>>({}))

export const session = withGetter(
  derived([pubkey, sessions], ([$pubkey, $sessions]) => ($pubkey ? $sessions[$pubkey] : undefined)),
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

export const dropSession = (_pubkey: string) => {
  const $signer = getSigner.pop(getSession(_pubkey))

  if ($signer instanceof Nip46Signer) {
    $signer.broker.cleanup()
  }

  if ($signer instanceof PomadeSigner) {
    $signer.client.rpc.stop()
  }

  pubkey.update($pubkey => ($pubkey === _pubkey ? undefined : $pubkey))
  sessions.update($sessions => omit([_pubkey], $sessions))
}

export const clearSessions = () => {
  for (const pubkey of Object.keys(sessions.get())) {
    dropSession(pubkey)
  }
}

// Session factories

export const makeNip01Session = (secret: string): SessionNip01 => ({
  method: SessionMethod.Nip01,
  secret,
  pubkey: getPubkey(secret),
})

export const makeNip07Session = (pubkey: string): SessionNip07 => ({
  method: SessionMethod.Nip07,
  pubkey,
})

export const makeNip46Session = (
  pubkey: string,
  clientSecret: string,
  signerPubkey: string,
  relays: string[],
): SessionNip46 => ({
  method: SessionMethod.Nip46,
  pubkey,
  secret: clientSecret,
  handler: {pubkey: signerPubkey, relays},
})

export const makeNip55Session = (pubkey: string, signer: string): SessionNip55 => ({
  method: SessionMethod.Nip55,
  pubkey,
  signer,
})

export const makePomadeSession = (pubkey: string, clientOptions: ClientOptions): SessionPomade => ({
  method: SessionMethod.Pomade,
  pubkey,
  clientOptions,
})

export const makePubkeySession = (pubkey: string): SessionPubkey => ({
  method: SessionMethod.Pubkey,
  pubkey,
})

// Type guards

export const isNip01Session = (session?: Session): session is SessionNip01 =>
  session?.method === SessionMethod.Nip01

export const isNip07Session = (session?: Session): session is SessionNip07 =>
  session?.method === SessionMethod.Nip07

export const isNip46Session = (session?: Session): session is SessionNip46 =>
  session?.method === SessionMethod.Nip46

export const isNip55Session = (session?: Session): session is SessionNip55 =>
  session?.method === SessionMethod.Nip55

export const isPomadeSession = (session?: Session): session is SessionPomade =>
  session?.method === SessionMethod.Pomade

export const isPubkeySession = (session?: Session): session is SessionPubkey =>
  session?.method === SessionMethod.Pubkey

// Login utilities

export const loginWithNip01 = (secret: string) => addSession(makeNip01Session(secret))

export const loginWithNip07 = (pubkey: string) => addSession(makeNip07Session(pubkey))

export const loginWithNip46 = (
  pubkey: string,
  clientSecret: string,
  signerPubkey: string,
  relays: string[],
) => addSession(makeNip46Session(pubkey, clientSecret, signerPubkey, relays))

export const loginWithNip55 = (pubkey: string, signer: string) =>
  addSession(makeNip55Session(pubkey, signer))

export const loginWithPomade = (pubkey: string, clientOptions: ClientOptions) =>
  addSession(makePomadeSession(pubkey, clientOptions))

export const loginWithPubkey = (pubkey: string) => addSession(makePubkeySession(pubkey))

// Other stuff

export const nip46Perms = "sign_event:22242,nip04_encrypt,nip04_decrypt,nip44_encrypt,nip44_decrypt"

export type SignerLogEntry = {
  id: string
  method: string
  started_at: number
  finished_at?: number
  ok?: boolean
}

export const signerLog = withGetter(writable<SignerLogEntry[]>([]))

export const wrapSigner = (signer: ISigner) =>
  new WrappedSigner(signer, async <T>(method: string, thunk: () => Promise<T>) => {
    const id = randomId()

    signerLog.update(log => append({id, method, started_at: Date.now()}, log))

    try {
      const result = await thunk()

      signerLog.update(log =>
        log.map(x => (x.id === id ? {...x, finished_at: Date.now(), ok: true} : x)),
      )

      return result
    } catch (error: any) {
      signerLog.update(log =>
        log.map(x => (x.id === id ? {...x, finished_at: Date.now(), ok: false} : x)),
      )

      throw error
    }
  })

export const getSigner = cached({
  maxSize: 100,
  getKey: ([session]: [Session | undefined]) => `${session?.method}:${session?.pubkey}`,
  getValue: ([session]: [Session | undefined]) => {
    if (isNip07Session(session)) return wrapSigner(new Nip07Signer())
    if (isNip01Session(session)) return wrapSigner(new Nip01Signer(session.secret))
    if (isNip55Session(session)) return wrapSigner(new Nip55Signer(session.signer, session.pubkey))
    if (isPomadeSession(session))
      return wrapSigner(new PomadeSigner(new Client(session.clientOptions)))
    if (isNip46Session(session)) {
      const {
        secret: clientSecret,
        handler: {relays, pubkey: signerPubkey},
      } = session
      const broker = new Nip46Broker({clientSecret, signerPubkey, relays})
      const signer = new Nip46Signer(broker)

      return wrapSigner(signer)
    }
  },
})

export const getSignerFromPubkey = (pubkey: string) => {
  const session = getSession(pubkey)

  if (session) {
    return getSigner(session)
  }
}

export const signer = withGetter(derived(session, getSigner))

export const sign = (event: StampedEvent) => signer.get()?.sign(event)

export const nip44EncryptToSelf = (payload: string) => {
  const $pubkey = pubkey.get()
  const $signer = signer.get()

  if (!$signer) {
    throw new Error("Unable to encrypt to self without valid signer")
  }

  return $signer.nip44.encrypt($pubkey!, payload)
}

// Gift wrap utilities

export const wrapManager = new WrapManager({repository, tracker})

export const shouldUnwrap = withGetter(writable(false))

export const failedUnwraps = new Set<string>()

export const unwrapAndStore = async (wrap: SignedEvent) => {
  if (wrap.kind !== WRAP) {
    throw new Error("Tried to unwrap an invalid event")
  }

  if (!shouldUnwrap.get()) {
    throw new Error("Discarding wrapped event because `shouldUnwrap` is not enabled")
  }

  // Check to see if we already tried to unwrap but failed
  if (failedUnwraps.has(wrap.id)) {
    return
  }

  // Check index and repository
  const cached = wrapManager.getRumor(wrap.id)

  if (cached) {
    return cached
  }

  let result: {rumor: HashedEvent; recipient: string} | undefined

  // Next, try to decrypt as the recipient
  for (const recipient of getPubkeyTagValues(wrap.tags)) {
    const signer = getSignerFromPubkey(recipient)

    if (signer) {
      try {
        const rumor = await Nip59.fromSigner(signer).unwrap(wrap)

        result = {rumor, recipient}
      } catch (e) {
        failedUnwraps.add(wrap.id)
      }
    }
  }

  if (result) {
    wrapManager.add({wrap, ...result})

    return result.rumor
  }
}
