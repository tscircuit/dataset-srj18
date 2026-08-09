import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"

const require = createRequire(import.meta.url)
const dataset = require("../index.js")

const samples = readdirSync("samples")
  .filter((file) => file.endsWith(".json"))
  .sort()
const sourceFiles = JSON.parse(readFileSync("source-files.json", "utf8"))
if (samples.length !== sourceFiles.length) {
  throw new Error(
    `Expected ${sourceFiles.length} samples, found ${samples.length}`,
  )
}

for (const [index, sampleFile] of samples.entries()) {
  const exportName = `sample${String(index + 1).padStart(3, "0")}`
  if (!dataset[exportName]) throw new Error(`Missing export ${exportName}`)
  const sample = dataset[exportName]
  if (!Array.isArray(sample.obstacles))
    throw new Error(`${exportName} missing obstacles`)
  if (!Array.isArray(sample.connections))
    throw new Error(`${exportName} missing connections`)
  if (!sample.bounds) throw new Error(`${exportName} missing bounds`)
}

if (!existsSync("index.d.ts")) throw new Error("Missing index.d.ts")

const hypergraphDir = "generated-datasets/srj18"
const hypergraphManifest = JSON.parse(
  readFileSync(join(hypergraphDir, "manifest.json"), "utf8"),
)
if (hypergraphManifest.version !== 1) {
  throw new Error(
    `Unsupported hypergraph manifest version ${hypergraphManifest.version}`,
  )
}
if (hypergraphManifest.sampleCount !== hypergraphManifest.cases.length) {
  throw new Error(
    `Hypergraph manifest declares ${hypergraphManifest.sampleCount} cases but contains ${hypergraphManifest.cases.length}`,
  )
}

for (const manifestCase of hypergraphManifest.cases) {
  const casePath = join(hypergraphDir, manifestCase.fileName)
  const caseJson = readFileSync(casePath, "utf8")
  const actualSha256 = createHash("sha256").update(caseJson).digest("hex")
  if (actualSha256 !== manifestCase.sha256) {
    throw new Error(
      `${manifestCase.sampleName} SHA-256 mismatch: expected ${manifestCase.sha256}, received ${actualSha256}`,
    )
  }

  const benchmarkCase = JSON.parse(caseJson)
  if (benchmarkCase.version !== 1) {
    throw new Error(
      `${manifestCase.sampleName} has unsupported case version ${benchmarkCase.version}`,
    )
  }
  if (benchmarkCase.sampleName !== manifestCase.sampleName) {
    throw new Error(
      `${manifestCase.fileName} sample name does not match manifest`,
    )
  }
  if (
    benchmarkCase.source.autorouterCommit !==
      hypergraphManifest.source.autorouterCommit ||
    benchmarkCase.source.benchmarkRunId !==
      hypergraphManifest.source.benchmarkRunId
  ) {
    throw new Error(`${manifestCase.sampleName} source does not match manifest`)
  }
  if (
    benchmarkCase.solverInput.serializedHyperGraph.connections.length !==
      benchmarkCase.summary.connectionCount ||
    benchmarkCase.solverInput.serializedHyperGraph.solvedRoutes.length !==
      benchmarkCase.summary.solvedRouteCount
  ) {
    throw new Error(
      `${manifestCase.sampleName} graph counts do not match summary`,
    )
  }
  if (
    benchmarkCase.summary.connectionCount !==
    benchmarkCase.summary.solvedRouteCount
  ) {
    throw new Error(
      `${manifestCase.sampleName} is not a completed Pipeline 7 case`,
    )
  }
  if (benchmarkCase.solverInput.sectionMaskStrategy !== "all-zero") {
    throw new Error(
      `${manifestCase.sampleName} has an unexpected section mask strategy`,
    )
  }
  if (
    benchmarkCase.solverInput.solveGraphSolver !==
    "selective-rerip-stable-initial-assignments"
  ) {
    throw new Error(
      `${manifestCase.sampleName} has an unexpected solve-graph solver`,
    )
  }
}

console.log(
  `Validated ${samples.length} SRJ samples and ${hypergraphManifest.sampleCount} Pipeline 7 hypergraph cases`,
)
