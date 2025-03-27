import {Subject, Observable, Operator} from "rxjs"

export type ChannelOperators = {
  rx?: Operator[]
  tx?: Operator[]
}

export class Channel<T, R> {
  constructor(
    private _subject: Subject<T>,
    readonly tx$: Observable<T>,
    readonly rx$: Observable<R>,
  ) {}

  static create<T, R>(rx$: Observable<R>) {
    const subject = new Subject<T>()
    const tx$ = subject.asObservable()

    return new Channel<T, R>(
      subject,
      tx$.pipe(observeOn(asapScheduler)),
      rx$.pipe(observeOn(asapScheduler)),
    )
  }

  clone({rx = [], tx = []}: ChannelOperators) {
    return new Channel(this._subject, this.tx$.pipe(...tx), this.rx$.pipe(...rx))
  }

  next(message: T) {
    this._subject.next(message)
  }

  complete() {
    this._subject.complete()
  }
}
