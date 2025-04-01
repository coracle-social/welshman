import {throttle} from "@welshman/lib"
import {verifyEvent, isEphemeralKind, isDVMKind} from "@welshman/util"
import {Repository} from "@welshman/relay"
import {Pool, Tracker, SocketEvent, isRelayEvent} from "@welshman/net"
import {custom} from "@welshman/store"
import {loadRelay, trackRelayStats} from "./relays.js"

export const repository = Repository.getSingleton()

export const tracker = new Tracker()

Pool.getSingleton().subscribe(socket => {
  loadRelay(socket.url)
  trackRelayStats(socket)

  socket.on(SocketEvent.Receive, message => {
    if (isRelayEvent(message)) {
      const event = message[2]

      if (!isEphemeralKind(event.kind) && !isDVMKind(event.kind) && verifyEvent(event)) {
        tracker.track(event.id, socket.url)
        repository.publish(event)
      }
    }
  })
})

// Adapt above objects to stores

export const makeRepositoryStore = ({throttle: t = 300}: {throttle?: number} = {}) =>
  custom(
    setter => {
      let onUpdate = () => setter(repository)

      if (t) {
        onUpdate = throttle(t, onUpdate)
      }

      onUpdate()
      repository.on("update", onUpdate)

      return () => repository.off("update", onUpdate)
    },
    {
      set: (other: Repository) => repository.load(other.dump()),
    },
  )

export const makeTrackerStore = ({throttle: t = 300}: {throttle?: number} = {}) =>
  custom(
    setter => {
      let onUpdate = () => setter(tracker)

      if (t) {
        onUpdate = throttle(t, onUpdate)
      }

      onUpdate()
      tracker.on("update", onUpdate)

      return () => tracker.off("update", onUpdate)
    },
    {
      set: (other: Tracker) => tracker.load(other.relaysById),
    },
  )
