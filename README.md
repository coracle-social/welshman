# Welshman

A nostr toolkit focused on creating highly a configurable client system, extracted from the [Coracle](https://github.com/coracle-social/coracle) nostr client.

# Linking

If you're developing an application which requires changes to welshman, you'll need to use `npm link` to link the two. This is an annoying process, and is only supported if using `npm`.

- Clone welshman and the repository that depends on it
- Within each `package` directory in welshman, run `npm link`
- Within your application directory, link all welshman dependencies _simultaneously_ (or else only one will get linked. A command that does this is: `rm -rf node_modules; npm i; cat package.json|js '.dependencies|keys[]'|grep welshman|xargs npm link`.

If you run `npm install` in your application directory, you'll need to repeat the final step above. Finally, if you're using the `editor` module, you may run into some dependency version conflicts. I recommend editing the command above to exclude the editor.

# Agent Skills

Welshman ships with agent skills for AI coding tools. Each skill covers a specific package and is auto-loaded when relevant to your current task.

```bash
npx skills add coracle-social/welshman
```

This will prompt you to select which skills to install and which agent tool to install them for. Use `-g` to install globally across all your projects instead of just the current one.

See `skills/README.md` for the full list and details on how they activate.
