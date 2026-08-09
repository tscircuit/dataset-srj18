import { createHash } from "node:crypto"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { AutoroutingPipelineSolver7_MultiGraph as Pipeline7 } from "@tscircuit/capacity-autorouter"

const require = createRequire(import.meta.url)
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const { dataset } = require("../index.js")

const AUTOROUTER_VERSION = "0.0.782"
const AUTOROUTER_COMMIT = "ac87ba2740c450c226ef84a5bbcef7fb31369297"
const AUTOROUTER_TREE = "41524cd3f596ff422875df54b833d014a22ad353"
const AUTOROUTER_BENCHMARK_RUN_ID = "31336663867"
const DATASET_SOURCE_COMMIT = "c0aad90256a95256fcac814f9f7da81a82a2fdea"
const DEFAULT_MAX_PIPELINE_STEPS = 1_000_000
const DEFAULT_OUTPUT_DIR = join(repoRoot, "generated-datasets", "srj18")

const COMPLETED_SAMPLES = [
  {
    sampleName: "sample001",
    completionTimeMs: 81747.467354,
    viaCount: 195,
    relaxedDrcPassed: true,
  },
  {
    sampleName: "sample003",
    completionTimeMs: 62986.181966000004,
    viaCount: 88,
    relaxedDrcPassed: false,
  },
  {
    sampleName: "sample005",
    completionTimeMs: 57686.020724,
    viaCount: 150,
    relaxedDrcPassed: true,
  },
  {
    sampleName: "sample007",
    completionTimeMs: 138557.075597,
    viaCount: 225,
    relaxedDrcPassed: false,
  },
  {
    sampleName: "sample008",
    completionTimeMs: 275481.654977,
    viaCount: 299,
    relaxedDrcPassed: false,
  },
  {
    sampleName: "sample009",
    completionTimeMs: 144147.63353,
    viaCount: 116,
    relaxedDrcPassed: false,
  },
  {
    sampleName: "sample010",
    completionTimeMs: 138750.275321,
    viaCount: 170,
    relaxedDrcPassed: true,
  },
  {
    sampleName: "sample011",
    completionTimeMs: 135167.27056200002,
    viaCount: 176,
    relaxedDrcPassed: true,
  },
]

