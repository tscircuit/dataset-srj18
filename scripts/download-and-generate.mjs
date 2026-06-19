import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { KicadToCircuitJsonConverter } from "../vendor/kicad-to-circuit-json/dist/index.js"
import { getSimpleRouteJsonFromCircuitJson } from "@tscircuit/core"

const boards = [
  {
    id: "arduino-leonardo",
    name: "Arduino Leonardo",
    owner: "sabogalc",
    repo: "KiCad-Arduino-Boards",
    ref: "main",
    path: "KiCad Projects/Arduino Leonardo/Arduino Leonardo.kicad_pcb",
  },
  {
    id: "arduino-mega-2560",
    name: "Arduino Mega 2560",
    owner: "sabogalc",
    repo: "KiCad-Arduino-Boards",
    ref: "main",
    path: "KiCad Projects/Arduino Mega 2560/Arduino Mega 2560.kicad_pcb",
  },
  {
    id: "arduino-micro",
    name: "Arduino Micro",
    owner: "sabogalc",
    repo: "KiCad-Arduino-Boards",
    ref: "main",
    path: "KiCad Projects/Arduino Micro/Arduino Micro.kicad_pcb",
  },
  {
    id: "arduino-nano",
    name: "Arduino Nano",
    owner: "sabogalc",
    repo: "KiCad-Arduino-Boards",
    ref: "main",
    path: "KiCad Projects/Arduino Nano/Arduino Nano.kicad_pcb",
  },
  {
    id: "arduino-uno",
    name: "Arduino Uno",
    owner: "sabogalc",
    repo: "KiCad-Arduino-Boards",
    ref: "main",
    path: "KiCad Projects/Uno/Arduino Uno/Arduino UNO.kicad_pcb",
  },
  { id: "ddr5-testbed", name: "DDR5_TESTBED", owner: "antmicro", repo: "ddr5-testbed", ref: "main", path: "ddr5-testbed.kicad_pcb" },
  {
    id: "dual-gmsl-serializer-adapter",
    name: "DUAL_GMSL_SERIALIZER_ADAPTER",
    owner: "antmicro",
    repo: "dual-gmsl-serializer-adapter",
    ref: "main",
    path: "dual-camera-to-gmsl-serializer-csi-adapter.kicad_pcb",
  },
  { id: "ftdi-toolkit", name: "FTDI_TOOLKIT", owner: "antmicro", repo: "ftdi-toolkit", ref: "main", path: "debug-toolkit.kicad_pcb" },
  { id: "gmsl-serializer", name: "GMSL_SERIALIZER", owner: "antmicro", repo: "gmsl-serializer", ref: "main", path: "gmsl-serializer.kicad_pcb" },
  {
    id: "hdmi-edid-debug-board",
    name: "HDMI_EDID_DEBUG_BOARD",
    owner: "antmicro",
    repo: "hdmi-edid-debug-board",
    ref: "main",
    path: "hdmi-edid-debug-board.kicad_pcb",
  },
  {
    id: "job-oculink-expansion",
    name: "JOB_OCULINK_EXPANSION",
    owner: "antmicro",
    repo: "job-oculink-expansion",
    ref: "main",
    path: "jetson-orin-baseboard-oculink-expansion.kicad_pcb",
  },
  {
    id: "oculink-pcie-adapter",
    name: "OCULINK_PCIE_ADAPTER",
    owner: "antmicro",
    repo: "oculink-pcie-adapter",
    ref: "main",
    path: "oculink-to-pcie-adapter.kicad_pcb",
  },
  {
    id: "ov5640-dual-camera-board",
    name: "OV5640_DUAL_CAMERA_BOARD",
    owner: "antmicro",
    repo: "ov5640-dual-camera-board",
    ref: "main",
    path: "OV5640-dual-camera-board.kicad_pcb",
  },
  {
    id: "ov9281-camera-board",
    name: "OV9281_CAMERA_BOARD",
    owner: "antmicro",
    repo: "ov9281-camera-board",
    ref: "main",
    path: "ov9281-dual-camera-board.kicad_pcb",
  },
  { id: "sdi-fiber-adapter", name: "SDI_FIBER_ADAPTER", owner: "antmicro", repo: "sdi-fiber-adapter", ref: "main", path: "sdi-fiber-adapter.kicad_pcb" },
  {
    id: "usb-c-power-adapter",
    name: "USB_C_POWER_ADAPTER",
    owner: "antmicro",
    repo: "usb-c-power-adapter",
    ref: "main",
    path: "usb-c-power-adapter.kicad_pcb",
  },
]

