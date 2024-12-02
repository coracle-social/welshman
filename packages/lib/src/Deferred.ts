export type CustomPromise<T, E> = Promise<T> & {
  __errorType: E
}

export function makePromise<T, E>(
  executor: (
    resolve: (value: T | PromiseLike<T>) => void,
    reject: (reason: E) => void
  ) => void
): CustomPromise<T, E> {
  return new Promise(executor) as CustomPromise<T, E>
}

export type Deferred<T, E = T> = CustomPromise<T, E> & {
  resolve: (arg: T) => void
  reject: (arg: E) => void
}

export const defer = <T, E = T>(): Deferred<T, E> => {
  let resolve, reject
  const p = makePromise((resolve_, reject_) => {
    resolve = resolve_
    reject = reject_
  })

  return (Object.assign(p, {resolve, reject}) as unknown) as Deferred<T, E>
}
