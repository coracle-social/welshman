---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "Welshman"
  text: Nostr building blocks for the web
  tagline: A series of independent libraries for managing every aspect of your Nostr application.
  actions:
    - theme: brand
      text: What is Welshman?
      link: /what-is-welshman
    - theme: alt
      text: Quickstart
      link: /getting-started
    - theme: alt
      text: Github
      link: https://github.com/coracle-social/welshman

features:
  - title: "@welshman/content"
    details: Parser and renderer for nostr note with customizable formatting options.
    link: "/content"
  - title: "@welshman/dvm"
    details: Tools for building and interacting with nostr Data Vending Machines (DVMs)
    link: "/dvm"
  - title: "@welshman/editor"
    details: Rich text editor component with support for mentions and embeds.
    link: "/editor"
  - title: "@welshman/feeds"
    details: Dynamic feed compiler and loader with filtering and composition.
    link: "/feeds"
  - title: "@welshman/util"
    details: Core Nostr utilities for events, filters, and data structures.
    link: "/util"
  - title: "@welshman/net"
    details: Networking layer for Nostr with relay connection management and message status handling.
    link: "/net"
  - title: "@welshman/signer"
    details: Implementations of various nostr signing methods (NIP-01, NIP-07, NIP-46, NIP-55).
    link: "/signer"
  - title: "@welshman/store"
    details: Svelte store utilities optimized for nostr state management.
    link: "/store"
---
