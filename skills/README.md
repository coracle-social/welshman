# Welshman Agent Skills

Agent skills for working with the welshman nostr library in AI coding tools.

## What are these skills?

Agent skills are Markdown instruction sets that are auto-loaded by AI coding tools (Claude Code, Cursor, Cline, etc.) when relevant to your current task. Each skill contains focused documentation about a specific part of the welshman nostr library. When you ask a question that matches a skill's domain, the tool loads the full skill content automatically, giving the agent accurate, up-to-date knowledge about welshman's APIs and patterns.

## Installation

### Via npx (recommended)

```bash
npx skills add jstaab/welshman
```

This will prompt you to:

1. Select which skills to install from the available list
2. Select which agent(s) to install them for (Claude Code, Cursor, Cline, etc.)

### Manual (Claude Code)

Copy or symlink the skill files into your `.claude/skills/` directory:

```bash
# Copy a skill
cp welshman-net.md ~/.claude/skills/

# Or symlink the entire collection
ln -s /path/to/welshman/skills ~/.claude/skills/welshman
```

### Scope options

By default, skills are installed project-scoped — placed in the project's `.claude/skills/` directory and committed to the repo so your whole team benefits.

Use the `-g` flag to install globally instead, making the skills available across all your projects:

```bash
npx skills add -g jstaab/welshman
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
| welshman-app | High-level app-layer Svelte stores |
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

## Contributing

The source of truth for these skills is the [welshman repository](https://github.com/coracle-social/welshman). The `docs/` directory contains the underlying documentation that skills are derived from. If you find inaccuracies or want to improve coverage, please open an issue or pull request there.
