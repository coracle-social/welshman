import TypedEventEmitter, {EventMap} from "typed-emitter"
import {Observable, BehaviorSubject} from "rxjs"

export type TypedEmitter<T extends EventMap> = TypedEventEmitter.default<T>

export type Unsubscriber = () => void

export function pauseController<T>() {
  const paused$ = new BehaviorSubject<boolean>(false)

  return {
    pause: () => paused$.next(true),
    resume: () => paused$.next(false),
    isPaused: () => paused$.value,
    operator: (source: Observable<T>) => {
      return new Observable<T>(observer => {
        const buffer: T[] = []
        let isPaused = false

        // Subscribe to the pause controller
        const pausedSubscription = paused$.subscribe({
          next: paused => {
            isPaused = paused

            if (!paused) {
              buffer.splice(0).forEach(value => observer.next(value))
            }
          },
          error: err => observer.error(err),
        })

        const sourceSubscription = source.subscribe({
          next: value => {
            if (isPaused) {
              buffer.push(value)
            } else {
              observer.next(value)
            }
          },
          error: err => observer.error(err),
          complete: () => {
            if (!isPaused) {
              buffer.splice(0).forEach(value => observer.next(value))
            }

            observer.complete()
          },
        })

        return () => {
          pausedSubscription.unsubscribe()
          sourceSubscription.unsubscribe()
        }
      })
    },
  }
}