const samplesDir = "samples"
const pcbDir = "kicad_pcb"
const circuitJsonDir = "circuit-json"

const rawGithubUrl = ({ owner, repo, ref, path }) =>
  `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(ref)}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`

const githubBlobUrl = ({ owner, repo, ref, path }) =>
  `https://github.com/${owner}/${repo}/blob/${encodeURIComponent(ref)}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`

const roundJson = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 1_000_000) / 1_000_000
  }
  if (Array.isArray(value)) return value.map(roundJson)
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, roundJson(nested)]))
  }
  return value
}

const getCopperPourConnectedTo = (copperPour, sourceNetIdByName) =>
  Array.from(new Set([
    copperPour.source_net_id,
    copperPour.net_name ? sourceNetIdByName.get(copperPour.net_name) : undefined,
  ].filter(Boolean)))

const getCopperPourObstaclesFromCircuitJson = (circuitJson) => {
  const sourceNetIdByName = new Map(
    circuitJson
      .filter((element) => element.type === "source_net" && element.name && element.source_net_id)
      .map((sourceNet) => [sourceNet.name, sourceNet.source_net_id]),
  )

  return circuitJson
    .filter(
      (element) =>
        element.type === "pcb_copper_pour" &&
        element.shape === "rect" &&
        element.center &&
        Number.isFinite(element.width) &&
        Number.isFinite(element.height),
    )
    .map((copperPour) => {
      const connectedTo = getCopperPourConnectedTo(copperPour, sourceNetIdByName)
      return {
        obstacleId: `${copperPour.pcb_copper_pour_id}_obstacle`,
        type: "rect",
        layers: [copperPour.layer],
        center: copperPour.center,
        width: copperPour.width,
        height: copperPour.height,
        connectedTo,
        isCopperPour: true,
        ...(connectedTo.length > 0 ? { netIsAssignable: true } : {}),
      }
    })
}


