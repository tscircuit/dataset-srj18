// lib/KicadToCircuitJsonConverter.ts
import { cju } from "@tscircuit/circuit-json-util";
import { parseKicadPcb, parseKicadSch } from "kicadts";

// lib/parseKicadSymbolLib.ts
function parseKicadSymbolLib(content) {
  const expressions = parseSExpr(content);
  const root = expressions.find(
    (expr) => isList(expr) && expr[0] === "kicad_symbol_lib"
  );
  if (!root) {
    throw new Error("Expected kicad_symbol_lib root in .kicad_sym file");
  }
  return {
    version: getChildScalar(root, "version"),
    generator: getChildScalar(root, "generator"),
    generatorVersion: getChildScalar(root, "generator_version"),
    symbols: getChildLists(root, "symbol").map(parseSymbol)
  };
}
function parseSExpr(content) {
  const tokens = tokenize(content);
  const expressions = [];
  let index = 0;
  function parseList() {
    const list = [];
    index++;
    while (index < tokens.length && tokens[index] !== ")") {
      if (tokens[index] === "(") {
        list.push(parseList());
      } else {
        list.push(tokens[index]);
        index++;
      }
    }
    if (tokens[index] !== ")") {
      throw new Error("Unterminated S-expression list");
    }
    index++;
    return list;
  }
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === "(") {
      expressions.push(parseList());
    } else if (token === ")") {
      throw new Error("Unexpected ')' in S-expression");
    } else if (token !== void 0) {
      expressions.push(token);
      index++;
    }
  }
  return expressions;
}
function tokenize(content) {
  const tokens = [];
  let index = 0;
  while (index < content.length) {
    const char = content[index];
    if (/\s/.test(char)) {
      index++;
      continue;
    }
    if (char === ";") {
      while (index < content.length && content[index] !== "\n") index++;
      continue;
    }
    if (char === "(" || char === ")") {
      tokens.push(char);
      index++;
      continue;
    }
    if (char === '"') {
      let value2 = "";
      index++;
      while (index < content.length) {
        const current = content[index];
        if (current === "\\") {
          const next = content[index + 1];
          if (next === void 0) {
            throw new Error("Unterminated escape sequence in quoted string");
          }
          value2 += next;
          index += 2;
          continue;
        }
        if (current === '"') {
          index++;
          break;
        }
        value2 += current;
        index++;
      }
      tokens.push(value2);
      continue;
    }
    let value = "";
    while (index < content.length && !/\s/.test(content[index]) && content[index] !== "(" && content[index] !== ")") {
      value += content[index];
      index++;
    }
    tokens.push(value);
  }
  return tokens;
}
function parseSymbol(expr) {
  const name = getAtom(expr[1]) ?? "";
  const subSymbols = getChildLists(expr, "symbol").map(parseSymbol);
  const directPins = getChildLists(expr, "pin").map(parsePin);
  return {
    name,
    properties: Object.fromEntries(
      getChildLists(expr, "property").flatMap((property) => {
        const key = getAtom(property[1]);
        const value = getAtom(property[2]);
        return key ? [[key, value ?? ""]] : [];
      })
    ),
    pins: directPins,
    polylines: getChildLists(expr, "polyline").map(parsePolyline),
    rectangles: getChildLists(expr, "rectangle").map(parseRectangle),
    circles: getChildLists(expr, "circle").map(parseCircle),
    arcs: getChildLists(expr, "arc").map(parseArc),
    texts: getChildLists(expr, "text").map(parseText),
    subSymbols
  };
}
function parsePin(expr) {
  const at = getChildList(expr, "at");
  const length = getChildScalar(expr, "length");
  return {
    electricalType: getAtom(expr[1]),
    graphicStyle: getAtom(expr[2]),
    at: at ? {
      x: parseNumber(getAtom(at[1])),
      y: parseNumber(getAtom(at[2])),
      angle: parseNumber(getAtom(at[3]))
    } : void 0,
    length: length !== void 0 ? parseNumber(length) : void 0,
    hidden: getChildScalar(expr, "hide") === "yes",
    name: getChildScalar(expr, "name") ?? "",
    number: getChildScalar(expr, "number") ?? "",
    alternates: getChildLists(expr, "alternate").map(parseAlternate)
  };
}
function parseAlternate(expr) {
  return {
    name: getAtom(expr[1]) ?? "",
    electricalType: getAtom(expr[2]),
    graphicStyle: getAtom(expr[3])
  };
}
function parsePolyline(expr) {
  const pts = getChildList(expr, "pts");
  return {
    points: pts ? getChildLists(pts, "xy").map(parseXy) : [],
    stroke: parseStroke(getChildList(expr, "stroke")),
    fill: parseFill(getChildList(expr, "fill"))
  };
}
function parseRectangle(expr) {
  return {
    start: parsePoint(getChildList(expr, "start")),
    end: parsePoint(getChildList(expr, "end")),
    stroke: parseStroke(getChildList(expr, "stroke")),
    fill: parseFill(getChildList(expr, "fill"))
  };
}
function parseCircle(expr) {
  return {
    center: parsePoint(getChildList(expr, "center")),
    radius: parseNumber(getChildScalar(expr, "radius")),
    stroke: parseStroke(getChildList(expr, "stroke")),
    fill: parseFill(getChildList(expr, "fill"))
  };
}
function parseArc(expr) {
  return {
    start: parsePoint(getChildList(expr, "start")),
    mid: parsePoint(getChildList(expr, "mid")),
    end: parsePoint(getChildList(expr, "end")),
    stroke: parseStroke(getChildList(expr, "stroke"))
  };
}
function parseText(expr) {
  const at = getChildList(expr, "at");
  const effects = getChildList(expr, "effects");
  const font = effects ? getChildList(effects, "font") : void 0;
  const fontSize = font ? getChildList(font, "size") : void 0;
  return {
    text: getAtom(expr[1]) ?? "",
    at: at ? {
      x: parseNumber(getAtom(at[1])),
      y: parseNumber(getAtom(at[2])),
      angle: parseNumber(getAtom(at[3]))
    } : { x: 0, y: 0, angle: 0 },
    fontSize: fontSize ? Math.max(
      parseNumber(getAtom(fontSize[1])),
      parseNumber(getAtom(fontSize[2]))
    ) : void 0
  };
}
function parseStroke(expr) {
  if (!expr) return {};
  return {
    width: parseNumber(getChildScalar(expr, "width")),
    type: getChildScalar(expr, "type")
  };
}
function parseFill(expr) {
  if (!expr) return {};
  return {
    type: getChildScalar(expr, "type")
  };
}
function parseXy(expr) {
  return {
    x: parseNumber(getAtom(expr[1])),
    y: parseNumber(getAtom(expr[2]))
  };
}
function parsePoint(expr) {
  if (!expr) return { x: 0, y: 0 };
  return {
    x: parseNumber(getAtom(expr[1])),
    y: parseNumber(getAtom(expr[2]))
  };
}
function getChildScalar(expr, token) {
  const child = getChildList(expr, token);
  if (!child) return void 0;
  return getAtom(child[1]);
}
function getChildList(expr, token) {
  return getChildLists(expr, token)[0];
}
function getChildLists(expr, token) {
  return expr.filter(
    (child) => isList(child) && child[0] === token
  );
}
function getAtom(expr) {
  return typeof expr === "string" ? expr : void 0;
}
function isList(expr) {
  return Array.isArray(expr);
}
function parseNumber(value) {
  if (value === void 0) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// lib/types.ts
var ConverterStage = class {
  constructor(ctx) {
    this.ctx = ctx;
  }
  ctx;
  MAX_ITERATIONS = 100;
  iterationCount = 0;
  finished = false;
  /**
   * Run this stage until completion or max iterations reached.
   */
  runUntilFinished() {
    this.iterationCount = 0;
    while (!this.finished && this.iterationCount < this.MAX_ITERATIONS) {
      const hasMoreWork = this.step();
      if (!hasMoreWork) {
        this.finished = true;
      }
      this.iterationCount++;
    }
    if (this.iterationCount >= this.MAX_ITERATIONS) {
      this.ctx.warnings = this.ctx.warnings || [];
      this.ctx.warnings.push(
        `Stage ${this.constructor.name} exceeded maximum iterations (${this.MAX_ITERATIONS})`
      );
      this.finished = true;
    }
  }
};

// lib/stages/pcb/CollectFootprintsStage/process-footprint.ts
import { applyToPoint as applyToPoint4 } from "transformation-matrix";

// lib/stages/pcb/layer-mapping.ts
var INNER_COPPER_LAYER_REGEX = /^In([1-9]\d*)\.Cu$/;
function dedupeLayerRefs(layers) {
  return [...new Set(layers)];
}
function extractKicadLayerNames(layer) {
  if (!layer) return [];
  if (typeof layer === "string") return [layer];
  if (Array.isArray(layer))
    return layer.filter((name) => typeof name === "string");
  return [
    ...layer.names || [],
    ...layer._names || [],
    ...layer._layers || [],
    ...layer.name ? [layer.name] : [],
    ...layer._name ? [layer._name] : []
  ].filter((name) => typeof name === "string");
}
function mapKicadLayerToPcbRenderLayer(layer) {
  const layerNames = extractKicadLayerNames(layer);
  for (const layerName of layerNames) {
    const copperLayer = mapKicadLayerNameToLayerRef(layerName);
    if (copperLayer) {
      return `${copperLayer}_copper`;
    }
    if (layerName.includes("Edge.Cuts")) {
      return "edge_cuts";
    }
    const side = mapKicadLayerToVisibleLayer(layerName);
    if (layerName.includes("CrtYd")) {
      return `${side}_courtyard`;
    }
    if (layerName.includes("Fab")) {
      return `${side}_fabrication_note`;
    }
    if (layerName.includes("SilkS")) {
      return `${side}_silkscreen`;
    }
  }
  return void 0;
}
function isPcbAnnotationRenderLayer(renderLayer) {
  return renderLayer?.endsWith("_silkscreen") || renderLayer?.endsWith("_fabrication_note") || renderLayer?.endsWith("_courtyard") || false;
}
function isPcbTextRenderLayer(renderLayer) {
  return renderLayer?.endsWith("_silkscreen") || renderLayer?.endsWith("_fabrication_note") || renderLayer?.endsWith("_copper") || false;
}
function mapKicadLayerNameToLayerRef(layerName) {
  if (layerName === "F.Cu") return "top";
  if (layerName === "B.Cu") return "bottom";
  const innerLayerMatch = layerName.match(INNER_COPPER_LAYER_REGEX);
  if (!innerLayerMatch) return void 0;
  return `inner${innerLayerMatch[1]}`;
}
function mapKicadLayerToLayerRef(layer) {
  const layerNames = extractKicadLayerNames(layer);
  for (const layerName of layerNames) {
    const mappedLayer = mapKicadLayerNameToLayerRef(layerName);
    if (mappedLayer) return mappedLayer;
  }
  const layerLabel = layerNames.join(" ");
  if (layerLabel.includes("B.") || layerLabel.includes("Back") || layerLabel.includes("Bottom")) {
    return "bottom";
  }
  return "top";
}
function mapKicadLayerToVisibleLayer(layer) {
  return mapKicadLayerToLayerRef(layer) === "bottom" ? "bottom" : "top";
}
function getPcbCopperLayerRefs(kicadPcb) {
  const definitions = kicadPcb?.layers?.definitions ?? [];
  const copperLayers = definitions.map((definition) => mapKicadLayerNameToLayerRef(definition.name ?? "")).filter((layer) => Boolean(layer));
  if (copperLayers.length > 0) {
    return dedupeLayerRefs(copperLayers);
  }
  return ["top", "bottom"];
}
function getPcbCopperLayerCount(kicadPcb) {
  const definitions = kicadPcb?.layers?.definitions ?? [];
  const copperLayerCount = definitions.filter(
    (definition) => definition.name?.endsWith(".Cu") ?? false
  ).length;
  return copperLayerCount > 0 ? copperLayerCount : 2;
}
function getLayerRefsFromLayers(layers, kicadPcb) {
  const layerNames = extractKicadLayerNames(layers);
  const mappedLayers = [];
  for (const layerName of layerNames) {
    if (layerName === "*.Cu") {
      mappedLayers.push(...getPcbCopperLayerRefs(kicadPcb));
      continue;
    }
    const mappedLayer = mapKicadLayerNameToLayerRef(layerName);
    if (mappedLayer) {
      mappedLayers.push(mappedLayer);
    }
  }
  return dedupeLayerRefs(mappedLayers);
}
function expandCopperLayerSpan(layers, kicadPcb) {
  if (layers.length <= 1) {
    return layers;
  }
  const copperStack = getPcbCopperLayerRefs(kicadPcb);
  const startIndex = copperStack.indexOf(layers[0]);
  const endIndex = copperStack.indexOf(layers[layers.length - 1]);
  if (startIndex === -1 || endIndex === -1) {
    return dedupeLayerRefs(layers);
  }
  const [fromIndex, toIndex] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
  return copperStack.slice(fromIndex, toIndex + 1);
}
function getCopperSpanLayerRefsFromLayers(layers, kicadPcb) {
  return expandCopperLayerSpan(
    getLayerRefsFromLayers(layers, kicadPcb),
    kicadPcb
  );
}

// lib/stages/pcb/CollectFootprintsStage/layer-utils.ts
function getComponentLayer(footprint) {
  return mapKicadLayerToVisibleLayer(footprint.layer);
}
function determineLayerFromLayers(layers) {
  return mapKicadLayerToLayerRef(extractKicadLayerNames(layers));
}
function mapTextLayer(kicadLayer) {
  return mapKicadLayerToVisibleLayer(kicadLayer);
}

// lib/stages/pcb/CollectFootprintsStage/process-pads.ts
import { applyToPoint as applyToPoint2 } from "transformation-matrix";

// lib/stages/pcb/CollectFootprintsStage/process-graphics.ts
import { applyToPoint } from "transformation-matrix";
function insertFootprintRoute(options) {
  const { ctx, componentId, layer, renderLayer, route, strokeWidth } = options;
  if (renderLayer.endsWith("_silkscreen")) {
    ctx.db.pcb_silkscreen_path.insert({
      pcb_component_id: componentId,
      layer,
      route,
      stroke_width: strokeWidth
    });
    return;
  }
  if (renderLayer.endsWith("_fabrication_note")) {
    ctx.db.pcb_fabrication_note_path.insert({
      pcb_component_id: componentId,
      layer,
      route,
      stroke_width: strokeWidth
    });
    return;
  }
  ctx.db.pcb_courtyard_outline.insert({
    pcb_component_id: componentId,
    layer,
    outline: route
  });
}
function rotatePoint(x, y, rotationDeg) {
  const rotationRad = rotationDeg * Math.PI / 180;
  return {
    x: x * Math.cos(rotationRad) - y * Math.sin(rotationRad),
    y: x * Math.sin(rotationRad) + y * Math.cos(rotationRad)
  };
}
function processFootprintGraphics(ctx, footprint, componentId, kicadComponentPos, componentRotation) {
  if (!ctx.k2cMatPcb) return;
  const lines = footprint.fpLines || [];
  const lineArray = Array.isArray(lines) ? lines : lines ? [lines] : [];
  for (const line of lineArray) {
    createFootprintLine(
      ctx,
      line,
      componentId,
      kicadComponentPos,
      componentRotation
    );
  }
  const rects = footprint.fpRects || [];
  const rectArray = Array.isArray(rects) ? rects : rects ? [rects] : [];
  for (const rect of rectArray) {
    createFootprintRect(
      ctx,
      rect,
      componentId,
      kicadComponentPos,
      componentRotation
    );
  }
  const circles = footprint.fpCircles || [];
  const circleArray = Array.isArray(circles) ? circles : circles ? [circles] : [];
  for (const circle of circleArray) {
    createFootprintCircle(
      ctx,
      circle,
      componentId,
      kicadComponentPos,
      componentRotation
    );
  }
  const arcs = footprint.fpArcs || [];
  const arcArray = Array.isArray(arcs) ? arcs : arcs ? [arcs] : [];
  for (const arc of arcArray) {
    createFootprintArc(
      ctx,
      arc,
      componentId,
      kicadComponentPos,
      componentRotation
    );
  }
  const polys = footprint.fpPolys || [];
  const polyArray = Array.isArray(polys) ? polys : polys ? [polys] : [];
  for (const poly of polyArray) {
    createFootprintPoly(
      ctx,
      poly,
      componentId,
      kicadComponentPos,
      componentRotation
    );
  }
}
function createFootprintLine(ctx, line, componentId, kicadComponentPos, componentRotation) {
  if (!ctx.k2cMatPcb) return;
  const renderLayer = mapKicadLayerToPcbRenderLayer(line.layer);
  if (!isPcbAnnotationRenderLayer(renderLayer)) return;
  const start = line.start || { x: 0, y: 0 };
  const end = line.end || { x: 0, y: 0 };
  const rotatedStart = rotatePoint(start.x, start.y, -componentRotation);
  const rotatedEnd = rotatePoint(end.x, end.y, -componentRotation);
  const startKicadPos = {
    x: kicadComponentPos.x + rotatedStart.x,
    y: kicadComponentPos.y + rotatedStart.y
  };
  const endKicadPos = {
    x: kicadComponentPos.x + rotatedEnd.x,
    y: kicadComponentPos.y + rotatedEnd.y
  };
  const startPos = applyToPoint(ctx.k2cMatPcb, startKicadPos);
  const endPos = applyToPoint(ctx.k2cMatPcb, endKicadPos);
  const layer = mapTextLayer(line.layer);
  const strokeWidth = line.stroke?.width || line.width || 0.12;
  insertFootprintRoute({
    ctx,
    componentId,
    layer,
    renderLayer,
    route: [startPos, endPos],
    strokeWidth
  });
}
function createFootprintRect(ctx, rect, componentId, kicadComponentPos, componentRotation) {
  if (!ctx.k2cMatPcb) return;
  const renderLayer = mapKicadLayerToPcbRenderLayer(rect.layer);
  if (!isPcbAnnotationRenderLayer(renderLayer)) return;
  const start = rect.start || { x: 0, y: 0 };
  const end = rect.end || { x: 0, y: 0 };
  const center = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2
  };
  const rotatedCenter = rotatePoint(center.x, center.y, -componentRotation);
  const centerKicadPos = {
    x: kicadComponentPos.x + rotatedCenter.x,
    y: kicadComponentPos.y + rotatedCenter.y
  };
  const centerPos = applyToPoint(ctx.k2cMatPcb, centerKicadPos);
  const layer = mapTextLayer(rect.layer);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  const strokeWidth = rect.stroke?.width || rect.width || 0.12;
  if (renderLayer.endsWith("_courtyard")) {
    ctx.db.pcb_courtyard_rect.insert({
      pcb_component_id: componentId,
      center: centerPos,
      width,
      height,
      layer,
      ccw_rotation: -componentRotation
    });
    return;
  }
  if (renderLayer.endsWith("_fabrication_note")) {
    ctx.db.pcb_fabrication_note_rect.insert({
      pcb_component_id: componentId,
      center: centerPos,
      width,
      height,
      layer,
      stroke_width: strokeWidth,
      is_filled: rect.fill?.filled === true,
      has_stroke: true
    });
    return;
  }
  const corners = [
    { x: start.x, y: start.y },
    { x: end.x, y: start.y },
    { x: end.x, y: end.y },
    { x: start.x, y: end.y },
    { x: start.x, y: start.y }
  ];
  const route = corners.map((point) => {
    const rotated = rotatePoint(point.x, point.y, -componentRotation);
    const kicadPos = {
      x: kicadComponentPos.x + rotated.x,
      y: kicadComponentPos.y + rotated.y
    };
    return applyToPoint(ctx.k2cMatPcb, kicadPos);
  });
  insertFootprintRoute({
    ctx,
    componentId,
    layer,
    renderLayer,
    route,
    strokeWidth
  });
}
function createFootprintCircle(ctx, circle, componentId, kicadComponentPos, componentRotation) {
  if (!ctx.k2cMatPcb) return;
  const renderLayer = mapKicadLayerToPcbRenderLayer(circle.layer);
  if (!isPcbAnnotationRenderLayer(renderLayer)) return;
  const center = circle.center || { x: 0, y: 0 };
  const end = circle.end || { x: 0, y: 0 };
  const radius = Math.sqrt((end.x - center.x) ** 2 + (end.y - center.y) ** 2);
  const rotatedCenter = rotatePoint(center.x, center.y, -componentRotation);
  const centerKicadPos = {
    x: kicadComponentPos.x + rotatedCenter.x,
    y: kicadComponentPos.y + rotatedCenter.y
  };
  const centerPos = applyToPoint(ctx.k2cMatPcb, centerKicadPos);
  const layer = mapTextLayer(circle.layer);
  const strokeWidth = circle.stroke?.width || circle.width || 0.12;
  if (renderLayer.endsWith("_courtyard")) {
    ctx.db.pcb_courtyard_circle.insert({
      pcb_component_id: componentId,
      center: centerPos,
      radius,
      layer
    });
    return;
  }
  const numPoints = 16;
  const circleRoute = [];
  for (let i = 0; i <= numPoints; i++) {
    const angle = i / numPoints * 2 * Math.PI;
    const x = centerPos.x + radius * Math.cos(angle);
    const y = centerPos.y + radius * Math.sin(angle);
    circleRoute.push({ x, y });
  }
  insertFootprintRoute({
    ctx,
    componentId,
    layer,
    renderLayer,
    route: circleRoute,
    strokeWidth
  });
}
function calculateArcCenter(p1, p2, p3) {
  const ax = p1.x - p2.x;
  const ay = p1.y - p2.y;
  const bx = p2.x - p3.x;
  const by = p2.y - p3.y;
  const denom = 2 * (ax * by - ay * bx);
  if (Math.abs(denom) < 1e-10) {
    return null;
  }
  const d1 = p1.x * p1.x + p1.y * p1.y - p2.x * p2.x - p2.y * p2.y;
  const d2 = p2.x * p2.x + p2.y * p2.y - p3.x * p3.x - p3.y * p3.y;
  const cx = (d1 * by - d2 * ay) / denom;
  const cy = (ax * d2 - bx * d1) / denom;
  const radius = Math.sqrt((p1.x - cx) ** 2 + (p1.y - cy) ** 2);
  return { center: { x: cx, y: cy }, radius };
}
function createFootprintArc(ctx, arc, componentId, kicadComponentPos, componentRotation) {
  if (!ctx.k2cMatPcb) return;
  const renderLayer = mapKicadLayerToPcbRenderLayer(arc.layer);
  if (!isPcbAnnotationRenderLayer(renderLayer)) return;
  const start = arc.start || { x: 0, y: 0 };
  const mid = arc.mid || { x: 0, y: 0 };
  const end = arc.end || { x: 0, y: 0 };
  const rotatedStart = rotatePoint(start.x, start.y, -componentRotation);
  const rotatedMid = rotatePoint(mid.x, mid.y, -componentRotation);
  const rotatedEnd = rotatePoint(end.x, end.y, -componentRotation);
  const startKicadPos = {
    x: kicadComponentPos.x + rotatedStart.x,
    y: kicadComponentPos.y + rotatedStart.y
  };
  const midKicadPos = {
    x: kicadComponentPos.x + rotatedMid.x,
    y: kicadComponentPos.y + rotatedMid.y
  };
  const endKicadPos = {
    x: kicadComponentPos.x + rotatedEnd.x,
    y: kicadComponentPos.y + rotatedEnd.y
  };
  const layer = mapTextLayer(arc.layer);
  const strokeWidth = arc.stroke?.width || arc.width || 0.12;
  const arcInfo = calculateArcCenter(startKicadPos, midKicadPos, endKicadPos);
  if (!arcInfo) {
    const startPos = applyToPoint(ctx.k2cMatPcb, startKicadPos);
    const endPos = applyToPoint(ctx.k2cMatPcb, endKicadPos);
    insertFootprintRoute({
      ctx,
      componentId,
      layer,
      renderLayer,
      route: [startPos, endPos],
      strokeWidth
    });
    return;
  }
  const { center, radius } = arcInfo;
  const startAngle = Math.atan2(
    startKicadPos.y - center.y,
    startKicadPos.x - center.x
  );
  const midAngle = Math.atan2(
    midKicadPos.y - center.y,
    midKicadPos.x - center.x
  );
  const endAngle = Math.atan2(
    endKicadPos.y - center.y,
    endKicadPos.x - center.x
  );
  let sweepAngle = endAngle - startAngle;
  let midSweep = midAngle - startAngle;
  while (sweepAngle > Math.PI) sweepAngle -= 2 * Math.PI;
  while (sweepAngle < -Math.PI) sweepAngle += 2 * Math.PI;
  while (midSweep > Math.PI) midSweep -= 2 * Math.PI;
  while (midSweep < -Math.PI) midSweep += 2 * Math.PI;
  const isCCW = sweepAngle > 0;
  const midIsBetween = isCCW && midSweep > 0 && midSweep < sweepAngle || !isCCW && midSweep < 0 && midSweep > sweepAngle;
  if (!midIsBetween) {
    sweepAngle = sweepAngle > 0 ? sweepAngle - 2 * Math.PI : sweepAngle + 2 * Math.PI;
  }
  const arcLength = Math.abs(radius * sweepAngle);
  const segmentLength = 0.1;
  const numSegments = Math.max(2, Math.ceil(arcLength / segmentLength));
  const arcRoute = [];
  for (let i = 0; i <= numSegments; i++) {
    const t = i / numSegments;
    const angle = startAngle + sweepAngle * t;
    const kicadPoint = {
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle)
    };
    const cjPoint = applyToPoint(ctx.k2cMatPcb, kicadPoint);
    arcRoute.push(cjPoint);
  }
  insertFootprintRoute({
    ctx,
    componentId,
    layer,
    renderLayer,
    route: arcRoute,
    strokeWidth
  });
}
function createFootprintPoly(ctx, poly, componentId, kicadComponentPos, componentCcwRotationDegrees) {
  if (!ctx.k2cMatPcb) return;
  const renderLayer = mapKicadLayerToPcbRenderLayer(poly.layer);
  if (!isPcbAnnotationRenderLayer(renderLayer)) return;
  const ptArray = poly.points?.points || [];
  if (ptArray.length === 0) return;
  const layer = mapTextLayer(poly.layer);
  const strokeWidth = poly.stroke?.width || poly.width || 0.12;
  const transformedPts = ptArray.map((p) => {
    const x = p.x ?? p.xy?.x ?? 0;
    const y = p.y ?? p.xy?.y ?? 0;
    const rotated = rotatePoint(x, y, -componentCcwRotationDegrees);
    const kicadPos = {
      x: kicadComponentPos.x + rotated.x,
      y: kicadComponentPos.y + rotated.y
    };
    return applyToPoint(ctx.k2cMatPcb, kicadPos);
  });
  if (renderLayer.endsWith("_courtyard")) {
    ctx.db.pcb_courtyard_outline.insert({
      pcb_component_id: componentId,
      layer,
      outline: transformedPts
    });
    return;
  }
  insertFootprintRoute({
    ctx,
    componentId,
    layer,
    renderLayer,
    route: transformedPts,
    strokeWidth
  });
}

