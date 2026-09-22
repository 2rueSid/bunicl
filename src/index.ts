export type CliWriter = (text: string) => void | Promise<void>;

export interface CliConfig {
	name: string;
	version?: string;
	description?: string;
	stdout?: CliWriter;
	stderr?: CliWriter;
}

type OptionBase<Name extends string> = {
	name: Name;
	description: string;
	short?: string;
	required?: boolean;
};

export type StringOption<Name extends string = string> = OptionBase<Name> & {
	type?: "string";
	default?: string;
};

export type BooleanOption<Name extends string = string> = OptionBase<Name> & {
	type: "boolean";
	default?: boolean;
};

export type OptionDefinition<Name extends string = string> =
	| StringOption<Name>
	| BooleanOption<Name>;

type OptionValue<Option extends OptionDefinition> = Option extends BooleanOption
	? boolean
	: string;

type AlwaysPresent<Option extends OptionDefinition> =
	Option extends BooleanOption
		? true
		: Option extends { required: true }
			? true
			: Option extends { default: string }
				? true
				: false;

export type ParsedOptions<Options extends readonly OptionDefinition[]> = {
	[Option in Options[number] as AlwaysPresent<Option> extends true
		? Option["name"]
		: never]: OptionValue<Option>;
} & {
	[Option in Options[number] as AlwaysPresent<Option> extends true
		? never
		: Option["name"]]?: OptionValue<Option>;
};

export interface CommandContext<
	Options extends readonly OptionDefinition[] = readonly OptionDefinition[],
> {
	options: ParsedOptions<Options>;
	positionals: string[];
}

export interface CommandDefinition<
	Options extends readonly OptionDefinition[] = readonly [],
> {
	description: string;
	options?: Options;
	run: (context: CommandContext<Options>) => void | Promise<void>;
}

type ParsedValue = string | boolean | undefined;

type RegisteredCommand = {
	name: string;
	description: string;
	options: readonly OptionDefinition[];
	run: (
		options: Record<string, ParsedValue>,
		positionals: string[],
	) => void | Promise<void>;
};

type ParsedCommandArguments =
	| { help: true }
	| {
			help: false;
			options: Record<string, ParsedValue>;
			positionals: string[];
	  };

class CliUsageError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CliUsageError";
	}
}

const commandNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const optionNamePattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const shortNamePattern = /^[A-Za-z0-9]$/;

const defaultStdout: CliWriter = async (text) => {
	await Bun.write(Bun.stdout, text);
};

const defaultStderr: CliWriter = async (text) => {
	await Bun.write(Bun.stderr, text);
};

function optionType(option: OptionDefinition): "string" | "boolean" {
	return option.type ?? "string";
}

function formatDefault(value: string | boolean): string {
	return typeof value === "string" ? JSON.stringify(value) : String(value);
}

function formatRows(rows: ReadonlyArray<readonly [string, string]>): string {
	const labelWidth = rows.reduce(
		(longest, [label]) => Math.max(longest, label.length),
		0,
	);

	return rows
		.map(([label, description]) => `  ${label.padEnd(labelWidth)}  ${description}`)
		.join("\n");
}

function optionLabel(option: OptionDefinition): string {
	const value = optionType(option) === "string" ? " <value>" : "";
	const long = `--${option.name}${value}`;
	return option.short ? `-${option.short}, ${long}` : `    ${long}`;
}

function optionDescription(option: OptionDefinition): string {
	const annotations: string[] = [];
	if (option.required) annotations.push("required");
	if (option.default !== undefined) {
		annotations.push(`default: ${formatDefault(option.default)}`);
	}

	return annotations.length === 0
		? option.description
		: `${option.description} (${annotations.join(", ")})`;
}

function parseBoolean(optionName: string, value: string): boolean {
	if (value === "true") return true;
	if (value === "false") return false;
	throw new CliUsageError(
		`Option '--${optionName}' expects 'true' or 'false', received '${value}'.`,
	);
}

function initialOptionValues(
	options: readonly OptionDefinition[],
): Record<string, ParsedValue> {
	const values: Record<string, ParsedValue> = {};
	for (const option of options) {
		if (option.default !== undefined) {
			values[option.name] = option.default;
		} else if (optionType(option) === "boolean") {
			values[option.name] = false;
		}
	}
	return values;
}

