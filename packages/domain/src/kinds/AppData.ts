import {parseJson} from "@welshman/lib"
import {decrypt} from "@welshman/signer"
import type {ISigner} from "@welshman/signer"
import {APP_DATA} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"
import {OutboxRouter} from "../EventRouter.js"
import {Kind} from "../Kind.js"
import type {AnyKind} from "../Kind.js"

// NIP-78 kind-30078 arbitrary app data, keyed by `d` tag. Content is JSON,
// optionally NIP-44 encrypted to the author.
export class AppDataReader extends EventReader {
  readonly kind = APP_DATA

  decrypted = false
  encrypted = false

  protected json: unknown = undefined

  async parse(signer?: ISigner) {
    if (!this.event.content) {
      this.decrypted = true

      return
    }

    const json = parseJson(this.event.content)

    if (json !== undefined) {
      this.json = json
      this.decrypted = true

      return
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
  }

  values<T>() {
    return this.json as T | undefined
  }
}

export class AppDataBuilder extends EventBuilder<AppDataReader> {
  readonly kind = APP_DATA

  values: unknown = undefined
  encrypted = false

  constructor(def: AnyKind, reader?: AppDataReader) {
    super(def, reader)

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

  protected validate() {
    super.validate()

    if (this.reader?.encrypted && this.reader?.decrypted === false && this.values !== undefined) {
      throw new Error("Unable to modify app data when decryption was not performed")
    }
  }

  protected async buildContent(signer?: ISigner): Promise<string> {
    // Preserve the original ciphertext when we never decrypted it.
    if (this.reader?.decrypted === false) return this.reader.event.content

    if (this.values === undefined) return ""

    const json = JSON.stringify(this.values)

    if (!this.encrypted) return json

    if (!signer) {
      throw new Error("A signer is required to encrypt app data")
    }

    const pubkey = await signer.getPubkey()

    return signer.nip44.encrypt(pubkey, json)
  }
}

export const AppData = new Kind({
  reader: AppDataReader,
  builder: AppDataBuilder,
  router: OutboxRouter,
})
