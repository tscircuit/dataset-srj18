import { existsSync, readFileSync, readdirSync } from "node:fs"
import { createRequire } from "node:module"
import assert from "node:assert/strict"

const require = createRequire(import.meta.url)
const dataset = require("../index.js")

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

// Sample002's J4 pin 1 is a plated slot with a rectangular copper pad. Older
// core conversion omitted the obstacle while retaining the routing endpoint.
const j4Pin1Obstacle = dataset.sample002.obstacles.find(
  (item) => item.connectedTo[0] === "pcb_plated_hole_58",
)
assert(j4Pin1Obstacle, "Missing J4 pin 1 plated-slot obstacle in sample002")
assert.deepEqual(j4Pin1Obstacle.layers, ["top", "bottom"])
assert.deepEqual(j4Pin1Obstacle.center, { x: -39.2404, y: -18.2722 })
assert.equal(j4Pin1Obstacle.width, 2)
assert.equal(j4Pin1Obstacle.height, 4.5)

// Sample016's zero-taper trapezoid used to lose its 270-degree pad rotation,
// placing TP5 inside C43 before routing. Check both stored representations.
const circuitJson = JSON.parse(readFileSync(dataset.sample016.sourceCircuitJson, "utf8"))
const getPad = (reference, pin) => {
  const source = circuitJson.find((element) => element.type === "source_component" && element.name === reference)
  assert(source, `Missing ${reference}`)
  const component = circuitJson.find((element) => element.type === "pcb_component" && element.source_component_id === source.source_component_id)
  assert(component, `Missing PCB component ${reference}`)
  const pad = circuitJson.find((element) => element.type === "pcb_smtpad" && element.pcb_component_id === component.pcb_component_id && element.port_hints?.includes(pin))
  assert(pad, `Missing ${reference}.${pin}`)
  return pad
}
const c43 = getPad("C43", "1")
const tp5 = getPad("TP5", "1")
assert.equal(c43.shape, "rect")
assert.equal(c43.width, 5.3)
assert.equal(c43.height, 2.5)
assert.equal(tp5.shape, "circle")
assert(Math.abs(tp5.x - c43.x) < c43.width / 2)
const copperGap = tp5.y - tp5.radius - (c43.y + c43.height / 2)
assert(Math.abs(copperGap - 0.65) < 1e-6, `Unexpected C43/TP5 gap: ${copperGap}`)
const obstacle = dataset.sample016.obstacles.find((item) => item.connectedTo[0] === c43.pcb_smtpad_id)
assert(obstacle, "Missing C43 obstacle in sample016")
assert.equal(obstacle.width, 5.3)
assert.equal(obstacle.height, 2.5)
assert(Math.abs(obstacle.center.x - c43.x) < 1e-6)
assert(Math.abs(obstacle.center.y - c43.y) < 1e-6)

console.log(`Validated ${samples.length} SRJ samples`)
