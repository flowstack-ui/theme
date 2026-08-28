import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import ts from "typescript";

const allowedClassifications = new Set(["operation", "operation-member", "metadata"]);

async function exists(path) {
  return stat(path).then(() => true, () => false);
}

function failure(code, message, surface, id) {
  return { code, message, ...(surface ? { surface } : {}), ...(id ? { id } : {}) };
}

function moduleExports(checker, sourceFile) {
  const module = checker.getSymbolAtLocation(sourceFile);
  if (!module) return [];
  return checker.getExportsOfModule(module).map((symbol) => {
    const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    return { name: symbol.getName(), value: Boolean(target.flags & ts.SymbolFlags.Value) };
  }).filter(({ name }) => name !== "default").sort((a, b) => a.name.localeCompare(b.name));
}

function destinationValid(destination) {
  if (!destination || typeof destination !== "object" || Array.isArray(destination)) return false;
  const keys = Object.keys(destination).sort().join(",");
  if (["operation", "native-application"].includes(destination.kind)) {
    return keys === "id,kind" && typeof destination.id === "string" && destination.id.length > 0;
  }
  if (destination.kind === "package") {
    return keys === "id,kind,package,versionPolicy"
      && typeof destination.package === "string" && destination.package.startsWith("@flowstack-ui/")
      && typeof destination.id === "string" && destination.id.length > 0
      && destination.versionPolicy === "installed-exact";
  }
  return false;
}