// lib/stages/pcb/CollectFootprintsStage/process-ports.ts
function createPcbPort({
  ctx,
  componentId,
  padInfo
}) {
  if (!padInfo.layers || padInfo.layers.length === 0) {
    return void 0;
  }
  const sourcePortId = `${componentId}_port_${padInfo.padNumber}`;
  const insertedPort = ctx.db.pcb_port.insert({
    pcb_component_id: componentId,
    source_port_id: sourcePortId,
    x: padInfo.position.x,
    y: padInfo.position.y,
    layers: padInfo.layers
  });
  return insertedPort.pcb_port_id;
}

// lib/stages/pcb/CollectFootprintsStage/process-pads.ts
var getNextPcbSmtPadId = (ctx) => {
  const usedIds = new Set(
    ctx.db.pcb_smtpad.list().map((pad) => pad.pcb_smtpad_id)
  );
  let index = usedIds.size;
  let candidate = `pcb_smtpad_${index}`;
  while (usedIds.has(candidate)) {
    index++;
    candidate = `pcb_smtpad_${index}`;
  }
  return candidate;
};
var getNextPcbPlatedHoleId = (ctx) => {
  const usedIds = new Set(
    ctx.db.pcb_plated_hole.list().map((hole) => hole.pcb_plated_hole_id)
  );
  let index = usedIds.size;
  let candidate = `pcb_plated_hole_${index}`;
  while (usedIds.has(candidate)) {
    index++;
    candidate = `pcb_plated_hole_${index}`;
  }
  return candidate;
};
function processPads(ctx, footprint, componentId, kicadComponentPos, componentRotation) {
  if (!ctx.k2cMatPcb) return;
  const pads = footprint.fpPads || [];
  const padArray = Array.isArray(pads) ? pads : [pads];
  for (const pad of padArray) {
    processPad({
      ctx,
      pad,
      componentId,
      kicadComponentPos,
      componentRotation
    });
  }
}
function processPad({
  ctx,
  pad,
  componentId,
  kicadComponentPos,
  componentRotation
}) {
  if (!ctx.k2cMatPcb) return;
  const padAt = pad.at || { x: 0, y: 0, angle: 0 };
  const padType = pad.padType || pad.type || "thru_hole";
  const padShape = pad.shape || "circle";
  const rotationRad = -componentRotation * Math.PI / 180;
  const rotatedPadX = padAt.x * Math.cos(rotationRad) - padAt.y * Math.sin(rotationRad);
  const rotatedPadY = padAt.x * Math.sin(rotationRad) + padAt.y * Math.cos(rotationRad);
  const padKicadPos = {
    x: kicadComponentPos.x + rotatedPadX,
    y: kicadComponentPos.y + rotatedPadY
  };
  const globalPos = applyToPoint2(ctx.k2cMatPcb, padKicadPos);
  let sizeX = 1;
  let sizeY = 1;
  if (pad.size) {
    if (Array.isArray(pad.size)) {
      sizeX = pad.size[0] || 1;
      sizeY = pad.size[1] || 1;
    } else if (typeof pad.size === "object") {
      sizeX = pad.size._width || pad.size.x || 1;
      sizeY = pad.size._height || pad.size.y || 1;
    }
  }
  const size = { x: sizeX, y: sizeY };
  const drill = pad.drill;
  const mappedCopperLayers = padType === "thru_hole" ? getCopperSpanLayerRefsFromLayers(pad.layers || [], ctx.kicadPcb) : getLayerRefsFromLayers(pad.layers || [], ctx.kicadPcb);
  const copperLayers = mappedCopperLayers.length > 0 ? mappedCopperLayers : padType === "thru_hole" ? getPcbCopperLayerRefs(ctx.kicadPcb) : [];
  const totalCcwRotationDegrees = padAt.angle || 0;
  const padNumber = pad.number?.toString();
  let pcbPortId;
  let sourcePortId;
  if (padNumber) {
    const padLayers = padType === "smd" ? copperLayers.slice(0, 1) : padType === "thru_hole" ? copperLayers : [];
    const padPortInfo = {
      padNumber,
      padType,
      layers: padLayers,
      position: globalPos
    };
    pcbPortId = createPcbPort({
      ctx,
      componentId,
      padInfo: padPortInfo
    });
    if (pcbPortId) {
      sourcePortId = `${componentId}_port_${padNumber}`;
    }
  }
  if (padType === "smd") {
    if (copperLayers.length === 0) {
      return;
    }
    createSmdPad({
      ctx,
      pad,
      componentId,
      pos: globalPos,
      size,
      shape: padShape,
      pcbPortId,
      sourcePortId,
      padKicadPos,
      totalCcwRotationDegrees
    });
  } else if (padType === "np_thru_hole") {
    createNpthHole(ctx, pad, componentId, globalPos, drill);
  } else {
    createPlatedHole(
      ctx,
      pad,
      componentId,
      globalPos,
      size,
      drill,
      padShape,
      copperLayers,
      totalCcwRotationDegrees,
      pcbPortId,
      sourcePortId
    );
  }
}
function createSmdPad({
  ctx,
  pad,
  componentId,
  pos,
  size,
  shape,
  pcbPortId,
  sourcePortId: _sourcePortId,
  padKicadPos,
  totalCcwRotationDegrees = 0
}) {
  const layers = pad.layers || [];
  const layer = determineLayerFromLayers(layers);
  if (shape === "custom") {
    const primitives = pad._sxPrimitives?._graphics || pad.primitives || [];
    const primitivesArray = Array.isArray(primitives) ? primitives : [primitives];
    let primitivesProcessed = 0;
    for (const primitive of primitivesArray) {
      if (primitive.token === "gr_poly") {
        const grPoly = primitive.gr_poly || primitive;
        let rawPts = [];
        const ptsContainer = grPoly._sxPts || grPoly.points || grPoly.pts;
        const contours = grPoly._contours || grPoly.contours;
        if (ptsContainer) {
          if (Array.isArray(ptsContainer)) {
            rawPts = ptsContainer;
          } else if (Array.isArray(ptsContainer.points)) {
            rawPts = ptsContainer.points;
          } else if (Array.isArray(ptsContainer.pts)) {
            rawPts = ptsContainer.pts;
          }
        } else if (Array.isArray(contours)) {
          for (const contour of contours) {
            const contourPts = contour.points || contour.pts || [];
            rawPts.push(
              ...Array.isArray(contourPts) ? contourPts : [contourPts]
            );
          }
        }
        const points = [];
        for (const pt of rawPts) {
          const x = pt.x ?? pt.xy?.x;
          const y = pt.y ?? pt.xy?.y;
          if (x !== void 0 && y !== void 0) {
            const rotated = rotatePoint(x, y, totalCcwRotationDegrees);
            const kicadPos = {
              x: padKicadPos.x + rotated.x,
              y: padKicadPos.y + rotated.y
            };
            points.push(applyToPoint2(ctx.k2cMatPcb, kicadPos));
          }
        }
        if (points.length > 0) {
          const smtpad = {
            type: "pcb_smtpad",
            shape: "polygon",
            pcb_component_id: componentId,
            pcb_port_id: pcbPortId,
            pcb_smtpad_id: getNextPcbSmtPadId(ctx),
            layer,
            port_hints: [pad.number.toString()],
            points
          };
          ctx.db.pcb_smtpad.insert(smtpad);
          primitivesProcessed++;
        }
      }
      if (primitive.token === "gr_circle") {
        const grCircle = primitive.gr_circle || primitive;
        const center = grCircle.center || grCircle._sxCenter || { x: 0, y: 0 };
        const end = grCircle.end || grCircle._sxEnd || { x: 0, y: 0 };
        const centerlineRadius = Math.sqrt(
          (end.x - center.x) ** 2 + (end.y - center.y) ** 2
        );
        const strokeWidth = grCircle.stroke?.width || grCircle.width || grCircle._sxWidth?.value || 0;
        const fill = grCircle.fill?.value || grCircle.fill || grCircle._sxFill?.value;
        const radius = fill === "no" && strokeWidth > 0 ? centerlineRadius + strokeWidth / 2 : centerlineRadius;
        const rotatedCenter = rotatePoint(
          center.x,
          center.y,
          totalCcwRotationDegrees
        );
        const kicadCenterPos = {
          x: padKicadPos.x + rotatedCenter.x,
          y: padKicadPos.y + rotatedCenter.y
        };
        const globalCenter = applyToPoint2(ctx.k2cMatPcb, kicadCenterPos);
        const smtpad = {
          type: "pcb_smtpad",
          shape: "circle",
          pcb_component_id: componentId,
          pcb_port_id: pcbPortId,
          pcb_smtpad_id: getNextPcbSmtPadId(ctx),
          layer,
          port_hints: [pad.number.toString()],
          x: globalCenter.x,
          y: globalCenter.y,
          width: radius * 2,
          height: radius * 2,
          radius
        };
        ctx.db.pcb_smtpad.insert(smtpad);
        primitivesProcessed++;
      }
    }
    if (primitivesProcessed > 0) {
      if (ctx.stats) {
        ctx.stats.pads = (ctx.stats.pads || 0) + primitivesProcessed;
      }
      return;
    }
  }
  const ccwRotationDegrees = pad.at?.angle;
  if (shape === "circle") {
    const smtpad = {
      type: "pcb_smtpad",
      pcb_component_id: componentId,
      pcb_smtpad_id: getNextPcbSmtPadId(ctx),
      x: pos.x,
      y: pos.y,
      width: size.x,
      height: size.y,
      layer,
      pcb_port_id: pcbPortId,
      port_hints: [pad.number?.toString()],
      shape: "circle",
      radius: Math.max(size.x, size.y) / 2
    };
    ctx.db.pcb_smtpad.insert(smtpad);
  } else if (shape === "oval") {
    const normalizedCcwRotation = normalizeRotationDegrees(ccwRotationDegrees);
    const rightAngleTurns = getRightAngleTurns(normalizedCcwRotation);
    const radius = Math.min(size.x, size.y) / 2;
    if (rightAngleTurns === null && normalizedCcwRotation !== 0) {
      const rotatedSmtPad = {
        type: "pcb_smtpad",
        pcb_component_id: componentId,
        x: pos.x,
        y: pos.y,
        width: size.x,
        height: size.y,
        radius,
        layer,
        pcb_port_id: pcbPortId,
        port_hints: [pad.number.toString()],
        shape: "rotated_pill",
        ccw_rotation: normalizedCcwRotation
      };
      ctx.db.pcb_smtpad.insert(rotatedSmtPad);
      return;
    }
    const shouldSwapDimensions = rightAngleTurns !== null && Math.abs(rightAngleTurns) % 2 === 1;
    const smtpad = {
      type: "pcb_smtpad",
      pcb_component_id: componentId,
      x: pos.x,
      y: pos.y,
      width: shouldSwapDimensions ? size.y : size.x,
      height: shouldSwapDimensions ? size.x : size.y,
      radius,
      layer,
      pcb_port_id: pcbPortId,
      port_hints: [pad.number.toString()],
      shape: "pill"
    };
    ctx.db.pcb_smtpad.insert(smtpad);
  } else if (shape === "rect" || shape === "roundrect") {
    const roundrectRatio = pad._sxRoundrectRatio?.value ?? pad.roundrect_rratio;
    let cornerRadius;
    if (shape === "roundrect" && roundrectRatio !== void 0) {
      const minDimension = Math.min(size.x, size.y);
      cornerRadius = minDimension * roundrectRatio / 2;
    }
    const normalizedCcwRotation = normalizeRotationDegrees(ccwRotationDegrees);
    const rightAngleTurns = getRightAngleTurns(normalizedCcwRotation);
    if (rightAngleTurns === null && normalizedCcwRotation !== 0) {
      const rotatedsmtpad = {
        type: "pcb_smtpad",
        pcb_component_id: componentId,
        x: pos.x,
        y: pos.y,
        width: size.x,
        height: size.y,
        layer,
        pcb_port_id: pcbPortId,
        port_hints: [pad.number.toString()],
        shape: "rotated_rect",
        ccw_rotation: normalizedCcwRotation,
        corner_radius: cornerRadius
      };
      ctx.db.pcb_smtpad.insert(rotatedsmtpad);
      return;
    }
    const shouldSwapDimensions = rightAngleTurns !== null && Math.abs(rightAngleTurns) % 2 === 1;
    const smtpad = {
      type: "pcb_smtpad",
      pcb_component_id: componentId,
      x: pos.x,
      y: pos.y,
      width: shouldSwapDimensions ? size.y : size.x,
      height: shouldSwapDimensions ? size.x : size.y,
      layer,
      pcb_port_id: pcbPortId,
      port_hints: [pad.number.toString()],
      shape: "rect",
      corner_radius: cornerRadius
    };
    ctx.db.pcb_smtpad.insert(smtpad);
  } else {
    ctx.db.pcb_smtpad.insert({
      type: "pcb_smtpad",
      pcb_component_id: componentId,
      x: pos.x,
      y: pos.y,
      width: size.x,
      height: size.y,
      layer,
      pcb_port_id: pcbPortId,
      port_hints: [pad.number?.toString()],
      shape: "rect"
    });
  }
  if (ctx.stats) {
    ctx.stats.pads = (ctx.stats.pads || 0) + 1;
  }
}
function normalizeRotationDegrees(rotationDegrees) {
  if (!rotationDegrees) return 0;
  const normalized = rotationDegrees % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}
