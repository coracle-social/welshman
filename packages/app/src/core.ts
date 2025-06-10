import {throttle} from "@welshman/lib"
import {Repository, LocalRelay} from "@welshman/relay"
import {custom} from "@welshman/store"
import {Tracker} from "@welshman/net"

export const repository = Repository.get()

export const relay = new LocalRelay(repository)

export const tracker = new Tracker()

// Adapt objects to stores

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
      onUpdate: (other: Repository) => repository.load(other.dump()),
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
      tracker.on("add", onUpdate)
      tracker.on("remove", onUpdate)
      tracker.on("load", onUpdate)
      tracker.on("clear", onUpdate)

      return () => {
        tracker.off("add", onUpdate)
        tracker.off("remove", onUpdate)
        tracker.off("load", onUpdate)
        tracker.off("clear", onUpdate)
      }
    },
    {
      onUpdate: (other: Tracker) => tracker.load(other.relaysById),
    },
  )
