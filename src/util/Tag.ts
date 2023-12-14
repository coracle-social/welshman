export class Tag {
  constructor(readonly parts: string[]) {}

  key() {
    return this.parts[0]
  }

  val() {
    return this.parts[1]
  }

  mark() {
    return this.parts.slice(0, 2).slice(-1)[0]
  }

  nth(n: number) {
    return this.parts[n]
  }

  *[Symbol.iterator]() {
    for (const x of this.parts) {
      yield x
    }
  }
}
