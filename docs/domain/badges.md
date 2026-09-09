# Badges

NIP-58 badges are three kinds that only mean anything together: an issuer defines a badge (kind 30009), awards it to people (kind 8), and each recipient decides which of their awards to display (kind 30008). Each is a plain `EventReader` / `EventWriter` pair — see [Readers & Writers](./readers-and-writers) for the base pattern.

Every example below assumes a bound `KindContext`. None of these kinds decrypt, so nothing here needs awaiting on the read side.

## BadgeDefinition (kind 30009)

The badge itself. Its `d` tag is a slug unique to the issuer, so a badge is named everywhere else by its `30009:issuer:slug` address. Images carry an optional dimension, read as a `BadgeImage` (`{url, dim?}`); a badge may offer several thumbnails at different sizes.

```typescript
import {BadgeDefinition} from "@welshman/domain"
import type {BadgeImage} from "@welshman/domain"

const badge = BadgeDefinition.configure(context).reader(event).parse()
badge.identifier()    // the badge's slug
badge.name()          // "name" tag value
badge.description()   // "description" tag value
badge.image()         // BadgeImage | undefined
badge.thumbs()        // BadgeImage[]

await BadgeDefinition.configure(context)
  .writer()
  .setIdentifier("bravery")                                      // required d tag
  .setName("Medal of Bravery")
  .setDescription("Awarded for great bravery")
  .setImage({url: "https://example.com/badge.png", dim: "1024x1024"})
  .setThumbs([{url: "https://example.com/thumb.png", dim: "256x256"}])
  .renderTemplate()
```

## BadgeAward (kind 8)

One badge granted to one or more pubkeys. `validate()` requires both — an award with no badge or nobody to award it to is meaningless.

```typescript
import {BadgeAward} from "@welshman/domain"
import {getAddress} from "@welshman/util"

const award = BadgeAward.configure(context).reader(event).parse()
award.badge()      // the definition's address
award.awardees()   // p-tag pubkeys

await BadgeAward.configure(context)
  .writer()
  .setBadge(getAddress(definitionEvent))
  .addAwardee(theirPubkey)
  .renderTemplate()
```

`setBadge` replaces any existing badge, since an award grants exactly one. `addAwardee` is the base writer's `addMention`, so it hints at the recipient's outbox and never lists anyone twice; `removeAwardee` drops them. Under the default routing an award publishes to the issuer's outbox and every awardee's inbox, which is how a recipient hears about it.

## ProfileBadges (kind 30008)

The badges a pubkey has accepted, in the order they should be displayed. NIP-58 fixes the `d` tag at `profile_badges`, so there is only one of these per pubkey and the writer sets the identifier itself.

A displayed badge is a pair — an `a` tag naming the definition, immediately followed by an `e` tag naming the award — so the tags are read positionally rather than by key, and an `a` tag with no award after it is skipped.

```typescript
import {ProfileBadges} from "@welshman/domain"
import type {ProfileBadge} from "@welshman/domain"

const badges = ProfileBadges.configure(context).reader(event).parse()
badges.badges()            // ProfileBadge[] — {address, awardId, relay?}, in display order
badges.includes(address)   // boolean

await ProfileBadges.configure(context)
  .writer(badges)
  .addBadge({address, awardId, relay: "wss://relay.example.com/"})
  .removeBadge(otherAddress)
  .renderTemplate()
```

`addBadge` appends, moving a badge that is already displayed to the end rather than listing it twice. `removeBadge` takes the definition's address and drops the award with it, keeping the pairs intact. `setBadges` replaces the lot, which is what a reordering UI wants.

## See also

- [Readers & Writers](./readers-and-writers) — the base `EventReader`/`EventWriter` pattern, the `configure` entry point, default routing, and `d`-tag validation.