export async function buildAgentCoverage({ packageRoot, manifest, guide }) {
  const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  const catalog = JSON.parse(await readFile(join(packageRoot, "agents", "catalog.json"), "utf8"));
  const failures = [];

  if (catalog.schema !== "flowstack.agent-catalog.v1" || catalog.package !== packageJson.name || catalog.layer !== "theme") {
    throw new Error("agents/catalog.json identity does not match @flowstack-ui/theme");
  }
  if (catalog.coverageProfile?.kind !== "operation-package" || catalog.coverageProfile?.ownerUnit !== "operation") {
    failures.push(failure("invalid-coverage-profile", "Theme requires the operation-package/operation coverage profile.", "agents/catalog.json"));
  }

  const guideIds = catalog.packageGuideIds ?? [];
  if (guideIds.length !== 1 || guideIds[0] !== guide.id) {
    failures.push(failure("invalid-package-guide-catalog", "packageGuideIds must contain only the canonical theme-system guide.", "agents/catalog.json"));
  }
  const agentFiles = (await readdir(join(packageRoot, "agents"))).filter((name) => /\.(?:json|md)$/u.test(name) && name !== "catalog.json").sort();
  const expectedAgentFiles = [`${guide.id}.json`, `${guide.id}.md`].sort();
  for (const name of agentFiles.filter((name) => !expectedAgentFiles.includes(name))) {
    failures.push(failure("stale-agent-source", "Unexpected package-guide Agent Knowledge source.", `agents/${name}`));
  }
  for (const name of expectedAgentFiles.filter((name) => !agentFiles.includes(name))) {
    failures.push(failure("missing-agent-source", "Canonical package-guide source is missing.", `agents/${name}`));
  }

  const owners = catalog.operationOwners ?? [];
  const ownerIds = new Set();
  for (const owner of owners) {
    if (!owner.id || !owner.name || owner.guideId !== guide.id || !owner.documentation || ownerIds.has(owner.id)) {
      failures.push(failure("invalid-operation-owner", "Operation owners require a unique id, name, theme-system guide, and documentation.", "agents/catalog.json", owner.id));
      continue;
    }
    ownerIds.add(owner.id);
    if (!await exists(join(packageRoot, owner.documentation.split("#")[0]))) {
      failures.push(failure("missing-operation-documentation", "Operation documentation does not exist.", owner.documentation, owner.id));
    }
  }

  const classifications = new Map();
  for (const item of catalog.classifications ?? []) {
    if (!item.surface || !allowedClassifications.has(item.classification) || !item.reason || classifications.has(item.surface)) {
      failures.push(failure("invalid-classification", "Classifications require a unique surface, supported kind, and reason.", item.surface));
      continue;
    }
    if (item.classification === "metadata") {
      if (!item.documentation || !await exists(join(packageRoot, item.documentation.split("#")[0]))) {
        failures.push(failure("missing-classification-documentation", "Metadata requires an existing public documentation owner.", item.surface));
      }
    } else if (!ownerIds.has(item.ownerId)) {
      failures.push(failure("invalid-operation-owner", "Operation classification names an unknown owner.", item.surface, item.ownerId));
    }
    classifications.set(item.surface, item);
  }

  const sourceFiles = [join(packageRoot, "src", "index.ts"), join(packageRoot, "src", "schema.ts")];
  const program = ts.createProgram(sourceFiles, {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    skipLibCheck: true,
  });
  const checker = program.getTypeChecker();
  const rootSymbols = moduleExports(checker, program.getSourceFile(sourceFiles[0]));
  const schemaSymbols = moduleExports(checker, program.getSourceFile(sourceFiles[1]));
  const surfaces = [{
    surface: ".",
    classification: "aggregate",
    documentation: "README.md",
    reason: "The root export aggregates all classified Theme operations.",
    status: "covered",
  }];

  for (const symbol of rootSymbols) {
    const surface = `.#${symbol.name}`;
    const item = classifications.get(surface);
    if (!item) {
      surfaces.push({ surface, classification: "unclassified", value: symbol.value, reason: "Root symbol has no operation classification.", status: "unclassified" });
      failures.push(failure("unclassified-public-surface", "Root symbol has no operation classification.", surface));
      continue;
    }
    surfaces.push({ ...item, value: symbol.value, status: "covered" });
  }

  const schemaClassification = classifications.get("./schema");
  if (!schemaClassification) failures.push(failure("unclassified-public-surface", "The schema subpath requires metadata classification.", "./schema"));
  else surfaces.push({ ...schemaClassification, status: "covered" });
  for (const symbol of schemaSymbols) {
    const root = classifications.get(`.#${symbol.name}`);
    const surface = `./schema#${symbol.name}`;
    if (!root) {
      surfaces.push({ surface, classification: "unclassified", value: symbol.value, reason: "Schema symbol has no classified root owner.", status: "unclassified" });
      failures.push(failure("unclassified-public-surface", "Schema symbol has no classified root owner.", surface));
      continue;
    }
    surfaces.push({ surface, classification: "operation-member", ownerId: root.ownerId, value: symbol.value, reason: "The schema subpath aliases the classified root schema contract.", status: "covered" });
  }

  for (const subpath of Object.keys(packageJson.exports).sort()) {
    if ([".", "./schema"].includes(subpath)) continue;
    const item = classifications.get(subpath);
    if (!item) {
      surfaces.push({ surface: subpath, classification: "unclassified", reason: "Export subpath has no classification.", status: "unclassified" });
      failures.push(failure("unclassified-public-surface", "Export subpath has no classification.", subpath));
    } else {
      surfaces.push({ ...item, status: "covered" });
    }
  }
  surfaces.push({ surface: "bin:flowstack-theme", classification: "operation", ownerId: "theme-cli", value: true, reason: "The public executable routes Theme file operations.", status: "covered" });

  const discovered = new Set(surfaces.map(({ surface }) => surface));
  for (const surface of classifications.keys()) {
    if (!discovered.has(surface)) failures.push(failure("stale-classification", "Classification does not match a public export or root symbol.", surface));
  }

  const nativeDestinations = catalog.nativeApplicationDestinations ?? [];
  const nativeIds = new Set();
  for (const item of nativeDestinations) {
    if (Object.keys(item).sort().join(",") !== "id,kind,reason" || !item.id || !["native", "application"].includes(item.kind) || !item.reason || nativeIds.has(item.id)) {
      failures.push(failure("invalid-native-application-destination", "Native/application destinations require unique id, kind, and reason fields.", "agents/catalog.json", item.id));
    } else nativeIds.add(item.id);
  }

  const selectionDestinations = [];
  const resolveDestination = (destination, context) => {
    let resolved = destinationValid(destination);
    if (resolved && destination.kind === "operation") resolved = ownerIds.has(destination.id);
    else if (resolved && destination.kind === "native-application") resolved = nativeIds.has(destination.id);
    else if (resolved && destination.kind === "package") resolved = false;
    selectionDestinations.push({ source: "agents/theme-system.json", context, destination, status: resolved ? "covered" : "unresolved" });
    if (!resolved) failures.push(failure("unresolved-selection", `Destination ${JSON.stringify(destination)} does not resolve.`, "agents/theme-system.json"));
  };
  for (const [index, selection] of guide.selection.entries()) {
    if (!Array.isArray(selection.destinations) || selection.destinations.length === 0) {
      failures.push(failure("missing-selection-destinations", `Selection item ${index + 1} has no destinations.`, "agents/theme-system.json"));
      continue;
    }
    for (const destination of selection.destinations) resolveDestination(destination, selection.intent);
  }
  for (const destination of guide.related) resolveDestination(destination, "related");

  const operations = owners.map((owner) => {
    const publicSurfaces = surfaces.filter(({ ownerId }) => ownerId === owner.id).map(({ surface }) => surface).sort();
    const selected = selectionDestinations.some(({ destination, status }) => destination.kind === "operation" && destination.id === owner.id && status === "covered");
    const status = publicSurfaces.length > 0 && selected ? "covered" : "uncovered";
    if (status === "uncovered") failures.push(failure("uncovered-operation", "Operation lacks public surfaces or a structured package-guide route.", undefined, owner.id));
    return {
      id: owner.id,
      name: owner.name,
      publicSurfaces,
      guideIds: [owner.guideId],
      manifestPaths: [],
      documentationOwner: owner.documentation,
      status,
    };
  }).sort((a, b) => a.id.localeCompare(b.id));

  if (!manifest.guides.some(({ id }) => id === guide.id)) failures.push(failure("uncovered-guide", "Package guide is absent from the manifest.", undefined, guide.id));
  const manifestOperationIds = manifest.operations.map(({ id }) => id).sort();
  const catalogOperationIds = operations.map(({ id }) => id);
  if (JSON.stringify(manifestOperationIds) !== JSON.stringify(catalogOperationIds)) {
    failures.push(failure("operation-manifest-mismatch", "Manifest operation IDs differ from the catalog.", "dist/agents/manifest.json"));
  }

  const exclusions = catalog.exclusions ?? [];
  for (const item of exclusions) failures.push(failure("invalid-exclusion", "Theme has no verifier-backed source-only exclusions.", item.pattern));
  surfaces.sort((a, b) => a.surface.localeCompare(b.surface));
  selectionDestinations.sort((a, b) => `${a.context}:${JSON.stringify(a.destination)}`.localeCompare(`${b.context}:${JSON.stringify(b.destination)}`));
  failures.sort((a, b) => `${a.code}:${a.surface ?? ""}:${a.id ?? ""}`.localeCompare(`${b.code}:${b.surface ?? ""}:${b.id ?? ""}`));
  const unclassified = surfaces.filter(({ status }) => status === "unclassified").length;
  const unresolvedSelections = selectionDestinations.filter(({ status }) => status === "unresolved").length;
  const guideRecord = {
    id: guide.id,
    name: guide.name,
    sourceOwner: "agents",
    agentSources: { json: "agents/theme-system.json", markdown: "agents/theme-system.md" },
    manifestPaths: { json: "./theme-system.json", markdown: "./theme-system.md" },
    status: manifest.guides.some(({ id }) => id === guide.id) ? "covered" : "uncovered",
  };

  return {
    schema: "flowstack.agent-coverage.v1",
    package: packageJson.name,
    packageVersion: packageJson.version,
    layer: "theme",
    profile: { kind: "operation-package", ownerUnit: "operation" },
    generatedFrom: { exports: "package.json", catalog: "agents/catalog.json", manifest: "dist/agents/manifest.json" },
    summary: {
      publicSurfaces: surfaces.length,
      classifiedPublicSurfaces: surfaces.length - unclassified,
      componentOwners: 0,
      guidedComponentOwners: 0,
      packageGuides: 1,
      unclassified,
      invalidExclusions: exclusions.length,
      unresolvedSelections,
      ownerUnits: operations.length,
      guidedOwnerUnits: operations.filter(({ status }) => status === "covered").length,
      operationOwners: operations.length,
      guidedOperationOwners: operations.filter(({ status }) => status === "covered").length,
      registryItems: 0,
      guidedRegistryItems: 0,
      registryFamilies: 0,
      invalidRegistryItems: 0,
      unresolvedDependencies: 0
    },
    components: [],
    owners: operations.map(({ id, name, publicSurfaces, guideIds, manifestPaths, status }) => ({ kind: "operation", id, name, publicSurfaces, guideIds, manifestPaths, status })),
    operations,
    registryItems: [],
    registryFamilies: [],
    surfaces,
    guides: [guideRecord],
    exclusions,
    selectionDestinations,
    nativeApplicationDestinations: nativeDestinations.map((item) => ({ ...item, status: nativeIds.has(item.id) ? "covered" : "invalid" })),
    failures,
  };
}

export function coverageFailureMessage(report) {
  if (!report.failures.length) return null;
  return `Agent catalog coverage failed:\n${report.failures.map(({ code, message, surface, id }) => `- [${code}] ${surface ?? id ?? "catalog"}: ${message}`).join("\n")}`;
}
