import configuration from "../verification.config.mjs";

if (configuration.servers.length !== 0) {
  throw new Error("The Theme package bootstrap must not register a server.");
}

console.log(`No automated-test ports are registered for ${configuration.id}.`);
