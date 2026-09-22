# bunicl

`bunicl` is a type-safe command-line interface library for Bun. It provides
isolated CLI instances, typed string and boolean options, positional arguments,
generated help, and explicit exit codes. The runtime has no third-party
dependencies and uses `Bun.argv` and `Bun.write`.

## Requirements

- Bun 1.4 or newer
- TypeScript when consuming the source package from a TypeScript project

## Install from Git

This package is private to prevent accidental registry publication. Install it
directly from the Git repository after creating the remote:

```bash
bun add git+ssh://git@github.com/<owner>/bunicl.git
```

Use an HTTPS URL instead when SSH access is unavailable:

```bash
bun add git+https://github.com/<owner>/bunicl.git
```

For local development, install the checkout by path:

```bash
bun add ../bunicl
```

## Define a CLI

```ts
#!/usr/bin/env bun

import { createCli } from "bunicl";

const cli = createCli({
  name: "acme",
  version: "1.0.0",
  description: "Acme project utilities",
});

cli.command("greet", {
  description: "Greet a person",
  options: [
    {
      name: "name",
      short: "n",
      description: "Name to greet",
      required: true,
    },
    {
      name: "loud",
      short: "l",
      type: "boolean",
      description: "Use uppercase output",
    },
  ] as const,
  run: async ({ options, positionals }) => {
    const greeting = `Hello, ${options.name}`;
    await Bun.write(
      Bun.stdout,
      `${options.loud ? greeting.toUpperCase() : greeting}\n`,
    );

    if (positionals.length > 0) {
      await Bun.write(Bun.stdout, `Extra values: ${positionals.join(", ")}\n`);
    }
  },
});

const exitCode = await cli.run();
if (exitCode !== 0) process.exitCode = exitCode;
```

Run the command through Bun:

```bash
bun run ./src/cli.ts greet --name Ada --loud
bun run ./src/cli.ts greet -ln Ada
bun run ./src/cli.ts greet --help
```

`cli.run()` reads `Bun.argv.slice(2)` by default. Pass an argument array when
embedding the CLI or testing it:

```ts
const exitCode = await cli.run(["greet", "--name", "Ada"]);
```

## Option behavior

- String options accept `--name value`, `--name=value`, `-n value`, or
  `-nvalue`.
- Boolean options accept `--loud`, `--loud=true`, `--loud=false`, or
  `--no-loud`.
- Short boolean flags can be grouped. For example, `-vl` enables `-v` and
  `-l`.
- `--` stops option parsing. Remaining values are available through
  `positionals`.
- Optional string options are `string | undefined`.
- Boolean options are always `boolean` and default to `false`.
- A string option with `required: true` or `default` is always `string`.

The `as const` assertion preserves literal option names and gives the command
handler exact option types.

## Errors and exit codes

`run()` returns:

- `0` after a command runs or help/version output is written.
- `2` for invalid commands, options, or missing required options.

Usage errors are written to stderr with command-specific help. Exceptions thrown
by a command handler are not caught or rewritten, so the calling application
retains the original error and stack.

## Output control

The default writers call `Bun.write(Bun.stdout, text)` and
`Bun.write(Bun.stderr, text)`. Supply writers to capture or redirect output:

```ts
const messages: string[] = [];
const cli = createCli({
  name: "embedded",
  stdout: (text) => {
    messages.push(text);
  },
});
```

## API

The package exports:

- `createCli(config)` and the `Cli` class.
- `CliConfig`, `CliWriter`, `CommandDefinition`, and `CommandContext`.
- `OptionDefinition`, `StringOption`, `BooleanOption`, and `ParsedOptions`.

Each `Cli` instance owns its command registry. Separate applications can use the
library in the same process without sharing commands or configuration.
