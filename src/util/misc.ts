export const now = () => Math.round(Date.now() / 1000)

export const nth = (i: number) => <T>(xs: T[]) => xs[i]

export const first = <T>(xs: T[]) => xs[0]

export const last = <T>(xs: T[]) => xs[xs.length - 1]

export const identity = <T>(x: T) => x

export const flatten = <T>(xs: T[]) => xs.flatMap(identity)

export const uniq = <T>(xs: T[]) => Array.from(new Set(xs))

// https://github.com/microsoft/TypeScript/issues/4628#issuecomment-1147905253
export type OmitStatics<T, S extends string> =
    T extends {new(...args: infer A): infer R} ?
        {new(...args: A): R}&Omit<T, S> :
        Omit<T, S>;

export const isIterable = (x: any) => Symbol.iterator in Object(x)
