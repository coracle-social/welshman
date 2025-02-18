# Web of Trust (WOT)

The WOT system provides a reactive way to calculate trust scores based on follows and mutes within a user's network. It helps determine content relevance and user reputation.

```typescript
import {
  wotGraph,         // Map of pubkey -> score
  maxWot,           // Highest score in graph
  getWotScore,      // Get score for pubkey
  deriveUserWotScore, // Reactive score for pubkey

  // Helper functions
  getFollows,       // Get user's follows
  getMutes,         // Get user's mutes
  getFollowers,     // Get user's followers
  getMuters,        // Get who muted user
  getNetwork,       // Get extended network
} from '@welshman/app'

// Get user's trust score
const score = getWotScore(pubkey)

// React to score changes
$: score = $deriveUserWotScore(pubkey)

// Get follows who follow target
const mutualFollows = getFollowsWhoFollow(userPubkey, targetPubkey)

// Get follows who muted target
const mutedBy = getFollowsWhoMute(userPubkey, targetPubkey)
```

The WOT system:
- Updates automatically as follows/mutes change
- Considers both direct and indirect relationships
- Provides normalized scores (0-1)
- Handles network effects
- Is used for content ranking and filtering

Think of it as a trust scoring system that helps determine what content and users are most relevant to the current user.
