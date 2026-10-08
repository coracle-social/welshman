import {describe, it, expect} from "vitest"
import {makeBolt12PayerNote, stamp, Resolver, BOLT12_ZAP, NOTE} from "@welshman/util"
import type {SignedEvent, TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {Bolt12Offer} from "../src/kinds/Bolt12Offer"
import {Bolt12Zap, getBolt12ZapPaymentHash, sumBolt12Zaps} from "../src/kinds/Bolt12Zap"
import type {Bolt12ZapClaim, Bolt12ZapWriter} from "../src/kinds/Bolt12Zap"
import {Bolt12ZapIntent} from "../src/kinds/Bolt12ZapIntent"
import {
  INBOX,
  INDEX,
  OUTBOX,
  buildEvent,
  buildTemplate,
  markerResolver,
  publishRelays,
  query,
  queryRelays,
  read,
  write,
} from "./helpers.js"

// Fixed keys and timestamps, since `paidProof` commits to the intent's id.
const recipientSigner = new Nip01Signer("22".repeat(32))
const payerSigner = new Nip01Signer("33".repeat(32))

// An offer of one description and one issuer id, and an offer nobody here announces.
const paidOffer = "lno1pgph5ctszcssyj7z5vfx29flqlnsuzatppeyu6u9ugtl3ntz3n4k996zg7a5jvuz"
const offerString = "lno1qgsyxjtl6luzd9t3pr62xr7eemp6awnejusgf6gw45q75vcfqqqqqqq"

// Recorded rather than signed: a fresh signature over it would move the intent's id.
const paidAnnouncement = {
  kind: Bolt12Offer.kind,
  tags: [["offer", paidOffer]],
  content: "",
  created_at: 1700000000,
  pubkey: "466d7fcae563e5cb09a0d1870bb580344804617879a14949cf22285f1bae3f27",
  id: "111f386a28d7c0a454478e0c5d52decfe27022074cfb4c770d821c24850d81ac",
  sig: "03a1eb965d4078c8130228e6b843e97b325b817e8bcc02fc6c17a97236fbf62560d0306122693f2341d52faf300a04291e7d71f78d5bdc7a1a6751443a8555e3",
} as SignedEvent

// The intent `makeZap` builds, named here because the proof commits to it by id.
const paidIntentId = "d886dcfc9d90402129d3f73c7875bc6cc61511d7761184f4e6919390a35e7156"

const paidNote = makeBolt12PayerNote(paidIntentId)

const paidHash = "02d449a31fbb267c8f352e9968a79e3e5fc95c1bbeaa502fd6454ebde5a4bedc"

// A proof of paying `paidOffer` 21000 msats, carrying `paidNote` as its payer note.
const paidProof =
  "lnp1pgph5ctszcssyj7z5vfx29flqlnsuzatppeyu6u9ugtl3ntz3n4k996zg7a5jvuztqssxfr986kyx3ygqqkvq6alklcslcvfj834l8lyxqkmafkjx57up2cut9xxummnw3er5mnfwpprzwny8qurverrve3njepexq6rqv33xgukgvmxxuekxdecxu6kycekvd3nvvf4xyckgdehxccnzwp5vc6x2d3exyunxwfsvyen2efhxy6nd2pqqt2yngclhvn8ere496vk3fu78e0ujhqmh649qt7kg48tmedyhmw25qjjpzczzqjtc233yeg48ur7wrst4vy8ynntsh3p07xdv2xwkc5hgfrmkjfnstcypvjrhqp7nrjjawad3l09pj4w7gzwdskkr9adal7uv2wghd5yr52lc2gh8wjvjaeqzfu67pf53cg0hpfpdsjwelh28cfrja6afrtv3galzsqrj69dhvfgzc70qh03qvnkvqgjnt95hwum355mvcme69g0vuuu7ugfe2zjmyev03cfk0fr7wwaazxxyy0rmuhxl2f7nwta85ddg240hlgrayspzyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zy0aq04jqzexkvammmqgl9k7krnea26ehrfwa8vmpy33t4evdvcgls8m08t4l5p7ecz0qz3695e9pd4j669pzykd2phm5gp6en8yghjmtnq2epry2ymr3ac586xh0gxjr9k4e20t725ddygvu6hae76causk2jv75zctkec4g0yu8gmq0h8s606au2v9m3wkw45hhrexn05l7gf0sjtzde838mfzy0e0nhxct6tnpqczvurntnm0c7e4q6zpxwpxhqklmqe9uuwcta44ff76w9hp6plaawgnzl88jctx0qj39q7u9v38k903xew5x77m7wgqcnea3xpf20v6nd7n3ua47j4xgwuglkv6p90w92eke0phpzzw3mldx6u02emt7ewhl0t9jt7mxz36y8z9ldm88079wnxdpu2mqep7g"

const note = {
  id: "cc".repeat(32),
  pubkey: "dd".repeat(32),
  created_at: 0,
  kind: NOTE,
  tags: [],
  content: "excellent note",
  sig: "00".repeat(64),
} as TrustedEvent

// An announcement, intent and zap in NIP-B1 order, whose intent comes out as `paidIntentId`.
const makeZap = async () => {
  const recipient = await recipientSigner.getPubkey()

  const intent = await payerSigner.sign(
    stamp(
      await buildTemplate(
        write(Bolt12ZapIntent)
          .setRecipient(recipient)
          .setAmount(21000)
          .setOfferEvent(paidAnnouncement)
          .setEvent(note)
          .setZapId("ab".repeat(16))
          .setContent("excellent note"),
      ),
      1700000001,
    ),
  )

  const zap = await buildEvent(
    write(Bolt12Zap)
      .setIntent(intent)
      .setProof(paidProof)
      .setPayer(await payerSigner.getPubkey()),
    payerSigner,
  )

  return {recipient, offer: paidAnnouncement, intent, zap}
}

// Re-sign a zap whose tags were edited, so only the edit is under test.
const resign = async (zap: SignedEvent, tags: string[][]) =>
  payerSigner.sign(stamp({kind: BOLT12_ZAP, content: zap.content, tags}, zap.created_at))

// Signs what a writer renders without validating it, for a zap the writer would refuse.
const buildUnvalidated = async (writer: Bolt12ZapWriter) =>
  payerSigner.sign(
    stamp({
      kind: BOLT12_ZAP,
      tags: await writer.renderTags(),
      content: await writer.renderContent(),
    }),
  )

describe("Bolt12Offer", () => {
  it("canonicalizes the offers it stores and reads", async () => {
    const template = await buildTemplate(write(Bolt12Offer).addOffer("LNO1QGSY+ABC"))

    expect(template.tags).toEqual([["offer", "lno1qgsyabc"]])

    const offer = await read(Bolt12Offer, {...note, kind: Bolt12Offer.kind, tags: template.tags})

    expect(offer.offers()).toEqual(["lno1qgsyabc"])
  })

  it("refuses an announcement with no offer", async () => {
    await expect(buildTemplate(write(Bolt12Offer))).rejects.toThrow(
      "Bolt12Offer requires at least one offer",
    )
  })

  it("refuses an announcement carrying junk beside a real offer", async () => {
    await expect(
      buildTemplate(write(Bolt12Offer).setOffers([offerString, "junk"])),
    ).rejects.toThrow("Bolt12Offer refuses an offer that is not a BOLT12 offer")
  })

  it("refuses an offer added in a form readers won't accept", async () => {
    const writer = write(Bolt12Offer).addTags(["offer", offerString.toUpperCase()])

    await expect(buildTemplate(writer)).rejects.toThrow(
      "Bolt12Offer refuses an offer that is not a BOLT12 offer in canonical form",
    )
  })
})

describe("Bolt12ZapIntent", () => {
  it("seeds a zap id and names the payer note the payment has to carry", async () => {
    const {intent} = await makeZap()
    const reader = await read(Bolt12ZapIntent, intent)

    expect(reader.zapId()).toMatch(/^[0-9a-f]{32}$/)
    expect(reader.amount()).toBe(21000)
    expect(reader.eventId()).toBe(note.id)
    expect(reader.targetKind()).toBe(NOTE)
    expect(reader.payerNote()).toBe(`nostr:nipB1:${intent.id}`)
  })

  it("requires a recipient, an amount and an announcement", async () => {
    await expect(buildTemplate(write(Bolt12ZapIntent))).rejects.toThrow(
      "Bolt12ZapIntent requires a recipient",
    )
  })

  it("refuses a zap id with too little entropy to be one", async () => {
    const {offer} = await makeZap()
    const writer = write(Bolt12ZapIntent)
      .setRecipient(await recipientSigner.getPubkey())
      .setAmount(21000)
      .setOfferEvent(offer)
      .setZapId("abcd")

    await expect(buildTemplate(writer)).rejects.toThrow(
      "Bolt12ZapIntent requires a zap id of at least 128 bits of lowercase hex",
    )
  })

  it("refuses an announcement that is not a signed offer announcement", async () => {
    const writer = write(Bolt12ZapIntent)
      .setRecipient(await recipientSigner.getPubkey())
      .setAmount(21000)
      .addTags(["offer_event", "junk"])

    await expect(buildTemplate(writer)).rejects.toThrow(
      "Bolt12ZapIntent requires the recipient's offer announcement",
    )
  })

  it("refuses an amount that is not a whole number of millisats", async () => {
    const {offer} = await makeZap()
    const writer = write(Bolt12ZapIntent)
      .setRecipient(await recipientSigner.getPubkey())
      .setAmount(21000.9)
      .setOfferEvent(offer)

    await expect(buildTemplate(writer)).rejects.toThrow(
      "Bolt12ZapIntent requires a positive whole number of millisats",
    )
  })
})

describe("Bolt12Zap", () => {
  it("validates a zap the payer signed for an offer the recipient announced", async () => {
    const {intent, offer, recipient, zap} = await makeZap()
    const reader = await read(Bolt12Zap, zap)
    const claim = reader.validate()

    expect(reader.recipient()).toBe(recipient)
    expect(reader.payer()).toBe(zap.pubkey)
    expect(reader.targetsProfile()).toBe(false)
    expect(claim?.event).toEqual(zap)
    expect(claim?.intent.id).toBe(intent.id)
    expect(claim?.offer.id).toBe(offer.id)
    expect(claim?.offers).toEqual([paidOffer])
    expect(claim?.target).toBe(note.id)
    expect(claim?.amount).toBe(21000)
    expect(claim?.proof).toBe(paidProof)
    expect(claim?.payerNote).toBe(makeBolt12PayerNote(intent.id))
  })

  it("validates a reader nobody parsed, since the embedded events are read on demand", async () => {
    const {zap} = await makeZap()
    const unparsed = Bolt12Zap.configure({resolver: new Resolver(() => [])}).reader(zap)

    expect(unparsed.validate()?.amount).toBe(21000)
  })

  it("refuses a zap claiming an amount the payer never signed for", async () => {
    const {zap} = await makeZap()
    const tags = zap.tags.map(tag => (tag[0] === "amount" ? ["amount", "2100000"] : tag))
    const reader = await read(Bolt12Zap, await resign(zap, tags))

    expect(reader.validate()).toBeUndefined()
  })

  it("refuses a zap whose embedded intent is not signed", async () => {
    const {intent, zap} = await makeZap()
    const forged = JSON.stringify({...intent, sig: "11".repeat(64)})
    const tags = zap.tags.map(tag => (tag[0] === "description" ? ["description", forged] : tag))
    const reader = await read(Bolt12Zap, await resign(zap, tags))

    expect(reader.intent()).toBeUndefined()
    expect(reader.validate()).toBeUndefined()
  })

  it("refuses a zap whose intent was signed by somebody else", async () => {
    const {offer, recipient} = await makeZap()
    const intent = await buildEvent(
      write(Bolt12ZapIntent).setRecipient(recipient).setAmount(21000).setOfferEvent(offer),
      recipientSigner,
    )
    const zap = await buildUnvalidated(write(Bolt12Zap).setIntent(intent).setProof(paidProof))
    const reader = await read(Bolt12Zap, zap)

    expect(reader.validate()).toBeUndefined()
  })

  it("refuses an announcement the recipient did not sign", async () => {
    const offer = await buildEvent(write(Bolt12Offer).addOffer(offerString), payerSigner)
    const intent = await buildEvent(
      write(Bolt12ZapIntent)
        .setRecipient(await recipientSigner.getPubkey())
        .setAmount(21000)
        .setOfferEvent(offer),
      payerSigner,
    )
    const zap = await buildUnvalidated(write(Bolt12Zap).setIntent(intent).setProof(paidProof))
    const reader = await read(Bolt12Zap, zap)

    expect(reader.validate()).toBeUndefined()
  })

  it("refuses a P tag naming anyone but the author", async () => {
    const {zap} = await makeZap()
    const tags = zap.tags.map(tag => (tag[0] === "P" ? ["P", "ee".repeat(32)] : tag))
    const reader = await read(Bolt12Zap, await resign(zap, tags))

    expect(reader.validate()).toBeUndefined()
  })

  it("refuses a zap whose content is not the comment the payer signed", async () => {
    const {zap} = await makeZap()
    const forged = await payerSigner.sign(
      stamp({kind: BOLT12_ZAP, content: "terrible note", tags: zap.tags}, zap.created_at),
    )
    const reader = await read(Bolt12Zap, forged)

    expect(reader.validate()).toBeUndefined()
  })

  it("refuses a zap repeating only the first of the amounts the payer signed", async () => {
    const {zap} = await makeZap()
    const tags = [...zap.tags, ["amount", "1"]]
    const reader = await read(Bolt12Zap, await resign(zap, tags))

    expect(reader.validate()).toBeUndefined()
  })

  it("refuses an amount that is not a whole number of millisats", async () => {
    const {zap} = await makeZap()
    const tags = zap.tags.map(tag => (tag[0] === "amount" ? ["amount", "21000.9"] : tag))
    const reader = await read(Bolt12Zap, await resign(zap, tags))

    expect(reader.amount()).toBeUndefined()
    expect(reader.validate()).toBeUndefined()
  })

  it("refuses a malformed P tag rather than reading it as an anonymous zap", async () => {
    const {zap} = await makeZap()
    const tags = zap.tags.map(tag => (tag[0] === "P" ? ["P", "not-a-pubkey"] : tag))
    const reader = await read(Bolt12Zap, await resign(zap, tags))

    expect(reader.payer()).toBeUndefined()
    expect(reader.validate()).toBeUndefined()
  })

  it("refuses a zap whose announcement carries an offer that is not canonical", async () => {
    const recipient = await recipientSigner.getPubkey()
    const offer = await recipientSigner.sign(
      stamp(
        {kind: Bolt12Offer.kind, content: "", tags: [["offer", offerString.toUpperCase()]]},
        1000,
      ),
    )
    const intent = await buildEvent(
      write(Bolt12ZapIntent).setRecipient(recipient).setAmount(21000).setOfferEvent(offer),
      payerSigner,
    )
    const zap = await buildUnvalidated(write(Bolt12Zap).setIntent(intent).setProof(paidProof))
    const reader = await read(Bolt12Zap, zap)

    expect(reader.offers()).toEqual([offerString])
    expect(reader.validate()).toBeUndefined()
  })

  it("refuses an announcement the recipient signed after the intent embedded it", async () => {
    const recipient = await recipientSigner.getPubkey()
    const offer = await recipientSigner.sign(
      stamp({kind: Bolt12Offer.kind, content: "", tags: [["offer", offerString]]}, 2000),
    )
    const intent = await payerSigner.sign(
      stamp(
        await buildTemplate(
          write(Bolt12ZapIntent).setRecipient(recipient).setAmount(21000).setOfferEvent(offer),
        ),
        1000,
      ),
    )
    const zap = await buildUnvalidated(write(Bolt12Zap).setIntent(intent).setProof(paidProof))
    const reader = await read(Bolt12Zap, zap)

    expect(reader.validate()).toBeUndefined()
  })

  it("refuses a zap with both an e and an a tag", async () => {
    const {zap} = await makeZap()
    const tags = [...zap.tags, ["a", `30023:${"dd".repeat(32)}:x`]]
    const reader = await read(Bolt12Zap, await resign(zap, tags))

    expect(reader.validate()).toBeUndefined()
  })

  it("requires a settled lnp proof", async () => {
    const {intent} = await makeZap()

    await expect(
      buildTemplate(write(Bolt12Zap).setIntent(intent).setProof("lnbc100n1pjexample")),
    ).rejects.toThrow("Bolt12Zap requires a settled lnp payer proof")
  })

  it("renders a zap whose proof the counter settles", async () => {
    const {intent, zap} = await makeZap()
    const claim = (await read(Bolt12Zap, zap)).validate()

    expect(intent.id).toBe(paidIntentId)
    expect(claim && getBolt12ZapPaymentHash(claim)).toBe(paidHash)
  })

  it("refuses a zap that changes the amount or announcement its intent names", async () => {
    const {intent} = await makeZap()
    const message = "Bolt12Zap has to repeat the content and tags of the intent it was paid for"

    const wrongAmount = write(Bolt12Zap).setIntent(intent).setProof(paidProof)

    wrongAmount.dropTags(tag => tag[0] === "amount").addTags(["amount", "22000"])

    await expect(buildTemplate(wrongAmount)).rejects.toThrow(message)

    const unannounced = await recipientSigner.sign(
      stamp({kind: Bolt12Offer.kind, content: "", tags: [["offer", offerString]]}, 1700000000),
    )
    const wrongOffer = write(Bolt12Zap).setIntent(intent).setProof(paidProof)

    wrongOffer
      .dropTags(tag => tag[0] === "offer_event")
      .addTags(["offer_event", JSON.stringify(unannounced)])

    await expect(buildTemplate(wrongOffer)).rejects.toThrow(message)

    await expect(
      buildTemplate(write(Bolt12Zap).setIntent(intent).setProof(paidProof).setContent("other")),
    ).rejects.toThrow(message)

    const twoTargets = write(Bolt12Zap).setIntent(intent).setProof(paidProof)

    twoTargets.addTags(["e", "aa".repeat(32)])

    await expect(buildTemplate(twoTargets)).rejects.toThrow()
  })

  it("refuses a proof for another intent", async () => {
    const {intent} = await makeZap()
    const message = "Bolt12Zap requires a settled lnp payer proof"

    const otherIntent = await payerSigner.sign(
      stamp({kind: intent.kind, content: intent.content, tags: intent.tags}, 1700000002),
    )

    await expect(
      buildTemplate(write(Bolt12Zap).setIntent(otherIntent).setProof(paidProof)),
    ).rejects.toThrow(message)
  })

  it("refuses an intent it cannot verify, since the payer note binds to its id", async () => {
    const {intent} = await makeZap()
    const writer = write(Bolt12Zap)
      .setIntent({...intent, sig: "11".repeat(64)})
      .setProof(paidProof)

    await expect(buildTemplate(writer)).rejects.toThrow(
      "Bolt12Zap requires the zap intent it was paid for",
    )
  })

  it("requires the announcement the intent named", async () => {
    const {intent} = await makeZap()
    const writer = write(Bolt12Zap).setIntent(intent).setProof(paidProof)

    writer.dropTags(tag => tag[0] === "offer_event")

    await expect(buildTemplate(writer)).rejects.toThrow(
      "Bolt12Zap requires the recipient's offer announcement",
    )
  })

  it("stores a proof in bech32's canonical lowercase", async () => {
    const {intent} = await makeZap()
    const template = await buildTemplate(
      write(Bolt12Zap).setIntent(intent).setProof(paidProof.toUpperCase()),
    )

    expect(template.tags).toContainEqual(["proof", paidProof])
  })

  it("keeps an anonymous zap off the user's own outbox relays", async () => {
    const {intent} = await makeZap()
    const attributed = write(Bolt12Zap, undefined, markerResolver)
      .setIntent(intent)
      .setProof(paidProof)
      .setPayer(await payerSigner.getPubkey())

    const anonymous = write(Bolt12Zap, undefined, markerResolver)
      .setIntent(intent)
      .setProof(paidProof)
      .clearPayer()

    expect(await publishRelays(attributed)).toContain(OUTBOX)
    expect(await publishRelays(anonymous)).not.toContain(OUTBOX)
    expect(await publishRelays(anonymous)).toContain(INBOX)
  })

  it("asks the indexers for an announcement as well as the author's outbox", async () => {
    const relays = await queryRelays(
      query(Bolt12Offer, markerResolver).setAuthors([await recipientSigner.getPubkey()]),
    )

    expect(relays).toContain(INDEX)
  })

  it("tells a zap of the recipient apart from a zap of their note", async () => {
    const recipient = await recipientSigner.getPubkey()
    const offer = await buildEvent(write(Bolt12Offer).addOffer(offerString), recipientSigner)
    const intent = await buildEvent(
      write(Bolt12ZapIntent).setRecipient(recipient).setAmount(21000).setOfferEvent(offer),
      payerSigner,
    )
    const zap = await buildUnvalidated(write(Bolt12Zap).setIntent(intent).setProof(paidProof))
    const reader = await read(Bolt12Zap, zap)

    expect(reader.targetsProfile()).toBe(true)
    expect(reader.validate()?.target).toBeUndefined()

    expect(await query(Bolt12Zap).forProfile(recipient).renderFilters()).toEqual([
      {kinds: [BOLT12_ZAP], "#p": [recipient]},
    ])
  })

  it("queries a regular event by e and a replaceable one by a", async () => {
    const article = {...note, kind: 30023, tags: [["d", "x"]]} as TrustedEvent

    expect(await query(Bolt12Zap).forEvent(note).renderFilters()).toEqual([
      {kinds: [BOLT12_ZAP], "#e": [note.id]},
    ])

    expect(await query(Bolt12Zap).forEvent(article).renderFilters()).toEqual([
      {kinds: [BOLT12_ZAP], "#a": [`30023:${article.pubkey}:x`]},
    ])
  })
})

const paidClaim = (overrides: Partial<Bolt12ZapClaim> = {}) =>
  ({
    proof: paidProof,
    offers: [paidOffer],
    payerNote: paidNote,
    amount: 21000,
    ...overrides,
  }) as Bolt12ZapClaim

describe("getBolt12ZapPaymentHash", () => {
  it("takes a settled proof of the amount, note and offer the claim names", () => {
    expect(getBolt12ZapPaymentHash(paidClaim())).toBe(paidHash)
  })

  it("refuses another amount, another intent, and an offer nobody announced", () => {
    expect(getBolt12ZapPaymentHash(paidClaim({amount: 22000}))).toBeUndefined()

    expect(
      getBolt12ZapPaymentHash(paidClaim({payerNote: makeBolt12PayerNote("cd".repeat(32))})),
    ).toBeUndefined()

    expect(getBolt12ZapPaymentHash(paidClaim({offers: [offerString]}))).toBeUndefined()
  })

  it("refuses a proof that decodes to nothing", () => {
    expect(getBolt12ZapPaymentHash(paidClaim({proof: "lnp1qqsexampleproof"}))).toBeUndefined()
  })
})

describe("sumBolt12Zaps", () => {
  const claim = (amount: number, proof: string, target?: string): Bolt12ZapClaim =>
    ({amount, proof, target}) as Bolt12ZapClaim

  it("counts one payment once, at the lower of the amounts claimed for it", () => {
    const claims = [claim(21000, "lnp1a"), claim(1000, "lnp1a"), claim(500, "lnp1b")]

    expect(sumBolt12Zaps(claims, c => c.proof)).toBe(1500)
  })

  it("deduplicates per target, so one proof reused on two targets counts twice", () => {
    const claims = [claim(21000, "lnp1a", "aa"), claim(21000, "lnp1a", "bb")]

    expect(sumBolt12Zaps(claims, c => c.proof)).toBe(42000)
  })

  it("validates the proofs itself when nobody hands it a check", () => {
    expect(sumBolt12Zaps([paidClaim(), claim(500, "lnp1b")])).toBe(21000)
  })

  it("leaves out a proof it cannot validate", () => {
    const claims = [claim(21000, "lnp1a"), claim(500, "lnp1b")]

    expect(sumBolt12Zaps(claims, c => (c.proof === "lnp1a" ? c.proof : undefined))).toBe(21000)
  })
})