function getRightAngleTurns(rotationDegrees) {
  const quarterTurns = rotationDegrees / 90;
  if (Math.abs(quarterTurns - Math.round(quarterTurns)) > 1e-9) {
    return null;
  }
  return Math.round(quarterTurns);
}
function createPlatedHole(ctx, pad, componentId, pos, size, drill, shape, layers, _rotation = 0, pcbPortId, _sourcePortId = void 0) {
  const drillX = typeof drill === "object" ? drill?.x || drill?._width || drill?.diameter || 0.8 : drill || 0.8;
  const drillY = typeof drill === "object" ? drill?.y || drill?._height || drill?.diameter || drillX : drill || 0.8;
  const holeDiameter = Math.max(drillX, drillY);
  const drillIsOval = typeof drill === "object" && drillX !== void 0 && drillY !== void 0 && drillX !== drillY;
  const outerWidth = size.x;
  const outerHeight = size.y;
  if (shape === "circle") {
    const platedHole = {
      type: "pcb_plated_hole",
      shape: "circle",
      pcb_component_id: componentId,
      pcb_port_id: pcbPortId,
      x: pos.x,
      y: pos.y,
      port_hints: [pad.number?.toString()],
      hole_diameter: holeDiameter,
      outer_diameter: Math.max(outerWidth, outerHeight),
      layers
    };
    ctx.db.pcb_plated_hole.insert(platedHole);
  } else if (shape === "oval") {
    const platedHole = {
      type: "pcb_plated_hole",
      shape: "pill",
      pcb_component_id: componentId,
      pcb_port_id: pcbPortId,
      x: pos.x,
      y: pos.y,
      port_hints: [pad.number?.toString()],
      hole_width: drillY,
      hole_height: drillX,
      outer_width: outerWidth,
      outer_height: outerHeight,
      ccw_rotation: pad.at?.angle || 0,
      layers
    };
    ctx.db.pcb_plated_hole.insert(platedHole);
  } else if (shape === "rect" || shape === "square" || shape === "roundrect") {
    const normalizedCcwRotationDegrees = normalizeRotationDegrees(pad.at?.angle);
    if (drillIsOval) {
      if (normalizedCcwRotationDegrees === 0) {
        const platedHole = {
          type: "pcb_plated_hole",
          shape: "pill_hole_with_rect_pad",
          pcb_component_id: componentId,
          pcb_port_id: pcbPortId,
          x: pos.x,
          y: pos.y,
          port_hints: [pad.number?.toString()],
          hole_shape: "pill",
          pad_shape: "rect",
          hole_width: drillY,
          hole_height: drillX,
          rect_pad_width: outerWidth,
          rect_pad_height: outerHeight,
          hole_offset_x: 0,
          hole_offset_y: 0,
          layers
        };
        if (shape === "roundrect") {
          const roundrectRatio = pad._sxRoundrectRatio?.value ?? pad.roundrect_rratio;
          if (roundrectRatio !== void 0) {
            const minDimension = Math.min(outerWidth, outerHeight);
            platedHole.rect_border_radius = minDimension * roundrectRatio / 2;
          }
        }
        ctx.db.pcb_plated_hole.insert(platedHole);
      } else {
        const platedHole = {
          type: "pcb_plated_hole",
          shape: "rotated_pill_hole_with_rect_pad",
          pcb_component_id: componentId,
          pcb_port_id: pcbPortId,
          x: pos.x,
          y: pos.y,
          port_hints: [pad.number?.toString()],
          hole_shape: "rotated_pill",
          pad_shape: "rect",
          hole_width: drillY,
          hole_height: drillX,
          hole_ccw_rotation: normalizedCcwRotationDegrees,
          rect_ccw_rotation: normalizedCcwRotationDegrees,
          rect_pad_width: outerWidth,
          rect_pad_height: outerHeight,
          hole_offset_x: 0,
          hole_offset_y: 0,
          layers
        };
        if (shape === "roundrect") {
          const roundrectRatio = pad._sxRoundrectRatio?.value ?? pad.roundrect_rratio;
          if (roundrectRatio !== void 0) {
            const minDimension = Math.min(outerWidth, outerHeight);
            platedHole.rect_border_radius = minDimension * roundrectRatio / 2;
          }
        }
        ctx.db.pcb_plated_hole.insert(platedHole);
      }
    } else {
      const platedHole = {
        type: "pcb_plated_hole",
        shape: "circular_hole_with_rect_pad",
        pcb_component_id: componentId,
        pcb_port_id: pcbPortId,
        pcb_plated_hole_id: getNextPcbPlatedHoleId(ctx),
        x: pos.x,
        y: pos.y,
        port_hints: [pad.number?.toString()],
        hole_shape: "circle",
        pad_shape: "rect",
        hole_diameter: holeDiameter,
        rect_ccw_rotation: pad.at?.angle || 0,
        rect_pad_width: outerWidth,
        rect_pad_height: outerHeight,
        hole_offset_x: 0,
        hole_offset_y: 0,
        layers
      };
      if (shape === "roundrect") {
        const roundrectRatio = pad._sxRoundrectRatio?.value ?? pad.roundrect_rratio;
        if (roundrectRatio !== void 0) {
          const minDimension = Math.min(outerWidth, outerHeight);
          platedHole.rect_border_radius = minDimension * roundrectRatio / 2;
        }
      }
      ctx.db.pcb_plated_hole.insert(platedHole);
    }
  }
  if (ctx.stats) {
    ctx.stats.pads = (ctx.stats.pads || 0) + 1;
  }
}
function createNpthHole(ctx, _pad, componentId, pos, drill) {
  const holeDiameter = drill?.diameter || drill || 1;
  const hole = {
    type: "pcb_hole",
    hole_shape: "circle",
    pcb_component_id: componentId,
    x: pos.x,
    y: pos.y,
    hole_diameter: holeDiameter
  };
  ctx.db.pcb_hole.insert(hole);
}

// lib/stages/pcb/CollectFootprintsStage/process-text.ts
import { applyToPoint as applyToPoint3 } from "transformation-matrix";

// lib/stages/pcb/CollectFootprintsStage/text-utils.ts
function getTextValue(footprint, type) {
  const texts = footprint.fpTexts || [];
  const textArray = Array.isArray(texts) ? texts : [texts];
  const text = textArray.find((t) => t.type === type);
  return text?.text;
}
function getPropertyValue(footprint, propertyName) {
  const properties = footprint.properties || [];
  const propertyArray = Array.isArray(properties) ? properties : [properties];
  const property = propertyArray.find((p) => p.key === propertyName);
  return property?.value;
}
function substituteKicadVariables(text, footprint) {
  let result = text;
  const reference = getPropertyValue(footprint, "Reference") || getTextValue(footprint, "reference") || "?";
  const value = getPropertyValue(footprint, "Value") || getTextValue(footprint, "value") || "";
  result = result.replace(/\$\{REFERENCE\}/g, reference);
  result = result.replace(/\$\{VALUE\}/g, value);
  return result;
}
function mapKicadJustifyToAnchorAlignment(justify) {
  if (!justify) return "center";
  const horizontal = justify.horizontal || "center";
  const vertical = justify.vertical || "center";
  if (vertical === "top") {
    if (horizontal === "left") return "top_left";
    if (horizontal === "center") return "top_center";
    if (horizontal === "right") return "top_right";
  }
  if (vertical === "center") {
    if (horizontal === "left") return "center_left";
    if (horizontal === "center") return "center";
    if (horizontal === "right") return "center_right";
  }
  if (vertical === "bottom") {
    if (horizontal === "left") return "bottom_left";
    if (horizontal === "center") return "bottom_center";
    if (horizontal === "right") return "bottom_right";
  }
  return "center";
}

// lib/stages/pcb/CollectFootprintsStage/process-text.ts
function convertKiCadAngleToCircuitJsonCcwRotation(rotationDegrees) {
  if (!rotationDegrees) return 0;
  const circuitJsonRotation = rotationDegrees % 360;
  return circuitJsonRotation < 0 ? circuitJsonRotation + 360 : circuitJsonRotation;
}
function isKicadTextHidden(text) {
  return text.hidden === true || text._sxHide?.value === true;
}
var KICAD_TEXT_HEIGHT_TO_CIRCUIT_JSON_FONT_SIZE = 2 / 3;
var TEXT_POSITION_EPSILON = 1e-6;
function getKiCadTextAnchor(text) {
  return text?._sxPosition || text?.at || text?._sxAt;
}
function areKiCadTextAnchorsAtSamePosition(a, b) {
  return Math.abs((a?.x ?? 0) - (b?.x ?? 0)) < TEXT_POSITION_EPSILON && Math.abs((a?.y ?? 0) - (b?.y ?? 0)) < TEXT_POSITION_EPSILON;
}
function isFabTextSameLabelAndPositionAsVisibleSilkscreenText(text, footprint) {
  const renderLayer = mapKicadLayerToPcbRenderLayer(text.layer);
  if (!renderLayer?.endsWith("_fabrication_note")) return false;
  const textValue = substituteKicadVariables(text.text || "", footprint);
  const textAt = getKiCadTextAnchor(text);
  const properties = footprint.properties || [];
  const propertyArray = Array.isArray(properties) ? properties : [properties];
  const hasMatchingSilkscreenProperty = propertyArray.some((property) => {
    const propertyLayer = mapKicadLayerToPcbRenderLayer(property.layer);
    if (!propertyLayer?.endsWith("_silkscreen")) return false;
    if (isKicadTextHidden(property)) return false;
    if (property.value !== textValue) return false;
    return areKiCadTextAnchorsAtSamePosition(
      textAt,
      getKiCadTextAnchor(property)
    );
  });
  if (hasMatchingSilkscreenProperty) return true;
  const texts = footprint.fpTexts || [];
  const textArray = Array.isArray(texts) ? texts : [texts];
  return textArray.some((otherText) => {
    const otherLayer = mapKicadLayerToPcbRenderLayer(otherText.layer);
    if (!otherLayer?.endsWith("_silkscreen")) return false;
    if (isKicadTextHidden(otherText)) return false;
    if (substituteKicadVariables(otherText.text || "", footprint) !== textValue) {
      return false;
    }
    return areKiCadTextAnchorsAtSamePosition(
      textAt,
      getKiCadTextAnchor(otherText)
    );
  });
}
function processFootprintText(ctx, footprint, componentId, kicadComponentPos, componentRotation) {
  if (!ctx.k2cMatPcb) return;
  processFootprintProperties(
    ctx,
    footprint,
    componentId,
    kicadComponentPos,
    componentRotation
  );
  const texts = footprint.fpTexts || [];
  const textArray = Array.isArray(texts) ? texts : [texts];
  for (const text of textArray) {
    if (isKicadTextHidden(text)) continue;
    if (isFabTextSameLabelAndPositionAsVisibleSilkscreenText(text, footprint)) {
      continue;
    }
    const renderLayer = mapKicadLayerToPcbRenderLayer(text.layer);
    if (!isPcbTextRenderLayer(renderLayer)) continue;
    const textElement = {
      text: text.text,
      at: getKiCadTextAnchor(text),
      // Use _sxPosition for position
      layer: text.layer,
      effects: text._sxEffects || text.effects,
      _sxEffects: text._sxEffects
      // Pass _sxEffects for font size access
    };
    createGraphicText(
      ctx,
      textElement,
      renderLayer,
      componentId,
      kicadComponentPos,
      componentRotation,
      footprint
    );
  }
}
function processFootprintProperties(ctx, footprint, componentId, kicadComponentPos, componentRotation) {
  if (!ctx.k2cMatPcb) return;
  const properties = footprint.properties || [];
  const propertyArray = Array.isArray(properties) ? properties : [properties];
  for (const property of propertyArray) {
    if (!property.layer) continue;
    const renderLayer = mapKicadLayerToPcbRenderLayer(property.layer);
    const isPropertyHidden = isKicadTextHidden(property);
    if (!isPcbTextRenderLayer(renderLayer) || isPropertyHidden) continue;
    const textElement = {
      text: property.value,
      at: getKiCadTextAnchor(property),
      layer: property.layer,
      effects: property._sxEffects || property.effects,
      _sxEffects: property._sxEffects
      // Pass _sxEffects for font size access
    };
    createGraphicText(
      ctx,
      textElement,
      renderLayer,
      componentId,
      kicadComponentPos,
      componentRotation,
      footprint
    );
  }
}
function createGraphicText(ctx, text, renderLayer, componentId, kicadComponentPos, componentRotation, footprint) {
  if (!ctx.k2cMatPcb) return;
  const at = text.at;
  const textLocalX = at?.x ?? 0;
  const textLocalY = at?.y ?? 0;
  const rotationRad = -componentRotation * Math.PI / 180;
  const rotatedTextX = textLocalX * Math.cos(rotationRad) - textLocalY * Math.sin(rotationRad);
  const rotatedTextY = textLocalX * Math.sin(rotationRad) + textLocalY * Math.cos(rotationRad);
  const textKicadPos = {
    x: kicadComponentPos.x + rotatedTextX,
    y: kicadComponentPos.y + rotatedTextY
  };
  const pos = applyToPoint3(ctx.k2cMatPcb, textKicadPos);
  const layer = mapTextLayer(text.layer);
  const processedText = substituteKicadVariables(text.text || "", footprint);
  const kicadFontSize = text._sxEffects?._sxFont?._sxSize?._height || text.effects?.font?.size?.y || 1;
  const fontSize = kicadFontSize * KICAD_TEXT_HEIGHT_TO_CIRCUIT_JSON_FONT_SIZE;
  const ccwRotation = convertKiCadAngleToCircuitJsonCcwRotation(at?.angle);
  const justify = text._sxEffects?._sxJustify || text.effects?.justify;
  const anchorAlignment = mapKicadJustifyToAnchorAlignment(justify);
  if (renderLayer.endsWith("_silkscreen")) {
    ctx.db.pcb_silkscreen_text.insert({
      pcb_component_id: componentId,
      font: "tscircuit2024",
      font_size: fontSize,
      text: processedText,
      anchor_position: pos,
      anchor_alignment: anchorAlignment,
      layer,
      ccw_rotation: ccwRotation || void 0
    });
    return;
  }
  if (renderLayer.endsWith("_fabrication_note")) {
    ctx.db.pcb_fabrication_note_text.insert({
      type: "pcb_fabrication_note_text",
      pcb_fabrication_note_text_id: "",
      pcb_component_id: componentId,
      font: "tscircuit2024",
      font_size: fontSize,
      text: processedText,
      anchor_position: pos,
      anchor_alignment: anchorAlignment,
      layer
    });
    return;
  }
  if (renderLayer.endsWith("_copper")) {
    ctx.db.pcb_copper_text.insert({
      pcb_component_id: componentId,
      font: "tscircuit2024",
      font_size: fontSize,
      text: processedText,
      anchor_position: pos,
      anchor_alignment: anchorAlignment,
      layer,
      ccw_rotation: ccwRotation || void 0
    });
  }
}

// lib/stages/pcb/CollectFootprintsStage/footprint-properties.ts
function getFootprintProperties(footprint) {
  const properties = footprint.properties || [];
  return Array.isArray(properties) ? properties : [properties];
}
function getFootprintPropertyName(property) {
  return property?.key;
}
function getFootprintPropertyValue(property) {
  return property?.value;
}
function findFootprintProperty(footprint, propertyNames) {
  const names = Array.isArray(propertyNames) ? propertyNames : [propertyNames];
  return getFootprintProperties(footprint).find(
    (property) => names.includes(getFootprintPropertyName(property) ?? "")
  );
}
function findFootprintPropertyValue(footprint, propertyNames) {
  const property = findFootprintProperty(footprint, propertyNames);
  return getFootprintPropertyValue(property);
}
function parseSupplierPartNumbers(value) {
  if (!value) return void 0;
  const partNumbers = value.split(/[,;]/).map((partNumber) => partNumber.trim()).filter(Boolean);
  return partNumbers.length > 0 ? partNumbers : void 0;
}

// lib/stages/pcb/CollectFootprintsStage/infer-component-type.ts
function inferComponentType(reference, footprint) {
  if (!reference && !footprint) return "simple_chip";
  const normalizedReference = reference?.trim();
  const prefix = normalizedReference?.match(/^([A-Z]+)/)?.[1];
  if (isFiducialReference(normalizedReference) || isFiducialFootprint(footprint)) {
    return "simple_fiducial";
  }
  switch (prefix) {
    case "R":
      return "simple_resistor";
    case "C":
      return "simple_capacitor";
    case "L":
      return "simple_inductor";
    case "D":
      if (isLedFootprint(footprint)) return "simple_led";
      return "simple_diode";
    case "LED":
      return "simple_led";
    case "Q":
      return "simple_transistor";
    case "U":
    case "IC":
      return "simple_chip";
    case "J":
    case "P":
      return "simple_chip";
    // Connectors treated as chips
    default:
      return "simple_chip";
  }
}
function isFiducialReference(reference) {
  return /^FID\d+/i.test(reference || "");
}
function isFiducialFootprint(footprint) {
  return getFootprintMetadata(footprint).includes("fiducial");
}
function isLedFootprint(footprint) {
  const metadata = getFootprintMetadata(footprint);
  return metadata.includes("led") || metadata.includes("light emitting diode");
}
function getFootprintMetadata(footprint) {
  if (!footprint) return "";
  return [
    footprint.libraryLink,
    footprint.descr?.value,
    footprint.tags?.value,
    findFootprintPropertyValue(footprint, "Footprint"),
    findFootprintPropertyValue(footprint, "Description"),
    findFootprintPropertyValue(footprint, "Value")
  ].filter(Boolean).join(" ").toLowerCase();
}
function inferTransistorTypeFromFootprint(footprint, value) {
  const lowerValue = (value || "").toLowerCase();
  if (lowerValue.includes("pnp")) return "pnp";
  if (lowerValue.includes("npn")) return "npn";
  const libId = footprint.libraryId;
  const lowerLibId = (libId || "").toLowerCase();
  if (lowerLibId.includes("pnp")) return "pnp";
  if (lowerLibId.includes("npn")) return "npn";
  return "npn";
}

// lib/stages/pcb/CollectFootprintsStage/process-footprint.ts
function processFootprint(ctx, footprint) {
  if (!ctx.k2cMatPcb) return;
  const position = footprint.position;
  const kicadPos = { x: position?.x ?? 0, y: position?.y ?? 0 };
  const cjPos = applyToPoint4(ctx.k2cMatPcb, kicadPos);
  const rotation = position?.angle ?? 0;
  const uuid = footprint.uuid?.value || footprint.tstamp?.value;
  if (!uuid) return;
  const refdes = getFootprintReference(footprint);
  const value = getFootprintValue(footprint);
  const jlcpcbPartNumbers = getJlcpcbPartNumbers(footprint);
  const ftype = inferComponentType(refdes, footprint);
  const sourceComponentData = {
    name: refdes || "U",
    ftype
  };
  if (ftype === "simple_transistor") {
    sourceComponentData.transistor_type = inferTransistorTypeFromFootprint(
      footprint,
      value
    );
  }
  if (jlcpcbPartNumbers) {
    sourceComponentData.supplier_part_numbers = {
      jlcpcb: jlcpcbPartNumbers
    };
  }
  if (value) {
    const sanitizedValue = value.replace(/,/g, ".");
    switch (ftype) {
      case "simple_resistor":
        sourceComponentData.resistance = sanitizedValue;
        break;
      case "simple_capacitor":
        sourceComponentData.capacitance = sanitizedValue;
        break;
      case "simple_inductor":
        sourceComponentData.inductance = sanitizedValue;
        break;
    }
  }
  const sourceComponent = ctx.db.source_component.insert(sourceComponentData);
  const sourceComponentId = sourceComponent.source_component_id;
  const inserted = ctx.db.pcb_component.insert({
    center: { x: cjPos.x, y: cjPos.y },
    layer: getComponentLayer(footprint),
    rotation: -rotation,
    // Negate rotation due to Y-axis flip in coordinate transform
    width: 0,
    // Will be computed from pads if needed
    height: 0,
    source_component_id: sourceComponentId
  });
  const componentId = inserted.pcb_component_id;
  ctx.footprintUuidToComponentId?.set(uuid, componentId);
  ctx.footprintUuidToSourceComponentId?.set(uuid, sourceComponentId);
  processPads(ctx, footprint, componentId, kicadPos, rotation);
  processFootprintText(ctx, footprint, componentId, kicadPos, rotation);
  processFootprintGraphics(ctx, footprint, componentId, kicadPos, rotation);
  if (ctx.stats) {
    ctx.stats.components = (ctx.stats.components || 0) + 1;
  }
}
function getFootprintReference(footprint) {
  const propertyValue = findFootprintPropertyValue(footprint, "Reference");
  if (propertyValue) return propertyValue;
  const textItems = footprint.fpTexts || [];
  const textArray = Array.isArray(textItems) ? textItems : [textItems];
  for (const text of textArray) {
    if (text.type === "reference") {
      return text.text;
    }
  }
  return void 0;
}
function getFootprintValue(footprint) {
  const propertyValue = findFootprintPropertyValue(footprint, "Value");
  if (propertyValue) return propertyValue;
  const textItems = footprint.fpTexts || [];
  const textArray = Array.isArray(textItems) ? textItems : [textItems];
  for (const text of textArray) {
    if (text.type === "value") {
      return text.text;
    }
  }
  return void 0;
}
function getJlcpcbPartNumbers(footprint) {
  return parseSupplierPartNumbers(
    findFootprintPropertyValue(footprint, [
      "JLCPCB Part #",
      "Supplier Part Number"
    ])
  );
}

