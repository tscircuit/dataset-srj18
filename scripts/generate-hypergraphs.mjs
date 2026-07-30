import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { AutoroutingPipelineSolver7_MultiGraph as Pipeline7 } from "@tscircuit/capacity-autorouter"

const require = createRequire(import.meta.url)
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const { dataset } = require("../index.js")

const DEFAULT_MAX_PIPELINE_STEPS = 1_000_000
const DEFAULT_OUTPUT_DIR = join(repoRoot, "generated-datasets", "srj18")

const parseArgs = (argv) => {
  const options = {
    force: false,
    maxPipelineSteps: DEFAULT_MAX_PIPELINE_STEPS,
    outputDir: DEFAULT_OUTPUT_DIR,
    sampleNames: [],
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--force") {
      options.force = true
    } else if (arg === "--sample") {
      const sampleName = argv[index + 1]
      if (!sampleName) throw new Error("--sample requires a sample name")
      options.sampleNames.push(sampleName)
      index += 1
    } else if (arg === "--output-dir") {
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

  return {
    ...options,
    sampleNames:
      options.sampleNames.length > 0 ? options.sampleNames : undefined,
  }
}

const printHelp = () => {
  console.log(`Generate tiny-hypergraph files from the SRJ18 samples.

Usage:
  bun scripts/generate-hypergraphs.mjs [options]

Options:
  --force                         Regenerate existing output files
  --sample <sampleName>           Generate one sample, repeatable
  --output-dir <dir>              Output directory (default: generated-datasets/srj18)
  --max-pipeline-steps <count>    Safety limit while advancing Pipeline7
  -h, --help                      Show this help
`)
}

const fileExists = async (filePath) => {
  try {
    return (await stat(filePath)).isFile()
  } catch (error) {
    if (error?.code === "ENOENT") return false
    throw error
  }
}

const getSampleEntries = () =>
  Object.entries(dataset)
    .filter(([sampleName]) => /^sample\d+$/.test(sampleName))
    .sort(([leftSampleName], [rightSampleName]) =>
      leftSampleName.localeCompare(rightSampleName),
    )

const assertSerializedHyperGraph = (value, sampleName) => {
  if (
    typeof value === "object" &&
    value !== null &&
    Array.isArray(value.regions) &&
    Array.isArray(value.ports) &&
    Array.isArray(value.connections)
  ) {
    return value
  }

  throw new Error(
    `Pipeline7 did not expose a serialized tiny-hypergraph input for ${sampleName}`,
  )
}

const getTinyHyperGraphInputFromPipeline7 = (
  sampleName,
  simpleRouteJson,
  maxPipelineSteps,
) => {
  const solver = new Pipeline7(structuredClone(simpleRouteJson), {
    cacheProvider: null,
    effort: 1,
  })
  let stepCount = 0

  while (solver.getCurrentPhase() !== "portPointPathingSolver") {
    if (solver.failed) {
      throw new Error(
        `Pipeline7 failed before portPointPathingSolver for ${sampleName}: ${solver.error ?? "unknown error"}`,
      )
    }
    if (solver.solved) {
      throw new Error(
        `Pipeline7 solved before reaching portPointPathingSolver for ${sampleName}`,
      )
    }
    if (stepCount >= maxPipelineSteps) {
      throw new Error(
        `Pipeline7 exceeded ${maxPipelineSteps} steps before portPointPathingSolver for ${sampleName}`,
      )
    }

    solver.step()
    stepCount += 1
  }

  while (
    !solver.portPointPathingSolver?.tinyPipelineSolver?.inputProblem
      ?.serializedHyperGraph
  ) {
    if (solver.failed) {
      throw new Error(
        `Pipeline7 failed while creating tiny-hypergraph input for ${sampleName}: ${solver.error ?? "unknown error"}`,
      )
    }
    if (stepCount >= maxPipelineSteps) {
      throw new Error(
        `Pipeline7 exceeded ${maxPipelineSteps} steps while creating tiny-hypergraph input for ${sampleName}`,
      )
    }

    solver.step()
    stepCount += 1
  }

  const serializedHyperGraph =
    solver.portPointPathingSolver.tinyPipelineSolver.inputProblem
      .serializedHyperGraph

  return {
    serializedHyperGraph: assertSerializedHyperGraph(
      serializedHyperGraph,
      sampleName,
    ),
    stepCount,
  }
}

const generateHypergraphs = async ({
  force,
  maxPipelineSteps,
  outputDir,
  sampleNames,
}) => {
  const allSampleEntries = getSampleEntries()
  const requestedSampleNames = new Set(
    sampleNames ?? allSampleEntries.map(([sampleName]) => sampleName),
  )
  const selectedSampleEntries = allSampleEntries.filter(([sampleName]) =>
    requestedSampleNames.has(sampleName),
  )
  const unknownSampleNames = [...requestedSampleNames].filter(
    (sampleName) =>
      !selectedSampleEntries.some(
        ([candidateSampleName]) => candidateSampleName === sampleName,
      ),
  )

  if (unknownSampleNames.length > 0) {
    throw new Error(`Unknown sample(s): ${unknownSampleNames.join(", ")}`)
  }

  if (force && sampleNames === undefined) {
    await rm(outputDir, { recursive: true, force: true })
  }
  await mkdir(outputDir, { recursive: true })

  let generatedCount = 0
  for (const [sampleName, simpleRouteJson] of selectedSampleEntries) {
    const outputPath = join(outputDir, `${sampleName}.hg.json`)
    if (!force && (await fileExists(outputPath))) {
      console.log(`skipped ${sampleName}.hg.json already exists`)
      continue
    }

    const startedAt = performance.now()
    const { serializedHyperGraph, stepCount } =
      getTinyHyperGraphInputFromPipeline7(
        sampleName,
        simpleRouteJson,
        maxPipelineSteps,
      )
    const tempPath = `${outputPath}.tmp-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`

    await writeFile(tempPath, `${JSON.stringify(serializedHyperGraph)}\n`)
    await rename(tempPath, outputPath)
    generatedCount += 1

    const durationSeconds = ((performance.now() - startedAt) / 1000).toFixed(2)
    console.log(
      `generated ${sampleName}.hg.json regions=${serializedHyperGraph.regions.length} ports=${serializedHyperGraph.ports.length} connections=${serializedHyperGraph.connections.length} pipelineSteps=${stepCount} duration=${durationSeconds}s`,
    )
  }

  console.log(
    `hypergraph output complete outputDir=${outputDir} generated=${generatedCount} total=${selectedSampleEntries.length}`,
  )
}

const options = parseArgs(process.argv.slice(2))
if (options.help) {
  printHelp()
} else {
  await generateHypergraphs(options)
}
