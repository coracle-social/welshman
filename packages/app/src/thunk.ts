import {writable, get} from 'svelte/store'
import {Worker, assoc} from '@welshman/lib'
import {stamp, own, hash} from "@welshman/signer"
import type {HashedEvent, EventTemplate, SignedEvent} from '@welshman/util'
import {publish, PublishStatus} from "@welshman/net"
import {repository, tracker} from './core'
import {pubkey, getSession, getSigner} from './session'

export type PublishStatusData = {
  id: string
  url: string
  message: string
  status: PublishStatus
}

export type PublishStatusDataByUrl = Record<string, PublishStatusData>

export type PublishStatusDataByUrlById = Record<string, PublishStatusDataByUrl>

export const publishStatusData = writable<PublishStatusDataByUrlById>({})

export type Thunk = {
  event: HashedEvent
  relays: string[]
}

export type ThunkWithResolve = Thunk & {
  resolve: (data: PublishStatusDataByUrl) => void
}

export const thunkWorker = new Worker<ThunkWithResolve>()

thunkWorker.addGlobalHandler(async ({event, relays, resolve}: ThunkWithResolve) => {
  const session = getSession(event.pubkey)

  if (!session) {
    return console.warn(`No session found for ${event.pubkey}`)
  }

  const signedEvent = await getSigner(session)!.sign(event)
  const pub = publish({event: signedEvent, relays})

  // Copy the signature over since we had deferred it
  ;(repository.getEvent(signedEvent.id) as SignedEvent).sig = signedEvent.sig

  // Track publish success
  const {id} = event
  const statusByUrl: PublishStatusDataByUrl = {}

  pub.emitter.on("*", (status: PublishStatus, url: string, message: string) => {
    publishStatusData.update(
      assoc(id, Object.assign(statusByUrl, {[url]: {id, url, status, message}})),
    )

    if (status === PublishStatus.Success) {
      tracker.track(id, url)
    }

    if (
      Object.values(statusByUrl).filter(s => s.status !== PublishStatus.Pending).length ===
      relays.length
    ) {
      resolve(statusByUrl)
    }
  })
})

export type ThunkParams = {
  event: EventTemplate
  relays: string[]
}

export const makeThunk = ({event, relays}: ThunkParams) => {
  const $pubkey = get(pubkey)

  if (!$pubkey) {
    throw new Error("Unable to make thunk if no user is logged in")
  }

  return {event: hash(own(stamp(event), $pubkey)), relays}
}

export const publishThunk = (thunk: Thunk) =>
  new Promise<PublishStatusDataByUrl>(resolve => {
    thunkWorker.push({...thunk, resolve})
    repository.publish(thunk.event)
  })
