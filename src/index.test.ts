import { describe, expect, test } from "bun:test";
import { createCli } from "./index";

function createOutput() {
	const stdout: string[] = [];
	const stderr: string[] = [];
	return {
		stdout,
		stderr,
		writeStdout: (text: string) => {
			stdout.push(text);
		},
		writeStderr: (text: string) => {
			stderr.push(text);
		},
	};
}

describe("Cli", () => {
	test("parses typed options, short flags, and positionals", async () => {
		const output = createOutput();
		let received: unknown;
		const cli = createCli({
			name: "example",
			stdout: output.writeStdout,
			stderr: output.writeStderr,
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
			run: (context) => {
				received = context;
			},
		});

		const exitCode = await cli.run(["greet", "-ln", "Ada", "friend"]);

		expect(exitCode).toBe(0);
		expect(received).toEqual({
			options: { name: "Ada", loud: true },
			positionals: ["friend"],
		});
		expect(output.stderr).toEqual([]);
	});

	test("routes nested commands and scopes options to the leaf command", async () => {
		const output = createOutput();
		let received: unknown;
		const cli = createCli({
			name: "example",
			stdout: output.writeStdout,
			stderr: output.writeStderr,
		});
		cli.command("project list", {
			description: "List projects",
			options: [
				{
					name: "name",
					short: "n",
					description: "Filter by project name",
				},
			] as const,
			run: (context) => {
				received = context;
			},
		});

		expect(
			await cli.run(["project", "list", "--name", "website"]),
		).toBe(0);
		expect(received).toEqual({
			options: { name: "website" },
			positionals: [],
		});

		expect(await cli.run(["project", "--help"])).toBe(0);
		expect(output.stdout.join("")).toContain(
			"Usage: example project <command>",
		);
		expect(output.stdout.join("")).toContain("list  List projects");
		expect(output.stderr).toEqual([]);
	});

	test("reports invalid input with command-specific recovery", async () => {
		const output = createOutput();
		const cli = createCli({
			name: "example",
			stdout: output.writeStdout,
			stderr: output.writeStderr,
		});
		cli.command("deploy", {
			description: "Deploy an application",
			options: [
				{
					name: "environment",
					description: "Deployment environment",
					required: true,
				},
			] as const,
			run: () => {},
		});

		const exitCode = await cli.run(["deploy"]);

		expect(exitCode).toBe(2);
		expect(output.stderr.join("")).toContain(
			"Error: Missing required option '--environment'.",
		);
		expect(output.stderr.join("")).toContain("Usage: example deploy");
	});

	test("renders root and command help without running the handler", async () => {
		const output = createOutput();
		let runs = 0;
		const cli = createCli({
			name: "example",
			version: "1.2.3",
			description: "Example commands",
			stdout: output.writeStdout,
			stderr: output.writeStderr,
		});
		cli.command("status", {
			description: "Show current status",
			run: () => {
				runs += 1;
			},
		});

		expect(await cli.run(["--help"])).toBe(0);
		expect(await cli.run(["status", "--help"])).toBe(0);
		expect(output.stdout.join("")).toContain("Commands:");
		expect(output.stdout.join("")).toContain("Usage: example status");
		expect(runs).toBe(0);
	});

	test("does not hide errors thrown by command handlers", async () => {
		const cli = createCli({
			name: "example",
			stdout: () => {},
			stderr: () => {},
		});
		const cause = new Error("deployment failed");
		cli.command("deploy", {
			description: "Deploy an application",
			run: () => {
				throw cause;
			},
		});

		expect(cli.run(["deploy"])).rejects.toBe(cause);
	});
});
