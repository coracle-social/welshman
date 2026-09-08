import {parseJson} from "@welshman/lib"
import {decrypt} from "@welshman/signer"
import {APP_DATA} from "@welshman/util"
import {AsyncEventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"
import type {KindContext} from "../core/Kind.js"

// NIP-78 kind-30078 arbitrary app data, keyed by `d` tag. Content is JSON,
// optionally NIP-44 encrypted to the author.
export class AppDataReader extends AsyncEventReader {
  decrypted = false
  encrypted = false

  protected json: unknown = undefined

  async parse() {
    const {signer} = this.context

    if (!this.event.content) {
      this.decrypted = true

      return this
    }

    const json = parseJson(this.event.content)

    if (json !== undefined) {
      this.json = json
      this.decrypted = true

      return this
    }

    this.encrypted = true

    if (signer && (await signer.getPubkey()) === this.event.pubkey) {
      try {
        this.json = parseJson(await decrypt(signer, this.event.pubkey, this.event.content))
        this.decrypted = true
      } catch {
        // pass
      }
    }

    return this
  }

  values<T>() {
    return this.json as T | undefined
  }
}

export class AppDataWriter extends EventWriter<AppDataReader> {
  values: unknown = undefined
  encrypted = false

  constructor(kind: number, context: KindContext, reader?: AppDataReader) {
    super(kind, context, reader)

    this.values = reader?.values()
    this.encrypted = reader?.encrypted ?? false
  }

  setValues(values: unknown) {
    this.values = values

    return this
  }

  setEncrypted(encrypted: boolean) {
    this.encrypted = encrypted

    return this
  }

  validate() {
    super.validate()

    if (this.reader?.encrypted && this.reader?.decrypted === false && this.values !== undefined) {
      throw new Error("Unable to modify app data when decryption was not performed")
    }
  }

  async renderContent(): Promise<string> {
    // Preserve the original ciphertext when we never decrypted it.
    if (this.reader?.decrypted === false) return this.reader.event.content

    if (this.values === undefined) return ""

    const json = JSON.stringify(this.values)

    if (!this.encrypted) return json

    const {signer} = this.context

    if (!signer) {
      throw new Error("A signer is required to encrypt app data")
    }

    const pubkey = await signer.getPubkey()

    return signer.nip44.encrypt(pubkey, json)
  }
}

export class AppDataQuery extends EventQuery {
  protected renderRoutes() {
    return this.authorRoutes()
  }
}

export const AppData = new KindFactory({
  kind: APP_DATA,
  reader: AppDataReader,
  writer: AppDataWriter,
  query: AppDataQuery,
})