function parseCommandArguments(
	command: RegisteredCommand,
	args: readonly string[],
): ParsedCommandArguments {
	const byName = new Map(command.options.map((option) => [option.name, option]));
	const byShort = new Map(
		command.options.flatMap((option) =>
			option.short ? ([[option.short, option]] as const) : [],
		),
	);
	const values = initialOptionValues(command.options);
	const seen = new Set<string>();
	const positionals: string[] = [];
	let positionalOnly = false;

	for (let index = 0; index < args.length; index += 1) {
		const token = args[index];
		if (token === undefined) continue;

		if (positionalOnly) {
			positionals.push(token);
			continue;
		}

		if (token === "--") {
			positionalOnly = true;
			continue;
		}

		if (token === "--help" || token === "-h") return { help: true };

		if (token.startsWith("--")) {
			const separator = token.indexOf("=");
			const rawName = token.slice(2, separator === -1 ? undefined : separator);
			const exactOption = byName.get(rawName);
			const negatedName = rawName.startsWith("no-") ? rawName.slice(3) : undefined;
			const option = exactOption ?? (negatedName ? byName.get(negatedName) : undefined);

			if (!option) {
				throw new CliUsageError(`Unknown option '--${rawName}'.`);
			}

			const type = optionType(option);
			const inlineValue = separator === -1 ? undefined : token.slice(separator + 1);
			const negated = exactOption === undefined && negatedName !== undefined;

			if (negated) {
				if (type !== "boolean") {
					throw new CliUsageError(
						`Option '--${option.name}' is not boolean and cannot use '--no-${option.name}'.`,
					);
				}
				if (inlineValue !== undefined) {
					throw new CliUsageError(
						`Option '--no-${option.name}' does not accept a value.`,
					);
				}
				values[option.name] = false;
				seen.add(option.name);
				continue;
			}

			if (type === "boolean") {
				values[option.name] =
					inlineValue === undefined
						? true
						: parseBoolean(option.name, inlineValue);
				seen.add(option.name);
				continue;
			}

			const value = inlineValue ?? args[index + 1];
			if (value === undefined) {
				throw new CliUsageError(`Option '--${option.name}' requires a value.`);
			}
			if (inlineValue === undefined) index += 1;
			values[option.name] = value;
			seen.add(option.name);
			continue;
		}

		if (token.startsWith("-") && token !== "-") {
			const cluster = token.slice(1);
			for (let shortIndex = 0; shortIndex < cluster.length; shortIndex += 1) {
				const short = cluster[shortIndex];
				if (short === undefined) continue;
				if (short === "h") return { help: true };

				const option = byShort.get(short);
				if (!option) {
					throw new CliUsageError(`Unknown option '-${short}'.`);
				}

				if (optionType(option) === "boolean") {
					values[option.name] = true;
					seen.add(option.name);
					continue;
				}

				const attachedValue = cluster.slice(shortIndex + 1);
				const value = attachedValue || args[index + 1];
				if (value === undefined) {
					throw new CliUsageError(`Option '-${short}' requires a value.`);
				}
				if (!attachedValue) index += 1;
				values[option.name] = value;
				seen.add(option.name);
				break;
			}
			continue;
		}

		positionals.push(token);
	}

	for (const option of command.options) {
		if (option.required && !seen.has(option.name)) {
			throw new CliUsageError(`Missing required option '--${option.name}'.`);
		}
	}

	return { help: false, options: values, positionals };
}

function validateOption(
	commandName: string,
	option: OptionDefinition,
	seenNames: Set<string>,
	seenShortNames: Set<string>,
): void {
	if (!optionNamePattern.test(option.name)) {
		throw new TypeError(
			`Invalid option name '${option.name}' on command '${commandName}'. Use lowercase kebab-case.`,
		);
	}
	if (option.name === "help") {
		throw new TypeError(
			`Command '${commandName}' cannot register '--help'; that option is built in.`,
		);
	}
	if (seenNames.has(option.name)) {
		throw new TypeError(
			`Command '${commandName}' already has an option named '--${option.name}'.`,
		);
	}
	seenNames.add(option.name);

	if (option.short !== undefined) {
		if (!shortNamePattern.test(option.short)) {
			throw new TypeError(
				`Invalid short option '${option.short}' on command '${commandName}'. Use one letter or digit.`,
			);
		}
		if (option.short === "h") {
			throw new TypeError(
				`Command '${commandName}' cannot register '-h'; that option is built in.`,
			);
		}
		if (seenShortNames.has(option.short)) {
			throw new TypeError(
				`Command '${commandName}' already has a short option named '-${option.short}'.`,
			);
		}
		seenShortNames.add(option.short);
	}

	if (option.required && option.default !== undefined) {
		throw new TypeError(
			`Option '--${option.name}' on command '${commandName}' cannot be required and have a default.`,
		);
	}
	if (
		option.default !== undefined &&
		typeof option.default !== optionType(option)
	) {
		throw new TypeError(
			`Default for '--${option.name}' on command '${commandName}' must be ${optionType(option)}.`,
		);
	}
}

