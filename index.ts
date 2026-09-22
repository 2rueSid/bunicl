import { parseArgs } from "node:util";
import { configure, getConsoleSink, getLogger } from "@logtape/logtape";
import { prettyFormatter } from "@logtape/pretty";

const CLI_LOGLER = "buncli";

export const initLogger = async () =>
	await configure({
		sinks: {
			console: getConsoleSink({
				formatter: prettyFormatter,
			}),
		},
		loggers: [
			{ category: CLI_LOGLER, lowestLevel: "debug", sinks: ["console"] },
		],
	});

const cliLogger = getLogger(CLI_LOGLER);

type CLIArgument = {
	name: string;
	description: string;
	short?: string;
	type?: "string" | "boolean";
	required?: boolean;
	default?: string | boolean;
};

type ParsedArgValue<TArg extends CLIArgument> = TArg["type"] extends "boolean"
	? boolean
	: string;

type ParsedArgs<TInput extends readonly CLIArgument[]> = {
	[K in TInput[number] as K["name"]]: ParsedArgValue<K>;
};

type CommandDefinition = {
	run: () => Promise<void>;
};

type CLIOptions<TInput extends readonly CLIArgument[]> = {
	[K in TInput[number] as K["name"]]: {
		multiple: boolean;
		short?: string;
		default?: string | boolean;
		type: "string" | "boolean";
	};
};

const commands: Record<string, CommandDefinition> = {};

export const command = <TInput extends readonly CLIArgument[]>(
	name: string,
	cb: (args: ParsedArgs<TInput>) => void | Promise<void>,
	schema?: TInput,
) => {
	const options = {} as CLIOptions<TInput>;

	if (schema) {
		Object.assign(
			options,
			schema.reduce(
				(acc, v) => {
					type OptionShape = {
						multiple: boolean;
						type: "string" | "boolean";
						short?: string;
						default?: string | boolean;
					};

					const option = {
						multiple: false,
						type: v.type ?? "string",
					} as OptionShape;

					if (v.short) {
						option.short = v.short;
					}

					if (v.default !== undefined) {
						option.default = v.default;
					}

					acc[v.name as keyof CLIOptions<TInput>] =
						option as CLIOptions<TInput>[keyof CLIOptions<TInput>];

					return acc;
				},
				{} as CLIOptions<TInput>,
			),
		);
	}

	const run = async () => {
		cliLogger.debug(`Parsing arguments for command '${name}'`);
		const { values } = parseArgs({
			args: Bun.argv.slice(3),
			options,
			strict: true,
			allowPositionals: true,
		});
		const parsedValues = values as Record<string, unknown>;

		if (schema) {
			for (const arg of schema) {
				if (arg.required && parsedValues[arg.name] === undefined) {
					cliLogger.error(
						`Missing required argument '--${arg.name}' for command '${name}'`,
					);
					throw new Error(`Missing required argument: --${arg.name}`);
				}
			}
		}

		cliLogger.debug(`Executing command callback for '${name}'`);
		await cb(parsedValues as unknown as ParsedArgs<TInput>);
	};

	const def: CommandDefinition = {
		run,
	};

	commands[name] = def;
	cliLogger.debug(`Registered CLI command '${name}'`);

	return def;
};

export async function exec() {
	cliLogger.info("Starting CLI execution");

	if (Object.keys(commands).length <= 0) {
		cliLogger.error("No commands specified before CLI execution");
		throw new Error("No commands specified");
	}

	if (!Bun.argv[2] || !(Bun.argv[2] in commands)) {
		const availableCommands = Object.keys(commands).join(", ");
		cliLogger.error(
			`Command not found: '${Bun.argv[2] ?? "<empty>"}'. Available commands: ${availableCommands}`,
		);
		throw new Error(
			`Command not found. Available commands: ${availableCommands}`,
		);
	}

	const commandData = commands[Bun.argv[2]];
	cliLogger.info(`Running command '${Bun.argv[2]}'`);

	try {
		await commandData?.run();
		cliLogger.info(`Command '${Bun.argv[2]}' completed`);
	} catch (error) {
		cliLogger.error(`Command '${Bun.argv[2]}' failed: ${error}`);
		throw error;
	}
}
