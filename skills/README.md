# Welshman Agent Skills

Agent skills for working with the welshman nostr library in AI coding tools.

## What are these skills?

Agent skills are Markdown instruction sets that AI coding tools (Claude Code, Cursor, Cline, etc.) load when they are relevant to the current task. Each skill documents one part of the welshman library: its APIs and the patterns for using them.

## Installation

```bash
npx skills add coracle-social/welshman
```

The command prompts for which skills to install and which agent tool to install them for. `-g` installs them globally across all your projects instead of just the current one.

## Available skills

| Skill | Description |
|-------|-------------|
| welshman | General overview, package map, getting started |
| welshman-util | Core nostr types, events, filters, tags, keys, NIPs, and the relay-selection routing DSL |
| welshman-domain | Nostr event kinds as Reader/Writer/Query classes: profiles, lists, rooms, handlers, zaps |
| welshman-lib | Utilities: LRU, emitter, deferred, task queue |
| welshman-net | Relay connections, request/publish, auth, Repository/Tracker |
| welshman-store | Svelte store primitives over a Repository |
| welshman-signer | Signing, login methods, encrypted events |
| welshman-feeds | Dynamic feed construction |
| welshman-app | Instance-based client: plugins, sessions, publishing, requests |
| welshman-content | Note content parsing and rendering |
| welshman-editor | Tiptap-based rich-text editor |

## How skills activate

At startup, the AI reads each skill's description. When a question matches a skill's domain, such as relay connections or feed construction, the tool loads the full skill content.

You can also invoke a skill manually using its slash command, to prime the agent before starting a task:

```
/welshman
/welshman-net
/welshman-store
```
