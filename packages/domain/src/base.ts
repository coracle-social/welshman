import {stamp, prep} from "@welshman/util"
import type {EventTemplate, SignedEvent, HashedEvent, TrustedEvent} from "@welshman/util"
import type {ISigner} from "@welshman/signer"

/**
 * The base class for domain objects.
 *
 * A domain object is an in-memory, mutable, JSON-serializable view of a single
 * nostr event. The pattern is "decrypt on parse, mutate in memory, encrypt on
 * serialize": concrete subclasses decrypt private content up front (in their
 * static `parse`), expose synchronous accessors and mutators over the
 * plaintext, and only touch the signer again when building an event.
 *
 * Subclasses provide:
 *
 *  - a static `parse(event, signer?)` that reads (and, when possible, decrypts)
 *    an event into a domain object
 *  - `getTemplate(signer?)` that builds (and, when needed, encrypts) the event
 *    template — the signer is optional for objects with no private content
 *  - `toJSON()` for plain-object serialization
 *
 * The base provides the shared signing/wrapping orchestration on top of
 * `getTemplate`.
 */
export abstract class DomainObject {
  /**
   * The source event, present when this object was parsed from one and absent
   * when it was freshly constructed.
   */
  abstract readonly event?: TrustedEvent

  /**
   * Build the event template for this object, encrypting any private content
   * with the signer. Subclasses that hold no private data may ignore the
   * signer (which is why it is optional).
   */
  abstract getTemplate(signer?: ISigner): Promise<EventTemplate>

  /**
   * A plain-JSON snapshot of this object — safe for storage, `structuredClone`,
   * or `postMessage`. Also lets `JSON.stringify` work transparently.
   */
  abstract toJSON(): object

  /**
   * Build a hashed-but-unsigned rumor (the inner event of a NIP-59 gift wrap),
   * encrypting private content as needed. A fresh `created_at` is stamped.
   */
  async toRumor(signer: ISigner): Promise<HashedEvent> {
    const [template, pubkey] = await Promise.all([this.getTemplate(signer), signer.getPubkey()])

    return prep(template, pubkey)
  }

  /**
   * Build and sign a full event, encrypting private content as needed. A fresh
   * `created_at` is stamped so the result supersedes any prior version.
   */
  async toEvent(signer: ISigner): Promise<SignedEvent> {
    const template = await this.getTemplate(signer)

    return signer.sign(stamp(template))
  }
}
