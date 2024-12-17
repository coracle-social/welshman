import type {EventContent, TrustedEvent, EventTemplate} from "./Events.js"

export type Encrypt = (x: string) => Promise<string>

export type EncryptableUpdates = Partial<EventContent>

export type DecryptedEvent = TrustedEvent & {
  plaintext: EncryptableUpdates
}

export const asDecryptedEvent = (event: TrustedEvent, plaintext: EncryptableUpdates = {}) =>
  ({...event, plaintext}) as DecryptedEvent

/**
 * Represents an encryptable event with optional updates.
 */
export class Encryptable<T extends EventTemplate> {
  /**
   * Creates an instance of Encryptable.
   * @param event - An EventTemplate with optional tags and content.
   * @param updates - Plaintext updates to be applied to the event content.
   * @example
   * Here's an example which enables updating a private mute list:
   * ```
   * const event = {kind: 10000, content: "", tags: []} // An event, only kind is required
   * const encryptable = new Encryptable(event, {content: JSON.stringify([["e", "bad word"]])})
   * const eventTemplate = await encryptable.reconcile(myEncryptFunction)
   * ```
   */
  constructor(
    readonly event: Partial<T>,
    readonly updates: EncryptableUpdates,
  ) {}

  /**
   * Encrypts plaintext updates and merges them into the event template.
   * @param encrypt - The encryption function to be used.
   * @returns A promise that resolves to the reconciled and encrypted event.
   */
  async reconcile(encrypt: Encrypt) {
    const encryptContent = () => {
      if (!this.updates.content) return null

      return encrypt(this.updates.content)
    }

    const encryptTags = () => {
      if (!this.updates.tags) return null

      return Promise.all(
        this.updates.tags.map(async tag => {
          tag[1] = await encrypt(tag[1])

          return tag
        }),
      )
    }

    const [content, tags] = await Promise.all([encryptContent(), encryptTags()])

    // Updates are optional. If not provided, fall back to the event's content and tags.
    return {
      ...this.event,
      tags: tags || this.event.tags || [],
      content: content || this.event.content || "",
    } as T
  }
}
