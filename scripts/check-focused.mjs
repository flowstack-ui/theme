import { spawnSync } from "node:child_process";

const owner = process.argv[2] ?? "all";
const commands = {
  definition: [["npm", ["run", "test:types"]]],
  validation: [
    ["npm", ["run", "build"]],
    [process.execPath, ["--test", "test/definition.test.mjs"]],
  ],
  cli: [
    ["npm", ["run", "build"]],
    [process.execPath, ["--test", "test/cli.test.mjs"]],
  ],
  all: [["npm", ["run", "test:unit"]]],
};

if (!(owner in commands)) {
  console.error(`Unknown focused owner "${owner}". Use definition, validation, cli, or all.`);
  process.exit(1);
}

for (const [command, args] of commands[owner]) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