const parseArgs = (argv) => {
  const options = {
    maxPipelineSteps: DEFAULT_MAX_PIPELINE_STEPS,
    outputDir: DEFAULT_OUTPUT_DIR,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--output-dir") {
      const outputDir = argv[index + 1]
      if (!outputDir) throw new Error("--output-dir requires a path")
      options.outputDir = resolve(process.cwd(), outputDir)
      index += 1
    } else if (arg === "--max-pipeline-steps") {
      const maxPipelineSteps = Number(argv[index + 1])
      if (!Number.isInteger(maxPipelineSteps) || maxPipelineSteps <= 0) {
        throw new Error("--max-pipeline-steps requires a positive integer")
      }
      options.maxPipelineSteps = maxPipelineSteps
      index += 1
    } else if (arg === "--help" || arg === "-h") {
      options.help = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return options
}

const printHelp = () => {
  console.log(`Generate the Pipeline 7 tiny-hypergraph inputs for the SRJ18 samples
that completed in tscircuit/tscircuit-autorouter benchmark run ${AUTOROUTER_BENCHMARK_RUN_ID}.

Usage:
  bun run generate:hypergraphs [options]

Options:
  --output-dir <dir>              Output directory (default: generated-datasets/srj18)
  --max-pipeline-steps <count>    Safety limit while advancing Pipeline 7
  -h, --help                      Show this help
`)
}

const assertSerializedHyperGraph = (value, sampleName) => {
  if (
    typeof value === "object" &&
    value !== null &&
    Array.isArray(value.regions) &&
    Array.isArray(value.ports) &&
    Array.isArray(value.connections) &&
    Array.isArray(value.solvedRoutes)
  ) {
    return value
  }

  throw new Error(
    `Pipeline 7 did not expose a complete serialized tiny-hypergraph input for ${sampleName}`,
  )
}

const materializeEffectiveInput = (
  serializedHyperGraph,
  tinyPipelineSolver,
) => {
  const effectiveGraph = structuredClone(serializedHyperGraph)
  const loaded = tinyPipelineSolver.loadHyperGraph(serializedHyperGraph)
  const regionById = new Map(
    effectiveGraph.regions.map((region) => [region.regionId, region]),
  )
  const portById = new Map(
    effectiveGraph.ports.map((port) => [port.portId, port]),
  )

  loaded.topology.regionMetadata?.forEach((metadata, regionIndex) => {
    const serializedRegionId = metadata?.serializedRegionId
    if (typeof serializedRegionId !== "string") return
    const region = regionById.get(serializedRegionId)
    if (!region) return
    region.d = {
      ...(region.d ?? {}),
      netId: loaded.problem.regionNetId[regionIndex],
    }
  })

  loaded.topology.portMetadata?.forEach((metadata, portIndex) => {
    const serializedPortId = metadata?.serializedPortId
    if (typeof serializedPortId !== "string") return
    const port = portById.get(serializedPortId)
    if (!port) return
    const effectivePenalty = Number(
      loaded.problem.portPenalty?.[portIndex] ?? 0,
    )
    port.d = {
      ...(port.d ?? {}),
      tinyHypergraphPortPenalty: effectivePenalty,
    }
  })

  return {
    serializedHyperGraph: effectiveGraph,
    effectiveRegionNetCount: [...loaded.problem.regionNetId].filter(
      (netId) => netId >= 0,
    ).length,
    effectivePortPenaltyCount: [...(loaded.problem.portPenalty ?? [])].filter(
      (penalty) => penalty > 0,
    ).length,
  }
}

const extractPipelineInput = (
  sampleName,
  simpleRouteJson,
  maxPipelineSteps,
) => {
  const solver = new Pipeline7(structuredClone(simpleRouteJson), {
    cacheProvider: null,
    effort: 1,
  })
  let pipelineSteps = 0

  while (
    !solver.portPointPathingSolver?.tinyPipelineSolver?.inputProblem
      ?.serializedHyperGraph
  ) {
    if (solver.failed) {
      throw new Error(
        `Pipeline 7 failed before exposing the tiny-hypergraph input for ${sampleName}: ${solver.error ?? "unknown error"}`,
      )
    }
    if (solver.solved) {
      throw new Error(
        `Pipeline 7 solved before exposing the tiny-hypergraph input for ${sampleName}`,
      )
    }
    if (pipelineSteps >= maxPipelineSteps) {
      throw new Error(
        `Pipeline 7 exceeded ${maxPipelineSteps} steps while extracting ${sampleName}`,
      )
    }

    solver.step()
    pipelineSteps += 1
  }

  const portPointPathingSolver = solver.portPointPathingSolver
  const tinyPipelineSolver = portPointPathingSolver.tinyPipelineSolver
  const inputProblem = tinyPipelineSolver.inputProblem
  const rawSerializedHyperGraph = assertSerializedHyperGraph(
    inputProblem.serializedHyperGraph,
    sampleName,
  )
  const effectiveInput = materializeEffectiveInput(
    rawSerializedHyperGraph,
    tinyPipelineSolver,
  )

  return {
    pipelineSteps,
    phase: solver.getCurrentPhase(),
    solverInput: {
      serializedHyperGraph: effectiveInput.serializedHyperGraph,
      solveGraphOptions: inputProblem.solveGraphOptions,
      sectionSolverOptions: inputProblem.sectionSolverOptions,
      pipelineMaxIterations: tinyPipelineSolver.MAX_ITERATIONS,
      sectionMaskStrategy: "all-zero",
      solveGraphSolver: tinyPipelineSolver.useSelectiveReripRouting
        ? "selective-rerip-stable-initial-assignments"
        : "core",
    },
    summary: {
      regionCount: effectiveInput.serializedHyperGraph.regions.length,
      portCount: effectiveInput.serializedHyperGraph.ports.length,
      connectionCount: effectiveInput.serializedHyperGraph.connections.length,
      solvedRouteCount: effectiveInput.serializedHyperGraph.solvedRoutes.length,
      effectiveRegionNetCount: effectiveInput.effectiveRegionNetCount,
      effectivePortPenaltyCount: effectiveInput.effectivePortPenaltyCount,
      duplicatedPortCount: portPointPathingSolver.duplicatedPortCount,
      duplicateCongestedPortError:
        portPointPathingSolver.duplicateCongestedPortError ?? null,
    },
  }
}

const jsonReplacer = (_key, value) =>
  value === Number.POSITIVE_INFINITY ? "Infinity" : value

const generateHypergraphs = async ({ maxPipelineSteps, outputDir }) => {
  await rm(outputDir, { recursive: true, force: true })
  await mkdir(outputDir, { recursive: true })

  const manifestCases = []
  for (const completedSample of COMPLETED_SAMPLES) {
    const simpleRouteJson = dataset[completedSample.sampleName]
    if (!simpleRouteJson) {
      throw new Error(`Missing dataset sample ${completedSample.sampleName}`)
    }

    const startedAt = performance.now()
    const extracted = extractPipelineInput(
      completedSample.sampleName,
      simpleRouteJson,
      maxPipelineSteps,
    )
    const benchmarkCase = {
      version: 1,
      sampleName: completedSample.sampleName,
      source: {
        dataset: "srj18",
        datasetCommit: DATASET_SOURCE_COMMIT,
        autorouterRepo: "tscircuit/tscircuit-autorouter",
        autorouterVersion: AUTOROUTER_VERSION,
        autorouterCommit: AUTOROUTER_COMMIT,
        autorouterTree: AUTOROUTER_TREE,
        benchmarkRunId: AUTOROUTER_BENCHMARK_RUN_ID,
        benchmarkEffort: 1,
        completionTimeMs: completedSample.completionTimeMs,
        viaCount: completedSample.viaCount,
        relaxedDrcPassed: completedSample.relaxedDrcPassed,
      },
      extraction: {
        pipeline: "AutoroutingPipelineSolver7_MultiGraph",
        phase: extracted.phase,
        pipelineSteps: extracted.pipelineSteps,
      },
      solverInput: extracted.solverInput,
      summary: extracted.summary,
    }
    const caseJson = `${JSON.stringify(benchmarkCase, jsonReplacer)}\n`
    const fileName = `${completedSample.sampleName}.tiny-hypergraph.json`
    await writeFile(join(outputDir, fileName), caseJson)

    manifestCases.push({
      sampleName: completedSample.sampleName,
      fileName,
      sha256: createHash("sha256").update(caseJson).digest("hex"),
      source: benchmarkCase.source,
      extraction: benchmarkCase.extraction,
      summary: benchmarkCase.summary,
    })

    console.log(
      [
        `generated ${fileName}`,
        `regions=${extracted.summary.regionCount}`,
        `ports=${extracted.summary.portCount}`,
        `connections=${extracted.summary.connectionCount}`,
        `pipelineSteps=${extracted.pipelineSteps}`,
        `duration=${((performance.now() - startedAt) / 1000).toFixed(2)}s`,
      ].join(" "),
    )
  }

  const manifest = {
    version: 1,
    name: "dataset-srj18-pipeline7-completed-tiny-hypergraph-inputs",
    sampleCount: manifestCases.length,
    source: {
      datasetCommit: DATASET_SOURCE_COMMIT,
      autorouterRepo: "tscircuit/tscircuit-autorouter",
      autorouterVersion: AUTOROUTER_VERSION,
      autorouterCommit: AUTOROUTER_COMMIT,
      autorouterTree: AUTOROUTER_TREE,
      benchmarkRunId: AUTOROUTER_BENCHMARK_RUN_ID,
      benchmarkEffort: 1,
    },
    cases: manifestCases,
  }
  await writeFile(
    join(outputDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )
  console.log(
    `hypergraph output complete outputDir=${outputDir} samples=${manifestCases.length}`,
  )
}

const options = parseArgs(process.argv.slice(2))
if (options.help) {
  printHelp()
} else {
  await generateHypergraphs(options)
}
