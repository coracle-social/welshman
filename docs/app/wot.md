# Web of Trust (WOT)

Welshman provides utilities for implementing a Web of Trust system within Nostr applications. This system analyzes social connections (follows and mutes) to build a reputation graph that can be used for content filtering, user scoring, and discovery.

## Core Concepts

- **Follow Trust**: Users gain positive reputation when followed by those in your network
- **Mute Distrust**: Users lose reputation when muted by those in your network
- **WOT Graph**: A reactive weighted directed graph representing trust relationships
- **Contextual Scoring**: Reputation scores that adapt based on user's social graph

## API Reference

### Social Graph Navigation

```typescript
// Get users followed by a specific pubkey
getFollows(pubkey: string): string[]

// Get users who have muted a specific pubkey
getMutes(pubkey: string): string[]

// Get followers of a specific pubkey
getFollowers(pubkey: string): string[]

// Get users who have muted a specific pubkey
getMuters(pubkey: string): string[]

// Get the extended network (follows-of-follows) for a pubkey
getNetwork(pubkey: string): string[]
```

### Trust Analysis

```typescript
// Get follows of a user who also follow a target
getFollowsWhoFollow(pubkey: string, target: string): string[]

// Get follows of a user who have muted a target
getFollowsWhoMute(pubkey: string, target: string): string[]

// Calculate trust score between users
getWotScore(pubkey: string, target: string): number
```

### Reactive Stores

```typescript
// Map of follower lists by pubkey
followersByPubkey: Readable<Map<string, Set<string>>>

// Map of muter lists by pubkey
mutersByPubkey: Readable<Map<string, Set<string>>>

// The full WOT graph with scores (pubkey → score)
wotGraph: Readable<Map<string, number>>

// The maximum WOT score in the graph
maxWot: Readable<number>

// Derive the WOT score for a specific user
deriveUserWotScore(targetPubkey: string): Readable<number>
```