const fetchText = async (url) => {
  const response = await fetch(url, { headers: { "user-agent": "dataset-srj18-generator" } })
  if (!response.ok) throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`)
  return response.text()
}

const writeIndexFiles = () => {
  const sampleFiles = readdirSync(samplesDir).filter((file) => /^sample\d+\.json$/.test(file)).sort()
  const exportNames = sampleFiles.map((file) => file.replace(/\.json$/, ""))

  const indexJs = [
    "\"use strict\"",
    "",
    ...exportNames.map((name) => `exports.${name} = require("./samples/${name}.json")`),
    "",
    "exports.dataset = {",
    ...exportNames.map((name) => `  ${name}: exports.${name},`),
    "}",
    "",
    "exports.default = exports.dataset",
    "",
  ].join("\n")

  const indexDts = [
    "export interface SimpleRouteConnectionPointBase {",
    "  x: number",
    "  y: number",
    "  pointId?: string",
    "  pcb_port_id?: string",
    "}",
    "",
    "export type SimpleRouteConnectionPoint =",
    "  | (SimpleRouteConnectionPointBase & { layer: string })",
    "  | (SimpleRouteConnectionPointBase & { layers: string[] })",
    "",
    "export interface SimpleRouteConnection {",
    "  name: string",
    "  source_trace_id?: string",
    "  rootConnectionName?: string",
    "  mergedConnectionNames?: string[]",
    "  isOffBoard?: boolean",
    "  netConnectionName?: string",
    "  nominalTraceWidth?: number",
    "  width?: number",
    "  pointsToConnect: SimpleRouteConnectionPoint[]",
    "  externallyConnectedPointIds?: string[][]",
    "}",
    "",
    "export interface SimpleRouteObstacle {",
    "  obstacleId?: string",
    "  componentId?: string",
    "  type: \"rect\"",
    "  layers: string[]",
    "  zLayers?: number[]",
    "  center: { x: number; y: number }",
    "  width: number",
    "  height: number",
    "  ccwRotationDegrees?: number",
    "  connectedTo: string[]",
    "  isCopperPour?: boolean",
    "  netIsAssignable?: boolean",
    "  offBoardConnectsTo?: string[]",
    "}",
    "",
    "export interface SimpleRouteJson {",
    "  id?: string",
    "  sourceCircuitJson?: string",
    "  sourceKicadPcb?: string",
    "  sourceName?: string",
    "  sourceUrl?: string",
    "  layerCount: number",
    "  minTraceWidth: number",
    "  nominalTraceWidth?: number",
    "  minViaDiameter?: number",
    "  minViaHoleDiameter?: number",
    "  minViaPadDiameter?: number",
    "  defaultObstacleMargin?: number",
    "  obstacles: SimpleRouteObstacle[]",
    "  connections: SimpleRouteConnection[]",
    "  bounds: { minX: number; maxX: number; minY: number; maxY: number }",
    "  outline?: Array<{ x: number; y: number }>",
    "  traces?: unknown[]",
    "  jumpers?: unknown[]",
    "}",
    "",
    ...exportNames.map((name) => `export const ${name}: SimpleRouteJson`),
    "",
    "export const dataset: Record<string, SimpleRouteJson>",
    "declare const defaultDataset: Record<string, SimpleRouteJson>",
    "export default defaultDataset",
    "",
  ].join("\n")

  writeFileSync("index.js", indexJs)
  writeFileSync("index.d.ts", indexDts)
}

rmSync(samplesDir, { recursive: true, force: true })
rmSync(pcbDir, { recursive: true, force: true })
rmSync(circuitJsonDir, { recursive: true, force: true })
mkdirSync(samplesDir, { recursive: true })
mkdirSync(pcbDir, { recursive: true })
mkdirSync(circuitJsonDir, { recursive: true })

const sourceFiles = []

for (const [index, board] of boards.entries()) {
  const sampleName = `sample${String(index + 1).padStart(3, "0")}`
  const rawUrl = rawGithubUrl(board)
  const sourceUrl = githubBlobUrl(board)
  const fileName = board.path.split("/").at(-1)

  const pcbText = await fetchText(rawUrl)
  const pcbFileName = `${sampleName}-${board.id}.kicad_pcb`
  writeFileSync(join(pcbDir, pcbFileName), pcbText)

  const converter = new KicadToCircuitJsonConverter()
  converter.addFile(fileName, pcbText)
  converter.runUntilFinished()

  const circuitJson =converter.getOutput()
  
  writeFileSync(join(circuitJsonDir, `${sampleName}-${board.id}.json`), `${JSON.stringify(circuitJson, null, 2)}\n`)

  const simpleRouteResult = getSimpleRouteJsonFromCircuitJson({ circuitJson })
  const simpleRouteJson = roundJson(simpleRouteResult.simpleRouteJson ?? simpleRouteResult)
  simpleRouteJson.obstacles.push(...roundJson(getCopperPourObstaclesFromCircuitJson(circuitJson)))
  simpleRouteJson.id = sampleName
  simpleRouteJson.sourceCircuitJson = `circuit-json/${sampleName}-${board.id}.json`
  simpleRouteJson.sourceKicadPcb = `kicad_pcb/${pcbFileName}`
  simpleRouteJson.sourceName = board.name
  simpleRouteJson.sourceUrl = sourceUrl

  writeFileSync(join(samplesDir, `${sampleName}.json`), `${JSON.stringify(simpleRouteJson, null, 2)}\n`)

  sourceFiles.push({
    sample: sampleName,
    board: board.name,
    repository: `${board.owner}/${board.repo}`,
    ref: board.ref,
    kicadPcb: board.path,
    sourceUrl,
    rawUrl,
    warnings: converter.getWarnings(),
    stats: converter.getStats(),
  })

  console.log(`${sampleName}: ${board.name}`)
}

writeFileSync("source-files.json", `${JSON.stringify(sourceFiles, null, 2)}\n`)
writeIndexFiles()
