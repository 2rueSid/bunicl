type Value<A extends CommandArgument> = A["multiple"] extends true
	? A["type"] extends "boolean"
		? boolean[]
		: string[]
	: A["type"] extends "boolean"
		? boolean
		: string;

export type Args<S extends readonly CommandArgument[]> =
	// Required arguments (and arguments with defaults) are always present.
	{
		[A in S[number] as A extends
			| { required: true }
			| { default: string | boolean }
			? A["name"]
			: never]: Value<A>;
	} & {
		// Other arguments may be absent.
		[A in S[number] as A extends
			| { required: true }
			| { default: string | boolean }
			? never
			: A["name"]]?: Value<A>;
	};

export type CommandArgument = {
	name: string;
	short?: string;
	required?: boolean;
	multiple?: boolean;
	description?: string;
	type: "string" | "boolean";
	default?: string | boolean;
};

export interface RegisteredCommand {
	readonly path: readonly string[];
	readonly name: string;
	readonly schema: readonly CommandArgument[];
	readonly description?: string;

	run(argv: string[], commands: Iterable<RegisteredCommand>): Promise<void>;
	addDescription(description: string): void;
	help(commands: Iterable<RegisteredCommand>): void;
}
