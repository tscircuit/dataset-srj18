import { existsSync, readFileSync, readdirSync } from "node:fs"
import { dataset } from "../index.js"

const samples = readdirSync("samples").filter((file) => file.endsWith(".json")).sort()
const sourceFiles = JSON.parse(readFileSync("source-files.json", "utf8"))
if (samples.length !== sourceFiles.length) {
  throw new Error(`Expected ${sourceFiles.length} samples, found ${samples.length}`)
}

for (const [index, sampleFile] of samples.entries()) {
  const exportName = `sample${String(index + 1).padStart(3, "0")}`
  if (!dataset[exportName]) throw new Error(`Missing export ${exportName}`)
  const sample = dataset[exportName]
  if (!Array.isArray(sample.obstacles)) throw new Error(`${exportName} missing obstacles`)
  if (!Array.isArray(sample.connections)) throw new Error(`${exportName} missing connections`)
  if (!sample.bounds) throw new Error(`${exportName} missing bounds`)
}

if (!existsSync("index.d.ts")) throw new Error("Missing index.d.ts")

console.log(`Validated ${samples.length} SRJ samples`)
