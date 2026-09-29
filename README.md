# bunicl

`bunicl` is a Bun CLI library under development.

## Installation

Install a specific GitHub release:

```bash
bun add github:2rueSid/bunicl#v0.2.1
```

## Register commands

```ts
import { CLI } from "bunicl";

const cli = new CLI("acme", "Acme tools");
const hello = cli.addCommand("hello", []);
hello.addDescription("say hello");
hello.on(async () => console.log("Hello"));

const objects = cli.addCommand("objects", []);
objects.addDescription("manage objects");
const get = cli.addCommand("get", ["objects"]);
get.addDescription("fetch an object");
get.on(async () => console.log("Fetching object"));

cli.run();
```

The second argument to `addCommand` is the parent path; `get` above is invoked
as `acme objects get`. Register a handler with `command.on(async (args) => { ... })`
to execute the command. Commands can also declare a third argument: an array
of option descriptors with `name`, `type` (`"string"` or `"boolean"`), and
optional `short`, `required`, `multiple`, `default`, and `description` fields.

## Help

Help shows the description, usage, available options, and immediate commands
in aligned columns. Long descriptions wrap under the description column:

```text
Acme tools

Usage: acme COMMAND ...

Available options:
    -h, --help  Prints help information

Available commands:
    hello    say hello
    objects  manage objects
```

- `acme --help` shows root help; `acme objects --help` shows the `objects`
  description and its immediate subcommands (`get  fetch an object`).
- `acme objects get --help` calls `get.help()` and shows its declared options
  without running its handler.
- A path used only as a parent, without a registered command, supports group
  help too. Its group entry has no description.
- An unknown command at any depth prints an error above root help. For
  example, `acme objects set` lists first-level commands, not `objects`
  subcommands.

Nested command descriptions appear at their parent level, not at the root.
You can also call `cli.help()` or a registered command's `help()` directly.

## Development

```bash
bun install
bun test
bun run typecheck
```

`src/index.ts` runs a demonstration CLI only when executed directly.