export class Cli {
	readonly #config: CliConfig;
	readonly #commands = new Map<string, RegisteredCommand>();
	readonly #stdout: CliWriter;
	readonly #stderr: CliWriter;

	constructor(config: CliConfig) {
		if (config.name.trim().length === 0 || /[\r\n]/.test(config.name)) {
			throw new TypeError("CLI name must be a non-empty, single-line string.");
		}
		this.#config = config;
		this.#stdout = config.stdout ?? defaultStdout;
		this.#stderr = config.stderr ?? defaultStderr;
	}

	command<const Options extends readonly OptionDefinition[] = readonly []>(
		name: string,
		definition: CommandDefinition<Options>,
	): this {
		if (!commandNamePattern.test(name)) {
			throw new TypeError(
				`Invalid command name '${name}'. Use lowercase kebab-case.`,
			);
		}
		if (name === "help") {
			throw new TypeError("Command name 'help' is reserved by the CLI.");
		}
		if (this.#commands.has(name)) {
			throw new TypeError(`Command '${name}' is already registered.`);
		}

		const options = definition.options ?? [];
		const seenNames = new Set<string>();
		const seenShortNames = new Set<string>();
		for (const option of options) {
			validateOption(name, option, seenNames, seenShortNames);
		}

		this.#commands.set(name, {
			name,
			description: definition.description,
			options,
			run: (parsedOptions, positionals) =>
				definition.run({
					options: parsedOptions as ParsedOptions<Options>,
					positionals,
				}),
		});
		return this;
	}

	help(commandName?: string): string {
		if (commandName !== undefined) {
			const command = this.#commands.get(commandName);
			if (!command) {
				throw new CliUsageError(`Unknown command '${commandName}'.`);
			}
			return this.#commandHelp(command);
		}

		const lines = [`Usage: ${this.#config.name} <command> [options]`];
		if (this.#config.description) lines.push("", this.#config.description);

		if (this.#commands.size > 0) {
			const commandRows = [...this.#commands.values()].map(
				(command) => [command.name, command.description] as const,
			);
			lines.push("", "Commands:", formatRows(commandRows));
		}

		const builtIns: Array<readonly [string, string]> = [
			["-h, --help", "Show help"],
		];
		if (this.#config.version !== undefined) {
			builtIns.push(["-V, --version", "Show version"]);
		}
		lines.push("", "Options:", formatRows(builtIns));
		return `${lines.join("\n")}\n`;
	}

	async run(args: readonly string[] = Bun.argv.slice(2)): Promise<number> {
		const [requestedCommand, ...commandArgs] = args;

		if (
			requestedCommand === undefined ||
			requestedCommand === "--help" ||
			requestedCommand === "-h"
		) {
			await this.#stdout(this.help());
			return 0;
		}

		if (requestedCommand === "--version" || requestedCommand === "-V") {
			if (this.#config.version === undefined) {
				await this.#stderr(
					`Error: CLI '${this.#config.name}' does not define a version.\n`,
				);
				return 2;
			}
			await this.#stdout(`${this.#config.version}\n`);
			return 0;
		}

		if (requestedCommand === "help") {
			const target = commandArgs[0];
			if (target === undefined) {
				await this.#stdout(this.help());
				return 0;
			}
			const command = this.#commands.get(target);
			if (!command) {
				await this.#unknownCommand(target);
				return 2;
			}
			await this.#stdout(this.#commandHelp(command));
			return 0;
		}

		const command = this.#commands.get(requestedCommand);
		if (!command) {
			await this.#unknownCommand(requestedCommand);
			return 2;
		}

		try {
			const parsed = parseCommandArguments(command, commandArgs);
			if (parsed.help) {
				await this.#stdout(this.#commandHelp(command));
				return 0;
			}
			await command.run(parsed.options, parsed.positionals);
			return 0;
		} catch (error) {
			if (!(error instanceof CliUsageError)) throw error;
			await this.#stderr(
				`Error: ${error.message}\n\n${this.#commandHelp(command)}`,
			);
			return 2;
		}
	}

	#commandHelp(command: RegisteredCommand): string {
		const lines = [
			`Usage: ${this.#config.name} ${command.name} [options] [--] [arguments...]`,
			"",
			command.description,
		];
		const optionRows: Array<readonly [string, string]> = command.options.map(
			(option) => [optionLabel(option), optionDescription(option)] as const,
		);
		optionRows.push(["-h, --help", "Show help"]);
		lines.push("", "Options:", formatRows(optionRows));
		return `${lines.join("\n")}\n`;
	}

	async #unknownCommand(name: string): Promise<void> {
		await this.#stderr(
			`Error: Unknown command '${name}'. Run '${this.#config.name} --help' to list available commands.\n`,
		);
	}
}

export function createCli(config: CliConfig): Cli {
	return new Cli(config);
}