// lib/stages/pcb/CollectFootprintsStage/index.ts
var CollectFootprintsStage = class extends ConverterStage {
  processedFootprints = /* @__PURE__ */ new Set();
  step() {
    if (!this.ctx.kicadPcb || !this.ctx.k2cMatPcb) {
      this.finished = true;
      return false;
    }
    const footprints = this.ctx.kicadPcb.footprints || [];
    const footprintArray = Array.isArray(footprints) ? footprints : [footprints];
    for (const footprint of footprintArray) {
      const uuid = footprint.uuid?.value || footprint.tstamp?.value;
      if (!uuid) continue;
      if (this.processedFootprints.has(uuid)) continue;
      processFootprint(this.ctx, footprint);
      this.processedFootprints.add(uuid);
    }
    this.finished = true;
    return false;
  }
};

// lib/stages/pcb/CollectGraphicsStage.ts
import { applyToPoint as applyToPoint5 } from "transformation-matrix";

// lib/stages/pcb/arc-utils.ts
var FULL_TURN = Math.PI * 2;
function normalizeToArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}
function getLayerNames(layer) {
  if (!layer) return [];
  if (typeof layer === "string") return [layer];
  return layer.names || [];
}
function getGraphicLayerNames(graphic) {
  return getLayerNames(graphic?.layer);
}
function getPcbPoint(point) {
  return {
    x: point?.x ?? 0,
    y: point?.y ?? 0
  };
}
function getLineStartEnd(line) {
  return {
    start: getPcbPoint(line.start),
    end: getPcbPoint(line.end)
  };
}
function getArcStartMidEnd(arc) {
  return {
    start: getPcbPoint(arc.start),
    mid: getPcbPoint(arc.mid),
    end: getPcbPoint(arc.end)
  };
}
function getCircleCenterEnd(circle) {
  return {
    center: getPcbPoint(circle.center),
    end: getPcbPoint(circle.end)
  };
}
function getGraphicArcs(kicadPcb) {
  return normalizeToArray(kicadPcb.graphicArcs);
}
function getGraphicCircles(kicadPcb) {
  return normalizeToArray(kicadPcb.graphicCircles);
}
function getGraphicCurves(kicadPcb) {
  return normalizeToArray(kicadPcb.graphicCurves);
}
function getTopLevelCopperArcs(kicadPcb) {
  return normalizeToArray(kicadPcb.arcs);
}
function approximateArcPoints(start, mid, end, options) {
  const geometry = getArcGeometry(start, mid, end);
  if (!geometry) {
    return [start, end];
  }
  const segmentLength = options?.segmentLength ?? 0.25;
  const minSegments = options?.minSegments ?? 8;
  const arcLength = Math.abs(geometry.radius * geometry.sweepAngle);
  const numSegments = Math.max(
    2,
    minSegments,
    Math.ceil(arcLength / segmentLength)
  );
  const points = [];
  for (let i = 0; i <= numSegments; i++) {
    const t = i / numSegments;
    const angle = geometry.startAngle + geometry.sweepAngle * t;
    points.push({
      x: geometry.center.x + geometry.radius * Math.cos(angle),
      y: geometry.center.y + geometry.radius * Math.sin(angle)
    });
  }
  return points;
}
function getCurvePoints(curve) {
  const ptsData = curve.points?.points ?? [];
  const xyPoints = ptsData.filter((point) => point.token === "xy").map((point) => getPcbPoint(point));
  if (xyPoints.length < 4) {
    return null;
  }
  return {
    start: xyPoints[0],
    control1: xyPoints[1],
    control2: xyPoints[2],
    end: xyPoints[3]
  };
}
function approximateCubicBezierPoints(start, control1, control2, end, options) {
  const segmentLength = options?.segmentLength ?? 0.25;
  const minSegments = options?.minSegments ?? 8;
  const controlPolygonLength = getDistance(start, control1) + getDistance(control1, control2) + getDistance(control2, end);
  const numSegments = Math.max(
    2,
    minSegments,
    Math.ceil(controlPolygonLength / segmentLength)
  );
  const points = [];
  for (let i = 0; i <= numSegments; i++) {
    const t = i / numSegments;
    const omt = 1 - t;
    points.push({
      x: omt ** 3 * start.x + 3 * omt ** 2 * t * control1.x + 3 * omt * t ** 2 * control2.x + t ** 3 * end.x,
      y: omt ** 3 * start.y + 3 * omt ** 2 * t * control1.y + 3 * omt * t ** 2 * control2.y + t ** 3 * end.y
    });
  }
  return points;
}
function approximateCirclePoints(center, end, options) {
  const radius = getDistance(center, end);
  if (radius <= 0) {
    return [center];
  }
  const segmentLength = options?.segmentLength ?? 0.25;
  const minSegments = options?.minSegments ?? 16;
  const circumference = FULL_TURN * radius;
  const numSegments = Math.max(
    8,
    minSegments,
    Math.ceil(circumference / segmentLength)
  );
  const startAngle = Math.atan2(end.y - center.y, end.x - center.x);
  const points = [];
  for (let i = 0; i <= numSegments; i++) {
    const t = i / numSegments;
    const angle = startAngle + FULL_TURN * t;
    points.push({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle)
    });
  }
  return points;
}
function getArcGeometry(start, mid, end) {
  const circle = calculateArcCenter2(start, mid, end);
  if (!circle) {
    return null;
  }
  const startAngle = Math.atan2(
    start.y - circle.center.y,
    start.x - circle.center.x
  );
  const midAngle = Math.atan2(mid.y - circle.center.y, mid.x - circle.center.x);
  const endAngle = Math.atan2(end.y - circle.center.y, end.x - circle.center.x);
  let sweepAngle = normalizeSignedAngle(endAngle - startAngle);
  const midSweep = normalizeSignedAngle(midAngle - startAngle);
  const isCounterClockwise = sweepAngle > 0;
  const midIsBetween = isCounterClockwise && midSweep > 0 && midSweep < sweepAngle || !isCounterClockwise && midSweep < 0 && midSweep > sweepAngle;
  if (!midIsBetween) {
    sweepAngle = sweepAngle > 0 ? sweepAngle - FULL_TURN : sweepAngle + FULL_TURN;
  }
  return {
    center: circle.center,
    radius: circle.radius,
    startAngle,
    sweepAngle
  };
}
function normalizeSignedAngle(angle) {
  while (angle <= -Math.PI) angle += FULL_TURN;
  while (angle > Math.PI) angle -= FULL_TURN;
  return angle;
}
function calculateArcCenter2(p1, p2, p3) {
  const ax = p1.x;
  const ay = p1.y;
  const bx = p2.x;
  const by = p2.y;
  const cx = p3.x;
  const cy = p3.y;
  const determinant = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(determinant) < 1e-10) {
    return null;
  }
  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / determinant;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / determinant;
  return {
    center: { x: ux, y: uy },
    radius: Math.sqrt((ax - ux) ** 2 + (ay - uy) ** 2)
  };
}
function getDistance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

// lib/stages/pcb/CollectGraphicsStage.ts
var EDGE_CUT_POINT_EPSILON = 0.01;
var KICAD_TEXT_HEIGHT_TO_CIRCUIT_JSON_FONT_SIZE2 = 2 / 3;
function convertKiCadAngleToCircuitJsonCcwRotation2(rotationDegrees) {
  if (!rotationDegrees) return 0;
  const circuitJsonRotation = rotationDegrees % 360;
  return circuitJsonRotation < 0 ? circuitJsonRotation + 360 : circuitJsonRotation;
}
var CollectGraphicsStage = class extends ConverterStage {
  step() {
    if (!this.ctx.kicadPcb || !this.ctx.k2cMatPcb) {
      this.finished = true;
      return false;
    }
    const lines = this.ctx.kicadPcb.graphicLines || [];
    const lineArray = Array.isArray(lines) ? lines : [lines];
    const arcArray = getGraphicArcs(this.ctx.kicadPcb);
    const circleArray = getGraphicCircles(this.ctx.kicadPcb);
    const curveArray = getGraphicCurves(this.ctx.kicadPcb);
    const grRects = this.ctx.kicadPcb.graphicRects || [];
    const rectArray = Array.isArray(grRects) ? grRects : [grRects];
    const edgeCutPrimitives = [];
    for (const line of lineArray) {
      const layerStr = getGraphicLayerNames(line).join(" ");
      if (layerStr.includes("Edge.Cuts")) {
        const { start, end } = getLineStartEnd(line);
        edgeCutPrimitives.push({
          type: "line",
          start,
          end
        });
      } else if (layerStr.includes("SilkS") || layerStr.includes("Fab") || layerStr.includes("CrtYd")) {
        const renderLayer = mapKicadLayerToPcbRenderLayer(line.layer);
        if (renderLayer) this.createGraphicPath(line, renderLayer);
      }
    }
    for (const arc of arcArray) {
      const layerStr = getGraphicLayerNames(arc).join(" ");
      if (layerStr.includes("Edge.Cuts")) {
        const { start, mid, end } = getArcStartMidEnd(arc);
        edgeCutPrimitives.push({
          type: "arc",
          start,
          mid,
          end
        });
      } else if (layerStr.includes("SilkS") || layerStr.includes("Fab") || layerStr.includes("CrtYd")) {
        const renderLayer = mapKicadLayerToPcbRenderLayer(arc.layer);
        if (renderLayer) this.createGraphicArc(arc, renderLayer);
      }
    }
    for (const circle of circleArray) {
      const layerStr = getGraphicLayerNames(circle).join(" ");
      if (!layerStr.includes("Edge.Cuts")) continue;
      const { center, end } = getCircleCenterEnd(circle);
      edgeCutPrimitives.push({
        type: "circle",
        center,
        start: end,
        end
      });
    }
    for (const curve of curveArray) {
      const layerStr = getGraphicLayerNames(curve).join(" ");
      if (!layerStr.includes("Edge.Cuts")) continue;
      const points = getCurvePoints(curve);
      if (!points) continue;
      edgeCutPrimitives.push({
        type: "curve",
        start: points.start,
        control1: points.control1,
        control2: points.control2,
        end: points.end
      });
    }
    for (const rect of rectArray) {
      const layerStr = getGraphicLayerNames(rect).join(" ");
      if (!layerStr.includes("Edge.Cuts")) continue;
      edgeCutPrimitives.push(...this.getRectEdgeCutPrimitives(rect));
    }
    edgeCutPrimitives.push(...this.getFootprintEdgeCutPrimitives());
    if (edgeCutPrimitives.length > 0) {
      this.createBoardOutline(edgeCutPrimitives);
    }
    for (const rect of rectArray) {
      this.processRectangle(rect);
    }
    const grPolys = this.ctx.kicadPcb.graphicPolys || [];
    const polyArray = Array.isArray(grPolys) ? grPolys : [grPolys];
    for (const poly of polyArray) {
      this.processPolygon(poly);
    }
    const texts = this.ctx.kicadPcb.graphicTexts || [];
    const textArray = Array.isArray(texts) ? texts : [texts];
    for (const text of textArray) {
      const renderLayer = mapKicadLayerToPcbRenderLayer(text.layer);
      if (renderLayer) this.createGraphicText(text, renderLayer);
    }
    this.finished = true;
    return false;
  }
  createBoardOutline(primitives) {
    if (!this.ctx.k2cMatPcb) return;
    const contours = this.createBoardContours(primitives);
    if (contours.length === 0) return;
    const boardContour = contours.reduce(
      (largestContour, contour) => contour.area > largestContour.area ? contour : largestContour
    );
    const points = boardContour.points;
    const numLayers = getPcbCopperLayerCount(this.ctx.kicadPcb);
    for (const contour of contours) {
      if (contour === boardContour) continue;
      this.createEdgeCutCutout(contour);
    }
    const existingBoard = this.ctx.db.pcb_board.list()[0];
    if (existingBoard) {
      existingBoard.outline = points;
      existingBoard.width = this.calculateWidth(points);
      existingBoard.height = this.calculateHeight(points);
      existingBoard.num_layers = numLayers;
    } else {
      this.ctx.db.insert({
        type: "pcb_board",
        center: { x: 0, y: 0 },
        outline: points,
        width: this.calculateWidth(points),
        height: this.calculateHeight(points),
        num_layers: numLayers
      });
    }
  }
  createBoardContours(primitives) {
    const orderedContours = this.orderConnectedContours(primitives);
    return orderedContours.map((contourPrimitives) => {
      const points = this.getBoardContourPoints(contourPrimitives);
      return {
        primitives: contourPrimitives,
        points,
        area: Math.abs(this.calculatePolygonArea(points))
      };
    }).filter((contour) => contour.points.length > 0);
  }
  getFootprintEdgeCutPrimitives() {
    const footprints = this.ctx.kicadPcb?.footprints || [];
    const footprintArray = Array.isArray(footprints) ? footprints : [footprints];
    const primitives = [];
    for (const footprint of footprintArray) {
      const position = footprint.position;
      const footprintPosition = getPcbPoint(position);
      const footprintRotation = position?.angle ?? 0;
      const fpLines = footprint.fpLines || [];
      const fpLineArray = Array.isArray(fpLines) ? fpLines : [fpLines];
      for (const line of fpLineArray) {
        const layerStr = getGraphicLayerNames(line).join(" ");
        if (!layerStr.includes("Edge.Cuts")) continue;
        const { start, end } = getLineStartEnd(line);
        primitives.push(
          this.transformFootprintPrimitive(
            {
              type: "line",
              start,
              end
            },
            footprintPosition,
            footprintRotation
          )
        );
      }
      const fpArcs = footprint.fpArcs || [];
      const fpArcArray = Array.isArray(fpArcs) ? fpArcs : [fpArcs];
      for (const arc of fpArcArray) {
        const layerStr = getGraphicLayerNames(arc).join(" ");
        if (!layerStr.includes("Edge.Cuts")) continue;
        const { start, mid, end } = getArcStartMidEnd(arc);
        primitives.push(
          this.transformFootprintPrimitive(
            {
              type: "arc",
              start,
              mid,
              end
            },
            footprintPosition,
            footprintRotation
          )
        );
      }
      const fpCircles = footprint.fpCircles || [];
      const fpCircleArray = Array.isArray(fpCircles) ? fpCircles : [fpCircles];
      for (const circle of fpCircleArray) {
        const layerStr = getGraphicLayerNames(circle).join(" ");
        if (!layerStr.includes("Edge.Cuts")) continue;
        const { center, end } = getCircleCenterEnd(circle);
        primitives.push(
          this.transformFootprintPrimitive(
            {
              type: "circle",
              center,
              start: end,
              end
            },
            footprintPosition,
            footprintRotation
          )
        );
      }
      const fpRects = footprint.fpRects || [];
      const fpRectArray = Array.isArray(fpRects) ? fpRects : [fpRects];
      for (const rect of fpRectArray) {
        const layerStr = getGraphicLayerNames(rect).join(" ");
        if (!layerStr.includes("Edge.Cuts")) continue;
        primitives.push(
          ...this.getRectEdgeCutPrimitives(rect).map(
            (primitive) => this.transformFootprintPrimitive(
              primitive,
              footprintPosition,
              footprintRotation
            )
          )
        );
      }
    }
    return primitives;
  }
  transformFootprintPrimitive(primitive, footprintPosition, footprintRotation) {
    if (primitive.type === "arc") {
      return {
        type: "arc",
        start: this.transformFootprintPoint(
          primitive.start,
          footprintPosition,
          footprintRotation
        ),
        mid: this.transformFootprintPoint(
          primitive.mid,
          footprintPosition,
          footprintRotation
        ),
        end: this.transformFootprintPoint(
          primitive.end,
          footprintPosition,
          footprintRotation
        )
      };
    }
    if (primitive.type === "circle") {
      return {
        type: "circle",
        center: this.transformFootprintPoint(
          primitive.center,
          footprintPosition,
          footprintRotation
        ),
        start: this.transformFootprintPoint(
          primitive.start,
          footprintPosition,
          footprintRotation
        ),
        end: this.transformFootprintPoint(
          primitive.end,
          footprintPosition,
          footprintRotation
        )
      };
    }
    if (primitive.type === "curve") {
      return {
        type: "curve",
        start: this.transformFootprintPoint(
          primitive.start,
          footprintPosition,
          footprintRotation
        ),
        control1: this.transformFootprintPoint(
          primitive.control1,
          footprintPosition,
          footprintRotation
        ),
        control2: this.transformFootprintPoint(
          primitive.control2,
          footprintPosition,
          footprintRotation
        ),
        end: this.transformFootprintPoint(
          primitive.end,
          footprintPosition,
          footprintRotation
        )
      };
    }
    return {
      type: "line",
      start: this.transformFootprintPoint(
        primitive.start,
        footprintPosition,
        footprintRotation
      ),
      end: this.transformFootprintPoint(
        primitive.end,
        footprintPosition,
        footprintRotation
      )
    };
  }
  transformFootprintPoint(point, footprintPosition, footprintRotation) {
    const rotated = rotatePoint(point.x, point.y, -footprintRotation);
    return {
      x: footprintPosition.x + rotated.x,
      y: footprintPosition.y + rotated.y
    };
  }
  orderConnectedContours(primitives) {
    const remainingSegments = [...primitives];
    const contours = [];
    while (remainingSegments.length > 0) {
      const orderedSegments = [remainingSegments.shift()];
      while (remainingSegments.length > 0) {
        const lastSegment = orderedSegments[orderedSegments.length - 1];
        const lastEnd = lastSegment.end;
        let foundIndex = remainingSegments.findIndex(
          (seg) => this.pointsEqualKicad(seg.start, lastEnd)
        );
        if (foundIndex !== -1) {
          orderedSegments.push(remainingSegments.splice(foundIndex, 1)[0]);
          continue;
        }
        foundIndex = remainingSegments.findIndex(
          (seg) => this.pointsEqualKicad(seg.end, lastEnd)
        );
        if (foundIndex !== -1) {
          const segment = remainingSegments.splice(foundIndex, 1)[0];
          orderedSegments.push(this.reverseBoardPrimitive(segment));
          continue;
        }
        break;
      }
      contours.push(orderedSegments);
    }
    return contours;
  }
  reverseBoardPrimitive(segment) {
    if (segment.type === "arc") {
      return {
        type: "arc",
        start: segment.end,
        mid: segment.mid,
        end: segment.start
      };
    }
    if (segment.type === "circle") {
      return {
        type: "circle",
        center: segment.center,
        start: segment.end,
        end: segment.start
      };
    }
    if (segment.type === "curve") {
      return {
        type: "curve",
        start: segment.end,
        control1: segment.control2,
        control2: segment.control1,
        end: segment.start
      };
    }
    return {
      type: "line",
      start: segment.end,
      end: segment.start
    };
  }
  getRectEdgeCutPrimitives(rect) {
    const { start, end } = this.getRectStartEnd(rect);
    const topLeft = { x: start.x, y: start.y };
    const topRight = { x: end.x, y: start.y };
    const bottomRight = { x: end.x, y: end.y };
    const bottomLeft = { x: start.x, y: end.y };
    return [
      { type: "line", start: topLeft, end: topRight },
      { type: "line", start: topRight, end: bottomRight },
      { type: "line", start: bottomRight, end: bottomLeft },
      { type: "line", start: bottomLeft, end: topLeft }
    ];
  }
  getRectStartEnd(rect) {
    return {
      start: {
        x: rect.start?.x ?? rect._sxStart?._x ?? 0,
        y: rect.start?.y ?? rect._sxStart?._y ?? 0
      },
      end: {
        x: rect.end?.x ?? rect._sxEnd?._x ?? 0,
        y: rect.end?.y ?? rect._sxEnd?._y ?? 0
      }
    };
  }
  getBoardContourPoints(primitives) {
    if (!this.ctx.k2cMatPcb) return [];
    const points = [];
    for (const segment of primitives) {
      const kicadPoints = this.getPrimitivePoints(segment);
      for (const kicadPoint of kicadPoints) {
        const point = applyToPoint5(this.ctx.k2cMatPcb, kicadPoint);
        const lastPoint = points[points.length - 1];
        if (!lastPoint || !this.pointsEqual(lastPoint, point)) {
          points.push(point);
        }
      }
    }
    return points;
  }
  getPrimitivePoints(segment) {
    if (segment.type === "arc") {
      return approximateArcPoints(segment.start, segment.mid, segment.end, {
        segmentLength: 0.25,
        minSegments: 16
      });
    }
    if (segment.type === "circle") {
      return approximateCirclePoints(segment.center, segment.end, {
        segmentLength: 0.25,
        minSegments: 16
      });
    }
    if (segment.type === "curve") {
      return approximateCubicBezierPoints(
        segment.start,
        segment.control1,
        segment.control2,
        segment.end,
        {
          segmentLength: 0.25,
          minSegments: 16
        }
      );
    }
    return [segment.start, segment.end];
  }
  createEdgeCutCutout(contour) {
    const [circle] = contour.primitives;
    if (circle?.type === "circle" && contour.primitives.length === 1) {
      this.createEdgeCutCircleHole(circle);
      return;
    }
    this.ctx.db.pcb_cutout.insert({
      shape: "polygon",
      points: contour.points
    });
  }
  createEdgeCutCircleHole(circle) {
    if (!this.ctx.k2cMatPcb) return;
    const center = applyToPoint5(this.ctx.k2cMatPcb, circle.center);
    const radius = Math.hypot(
      circle.end.x - circle.center.x,
      circle.end.y - circle.center.y
    );
    this.ctx.db.pcb_hole.insert({
      hole_shape: "circle",
      hole_diameter: radius * 2,
      x: center.x,
      y: center.y
    });
  }
  calculatePolygonArea(points) {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const current = points[i];
      const next = points[(i + 1) % points.length];
      area += current.x * next.y - next.x * current.y;
    }
    return area / 2;
  }
  createGraphicPath(line, renderLayer) {
    if (!this.ctx.k2cMatPcb) return;
    const { start, end } = getLineStartEnd(line);
    const startPos = applyToPoint5(this.ctx.k2cMatPcb, start);
    const endPos = applyToPoint5(this.ctx.k2cMatPcb, end);
    const layer = mapKicadLayerToVisibleLayer(line.layer);
    const strokeWidth = line.width || 0.15;
    this.insertRouteGraphic({
      layer,
      renderLayer,
      pcbComponentId: "",
      route: [startPos, endPos],
      strokeWidth
    });
  }
  createGraphicArc(arc, renderLayer) {
    if (!this.ctx.k2cMatPcb) return;
    const { start, mid, end } = getArcStartMidEnd(arc);
    const route = approximateArcPoints(start, mid, end, {
      segmentLength: 0.1,
      minSegments: 8
    }).map((point) => applyToPoint5(this.ctx.k2cMatPcb, point));
    const layer = mapKicadLayerToVisibleLayer(arc.layer);
    const strokeWidth = arc.stroke?.width ?? arc._sxStroke?._sxWidth?.value ?? arc.width ?? 0.15;
    this.insertRouteGraphic({
      layer,
      renderLayer,
      pcbComponentId: "",
      route,
      strokeWidth
    });
  }
  insertRouteGraphic(options) {
    const { layer, renderLayer, pcbComponentId, route, strokeWidth } = options;
    if (renderLayer.endsWith("_silkscreen")) {
      this.ctx.db.pcb_silkscreen_path.insert({
        pcb_component_id: pcbComponentId,
        layer,
        route,
        stroke_width: strokeWidth
      });
      return;
    }
    if (renderLayer.endsWith("_fabrication_note")) {
      this.ctx.db.pcb_fabrication_note_path.insert({
        pcb_component_id: pcbComponentId,
        layer,
        route,
        stroke_width: strokeWidth
      });
      return;
    }
    this.ctx.db.pcb_courtyard_outline.insert({
      pcb_component_id: pcbComponentId,
      layer,
      outline: route
    });
  }
  processRectangle(rect) {
    if (!this.ctx.k2cMatPcb) return;
    const start = {
      x: rect._sxStart?._x ?? 0,
      y: rect._sxStart?._y ?? 0
    };
    const end = {
      x: rect._sxEnd?._x ?? 0,
      y: rect._sxEnd?._y ?? 0
    };
    const renderLayer = mapKicadLayerToPcbRenderLayer(rect._sxLayer);
    const isFilled = rect._sxFill && (rect._sxFill.isFilled === true || String(rect._sxFill).includes("fill yes"));
    const isCopperLayer = renderLayer?.endsWith("_copper");
    const centerKicad = {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2
    };
    const widthKicad = Math.abs(end.x - start.x);
    const heightKicad = Math.abs(end.y - start.y);
    const centerCJ = applyToPoint5(this.ctx.k2cMatPcb, centerKicad);
    if (isFilled && isCopperLayer) {
      const layer2 = mapKicadLayerToLayerRef(rect._sxLayer);
      this.ctx.db.pcb_smtpad.insert({
        pcb_component_id: "",
        // Not attached to a specific component
        x: centerCJ.x,
        y: centerCJ.y,
        width: widthKicad,
        height: heightKicad,
        layer: layer2,
        shape: "rect",
        port_hints: []
      });
      if (this.ctx.stats) {
        this.ctx.stats.pads = (this.ctx.stats.pads || 0) + 1;
      }
      return;
    }
    const layer = mapKicadLayerToVisibleLayer(rect._sxLayer);
    const strokeWidth = rect.stroke?.width ?? rect._sxStroke?._sxWidth?.value ?? rect.width ?? 0.15;
    if (renderLayer?.endsWith("_fabrication_note")) {
      this.ctx.db.pcb_fabrication_note_rect.insert({
        pcb_component_id: "",
        center: centerCJ,
        width: widthKicad,
        height: heightKicad,
        layer,
        stroke_width: strokeWidth,
        is_filled: isFilled,
        has_stroke: true
      });
      return;
    }
    if (renderLayer?.endsWith("_courtyard")) {
      this.ctx.db.pcb_courtyard_rect.insert({
        pcb_component_id: "",
        center: centerCJ,
        width: widthKicad,
        height: heightKicad,
        layer
      });
    }
  }
  createGraphicText(text, renderLayer) {
    if (!this.ctx.k2cMatPcb) return;
    const at = text.at || text._sxPosition;
    const pos = applyToPoint5(this.ctx.k2cMatPcb, {
      x: at?.x ?? 0,
      y: at?.y ?? 0
    });
    const rotation = convertKiCadAngleToCircuitJsonCcwRotation2(at?.angle);
    const layer = mapKicadLayerToVisibleLayer(text.layer);
    const kicadFontSize = text._sxEffects?._sxFont?._sxSize?._height || text.effects?.font?.size?.y || 1;
    const fontSize = kicadFontSize * KICAD_TEXT_HEIGHT_TO_CIRCUIT_JSON_FONT_SIZE2;
    const textValue = text.text || text._text || "";
    const justify = text._sxEffects?._sxJustify || text.effects?.justify;
    const anchorAlignment = mapKicadJustifyToAnchorAlignment(justify);
    const isKnockout = extractKicadLayerNames(text.layer).includes("knockout");
    if (renderLayer.endsWith("_silkscreen")) {
      const silkscreenText = {
        pcb_component_id: "",
        text: textValue,
        anchor_position: pos,
        anchor_alignment: anchorAlignment,
        layer,
        font_size: fontSize,
        font: "tscircuit2024",
        ccw_rotation: rotation || void 0
      };
      if (isKnockout) {
        silkscreenText.is_knockout = true;
      }
      this.ctx.db.pcb_silkscreen_text.insert(silkscreenText);
      return;
    }
    if (renderLayer.endsWith("_fabrication_note")) {
      const fabricationNoteText = {
        pcb_component_id: "",
        type: "pcb_fabrication_note_text",
        pcb_fabrication_note_text_id: "",
        text: textValue,
        anchor_position: pos,
        anchor_alignment: anchorAlignment,
        layer,
        font_size: fontSize,
        font: "tscircuit2024",
        ccw_rotation: rotation || void 0
      };
      this.ctx.db.pcb_fabrication_note_text.insert(fabricationNoteText);
      return;
    }
    if (renderLayer.endsWith("_copper")) {
      const copperText = {
        pcb_component_id: "",
        text: textValue,
        anchor_position: pos,
        anchor_alignment: anchorAlignment,
        layer,
        font_size: fontSize,
        font: "tscircuit2024",
        ccw_rotation: rotation || void 0
      };
      this.ctx.db.pcb_copper_text.insert(copperText);
    }
  }
  pointsEqual(p1, p2) {
    return Math.abs(p1.x - p2.x) < EDGE_CUT_POINT_EPSILON && Math.abs(p1.y - p2.y) < EDGE_CUT_POINT_EPSILON;
  }
  pointsEqualKicad(p1, p2) {
    return Math.abs(p1.x - p2.x) < EDGE_CUT_POINT_EPSILON && Math.abs(p1.y - p2.y) < EDGE_CUT_POINT_EPSILON;
  }
  calculateWidth(points) {
    if (points.length === 0) return 0;
    const xs = points.map((p) => p.x);
    return Math.max(...xs) - Math.min(...xs);
  }
  calculateHeight(points) {
    if (points.length === 0) return 0;
    const ys = points.map((p) => p.y);
    return Math.max(...ys) - Math.min(...ys);
  }
  processPolygon(poly) {
    if (!this.ctx.k2cMatPcb) return;
    const renderLayer = mapKicadLayerToPcbRenderLayer(poly._sxLayer);
    const isFilled = poly._sxFill?.filled === true;
    const isCopperLayer = renderLayer?.endsWith("_copper");
    if (!isFilled && !renderLayer?.endsWith("_courtyard")) {
      return;
    }
    const ptsData = poly._sxPts?.points || [];
    const points = [];
    for (const pt of ptsData) {
      if (pt.token === "xy") {
        points.push({ x: pt.x, y: pt.y });
      } else if (pt.token === "arc") {
        const arcPoints = approximateArcPoints(
          { x: pt._sxStart?._x, y: pt._sxStart?._y },
          { x: pt._sxMid?._x, y: pt._sxMid?._y },
          { x: pt._sxEnd?._x, y: pt._sxEnd?._y }
        );
        points.push(...arcPoints);
      }
    }
    if (points.length < 3) {
      return;
    }
    const transformedPoints = points.map(
      (pt) => applyToPoint5(this.ctx.k2cMatPcb, pt)
    );
    if (isFilled && isCopperLayer) {
      const layer = mapKicadLayerToLayerRef(poly._sxLayer);
      this.ctx.db.pcb_smtpad.insert({
        pcb_component_id: "",
        // Not attached to a specific component
        shape: "polygon",
        points: transformedPoints,
        layer,
        port_hints: []
      });
      if (this.ctx.stats) {
        this.ctx.stats.pads = (this.ctx.stats.pads || 0) + 1;
      }
      return;
    }
    if (renderLayer?.endsWith("_courtyard")) {
      const layer = mapKicadLayerToVisibleLayer(poly._sxLayer);
      this.ctx.db.pcb_courtyard_outline.insert({
        pcb_component_id: "",
        layer,
        outline: transformedPoints
      });
    }
  }
};

