# Welshman Agent Skills

Agent skills for working with the welshman nostr library in AI coding tools.

## What are these skills?

Agent skills are Markdown instruction sets that are auto-loaded by AI coding tools (Claude Code, Cursor, Cline, etc.) when relevant to your current task. Each skill contains focused documentation about a specific part of the welshman nostr library. When you ask a question that matches a skill's domain, the tool loads the full skill content automatically, giving the agent accurate, up-to-date knowledge about welshman's APIs and patterns.

## Installation

### Via npx (recommended)

```bash
npx skills add coracle-social/welshman
```

## Available skills

| Skill | Description |
|-------|-------------|
| welshman | General overview, package map, getting started |
| welshman-util | Core nostr types, events, filters, NIPs |
| welshman-lib | Utilities: LRU, emitter, deferred, task queue |
| welshman-net | Relay connections, request/publish, auth |
| welshman-router | Relay selection strategies |
| welshman-store | Svelte stores and Repository pattern |
| welshman-signer | Signing, login methods, encrypted events |
| welshman-feeds | Dynamic feed construction |
| welshman-app | Instance-based client: plugins, sessions, publishing, requests |
| welshman-content | Note content parsing and rendering |
| welshman-editor | Svelte rich-text editor component |

## How skills activate

At startup, the AI reads each skill's description to understand what it covers. When you ask a question that matches a skill's domain — for example, asking about relay connections or feed construction — the full skill content is loaded automatically to inform the response.

You can also invoke a skill manually using its slash command:

```
/welshman
/welshman-net
/welshman-store
```

This is useful when you want to prime the agent with a specific skill before starting a task.
