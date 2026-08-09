# dataset-srj18

Simple Route JSON dataset generated from five KiCad Arduino boards and eleven
Antmicro boards.

Arduino boards:

- Arduino Leonardo
- Arduino Mega 2560
- Arduino Micro
- Arduino Nano
- Arduino Uno

Arduino source KiCad PCB files are downloaded from
<https://github.com/sabogalc/KiCad-Arduino-Boards/tree/main/KiCad%20Projects>.

Antmicro boards:

- DDR5_TESTBED
- DUAL_GMSL_SERIALIZER_ADAPTER
- FTDI_TOOLKIT
- GMSL_SERIALIZER
- HDMI_EDID_DEBUG_BOARD
- JOB_OCULINK_EXPANSION
- OCULINK_PCIE_ADAPTER
- OV5640_DUAL_CAMERA_BOARD
- OV9281_CAMERA_BOARD
- SDI_FIBER_ADAPTER
- USB_C_POWER_ADAPTER

Antmicro source repositories are listed in `source-files.json`.

## Usage

```js
const { sample001, dataset } = require("dataset-srj18")
```

## Regenerate

```sh
bun install
bun run generate
bun run generate:hypergraphs
bun run test
```

The generator downloads `.kicad_pcb` files into `kicad_pcb/`, converts them to
Circuit JSON with `kicad-to-circuit-json`, and converts that output to Simple
Route JSON with `getSimpleRouteJsonFromCircuitJson` from `@tscircuit/core`.

`generate:hypergraphs` stores the effective Pipeline 7 tiny-hypergraph inputs
for the samples completed by the pinned `tscircuit-autorouter` benchmark run.
The generated manifest records the autorouter version, commit, benchmark run,
input hashes, extraction counts, and source completion metrics.
