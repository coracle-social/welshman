# Welshman

A nostr toolkit for building highly configurable clients, extracted from the [Coracle](https://github.com/coracle-social/coracle) nostr client.

# Linking

Developing an application against a local copy of welshman requires `npm link`, which is only supported with `npm`.

- Clone welshman and the repository that depends on it
- Within each `package` directory in welshman, run `npm link`
- Within your application directory, link all welshman dependencies _simultaneously_, or else only one will get linked. A command that does this is: `rm -rf node_modules; npm i; cat package.json|jq -r '.dependencies|keys[]'|grep welshman|xargs npm link`.

Running `npm install` in your application directory undoes the link, so the final step has to be repeated. The `editor` package can cause dependency version conflicts, which excluding it from that command avoids.

# Agent Skills

Welshman ships agent skills for AI coding tools, one per package. See [`skills/README.md`](skills/README.md) for installation and the full list.