// lib/stages/pcb/CollectNetsStage.ts
function sanitizeCircuitJsonNetName(rawName, fallbackName) {
  const baseName = rawName?.trim() || fallbackName;
  const sanitized = baseName.replace(/\+/g, "_P").replace(/-/g, "_").replace(/[^A-Za-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  const name = sanitized || fallbackName;
  return /^\d/.test(name) ? `net_${name}` : name;
}
var CollectNetsStage = class extends ConverterStage {
  step() {
    if (!this.ctx.kicadPcb || !this.ctx.netNumToName) {
      this.finished = true;
      return false;
    }
    const nets = this.ctx.kicadPcb.nets || [];
    const netArray = Array.isArray(nets) ? nets : [nets];
    const usedNetNames = /* @__PURE__ */ new Set();
    for (const net of netArray) {
      const netNum = net._id ?? net.number ?? net.ordinal ?? 0;
      const rawNetName = net._name ?? net.name;
      const sanitizedNetName = sanitizeCircuitJsonNetName(
        rawNetName,
        `Net_${netNum}`
      );
      const netName = usedNetNames.has(sanitizedNetName) ? `${sanitizedNetName}_${netNum}` : sanitizedNetName;
      usedNetNames.add(netName);
      this.ctx.netNumToName.set(netNum, netName);
    }
    if (!this.ctx.netNumToName.has(0)) {
      this.ctx.netNumToName.set(0, "");
    }
    this.finished = true;
    return false;
  }
};

// lib/stages/pcb/CollectSourceTracesStage.ts
var CollectSourceTracesStage = class extends ConverterStage {
  processedNets = /* @__PURE__ */ new Set();
  step() {
    if (!this.ctx.kicadPcb || !this.ctx.netNumToName) {
      this.finished = true;
      return false;
    }
    const netToPads = /* @__PURE__ */ new Map();
    const footprints = this.ctx.kicadPcb.footprints || [];
    const footprintArray = Array.isArray(footprints) ? footprints : [footprints];
    for (const footprint of footprintArray) {
      this.processFootprintPads(footprint, netToPads);
    }
    this.collectNetsFromCopper(netToPads);
    for (const [netNum, pads] of netToPads.entries()) {
      if (this.processedNets.has(netNum)) {
        continue;
      }
      this.ctx.netNumToSourcePortIds?.set(
        netNum,
        pads.map((p) => p.sourcePortId)
      );
      this.createSourceNet(netNum);
      this.processedNets.add(netNum);
    }
    this.finished = true;
    return false;
  }
  collectNetsFromCopper(netToPads) {
    if (!this.ctx.kicadPcb) return;
    const segments = this.ctx.kicadPcb.segments || [];
    const segmentArray = Array.isArray(segments) ? segments : [segments];
    for (const segment of segmentArray) {
      const netNum = this.getSegmentNet(segment);
      if (!netNum) continue;
      if (!netToPads.has(netNum)) {
        netToPads.set(netNum, []);
      }
    }
    const arcArray = getTopLevelCopperArcs(this.ctx.kicadPcb);
    for (const arc of arcArray) {
      const netNum = this.getSegmentNet(arc);
      if (!netNum) continue;
      if (!netToPads.has(netNum)) {
        netToPads.set(netNum, []);
      }
    }
  }
  getSegmentNet(segment) {
    const net = segment?.net;
    if (!net) return null;
    if (typeof net === "number") return net;
    if (typeof net === "object") {
      return net._id ?? net.number ?? net.ordinal ?? null;
    }
    return null;
  }
  processFootprintPads(footprint, netToPads) {
    const footprintUuid = footprint.uuid?.value || footprint.tstamp?.value;
    if (!footprintUuid) return;
    const componentId = this.ctx.footprintUuidToComponentId?.get(footprintUuid);
    if (!componentId) return;
    const pads = footprint.fpPads || [];
    const padArray = Array.isArray(pads) ? pads : [pads];
    for (const pad of padArray) {
      const padNumber = pad.number?.toString();
      if (!padNumber) continue;
      const netNum = this.getPadNet(pad);
      if (netNum === null || netNum === void 0 || netNum === 0) {
        continue;
      }
      const sourcePortId = this.getOrCreateSourcePort(
        componentId,
        padNumber,
        footprint
      );
      if (!netToPads.has(netNum)) {
        netToPads.set(netNum, []);
      }
      netToPads.get(netNum).push({
        componentId,
        padNumber,
        sourcePortId
      });
    }
  }
  getPadNet(pad) {
    const net = pad._sxNet || pad.net;
    if (!net) return null;
    if (typeof net === "number") return net;
    if (typeof net === "object") {
      return net._id ?? net.number ?? net.ordinal ?? null;
    }
    return null;
  }
  getOrCreateSourcePort(componentId, padNumber, footprint) {
    const sourcePortId = `${componentId}_port_${padNumber}`;
    const existingPort = this.ctx.db.source_port.list().find((sp) => sp.source_port_id === sourcePortId);
    if (!existingPort) {
      const footprintUuid = footprint.uuid?.value || footprint.tstamp?.value;
      const sourceComponentId = footprintUuid && this.ctx.footprintUuidToSourceComponentId ? this.ctx.footprintUuidToSourceComponentId.get(footprintUuid) : void 0;
      this.ctx.db.source_port.insert({
        source_port_id: sourcePortId,
        source_component_id: sourceComponentId || componentId,
        name: this.getSourcePortName(padNumber),
        pin_number: this.getSourcePortPinNumber(padNumber)
      });
    }
    return sourcePortId;
  }
  getSourcePortName(padNumber) {
    if (/^\d+$/.test(padNumber)) {
      return `pin${Number(padNumber)}`;
    }
    return padNumber;
  }
  getSourcePortPinNumber(padNumber) {
    if (/^\d+$/.test(padNumber)) {
      return Number(padNumber);
    }
    return padNumber;
  }
  createSourceNet(netNum) {
    const netName = this.ctx.netNumToName?.get(netNum) || `Net-${netNum}`;
    const sourceNet = this.ctx.db.source_net.insert({
      name: netName,
      member_source_group_ids: []
    });
    this.ctx.netNumToSourceNetId?.set(netNum, sourceNet.source_net_id);
    if (this.ctx.stats) {
      this.ctx.stats.traces = (this.ctx.stats.traces || 0) + 1;
    }
  }
};

// lib/stages/pcb/CollectTracesStage.ts
import { applyToPoint as applyToPoint6 } from "transformation-matrix";
var CollectTracesStage = class extends ConverterStage {
  PORT_MATCH_TOLERANCE = 1e-3;
  POINT_KEY_PRECISION = 1e6;
  sourceTraceIdByNetTraceKey = /* @__PURE__ */ new Map();
  step() {
    if (!this.ctx.kicadPcb || !this.ctx.k2cMatPcb || !this.ctx.netNumToName || !this.ctx.netNumToSourceNetId) {
      this.finished = true;
      return false;
    }
    const segments = this.ctx.kicadPcb.segments || [];
    const segmentArray = Array.isArray(segments) ? segments : [segments];
    const arcArray = getTopLevelCopperArcs(this.ctx.kicadPcb);
    const primitives = [];
    for (const segment of segmentArray) {
      const primitive = this.getTracePrimitiveFromSegment(segment);
      if (primitive) primitives.push(primitive);
    }
    for (const arc of arcArray) {
      const primitive = this.getTracePrimitiveFromArc(arc);
      if (primitive) primitives.push(primitive);
    }
    const vias = this.ctx.kicadPcb.vias || [];
    const viaArray = Array.isArray(vias) ? vias : [vias];
    for (const via of viaArray) {
      const primitive = this.getTracePrimitiveFromVia(via);
      if (primitive) primitives.push(primitive);
    }
    this.annotatePrimitivesWithConnectedSourcePorts(primitives);
    this.createTracesFromPrimitives(primitives);
    this.finished = true;
    return false;
  }
  getTracePrimitiveFromSegment(segment) {
    if (!this.ctx.k2cMatPcb) return void 0;
    const start = segment.start || { x: 0, y: 0 };
    const end = segment.end || { x: 0, y: 0 };
    const width = segment.width || 0.2;
    const layer = segment.layer;
    const layerNames = getLayerNames(layer);
    const layerStr = layerNames.join(" ");
    const mappedLayer = mapKicadLayerToLayerRef(layerStr);
    const netNum = this.getSegmentNet(segment);
    const startPoint = { x: start.x, y: start.y };
    const endPoint = { x: end.x, y: end.y };
    if (this.pointsMatch(startPoint, endPoint)) {
      return void 0;
    }
    return {
      primitiveType: "wire",
      start: startPoint,
      end: endPoint,
      points: [startPoint, endPoint],
      width,
      layer: mappedLayer,
      netNum
    };
  }
  getTracePrimitiveFromArc(arc) {
    if (!this.ctx.k2cMatPcb) return void 0;
    const { start, mid, end } = getArcStartMidEnd(arc);
    const width = arc.width ?? arc._sxWidth?.value ?? 0.2;
    const layerStr = getLayerNames(arc.layer).join(" ");
    const mappedLayer = mapKicadLayerToLayerRef(layerStr);
    const netNum = this.getSegmentNet(arc);
    const points = approximateArcPoints(start, mid, end, {
      segmentLength: Math.max(width, 0.1),
      minSegments: 8
    });
    const startPoint = points[0];
    const endPoint = points[points.length - 1];
    if (!startPoint || !endPoint || this.pointsMatch(startPoint, endPoint)) {
      return void 0;
    }
    return {
      primitiveType: "wire",
      start: startPoint,
      end: endPoint,
      points,
      width,
      layer: mappedLayer,
      netNum
    };
  }
  getTracePrimitiveFromVia(via) {
    const netNum = this.getSegmentNet(via);
    if (netNum === null) return void 0;
    const at = via.at || { x: 0, y: 0 };
    const point = { x: at.x, y: at.y };
    const viaLayers = via.layers ? getCopperSpanLayerRefsFromLayers(via.layers, this.ctx.kicadPcb) : [];
    const layers = viaLayers.length > 0 ? viaLayers : getPcbCopperLayerRefs(this.ctx.kicadPcb);
    const fromLayer = layers[0];
    const toLayer = layers[layers.length - 1];
    if (!fromLayer || !toLayer || fromLayer === toLayer) return void 0;
    return {
      primitiveType: "via",
      start: point,
      end: point,
      points: [point],
      fromLayer,
      toLayer,
      outerDiameter: via.size || 0.8,
      holeDiameter: via.drill || 0.4,
      netNum
    };
  }
  createTracesFromPrimitives(primitives) {
    const groupedPrimitives = /* @__PURE__ */ new Map();
    for (const primitive of primitives) {
      const key = this.getPrimitiveGroupKey(primitive);
      const group = groupedPrimitives.get(key) ?? [];
      group.push(primitive);
      groupedPrimitives.set(key, group);
    }
    for (const group of groupedPrimitives.values()) {
      this.createTracesFromPrimitiveGroup(group);
    }
  }
  createTracesFromPrimitiveGroup(primitives) {
    const graph = this.createTraceGraph(primitives);
    const visitedEdgeIds = /* @__PURE__ */ new Set();
    const isTerminal = (nodeKey) => this.isTerminalNode(nodeKey, graph);
    for (const nodeKey of graph.adjacency.keys()) {
      if (!isTerminal(nodeKey)) continue;
      for (const edgeId of graph.adjacency.get(nodeKey) ?? []) {
        if (visitedEdgeIds.has(edgeId)) continue;
        const path = this.walkTracePath(nodeKey, edgeId, graph, visitedEdgeIds);
        this.insertTracePath(path);
      }
    }
    for (const edge of graph.edges) {
      if (visitedEdgeIds.has(edge.id)) continue;
      const path = this.walkTracePath(
        edge.startKey,
        edge.id,
        graph,
        visitedEdgeIds
      );
      this.insertTracePath(path);
    }
  }
  createTraceGraph(primitives) {
    const edges = [];
    const adjacency = /* @__PURE__ */ new Map();
    for (const primitive of primitives) {
      const id = edges.length;
      const startLayer = primitive.primitiveType === "via" ? primitive.fromLayer : primitive.layer;
      const endLayer = primitive.primitiveType === "via" ? primitive.toLayer : primitive.layer;
      const startKey = this.getTraceGraphNodeKey(primitive.start, startLayer);
      const endKey = this.getTraceGraphNodeKey(primitive.end, endLayer);
      const edge = { ...primitive, id, startKey, endKey };
      edges.push(edge);
      for (const nodeKey of [startKey, endKey]) {
        const edgeIds = adjacency.get(nodeKey) ?? [];
        edgeIds.push(id);
        adjacency.set(nodeKey, edgeIds);
      }
    }
    return { edges, adjacency };
  }
  walkTracePath(startNodeKey, firstEdgeId, graph, visitedEdgeIds) {
    const path = [];
    let currentNodeKey = startNodeKey;
    let edgeId = firstEdgeId;
    while (!visitedEdgeIds.has(edgeId)) {
      const edge = graph.edges[edgeId];
      if (!edge) break;
      const reversed = edge.endKey === currentNodeKey;
      path.push({ edge, reversed });
      visitedEdgeIds.add(edgeId);
      currentNodeKey = reversed ? edge.startKey : edge.endKey;
      if (this.isTerminalNode(currentNodeKey, graph)) break;
      const nextEdgeId = (graph.adjacency.get(currentNodeKey) ?? []).find(
        (candidateEdgeId) => candidateEdgeId !== edgeId && !visitedEdgeIds.has(candidateEdgeId)
      );
      if (nextEdgeId === void 0) break;
      edgeId = nextEdgeId;
    }
    return path;
  }
  insertTracePath(path) {
    if (!this.ctx.k2cMatPcb || !this.ctx.netNumToSourceNetId) return;
    if (path.length === 0) return;
    const routePoints = this.getPathRoutePoints(path);
    if (routePoints.length < 2) return;
    const firstNode = this.getTraceGraphNodeFromKey(
      this.getOrientedTraceEdgeStartKey(path[0])
    );
    const lastNode = this.getTraceGraphNodeFromKey(
      this.getOrientedTraceEdgeEndKey(path[path.length - 1])
    );
    const netNum = path[0].edge.netNum;
    const sourceNetId = netNum !== null ? this.ctx.netNumToSourceNetId.get(netNum) ?? void 0 : void 0;
    const startPoint = applyToPoint6(this.ctx.k2cMatPcb, firstNode.point);
    const lastPoint = applyToPoint6(this.ctx.k2cMatPcb, lastNode.point);
    const startPcbPortId = this.findPortAtPosition(startPoint, firstNode.layer);
    const endPcbPortId = this.findPortAtPosition(lastPoint, lastNode.layer);
    const connectedSourcePortIds = this.getConnectedSourcePortIds([
      startPcbPortId,
      endPcbPortId
    ]);
    const traceConnectedSourcePortIds = this.getTraceConnectedSourcePortIds(path);
    const inferredSourcePortIds = this.getSourcePortIdsForTrace({
      netNum,
      connectedSourcePortIds,
      traceConnectedSourcePortIds
    });
    const sourceTraceId = sourceNetId ? this.createSourceTraceForPath({
      sourceNetId,
      connectedSourcePortIds: inferredSourcePortIds,
      netNum
    }) : void 0;
    const firstWireIndex = routePoints.findIndex(
      (point) => point.routeType === "wire"
    );
    const lastWireIndex = routePoints.findLastIndex(
      (point) => point.routeType === "wire"
    );
    if (firstWireIndex === -1) return;
    const route = routePoints.map((point, index) => {
      if (point.routeType === "via") {
        return {
          route_type: "via",
          x: point.x,
          y: point.y,
          from_layer: point.fromLayer,
          to_layer: point.toLayer,
          ...point.outerDiameter ? { outer_diameter: point.outerDiameter } : {},
          ...point.holeDiameter ? { hole_diameter: point.holeDiameter } : {}
        };
      }
      return {
        route_type: "wire",
        x: point.x,
        y: point.y,
        width: point.width,
        layer: point.layer,
        ...index === firstWireIndex && startPcbPortId ? { start_pcb_port_id: startPcbPortId } : {},
        ...index === lastWireIndex && endPcbPortId ? { end_pcb_port_id: endPcbPortId } : {}
      };
    });
    this.ctx.db.pcb_trace.insert({
      route,
      source_trace_id: sourceTraceId,
      pcb_port_id: void 0
    });
    if (this.ctx.stats) {
      this.ctx.stats.traces = (this.ctx.stats.traces || 0) + 1;
    }
  }
  getPathRoutePoints(path) {
    const routePoints = [];
    let lastRawPoint;
    let lastWireLayer;
    for (const { edge, reversed } of path) {
      if (edge.primitiveType === "via") {
        const point = edge.start;
        const transformedPoint = applyToPoint6(this.ctx.k2cMatPcb, point);
        routePoints.push({
          routeType: "via",
          x: transformedPoint.x,
          y: transformedPoint.y,
          fromLayer: reversed ? edge.toLayer : edge.fromLayer,
          toLayer: reversed ? edge.fromLayer : edge.toLayer,
          outerDiameter: edge.outerDiameter,
          holeDiameter: edge.holeDiameter
        });
        continue;
      }
      const edgePoints = reversed ? [...edge.points].reverse() : edge.points;
      const layer = edge.layer;
      const width = edge.width;
      for (const point of edgePoints) {
        if (lastRawPoint && lastWireLayer === layer && this.pointsMatch(lastRawPoint, point)) {
          continue;
        }
        const transformedPoint = applyToPoint6(this.ctx.k2cMatPcb, point);
        routePoints.push({
          routeType: "wire",
          x: transformedPoint.x,
          y: transformedPoint.y,
          width,
          layer
        });
        lastRawPoint = point;
        lastWireLayer = layer;
      }
    }
    return routePoints;
  }
  isTerminalNode(nodeKey, graph) {
    const edgeIds = graph.adjacency.get(nodeKey) ?? [];
    if (edgeIds.length !== 2) return true;
    const { point, layer } = this.getTraceGraphNodeFromKey(nodeKey);
    const transformedPoint = applyToPoint6(this.ctx.k2cMatPcb, point);
    if (this.findPortAtPosition(transformedPoint, layer)) return true;
    return false;
  }
  getPrimitiveGroupKey(primitive) {
    return `${primitive.netNum ?? "no-net"}`;
  }
  getPointKey(point) {
    const x = Math.round(point.x * this.POINT_KEY_PRECISION);
    const y = Math.round(point.y * this.POINT_KEY_PRECISION);
    return `${x},${y}`;
  }
  getPointFromKey(pointKey) {
    const [x, y] = pointKey.split(",").map(Number);
    return {
      x: (x ?? 0) / this.POINT_KEY_PRECISION,
      y: (y ?? 0) / this.POINT_KEY_PRECISION
    };
  }
  getTraceGraphNodeKey(point, layer) {
    return `${layer}:${this.getPointKey(point)}`;
  }
  getTraceGraphNodeFromKey(nodeKey) {
    const [layer, ...pointKeyParts] = nodeKey.split(":");
    return {
      layer,
      point: this.getPointFromKey(pointKeyParts.join(":"))
    };
  }
  getOrientedTraceEdgeStartKey({ edge, reversed }) {
    return reversed ? edge.endKey : edge.startKey;
  }
  getOrientedTraceEdgeEndKey({ edge, reversed }) {
    return reversed ? edge.startKey : edge.endKey;
  }
  pointsMatch(a, b) {
    return this.getPointKey(a) === this.getPointKey(b);
  }
  getPcbTraceNodeKey({
    netNum,
    layer,
    point
  }) {
    return `${netNum ?? "no-net"}:${layer}:${this.getPointKey(point)}`;
  }
  annotatePrimitivesWithConnectedSourcePorts(primitives) {
    if (!this.ctx.k2cMatPcb || primitives.length === 0) return;
    const nodes = /* @__PURE__ */ new Map();
    const adjacency = /* @__PURE__ */ new Map();
    const ensureNode = (netNum, layer, point) => {
      const key = this.getPcbTraceNodeKey({ netNum, layer, point });
      if (!nodes.has(key)) {
        nodes.set(key, { key, point, layer, netNum });
      }
      if (!adjacency.has(key)) {
        adjacency.set(key, /* @__PURE__ */ new Set());
      }
      return key;
    };
    const connectNodes = (a, b) => {
      adjacency.get(a)?.add(b);
      adjacency.get(b)?.add(a);
    };
    for (const primitive of primitives) {
      if (primitive.primitiveType !== "wire") continue;
      const startKey = ensureNode(
        primitive.netNum,
        primitive.layer,
        primitive.start
      );
      const endKey = ensureNode(
        primitive.netNum,
        primitive.layer,
        primitive.end
      );
      connectNodes(startKey, endKey);
    }
    const vias = this.ctx.kicadPcb?.vias || [];
    const viaArray = Array.isArray(vias) ? vias : [vias];
    for (const via of viaArray) {
      const netNum = this.getSegmentNet(via);
      if (netNum === null) continue;
      const at = via.at || { x: 0, y: 0 };
      const point = { x: at.x, y: at.y };
      const viaLayers = via.layers ? getCopperSpanLayerRefsFromLayers(via.layers, this.ctx.kicadPcb) : [];
      const layers = viaLayers.length > 0 ? viaLayers : getPcbCopperLayerRefs(this.ctx.kicadPcb);
      const viaNodeKeys = layers.map(
        (layer) => ensureNode(netNum, layer, point)
      );
      for (let i = 1; i < viaNodeKeys.length; i++) {
        connectNodes(viaNodeKeys[0], viaNodeKeys[i]);
      }
    }
    const connectedSourcePortIdsByNodeKey = /* @__PURE__ */ new Map();
    const visited = /* @__PURE__ */ new Set();
    for (const startNodeKey of nodes.keys()) {
      if (visited.has(startNodeKey)) continue;
      const traceNodeKeys = [];
      const traceConnectedSourcePortIds = /* @__PURE__ */ new Set();
      const stack = [startNodeKey];
      visited.add(startNodeKey);
      while (stack.length > 0) {
        const nodeKey = stack.pop();
        const node = nodes.get(nodeKey);
        if (!node) continue;
        traceNodeKeys.push(nodeKey);
        const transformedPoint = applyToPoint6(this.ctx.k2cMatPcb, node.point);
        const pcbPortId = this.findPortAtPosition(transformedPoint, node.layer);
        const sourcePortId = this.getConnectedSourcePortIds([pcbPortId])[0];
        if (sourcePortId) {
          traceConnectedSourcePortIds.add(sourcePortId);
        }
        for (const neighborNodeKey of adjacency.get(nodeKey) ?? []) {
          if (visited.has(neighborNodeKey)) continue;
          visited.add(neighborNodeKey);
          stack.push(neighborNodeKey);
        }
      }
      const sourcePortIds = [...traceConnectedSourcePortIds];
      for (const nodeKey of traceNodeKeys) {
        connectedSourcePortIdsByNodeKey.set(nodeKey, sourcePortIds);
      }
    }
    for (const primitive of primitives) {
      if (primitive.primitiveType !== "wire") continue;
      const nodeKey = this.getPcbTraceNodeKey({
        netNum: primitive.netNum,
        layer: primitive.layer,
        point: primitive.start
      });
      primitive.connectedSourcePortIds = connectedSourcePortIdsByNodeKey.get(nodeKey) ?? [];
    }
  }
  getSegmentNet(segment) {
    const net = segment?.net;
    if (!net) return null;
    if (typeof net === "number") return net;
    if (typeof net === "object") {
      return net._id ?? net.number ?? net.ordinal ?? null;
    }
    return null;
  }
  findPortAtPosition(point, layer) {
    const ports = this.ctx.db.pcb_port.list();
    for (const port of ports) {
      const layers = port.layers;
      if (layers?.length && !layers.includes(layer)) {
        continue;
      }
      if (Math.abs((port.x ?? 0) - point.x) <= this.PORT_MATCH_TOLERANCE && Math.abs((port.y ?? 0) - point.y) <= this.PORT_MATCH_TOLERANCE) {
        return port.pcb_port_id;
      }
    }
    return void 0;
  }
  getConnectedSourcePortIds(pcbPortIds) {
    const connectedSourcePortIds = [];
    for (const pcbPortId of pcbPortIds) {
      if (!pcbPortId) continue;
      const pcbPort = this.ctx.db.pcb_port.get(pcbPortId);
      const sourcePortId = pcbPort?.source_port_id;
      if (!sourcePortId || connectedSourcePortIds.includes(sourcePortId)) {
        continue;
      }
      connectedSourcePortIds.push(sourcePortId);
    }
    return connectedSourcePortIds;
  }
  getSourcePortIdsForTrace({
    netNum,
    connectedSourcePortIds,
    traceConnectedSourcePortIds
  }) {
    if (netNum === null || connectedSourcePortIds.length >= 2) {
      return connectedSourcePortIds;
    }
    const inferredSourcePortIds = [...connectedSourcePortIds];
    for (const sourcePortId of traceConnectedSourcePortIds) {
      if (!inferredSourcePortIds.includes(sourcePortId)) {
        inferredSourcePortIds.push(sourcePortId);
      }
      if (inferredSourcePortIds.length >= 2) {
        return inferredSourcePortIds.slice(0, 2);
      }
    }
    const netSourcePortIds = this.ctx.netNumToSourcePortIds?.get(netNum) ?? [];
    for (const sourcePortId of netSourcePortIds) {
      if (!inferredSourcePortIds.includes(sourcePortId)) {
        inferredSourcePortIds.push(sourcePortId);
      }
      if (inferredSourcePortIds.length >= 2) {
        return inferredSourcePortIds.slice(0, 2);
      }
    }
    return inferredSourcePortIds;
  }
  getTraceConnectedSourcePortIds(path) {
    const sourcePortIds = [];
    for (const { edge } of path) {
      for (const sourcePortId of edge.connectedSourcePortIds ?? []) {
        if (!sourcePortIds.includes(sourcePortId)) {
          sourcePortIds.push(sourcePortId);
        }
      }
    }
    return sourcePortIds;
  }
  createSourceTraceForPath({
    sourceNetId,
    connectedSourcePortIds,
    netNum
  }) {
    const netName = netNum !== null ? this.ctx.netNumToName?.get(netNum) ?? `Net-${netNum}` : void 0;
    const netTraceKey = this.getNetTraceKey({
      sourceNetId,
      connectedSourcePortIds
    });
    const existingSourceTraceId = this.sourceTraceIdByNetTraceKey.get(netTraceKey);
    if (existingSourceTraceId) {
      return existingSourceTraceId;
    }
    const sourceTrace = this.ctx.db.source_trace.insert({
      connected_source_port_ids: connectedSourcePortIds,
      connected_source_net_ids: [sourceNetId],
      display_name: netName
    });
    this.sourceTraceIdByNetTraceKey.set(
      netTraceKey,
      sourceTrace.source_trace_id
    );
    return sourceTrace.source_trace_id;
  }
  getNetTraceKey({
    sourceNetId,
    connectedSourcePortIds
  }) {
    return `${sourceNetId}:${[...connectedSourcePortIds].sort().join("|")}`;
  }
};

// lib/stages/pcb/CollectViasStage.ts
import { applyToPoint as applyToPoint7 } from "transformation-matrix";
var CollectViasStage = class extends ConverterStage {
  POINT_KEY_PRECISION = 1e6;
  step() {
    if (!this.ctx.kicadPcb || !this.ctx.k2cMatPcb || !this.ctx.netNumToName) {
      this.finished = true;
      return false;
    }
    const vias = this.ctx.kicadPcb.vias || [];
    const viaArray = Array.isArray(vias) ? vias : [vias];
    for (const via of viaArray) {
      this.processVia(via);
    }
    this.finished = true;
    return false;
  }
  processVia(via) {
    if (!this.ctx.k2cMatPcb || !this.ctx.netNumToName) return;
    const at = via.at || { x: 0, y: 0 };
    const pos = applyToPoint7(this.ctx.k2cMatPcb, { x: at.x, y: at.y });
    const size = via.size || 0.8;
    const drill = via.drill || 0.4;
    const mappedLayers = via.layers ? getCopperSpanLayerRefsFromLayers(via.layers, this.ctx.kicadPcb) : [];
    const layers = mappedLayers.length > 0 ? mappedLayers : getPcbCopperLayerRefs(this.ctx.kicadPcb);
    if (this.hasMatchingTraceRouteVia(pos, layers)) {
      if (this.ctx.stats) {
        this.ctx.stats.vias = (this.ctx.stats.vias || 0) + 1;
      }
      return;
    }
    this.ctx.db.pcb_via.insert({
      x: pos.x,
      y: pos.y,
      outer_diameter: size,
      hole_diameter: drill,
      layers
    });
    if (this.ctx.stats) {
      this.ctx.stats.vias = (this.ctx.stats.vias || 0) + 1;
    }
  }
  hasMatchingTraceRouteVia(point, layers) {
    const pointKey = this.getPointKey(point);
    const layerSet = new Set(layers);
    const pcbTraces = this.ctx.db.pcb_trace.list();
    return pcbTraces.some(
      (trace) => (trace.route ?? []).some(
        (routePoint) => routePoint.route_type === "via" && this.getPointKey(routePoint) === pointKey && layerSet.has(routePoint.from_layer) && layerSet.has(routePoint.to_layer)
      )
    );
  }
  getPointKey(point) {
    const x = Math.round(point.x * this.POINT_KEY_PRECISION);
    const y = Math.round(point.y * this.POINT_KEY_PRECISION);
    return `${x},${y}`;
  }
};

// lib/stages/pcb/CollectZonesStage.ts
import {
  PtsArc,
  Xy
} from "kicadts";
import { applyToPoint as applyToPoint8 } from "transformation-matrix";
var CollectZonesStage = class extends ConverterStage {
  step() {
    if (!this.ctx.kicadPcb || !this.ctx.k2cMatPcb || !this.ctx.netNumToName) {
      this.finished = true;
      return false;
    }
    const zones = this.ctx.kicadPcb.zones || [];
    const zoneArray = Array.isArray(zones) ? zones : [zones];
    for (const zone of zoneArray) {
      if (this.isZoneFilled(zone)) {
        this.createCopperPourFromZone(zone);
      }
    }
    this.finished = true;
    return false;
  }
  isZoneFilled(zone) {
    return zone.fill?.filled === true || zone.filledPolygons.length > 0;
  }
  createCopperPourFromZone(zone) {
    if (!this.ctx.k2cMatPcb || !this.ctx.netNumToName) return;
    const polygonRecords = this.getZonePolygonRecords(zone);
    if (polygonRecords.length === 0) {
      if (this.ctx.warnings) {
        this.ctx.warnings.push(
          `Zone on layer ${this.getZoneLayerLabel(zone)} has no valid polygon points`
        );
      }
      return;
    }
    const netNum = typeof zone.net === "number" ? zone.net : 0;
    const netName = this.ctx.netNumToName.get(netNum) || zone.netName || "";
    const sourceNetId = this.ctx.netNumToSourceNetId?.get(netNum);
    for (const polygonRecord of polygonRecords) {
      const transformedPoints = polygonRecord.points.map(
        (point) => applyToPoint8(this.ctx.k2cMatPcb, { x: point.x, y: point.y })
      );
      const bounds = this.getBoundsFromPoints(transformedPoints);
      if (!bounds) continue;
      this.ctx.db.pcb_copper_pour.insert({
        layer: polygonRecord.layer,
        net_name: netName,
        source_net_id: sourceNetId,
        shape: "rect",
        center: bounds.center,
        width: bounds.width,
        height: bounds.height,
        covered_with_solder_mask: true
      });
      if (this.ctx.stats) {
        this.ctx.stats.copper_pours = (this.ctx.stats.copper_pours || 0) + 1;
      }
    }
  }
  getBoundsFromPoints(points) {
    if (points.length === 0) return null;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
      return null;
    }
    return {
      center: {
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2
      },
      width: maxX - minX,
      height: maxY - minY
    };
  }
  getZonePolygonRecords(zone) {
    const filledPolygons = Array.isArray(zone.filledPolygons) ? zone.filledPolygons : [];
    const polygons = Array.isArray(zone.polygons) ? zone.polygons : [];
    const zonePolygonRecords = polygons.flatMap(
      (polygon) => this.createZonePolygonRecordsFromShape(polygon, this.getZoneLayers(zone))
    );
    if (zonePolygonRecords.length > 0) {
      return zonePolygonRecords;
    }
    return filledPolygons.flatMap(
      (filledPolygon) => this.createZonePolygonRecordsFromShape(
        filledPolygon,
        this.getPolygonLayers(zone, filledPolygon)
      )
    );
  }
  createZonePolygonRecordsFromShape(polygon, layers) {
    const points = this.extractPointsFromPts(polygon.pts?.points ?? []);
    if (points.length < 3 || layers.length === 0) {
      return [];
    }
    return layers.map((layer) => ({
      layer,
      points
    }));
  }
  getPolygonLayers(zone, polygon) {
    if (polygon.layer) {
      return [mapKicadLayerToLayerRef(polygon.layer)];
    }
    return this.getZoneLayers(zone);
  }
  getZoneLayers(zone) {
    if (zone.layer) {
      return [mapKicadLayerToLayerRef(zone.layer)];
    }
    if (zone.layers) {
      const layers = getLayerRefsFromLayers(zone.layers, this.ctx.kicadPcb);
      if (layers.length > 0) {
        return layers;
      }
    }
    return [];
  }
  getZoneLayerLabel(zone) {
    return [...zone.layer?.names ?? [], ...zone.layers?.names ?? []].join(" ") || "unknown";
  }
  extractPointsFromPts(pointsData) {
    const points = [];
    for (const point of pointsData) {
      if (point instanceof Xy) {
        points.push({ x: point.x, y: point.y });
        continue;
      }
      if (point instanceof PtsArc && point.start && point.mid && point.end) {
        points.push(...approximateArcPoints(point.start, point.mid, point.end));
      }
    }
    return points;
  }
};

// lib/stages/pcb/InitializePcbContextStage.ts
import { compose, scale, translate } from "transformation-matrix";
var InitializePcbContextStage = class extends ConverterStage {
  step() {
    if (!this.ctx.kicadPcb) {
      this.finished = true;
      return false;
    }
    const center = this.calculateBoardCenter();
    this.ctx.k2cMatPcb = compose(scale(1, -1), translate(-center.x, -center.y));
    this.ctx.netNumToName = /* @__PURE__ */ new Map();
    this.ctx.netNumToSourceNetId = /* @__PURE__ */ new Map();
    this.ctx.netNumToSourcePortIds = /* @__PURE__ */ new Map();
    this.ctx.footprintUuidToComponentId = /* @__PURE__ */ new Map();
    this.ctx.footprintUuidToSourceComponentId = /* @__PURE__ */ new Map();
    this.finished = true;
    return false;
  }
  calculateBoardCenter() {
    if (!this.ctx.kicadPcb) {
      return { x: 0, y: 0 };
    }
    const lines = this.ctx.kicadPcb.graphicLines || [];
    const lineArray = Array.isArray(lines) ? lines : [lines];
    const arcArray = getGraphicArcs(this.ctx.kicadPcb);
    const circleArray = getGraphicCircles(this.ctx.kicadPcb);
    const curveArray = getGraphicCurves(this.ctx.kicadPcb);
    const rectArray = this.getGraphicRects();
    const xs = [];
    const ys = [];
    for (const line of lineArray) {
      const layerStr = getGraphicLayerNames(line).join(" ");
      if (!layerStr.includes("Edge.Cuts")) continue;
      const { start, end } = getLineStartEnd(line);
      xs.push(start.x, end.x);
      ys.push(start.y, end.y);
    }
    for (const arc of arcArray) {
      const layerStr = getGraphicLayerNames(arc).join(" ");
      if (!layerStr.includes("Edge.Cuts")) continue;
      const { start, mid, end } = getArcStartMidEnd(arc);
      for (const point of approximateArcPoints(start, mid, end, {
        segmentLength: 0.25,
        minSegments: 16
      })) {
        xs.push(point.x);
        ys.push(point.y);
      }
    }
    for (const circle of circleArray) {
      const layerStr = getGraphicLayerNames(circle).join(" ");
      if (!layerStr.includes("Edge.Cuts")) continue;
      const { center, end } = getCircleCenterEnd(circle);
      for (const point of approximateCirclePoints(center, end, {
        segmentLength: 0.25,
        minSegments: 16
      })) {
        xs.push(point.x);
        ys.push(point.y);
      }
    }
    for (const curve of curveArray) {
      const layerStr = getGraphicLayerNames(curve).join(" ");
      if (!layerStr.includes("Edge.Cuts")) continue;
      const points = getCurvePoints(curve);
      if (!points) continue;
      for (const point of approximateCubicBezierPoints(
        points.start,
        points.control1,
        points.control2,
        points.end,
        {
          segmentLength: 0.25,
          minSegments: 16
        }
      )) {
        xs.push(point.x);
        ys.push(point.y);
      }
    }
    for (const rect of rectArray) {
      const layerStr = getGraphicLayerNames(rect).join(" ");
      if (!layerStr.includes("Edge.Cuts")) continue;
      const { start, end } = this.getRectStartEnd(rect);
      xs.push(start.x, end.x);
      ys.push(start.y, end.y);
    }
    if (xs.length === 0 || ys.length === 0) {
      return { x: 0, y: 0 };
    }
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2
    };
  }
  getGraphicRects() {
    const rects = this.ctx.kicadPcb?.graphicRects || [];
    return Array.isArray(rects) ? rects : [rects];
  }
  getRectStartEnd(rect) {
    return {
      start: {
        x: rect.start?.x ?? rect._sxStart?._x ?? 0,
        y: rect.start?.y ?? rect._sxStart?._y ?? 0
      },
      end: {
        x: rect.end?.x ?? rect._sxEnd?._x ?? 0,
        y: rect.end?.y ?? rect._sxEnd?._y ?? 0
      }
    };
  }
};

