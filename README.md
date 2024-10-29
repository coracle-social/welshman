# Welshman

A nostr toolkit focused on creating highly a configurable client system, extracted from the [Coracle](https://github.com/coracle-social/coracle) nostr client.

This is a monorepo which is split into several different packages:

- [@welshman/lib](./packages/lib) - generic utility functions.
- [@welshman/util](./packages/util) - various nostr-specific utilities.
- [@welshman/net](./packages/net) - framework for interacting with relays.
- [@welshman/content](./packages/content) - utilities for parsing and rendering notes.
- [@welshman/feeds](./packages/feeds) - an interpreter for custom nostr feeds.
- [@welshman/dvm](./packages/dvm) - utilities for creating and making request against dvms.

# Linking

If you're developing an application which requires changes to welshman, you'll need to use `npm link` to link the two. This is an annoying process, and is only supported if using `npm`.

- Clone welshman and the repository that depends on it
- Within each `package` directory in welshman, run `npm link`
- Within your application directory, link all welshman dependencies _simultaneously_ (or else only one will get linked. A command that does this is: `rm -rf node_modules; npm i; cat package.json|js '.depedencies|keys[]'|grep welshman|xargs npm link`.

If you run `npm install` in your application directory, you'll need to repeat the final step above.
