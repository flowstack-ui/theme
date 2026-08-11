const verification = {
  schemaVersion: 1,
  id: "theme",
  kind: "public-package",
  commands: {
    focused: "check:focused",
    repository: "check:repository",
    release: "check:release",
    processCheck: "test:processes",
    contract: "verify:repository-contract",
  },
  servers: [],
  browserConfigs: [],
  workflows: {
    ci: ".github/workflows/ci.yml",
    publish: ".github/workflows/publish.yml",
  },
  impact: {
    strategy: "conservative-repository",
    conservativePaths: [
      "package.json",
      "package-lock.json",
      "src",
      "scripts",
      "test",
      "verification.config.mjs",
    ],
  },
  manual: [
    "public schema meaning and compatibility review",
    "human review of theme semantics after compiler work begins",
  ],
};

export default verification;
