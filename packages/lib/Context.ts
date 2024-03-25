const ctx = new Map<string, any>()

export const getContext = (k: string) => ctx.get(k)

export const setContext = (k: string, d: any) => ctx.set(k, d)

export const withContext = (k: string, d: any, f: () => void) => {
  const o = ctx.get(k)

  ctx.set(k, d)
  f()
  ctx.set(k, o)
}
