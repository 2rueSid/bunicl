import { styleText } from "node:util";
import type { CommandArgument, RegisteredCommand } from "./types";

export function availableCommands(
	commands: Iterable<RegisteredCommand>,
	path: readonly string[],
): Map<string, string | undefined> {
	const entries = new Map<string, string | undefined>();

	for (const command of commands) {
		if (
			command.path.length < path.length ||
			!path.every((part, index) => command.path[index] === part)
		) {
			continue;
		}

		if (command.path.length === path.length) {
			entries.set(command.name, command.description);
		} else {
			const group = command.path[path.length];
			if (group !== undefined && !entries.has(group))
				entries.set(group, undefined);
		}
	}
	return entries;
}

export function formatRows(rows: Map<string, string | undefined>): string {
	let width = 0;

	for (const name of rows.keys()) width = Math.max(width, name.length);

	const lines: string[] = [];

	for (const [name, description] of rows) {
		const prefix = `    ${styleText("green", name.padEnd(width))}  `;

		if (!description) {
			lines.push(`    ${styleText("green", name)}`);
			continue;
		}
		const continuation = " ".repeat(prefix.length);
		let line = prefix;
		for (const word of description.split(/\s+/)) {
			if (line.length > prefix.length && line.length + word.length + 1 > 80) {
				lines.push(line);
				line = `${continuation}${word}`;
			} else {
				line += `${line.length > prefix.length ? " " : ""}${word}`;
			}
		}
		lines.push(line);
	}
	return lines.join("\n");
}

export function formatHelp(
	name: string,
	description: string | undefined,
	schema: readonly CommandArgument[],
	commands: Iterable<RegisteredCommand>,
	path: readonly string[] = [],
	defaultOptions: Record<string, string | undefined> = {},
): string {
	const available = availableCommands(commands, path);
	const options = new Map<string, string | undefined>(
		Object.entries(defaultOptions),
	);

	for (const arg of schema) {
		options.set(
			`${arg.short ? `-${arg.short}, ` : ""}--${arg.name}`,
			arg.description,
		);
	}
	const usage = `${styleText(["blue", "bold"], "Usage:")} ${name}${available.size ? " COMMAND ..." : " [OPTIONS]"}`;
	return [
		description,
		usage,
		`${styleText(["yellow", "bold"], "Available options:")}\n${formatRows(options)}`,
		available.size
			? `${styleText(["yellow", "bold"], "Available commands:")}\n${formatRows(available)}`
			: undefined,
	]
		.filter(Boolean)
		.join("\n\n");
}
