# bunicl

`bunicl` is a Bun CLI library under development. The current source exports
`CLI` and `Command` from `src/index.ts`.

## Register a typed command

`CLI.addCommand(name, handler, schema)` infers the handler's argument types from
the schema. Each option has a name and an optional `type` (`"string"` or
`"boolean"`); omitted types are strings.

```ts
import { CLI } from "bunicl";

const cli = new CLI("acme");
const command = cli.addCommand(
  "greet",
  ({ name, loud }) => {
    console.log(loud ? name.toUpperCase() : name);
  },
  [
    { name: "name", type: "string" },
    { name: "loud", type: "boolean" },
  ] as const,
);
```

The returned command retains the schema in `command.arguments`. The registry
stores commands under their names, but its handler cannot be called through the
registry's type: the registry does not track which schema belongs to a lookup
key. Use the typed value returned by `addCommand` when calling a handler with
already validated arguments.

## Current runtime limitations

`CLI.run()` currently logs `Bun.argv` and parses three hard-coded flags with
`util.parseArgs`. It does not dispatch registered commands or validate their
schemas. Importing `src/index.ts` also runs a demonstration CLI at module load
time. The registration example above is not yet an executable CLI.

## Development

```bash
bun install
bun run typecheck
```

The typecheck includes a compile-time regression for schema inference and safe
registry access in `src/index.typecheck.ts`.
