"use strict";

const sourcePath = "^src/";

function topologyRule(name, fromPath, allowedPath, comment) {
  return {
    name,
    comment,
    severity: "error",
    from: { path: fromPath },
    to: {
      path: sourcePath,
      pathNot: allowedPath,
    },
  };
}

module.exports = {
  forbidden: [
    {
      name: "no-circular",
      comment: "Cycles make layer direction and deterministic evaluation ambiguous.",
      severity: "error",
      from: { path: "^src" },
      to: { circular: true },
    },
    {
      name: "not-to-unresolvable",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "no-undeclared-packages",
      severity: "error",
      from: { pathNot: "^(?:node_modules|dist)(?:/|$)" },
      to: {
        dependencyTypes: ["npm-no-pkg", "npm-unknown"],
      },
    },
    {
      name: "engine-no-renderer-or-audio-packages",
      comment: "The engine must remain headless.",
      severity: "error",
      from: { path: "^src/engine(?:/|$)" },
      to: { path: "^(?:pixi[.]js|howler)(?:/|$)" },
    },
    {
      name: "engine-no-upper-layers",
      comment: "No engine entry point may depend on I/O, AI, DTO, audio, app, or UI.",
      severity: "error",
      from: { path: "^src/engine(?:/|$)" },
      to: { path: "^src/(?:content-io|ai|dto|audio|app|ui)(?:/|$)" },
    },
    topologyRule(
      "domain-is-bottom-layer",
      "^src/engine/domain(?:/|$)",
      "^src/engine/domain(?:/|$)",
      "TruthGraph/domain data cannot depend on any higher layer.",
    ),
    topologyRule(
      "knowledge-only-reads-domain",
      "^src/engine/knowledge(?:/|$)",
      "^src/engine/(?:domain|knowledge)(?:/|$)",
      "KnowledgeState may read domain definitions, but no rule or presentation layer.",
    ),
    topologyRule(
      "resolution-only-reads-domain-and-knowledge",
      "^src/engine/resolution(?:/|$)",
      "^src/engine/(?:domain|knowledge|resolution)(?:/|$)",
      "Pure resolution evaluators depend only on truth and player knowledge.",
    ),
    topologyRule(
      "cards-only-read-domain",
      "^src/engine/cards(?:/|$)",
      "^src/engine/(?:domain|cards)(?:/|$)",
      "Card definitions may depend on domain definitions only.",
    ),
    topologyRule(
      "encounter-follows-canonical-engine-flow",
      "^src/engine/encounter(?:/|$)",
      "^src/engine/(?:domain|knowledge|resolution|cards|rng|encounter)(?:/|$)",
      "Encounter orchestration may use the four lower engine modules and the deterministic RNG leaf.",
    ),
    topologyRule(
      "run-only-reads-domain-and-encounter",
      "^src/engine/run(?:/|$)",
      "^src/engine/(?:domain|encounter|run)(?:/|$)",
      "Run progression composes case definitions and encounter outcomes.",
    ),
    topologyRule(
      "rng-is-a-leaf-utility",
      "^src/engine/rng(?:/|$)",
      "^src/engine/rng(?:/|$)",
      "Seeded RNG streams must not know game, content, or presentation state.",
    ),
    topologyRule(
      "log-stays-inside-engine",
      "^src/engine/log(?:/|$)",
      "^src/engine(?:/|$)",
      "Judgment logs may serialize engine outputs but cannot reach upper layers.",
    ),
    topologyRule(
      "content-io-only-builds-domain",
      "^src/content-io(?:/|$)",
      "^src/(?:content-io|engine/domain)(?:/|$)",
      "Repositories validate and construct domain data without reading runtime state.",
    ),
    topologyRule(
      "ai-only-sees-public-contracts",
      "^src/ai(?:/|$)",
      "^src/(?:ai|dto)(?:/|$)",
      "Dialogue actors receive allow-listed contracts and never TruthGraph or rules.",
    ),
    topologyRule(
      "dto-is-the-engine-exit",
      "^src/dto(?:/|$)",
      "^src/(?:dto|engine)(?:/|$)",
      "PublicDTOMapper is the only outward reader of engine state.",
    ),
    topologyRule(
      "ui-only-reads-public-contracts",
      "^src/ui(?:/|$)",
      "^src/(?:ui|dto|audio|app)(?:/|$)",
      "Presentation receives PublicDTO and presentation services, never engine objects.",
    ),
    topologyRule(
      "audio-is-an-adapter",
      "^src/audio(?:/|$)",
      "^src/audio(?:/|$)",
      "The Howler adapter is independent from engine and UI state.",
    ),
  ],
  options: {
    doNotFollow: {
      path: "node_modules",
    },
    exclude: "^(?:dist|coverage|node_modules)(?:/|$)",
    tsConfig: {
      fileName: "tsconfig.json",
    },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      conditionNames: ["import", "module", "browser", "node", "default"],
      exportsFields: ["exports"],
    },
  },
};
