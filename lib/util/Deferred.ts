export type Deferred<T> = Promise<T> & {
  resolve: (arg: T) => void
  reject: (arg: T) => void
}

export const defer = (): Deferred<any> => {
  let resolve, reject
  const p = new Promise((resolve_, reject_) => {
    resolve = resolve_
    reject = reject_
  })

  return Object.assign(p, {resolve, reject}) as any
}
