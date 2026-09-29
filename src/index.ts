import {
	type ParseArgsOptionDescriptor,
	parseArgs,
	styleText,
} from "node:util";
import { formatHelp } from "./help";
import type { Args, CommandArgument, RegisteredCommand } from "./types";

const helpArgument = {
	name: "help",
	short: "h",
	type: "boolean",
	description: "Prints help information",
	multiple: false,
	default: false,
} as const satisfies CommandArgument;

type WithHelp<S extends readonly CommandArgument[]> = readonly [
	...S,
	typeof helpArgument,
];

class Command<const S extends readonly CommandArgument[]>
	implements RegisteredCommand
{
	path: string[];
	name: string;
	readonly schema: WithHelp<S>;
	description?: string | undefined;

	private handler?: (args: Args<WithHelp<S>>) => Promise<void>;

	constructor(
		path: string[],
		name: string,
		schema: S,
		private readonly cliName: string,
	) {
		this.name = name;
		this.path = path;
		this.schema = [...schema, helpArgument] as const;
	}

	on(handler: (args: Args<WithHelp<S>>) => Promise<void>): this {
		this.handler = handler;
		return this;
	}

	addDescription(description: string): void {
		this.description = description;
	}

	help(commands: Iterable<RegisteredCommand> = []): void {
		const path = [...this.path, this.name];
		console.log(
			formatHelp(
				[this.cliName, ...path].join(" "),
				this.description,
				this.schema,
				commands,
				path,
			),
		);
	}

	async run(
		runtimeArguments: string[],
		commands: Iterable<RegisteredCommand>,
	): Promise<void> {
		if (!this.handler) throw new Error(`No handler for ${this.name}`);

		const options = this.schema.reduce((acc, arg) => {
			const cmdArg: ParseArgsOptionDescriptor = {
				type: arg.type,
			};

			if (arg?.short) {
				cmdArg.short = arg.short;
			}

			if (arg?.multiple) {
				cmdArg.multiple = arg.multiple;
			}

			if (arg?.default) {
				cmdArg.default = arg.default;
			}

			return Object.assign(acc, { [arg.name]: cmdArg });
		}, {});

		const { values: parsedValues } = parseArgs({
			args: runtimeArguments,
			options: options,
			allowPositionals: true,
		}) as { values: Args<S>; positionals: string[] };

		if ("help" in parsedValues && parsedValues.help) {
			this.help(commands);
			return;
		}

		await this.handler(parsedValues);
	}
}

export class CLI {
	name: string;
	description: string = "";
	private commands = new Map<string, RegisteredCommand>();

	constructor(name: string, description: string = "") {
		this.name = name;
		this.description = description;
	}

	addCommand(name: string, path: string[]): Command<[]>;
	addCommand<const S extends readonly CommandArgument[]>(
		name: string,
		path: string[],
		schema: S,
	): Command<S>;

	addCommand(
		name: string,
		path: string[] = [],
		schema: readonly CommandArgument[] = [],
	) {
		const fullCmdPath = [...path, name].join(".");
		if (this.commands.has(fullCmdPath)) {
			throw new Error(`${fullCmdPath} already exists`);
		}

		const cmd = new Command(path, name, schema, this.name);
		this.commands.set(fullCmdPath, cmd);
		return cmd;
	}

	async run() {
		const args = Bun.argv.slice(2);
		const commandPath: string[] = [];

		for (const arg of args) {
			if (arg.startsWith("-")) break;
			commandPath.push(arg);
		}

		if (
			commandPath.length === 0 &&
			(args.length === 0 || args.includes("--help") || args.includes("-h"))
		) {
			this.help();
			return;
		}

		const commandPathStr = commandPath.join(".");
		const command = this.commands.get(commandPathStr);

		if (!command && commandPath.length) {
			const tmpCmd = new Command(
				[],
				commandPath.reverse()[0] || "",
				[],
				this.name,
			);

			tmpCmd.help(this.commands.values());
			return;
		}

		if (!command) {
			this.help([
				styleText("red", `Command ${commandPath.join(" ")} doesn't exist`),
			]);
			return;
		}

		await command.run(args, this.commands.values());
	}

	help(additionalText: string[] = []) {
		console.log(
			...additionalText,
			formatHelp(this.name, this.description, [], this.commands.values(), [], {
				"-h, --help": "Prints help information",
			}),
		);
	}
}
