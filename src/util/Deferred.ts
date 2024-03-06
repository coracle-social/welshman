export type Deferred<T> = Promise<T> & {
  resolve: (arg: T) => void
  reject: (arg: T) => void
}

export const defer = <T>(): Deferred<T> => {
  let resolve, reject
  const p = new Promise((resolve_, reject_) => {
    resolve = resolve_
    reject = reject_
  })

  return (Object.assign(p, {resolve, reject}) as unknown) as Deferred<T>
}
