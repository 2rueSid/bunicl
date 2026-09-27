import { type ParseArgsOptionDescriptor, parseArgs } from "util";
import type { Args, CommandArgument, RegisteredCommand } from "./types";

class Command<const S extends readonly CommandArgument[]>
	implements RegisteredCommand
{
	path: string[];
	name: string;
	schema: S;

	private handler?: (args: Args<S>) => Promise<void>;

	constructor(path: string[], name: string, schema: S) {
		this.name = name;
		this.path = path;
		this.schema = schema;
	}

	on(handler: (args: Args<S>) => Promise<void>): this {
		this.handler = handler;
		return this;
	}

	async run(runtimeArguments: string[]): Promise<void> {
		if (!this.handler) throw new Error(`No handler for ${this.name}`);

		const options = this.schema.reduce((acc, arg) => {
			const cmdArg: ParseArgsOptionDescriptor = {
				type: arg.type,
			};

			if (arg.short) {
				cmdArg.short = arg.short;
			}

			if (arg.multiple) {
				cmdArg.multiple = arg.multiple;
			}

			if (arg.default) {
				cmdArg.default = arg.default;
			}

			return Object.assign(acc, { [arg.name]: cmdArg });
		}, {});

		console.log(options);

		const { values: parsedValues } = parseArgs({
			args: runtimeArguments,
			options: options,
			allowPositionals: true,
		}) as { values: Args<S>; positionals: string[] };

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

		const cmd = new Command(path, name, schema);
		this.commands.set(fullCmdPath, cmd);
		return cmd;
	}

	async run() {
		const args = Bun.argv.slice(2);

		const commandPath = [];
		for (const arg of args) {
			if (arg.startsWith("-")) {
				break;
			}

			commandPath.push(arg);
		}

		const commandKey = commandPath.join(".");
		const command = this.commands.get(commandKey);

		if (!command) {
			this.help();
			throw new Error(`Command ${commandKey} doesn't exists`);
		} else {
		}

		await command.run(args);
	}

	help() {
		console.log(cli.description);
	}
}

////////////// TESTING ////////////////////

const cli = new CLI("greeter", "a convinient method to meet people");

const sayHi = cli.addCommand(
	"say-hi",
	[],
	[
		{
			name: "name",
			short: "n",
			required: true,
			type: "string",
		},
		{
			name: "age",
			short: "a",
			type: "string",
		},
	],
);

sayHi.on(async (args) => {
	console.log(`Hello ${args.name} of age ${args.age}`);
});

const objectsGet = cli.addCommand(
	"get",
	["objects"],
	[
		{
			name: "id",
			type: "string",
			required: true,
		},
	],
);

objectsGet.on(async (args) => {
	console.log(`getting object for ${args.id}`);
});

const simpleCmd = cli.addCommand("simple", ["objects"]);

simpleCmd.on(async () => {
	console.log("im simple cmd");
});

cli.run();