// lib/stages/schematic/CollectLibrarySymbolsStage.ts
import { applyToPoint as applyToPoint9 } from "transformation-matrix";

// lib/stages/schematic/utils/rotationToDirection.ts
function rotationToDirection(rotation) {
  const normalized = (rotation % 360 + 360) % 360;
  if (normalized >= 315 || normalized < 45) return "up";
  if (normalized >= 45 && normalized < 135) return "right";
  if (normalized >= 135 && normalized < 225) return "down";
  return "left";
}

// lib/stages/schematic/utils/inferSymbolName.ts
function inferSymbolName({
  libId,
  reference,
  rotation
}) {
  const lower = libId.toLowerCase();
  const direction = rotationToDirection(rotation);
  if (lower.includes(":r_") || lower.includes(":r") && reference.startsWith("R")) {
    return `boxresistor_${direction}`;
  }
  if (lower.includes(":c_") || lower.includes(":c") && reference.startsWith("C")) {
    if (lower.includes("polarized") || lower.includes("_pol")) {
      return `capacitor_${direction}`;
    }
    return `capacitor_${direction}`;
  }
  if (lower.includes(":l_") || lower.includes(":l") && reference.startsWith("L")) {
    return `inductor_${direction}`;
  }
  if (lower.includes(":d_") || lower.includes("diode") || reference.startsWith("D")) {
    if (lower.includes("led")) {
      return `led_${direction}`;
    }
    if (lower.includes("schottky")) {
      return `schottky_diode_${direction}`;
    }
    if (lower.includes("zener")) {
      return `zener_diode_${direction}`;
    }
    return `diode_${direction}`;
  }
  if (lower.includes(":q_") || reference.startsWith("Q")) {
    if (lower.includes("npn")) {
      return `npn_bipolar_transistor_${direction}`;
    }
    if (lower.includes("pnp")) {
      return `pnp_bipolar_transistor_${direction}`;
    }
    if (lower.includes("_n_") || lower.includes("nmos")) {
      return `n_channel_mosfet_transistor_${direction}`;
    }
    if (lower.includes("_p_") || lower.includes("pmos")) {
      return `p_channel_mosfet_transistor_${direction}`;
    }
    return `npn_bipolar_transistor_${direction}`;
  }
  if (lower.includes("gnd") || lower.includes("ground")) {
    return void 0;
  }
  if (lower.includes("vcc") || lower.includes("vdd") || lower.includes("power")) {
    return void 0;
  }
}

