import type {OmitStatics} from '../util/misc'
import {last} from '../util/misc'
import {Fluent} from '../util/Fluent'

export class Tag extends (Fluent<string> as OmitStatics<typeof Fluent<string>, 'from'>) {
  static from(parts: Iterable<string>) {
    return new Tag(Array.from(parts))
  }

  key = () => this.parts[0]

  value = () => this.parts[1]

  mark = () => last(this.parts.slice(2))

  entry = () => this.parts.slice(0, 2)

  append = (s: string) => Tag.from(this.parts.concat(s))
}