// lib/stages/schematic/CollectLibrarySymbolsStage.ts
var CollectLibrarySymbolsStage = class extends ConverterStage {
  processedSymbols = /* @__PURE__ */ new Set();
  step() {
    if (!this.ctx.kicadSch || !this.ctx.k2cMatSch) {
      this.finished = true;
      return false;
    }
    const symbols = this.ctx.kicadSch.symbols || [];
    for (const symbol of symbols) {
      const uuid = symbol.uuid;
      if (!uuid || this.processedSymbols.has(uuid)) continue;
      this.processSymbol(symbol);
      this.processedSymbols.add(uuid);
    }
    this.finished = true;
    return false;
  }
  processSymbol(symbol) {
    if (!this.ctx.k2cMatSch) return;
    const reference = this.getProperty(symbol, "Reference") || "U?";
    const value = this.getProperty(symbol, "Value") || "";
    const libId = symbol.libraryId || "";
    const at = symbol.at;
    const kicadPos = { x: at?.x ?? 0, y: at?.y ?? 0 };
    const cjPos = applyToPoint9(this.ctx.k2cMatSch, kicadPos);
    const rotation = at?.angle ?? 0;
    const ftype = this.inferFtype(libId, reference);
    const sourceComponentId = `${libId}_source`;
    const existingSource = this.ctx.db.source_component.list().find((sc) => sc.source_component_id === sourceComponentId);
    if (!existingSource) {
      this.ctx.db.source_component.insert({
        name: libId || reference,
        ftype,
        // TODO: Fix ftype - should be mapped to valid CJ simple component types
        manufacturer_part_number: value || void 0
      });
    }
    const uuid = symbol.uuid;
    if (!uuid) return;
    const symbolName = inferSymbolName({ libId, reference, rotation });
    const inserted = this.ctx.db.schematic_component.insert({
      source_component_id: sourceComponentId,
      center: { x: cjPos.x, y: cjPos.y },
      size: this.estimateSize(symbol),
      ...symbolName ? { symbol_name: symbolName } : {}
    });
    const componentId = inserted.schematic_component_id;
    this.ctx.symbolUuidToComponentId?.set(uuid, componentId);
    this.createPorts(symbol, componentId);
    if (this.ctx.stats) {
      this.ctx.stats.components = (this.ctx.stats.components || 0) + 1;
    }
  }
  getProperty(symbol, propName) {
    const props = symbol.properties || [];
    const prop = props.find((p) => p.key === propName);
    return prop?.value;
  }
  inferFtype(libId, reference) {
    const lower = libId.toLowerCase();
    if (lower.includes(":r_") || reference.startsWith("R"))
      return "simple_resistor";
    if (lower.includes(":c_") || reference.startsWith("C"))
      return "simple_capacitor";
    if (lower.includes(":l_") || reference.startsWith("L"))
      return "simple_inductor";
    if (lower.includes(":d_") || reference.startsWith("D"))
      return "simple_diode";
    if (lower.includes(":led") || reference.startsWith("LED"))
      return "simple_led";
    if (lower.includes(":q_") || reference.startsWith("Q"))
      return "simple_transistor";
    return "simple_chip";
  }
  estimateSize(symbol) {
    return { width: 1, height: 1 };
  }
  createPorts(symbol, componentId) {
    const libId = symbol.libraryId;
    const libSymbol = this.ctx.kicadSch?.libSymbols?.symbols?.find(
      (ls) => ls.libraryId === libId
    );
    if (!libSymbol) return;
    const allPins = [];
    if (libSymbol.pins && Array.isArray(libSymbol.pins) && libSymbol.pins.length > 0) {
      allPins.push(...libSymbol.pins);
    } else if (libSymbol.pins && !Array.isArray(libSymbol.pins)) {
      allPins.push(libSymbol.pins);
    }
    if (libSymbol.subSymbols && Array.isArray(libSymbol.subSymbols)) {
      for (const subSymbol of libSymbol.subSymbols) {
        if (subSymbol.pins && Array.isArray(subSymbol.pins) && subSymbol.pins.length > 0) {
          allPins.push(...subSymbol.pins);
        } else if (subSymbol.pins && !Array.isArray(subSymbol.pins)) {
          allPins.push(subSymbol.pins);
        }
      }
    }
    if (allPins.length === 0) return;
    const componentRotation = symbol.at?.angle ?? 0;
    for (const pin of allPins) {
      const pinAt = pin._sxAt;
      if (!pinAt) continue;
      const rotRad = componentRotation * Math.PI / 180;
      const cosR = Math.cos(rotRad);
      const sinR = Math.sin(rotRad);
      const rotatedPinPos = {
        x: pinAt.x * cosR - pinAt.y * sinR,
        y: pinAt.x * sinR + pinAt.y * cosR
      };
      const scaleFactor = Math.abs(this.ctx.k2cMatSch?.a || 1 / 15);
      const relativePos = {
        x: rotatedPinPos.x * scaleFactor,
        y: -rotatedPinPos.y * scaleFactor
        // Flip Y axis
      };
      this.ctx.db.schematic_port.insert({
        schematic_component_id: componentId,
        center: relativePos,
        facing_direction: this.inferPinDirection(pin, componentRotation),
        pin_number: pin._sxNumber?.value ?? pin.pinNumber ?? void 0
      });
    }
  }
  inferPinDirection(pin, componentRotation) {
    const pinAngle = pin.at?.angle ?? 0;
    const totalAngle = pinAngle + componentRotation;
    return rotationToDirection(totalAngle);
  }
};

// lib/stages/schematic/CollectSchematicTracesStage.ts
import { applyToPoint as applyToPoint10 } from "transformation-matrix";
var CollectSchematicTracesStage = class extends ConverterStage {
  step() {
    if (!this.ctx.kicadSch || !this.ctx.k2cMatSch) {
      this.finished = true;
      return false;
    }
    const wires = this.ctx.kicadSch.wires || [];
    const wireArray = Array.isArray(wires) ? wires : [wires];
    for (const wire of wireArray) {
      this.processWire(wire);
    }
    const junctions = this.ctx.kicadSch.junctions || [];
    const junctionArray = Array.isArray(junctions) ? junctions : [junctions];
    for (const junction of junctionArray) {
      this.processJunction(junction);
    }
    this.finished = true;
    return false;
  }
  processWire(wire) {
    if (!this.ctx.k2cMatSch || !wire.pts) return;
    const pts = Array.isArray(wire.pts.xy) ? wire.pts.xy : [wire.pts.xy];
    if (pts.length < 2) return;
    const edges = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const from = applyToPoint10(this.ctx.k2cMatSch, {
        x: pts[i].x,
        y: pts[i].y
      });
      const to = applyToPoint10(this.ctx.k2cMatSch, {
        x: pts[i + 1].x,
        y: pts[i + 1].y
      });
      edges.push({ from, to });
    }
    this.ctx.db.schematic_trace.insert({
      edges
    });
    if (this.ctx.stats) {
      this.ctx.stats.traces = (this.ctx.stats.traces || 0) + 1;
    }
  }
  processJunction(junction) {
    if (!this.ctx.k2cMatSch || !junction.at) return;
    const pos = applyToPoint10(this.ctx.k2cMatSch, {
      x: junction.at.x,
      y: junction.at.y
    });
    this.ctx.db.schematic_trace.insert({
      edges: [],
      junctions: [pos]
    });
  }
};

// lib/stages/schematic/InitializeSchematicContextStage.ts
import { compose as compose2, scale as scale2, translate as translate2 } from "transformation-matrix";
var InitializeSchematicContextStage = class extends ConverterStage {
  step() {
    if (!this.ctx.kicadSch) {
      this.finished = true;
      return false;
    }
    const KICAD_CENTER_X = 105;
    const KICAD_CENTER_Y = 148.5;
    const kicadCenterX = KICAD_CENTER_X;
    const kicadCenterY = KICAD_CENTER_Y;
    const cjCenterX = 0;
    const cjCenterY = 0;
    this.ctx.k2cMatSch = compose2(
      translate2(cjCenterX, cjCenterY),
      scale2(1 / 15, -1 / 15),
      translate2(-kicadCenterX, -kicadCenterY)
    );
    this.ctx.symbolUuidToComponentId = /* @__PURE__ */ new Map();
    this.ctx.warnings = this.ctx.warnings || [];
    this.ctx.stats = this.ctx.stats || {};
    this.finished = true;
    return false;
  }
};

// lib/stages/symbol-library/CollectSymbolLibrarySymbolsStage.ts
var MAX_KICAD_SYMBOL_UNIT_TO_CJ = 1;
var PREVIEW_COLUMNS = 6;
var PREVIEW_CELL_WIDTH = 10;
var PREVIEW_CELL_HEIGHT = 9.5;
var PREVIEW_CELL_FILL_RATIO = 0.95;
var DEFAULT_STROKE_COLOR = "rgb(132, 0, 0)";
var DEFAULT_FILL_COLOR = "rgb(255, 255, 194)";
var CollectSymbolLibrarySymbolsStage = class extends ConverterStage {
  processedSymbols = /* @__PURE__ */ new Set();
  previewIndex = 0;
  step() {
    if (!this.ctx.kicadSymbolLib) {
      this.finished = true;
      return false;
    }
    const symbols = [...this.ctx.kicadSymbolLib.symbols].sort((a, b) => {
      const aFileName = this.getKicadSymbolExportFileName(a);
      const bFileName = this.getKicadSymbolExportFileName(b);
      return aFileName < bFileName ? -1 : aFileName > bFileName ? 1 : 0;
    });
    for (const symbol of symbols) {
      if (!symbol.name || this.processedSymbols.has(symbol.name)) continue;
      this.processSymbol(symbol);
      this.processedSymbols.add(symbol.name);
    }
    this.finished = true;
    return false;
  }
  processSymbol(symbol) {
    const sourceComponentData = this.createSourceComponentData(symbol);
    const sourceComponent = this.ctx.db.source_component.insert(sourceComponentData);
    const pins = this.collectPins(symbol);
    const seenPinNumbers = /* @__PURE__ */ new Set();
    let unnamedPinIndex = 0;
    const sourcePortIdByPinNumber = /* @__PURE__ */ new Map();
    for (const pin of pins) {
      const pinNumber = pin.number || `unnamed_${unnamedPinIndex++}`;
      if (seenPinNumbers.has(pinNumber)) continue;
      seenPinNumbers.add(pinNumber);
      const sourcePortData = {
        source_component_id: sourceComponent.source_component_id,
        name: this.getPortName(pin, pinNumber),
        ...this.getSourcePortPinMetadata(pinNumber)
      };
      const sourcePort = this.ctx.db.source_port.insert(sourcePortData);
      sourcePortIdByPinNumber.set(pinNumber, sourcePort.source_port_id);
    }
    this.createSchematicPreview({
      symbol,
      pins,
      sourceComponentId: sourceComponent.source_component_id,
      sourcePortIdByPinNumber
    });
    if (this.ctx.stats) {
      this.ctx.stats.components = (this.ctx.stats.components || 0) + 1;
      this.ctx.stats.pads = (this.ctx.stats.pads || 0) + seenPinNumbers.size;
    }
  }
  getKicadSymbolExportFileName(symbol) {
    return `${symbol.name}_unit1.svg`;
  }
  collectPins(symbol) {
    return [
      ...symbol.pins,
      ...symbol.subSymbols.flatMap((subSymbol) => this.collectPins(subSymbol))
    ];
  }
  collectPolylines(symbol) {
    return [
      ...symbol.polylines,
      ...symbol.subSymbols.flatMap(
        (subSymbol) => this.collectPolylines(subSymbol)
      )
    ];
  }
  collectRectangles(symbol) {
    return [
      ...symbol.rectangles,
      ...symbol.subSymbols.flatMap(
        (subSymbol) => this.collectRectangles(subSymbol)
      )
    ];
  }
  collectCircles(symbol) {
    return [
      ...symbol.circles,
      ...symbol.subSymbols.flatMap(
        (subSymbol) => this.collectCircles(subSymbol)
      )
    ];
  }
  collectArcs(symbol) {
    return [
      ...symbol.arcs,
      ...symbol.subSymbols.flatMap((subSymbol) => this.collectArcs(subSymbol))
    ];
  }
  collectTexts(symbol) {
    return [
      ...symbol.texts,
      ...symbol.subSymbols.flatMap((subSymbol) => this.collectTexts(subSymbol))
    ];
  }
  createSchematicPreview(params) {
    const { symbol, pins, sourceComponentId, sourcePortIdByPinNumber } = params;
    const bounds = this.getPinBounds(pins);
    const scale3 = this.getPreviewScale(bounds);
    const size = {
      width: Math.max(1, bounds.width * scale3),
      height: Math.max(1, bounds.height * scale3)
    };
    const center = this.getPreviewCenter();
    const schematicComponentData = {
      source_component_id: sourceComponentId,
      center,
      size,
      is_box_with_pins: false
    };
    const schematicComponent = this.ctx.db.schematic_component.insert(
      schematicComponentData
    );
    for (const pin of pins) {
      if (!pin.at) continue;
      const pinNumber = pin.number || "";
      const sourcePortId = sourcePortIdByPinNumber.get(pinNumber);
      if (!sourcePortId) continue;
      const schematicPortData = {
        schematic_component_id: schematicComponent.schematic_component_id,
        source_port_id: sourcePortId,
        center: this.toSchematicPoint(pin.at, center, scale3),
        facing_direction: rotationToDirection(pin.at.angle),
        ...this.getSchematicPortPinMetadata(pinNumber)
      };
      this.ctx.db.schematic_port.insert(schematicPortData);
    }
    this.createPinLinePrimitives({
      pins,
      schematicComponentId: schematicComponent.schematic_component_id,
      origin: center,
      scale: scale3
    });
    this.createSchematicPrimitives({
      symbol,
      schematicComponentId: schematicComponent.schematic_component_id,
      origin: center,
      scale: scale3
    });
  }
  getPreviewCenter() {
    const index = this.previewIndex++;
    const column = index % PREVIEW_COLUMNS;
    const row = Math.floor(index / PREVIEW_COLUMNS);
    return {
      x: (column - (PREVIEW_COLUMNS - 1) / 2) * PREVIEW_CELL_WIDTH,
      y: -row * PREVIEW_CELL_HEIGHT
    };
  }
  getPinBounds(pins) {
    const pinsWithPositions = pins.filter((pin) => pin.at);
    if (pinsWithPositions.length === 0) {
      return { width: 15, height: 15 };
    }
    const xs = pinsWithPositions.map((pin) => pin.at.x);
    const ys = pinsWithPositions.map((pin) => pin.at.y);
    return {
      width: Math.max(...xs) - Math.min(...xs) + 7.5,
      height: Math.max(...ys) - Math.min(...ys) + 7.5
    };
  }
  getPreviewScale(bounds) {
    const scaleX = PREVIEW_CELL_WIDTH * PREVIEW_CELL_FILL_RATIO / Math.max(1, bounds.width);
    const scaleY = PREVIEW_CELL_HEIGHT * PREVIEW_CELL_FILL_RATIO / Math.max(1, bounds.height);
    return Math.min(MAX_KICAD_SYMBOL_UNIT_TO_CJ, scaleX, scaleY);
  }
  createSchematicPrimitives(params) {
    const { symbol, schematicComponentId, origin, scale: scale3 } = params;
    for (const polyline of this.collectPolylines(symbol)) {
      this.createPolylinePrimitives(
        polyline,
        schematicComponentId,
        origin,
        scale3
      );
    }
    for (const rectangle of this.collectRectangles(symbol)) {
      const start = this.toSchematicPoint(rectangle.start, origin, scale3);
      const end = this.toSchematicPoint(rectangle.end, origin, scale3);
      const rectData = {
        schematic_component_id: schematicComponentId,
        center: {
          x: (start.x + end.x) / 2,
          y: (start.y + end.y) / 2
        },
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
        rotation: 0,
        stroke_width: this.toStrokeWidth(rectangle.stroke?.width, scale3),
        color: DEFAULT_STROKE_COLOR,
        is_filled: this.isFilled(rectangle.fill?.type),
        fill_color: this.getFillColor(rectangle.fill?.type),
        is_dashed: rectangle.stroke?.type === "dash"
      };
      this.ctx.db.schematic_rect.insert(rectData);
    }
    for (const circle of this.collectCircles(symbol)) {
      const circleData = {
        schematic_component_id: schematicComponentId,
        center: this.toSchematicPoint(circle.center, origin, scale3),
        radius: circle.radius * scale3,
        stroke_width: this.toStrokeWidth(circle.stroke?.width, scale3),
        color: DEFAULT_STROKE_COLOR,
        is_filled: this.isFilled(circle.fill?.type),
        fill_color: this.getFillColor(circle.fill?.type),
        is_dashed: circle.stroke?.type === "dash"
      };
      this.ctx.db.schematic_circle.insert(circleData);
    }
    for (const arc of this.collectArcs(symbol)) {
      const arcGeometry = this.getArcGeometry(arc, origin, scale3);
      if (!arcGeometry) {
        const pathData = {
          schematic_component_id: schematicComponentId,
          points: [arc.start, arc.mid, arc.end].map(
            (point) => this.toSchematicPoint(point, origin, scale3)
          ),
          stroke_width: this.toStrokeWidth(arc.stroke?.width, scale3),
          stroke_color: DEFAULT_STROKE_COLOR
        };
        this.ctx.db.schematic_path.insert(pathData);
        continue;
      }
      const arcData = {
        schematic_component_id: schematicComponentId,
        ...arcGeometry,
        stroke_width: this.toStrokeWidth(arc.stroke?.width, scale3),
        color: DEFAULT_STROKE_COLOR,
        is_dashed: arc.stroke?.type === "dash"
      };
      this.ctx.db.schematic_arc.insert(arcData);
    }
    for (const text of this.collectTexts(symbol)) {
      if (!text.text) continue;
      const textData = {
        schematic_component_id: schematicComponentId,
        text: text.text,
        font_size: Math.max(0.1, (text.fontSize ?? 1.27) * scale3),
        position: this.toSchematicPoint(text.at, origin, scale3),
        rotation: -text.at.angle,
        anchor: "center",
        color: DEFAULT_STROKE_COLOR
      };
      this.ctx.db.schematic_text.insert(textData);
    }
  }
  createPinLinePrimitives(params) {
    const { pins, schematicComponentId, origin, scale: scale3 } = params;
    for (const pin of pins) {
      if (!pin.at || pin.hidden || !pin.length) continue;
      if (pin.graphicStyle && pin.graphicStyle !== "line") continue;
      const start = this.toSchematicPoint(pin.at, origin, scale3);
      const end = this.toSchematicPoint(
        this.getPinLineEndPoint(pin),
        origin,
        scale3
      );
      if (start.x === end.x && start.y === end.y) continue;
      const lineData = {
        schematic_component_id: schematicComponentId,
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
        stroke_width: this.toStrokeWidth(void 0, scale3),
        color: DEFAULT_STROKE_COLOR,
        is_dashed: false
      };
      this.ctx.db.schematic_line.insert(lineData);
    }
  }
  getPinLineEndPoint(pin) {
    const angleRadians = (pin.at?.angle ?? 0) * Math.PI / 180;
    const length = pin.length ?? 0;
    return {
      x: (pin.at?.x ?? 0) + Math.cos(angleRadians) * length,
      y: (pin.at?.y ?? 0) + Math.sin(angleRadians) * length
    };
  }
  createPolylinePrimitives(polyline, schematicComponentId, origin, scale3) {
    if (polyline.points.length < 2) return;
    if (this.isFilled(polyline.fill?.type) && polyline.points.length >= 3) {
      const pathData = {
        schematic_component_id: schematicComponentId,
        points: polyline.points.map(
          (point) => this.toSchematicPoint(point, origin, scale3)
        ),
        stroke_width: this.toStrokeWidth(polyline.stroke?.width, scale3),
        stroke_color: DEFAULT_STROKE_COLOR,
        is_filled: true,
        fill_color: this.getFillColor(polyline.fill?.type)
      };
      this.ctx.db.schematic_path.insert(pathData);
    }
    for (let index = 1; index < polyline.points.length; index++) {
      const start = this.toSchematicPoint(
        polyline.points[index - 1],
        origin,
        scale3
      );
      const end = this.toSchematicPoint(polyline.points[index], origin, scale3);
      const lineData = {
        schematic_component_id: schematicComponentId,
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
        stroke_width: this.toStrokeWidth(polyline.stroke?.width, scale3),
        color: DEFAULT_STROKE_COLOR,
        is_dashed: polyline.stroke?.type === "dash"
      };
      this.ctx.db.schematic_line.insert(lineData);
    }
  }
  toSchematicPoint(point, origin = { x: 0, y: 0 }, scale3 = MAX_KICAD_SYMBOL_UNIT_TO_CJ) {
    return {
      x: origin.x + point.x * scale3,
      y: origin.y + point.y * scale3
    };
  }
  toStrokeWidth(width, scale3) {
    if (!width) return null;
    return Math.max(0.01, width * scale3);
  }
  isFilled(fillType) {
    return fillType !== void 0 && fillType !== "none";
  }
  getFillColor(fillType) {
    if (!this.isFilled(fillType)) return void 0;
    return fillType === "background" ? DEFAULT_FILL_COLOR : DEFAULT_STROKE_COLOR;
  }
  getArcGeometry(arc, origin, scale3) {
    const start = this.toSchematicPoint(arc.start, origin, scale3);
    const mid = this.toSchematicPoint(arc.mid, origin, scale3);
    const end = this.toSchematicPoint(arc.end, origin, scale3);
    const denominator = 2 * (start.x * (mid.y - end.y) + mid.x * (end.y - start.y) + end.x * (start.y - mid.y));
    if (Math.abs(denominator) < 1e-9) return null;
    const startLen = start.x ** 2 + start.y ** 2;
    const midLen = mid.x ** 2 + mid.y ** 2;
    const endLen = end.x ** 2 + end.y ** 2;
    const center = {
      x: (startLen * (mid.y - end.y) + midLen * (end.y - start.y) + endLen * (start.y - mid.y)) / denominator,
      y: (startLen * (end.x - mid.x) + midLen * (start.x - end.x) + endLen * (mid.x - start.x)) / denominator
    };
    const radius = Math.hypot(start.x - center.x, start.y - center.y);
    const startAngleDegrees = this.getAngleDegrees(start, center);
    const endAngleDegrees = this.getAngleDegrees(end, center);
    const cross = (mid.x - start.x) * (end.y - mid.y) - (mid.y - start.y) * (end.x - mid.x);
    return {
      center,
      radius,
      start_angle_degrees: startAngleDegrees,
      end_angle_degrees: endAngleDegrees,
      direction: cross >= 0 ? "counterclockwise" : "clockwise"
    };
  }
  getAngleDegrees(point, center) {
    return Math.atan2(point.y - center.y, point.x - center.x) * 180 / Math.PI;
  }
  getManufacturerPartNumber(symbol) {
    return symbol.properties["Manufacturer Part Number"] || symbol.properties["MPN"] || symbol.properties["P/N"] || symbol.properties.Value || void 0;
  }
  createSourceComponentData(symbol) {
    const base = {
      name: symbol.name,
      manufacturer_part_number: this.getManufacturerPartNumber(symbol)
    };
    const ftype = this.inferFtype(symbol);
    switch (ftype) {
      case "simple_resistor":
        return { ...base, ftype, resistance: 0 };
      case "simple_capacitor":
        return { ...base, ftype, capacitance: 0 };
      case "simple_inductor":
        return { ...base, ftype, inductance: 0 };
      case "simple_transistor":
        return { ...base, ftype, transistor_type: "npn" };
      case "simple_led":
      case "simple_diode":
      case "simple_chip":
        return { ...base, ftype };
    }
  }
  inferFtype(symbol) {
    const name = symbol.name.toLowerCase();
    const reference = symbol.properties.Reference ?? "";
    if (name === "r" || name.startsWith("r_") || reference.startsWith("R")) {
      return "simple_resistor";
    }
    if (name === "c" || name.startsWith("c_") || reference.startsWith("C")) {
      return "simple_capacitor";
    }
    if (name === "l" || name.startsWith("l_") || reference.startsWith("L")) {
      return "simple_inductor";
    }
    if (name.includes("led") || reference.startsWith("LED")) {
      return "simple_led";
    }
    if (name.startsWith("d_") || reference.startsWith("D")) {
      return "simple_diode";
    }
    if (name.startsWith("q_") || reference.startsWith("Q")) {
      return "simple_transistor";
    }
    return "simple_chip";
  }
  getPortName(pin, pinNumber) {
    if (pin.name) return pin.name;
    if (/^\d+$/.test(pinNumber)) return `pin${Number(pinNumber)}`;
    return pinNumber;
  }
  getSourcePortPinMetadata(pinNumber) {
    if (/^\d+$/.test(pinNumber)) {
      return { pin_number: Number(pinNumber) };
    }
    return { port_hints: [pinNumber] };
  }
  getSchematicPortPinMetadata(pinNumber) {
    if (/^\d+$/.test(pinNumber)) {
      return { pin_number: Number(pinNumber) };
    }
    return { display_pin_label: pinNumber };
  }
};

// lib/stages/symbol-library/InitializeSymbolLibraryContextStage.ts
var InitializeSymbolLibraryContextStage = class extends ConverterStage {
  step() {
    if (!this.ctx.kicadSymbolLib) {
      this.finished = true;
      return false;
    }
    this.ctx.warnings = this.ctx.warnings || [];
    this.ctx.stats = this.ctx.stats || {};
    this.finished = true;
    return false;
  }
};

// lib/KicadToCircuitJsonConverter.ts
var KicadToCircuitJsonConverter = class {
  fsMap = {};
  ctx;
  currentStageIndex = 0;
  pipeline;
  get currentStage() {
    return this.pipeline?.[this.currentStageIndex];
  }
  addFile(filePath, content) {
    this.fsMap[filePath] = content;
  }
  _findFileWithExtension(extension) {
    const filesWithExtension = Object.keys(this.fsMap).filter(
      (key) => key.endsWith(extension)
    );
    if (filesWithExtension.length > 1) {
      throw new Error(
        `Expected 0 or 1 file with extension ${extension}, got ${filesWithExtension.length}. Files: ${filesWithExtension.join(", ")}`
      );
    }
    return filesWithExtension[0] ?? null;
  }
  initializePipeline() {
    const pcbFile = this._findFileWithExtension(".kicad_pcb");
    const schFile = this._findFileWithExtension(".kicad_sch");
    const symbolLibFile = this._findFileWithExtension(".kicad_sym");
    this.ctx = {
      db: cju([]),
      kicadPcb: pcbFile ? parseKicadPcb(this.fsMap[pcbFile]) : void 0,
      kicadSch: schFile ? parseKicadSch(this.fsMap[schFile]) : void 0,
      kicadSymbolLib: symbolLibFile ? parseKicadSymbolLib(this.fsMap[symbolLibFile]) : void 0,
      warnings: [],
      stats: {}
    };
    this.pipeline = [];
    if (this.ctx.kicadSymbolLib) {
      this.pipeline.push(
        new InitializeSymbolLibraryContextStage(this.ctx),
        new CollectSymbolLibrarySymbolsStage(this.ctx)
      );
    }
    if (this.ctx.kicadSch) {
      this.pipeline.push(
        new InitializeSchematicContextStage(this.ctx),
        new CollectLibrarySymbolsStage(this.ctx),
        new CollectSchematicTracesStage(this.ctx)
      );
    }
    if (this.ctx.kicadPcb) {
      this.pipeline.push(
        new InitializePcbContextStage(this.ctx),
        new CollectNetsStage(this.ctx),
        new CollectFootprintsStage(this.ctx),
        new CollectSourceTracesStage(this.ctx),
        new CollectTracesStage(this.ctx),
        new CollectViasStage(this.ctx),
        new CollectZonesStage(this.ctx),
        new CollectGraphicsStage(this.ctx)
      );
    }
  }
  step() {
    if (!this.pipeline) {
      this.initializePipeline();
    }
    if (!this.currentStage) {
      return false;
    }
    const hasMoreWork = this.currentStage.step();
    if (!hasMoreWork || this.currentStage.finished) {
      this.currentStageIndex++;
    }
    return this.currentStageIndex < (this.pipeline?.length || 0);
  }
  runUntilFinished() {
    if (!this.pipeline) {
      this.initializePipeline();
    }
    for (const stage of this.pipeline || []) {
      stage.runUntilFinished();
    }
  }
  getOutput() {
    if (!this.ctx) {
      this.initializePipeline();
      this.runUntilFinished();
    }
    return this.ctx.db.toArray();
  }
  getOutputString() {
    return JSON.stringify(this.getOutput(), null, 2);
  }
  getWarnings() {
    return this.ctx?.warnings || [];
  }
  getStats() {
    return this.ctx?.stats || {};
  }
};
export {
  CollectFootprintsStage,
  CollectGraphicsStage,
  CollectLibrarySymbolsStage,
  CollectNetsStage,
  CollectSchematicTracesStage,
  CollectSourceTracesStage,
  CollectSymbolLibrarySymbolsStage,
  CollectTracesStage,
  CollectViasStage,
  CollectZonesStage,
  ConverterStage,
  InitializePcbContextStage,
  InitializeSchematicContextStage,
  InitializeSymbolLibraryContextStage,
  KicadToCircuitJsonConverter
};
