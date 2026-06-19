import { AnyCircuitElement } from 'circuit-json';
import { CircuitJsonUtilObjects } from '@tscircuit/circuit-json-util';
import { KicadPcb, KicadSch } from 'kicadts';
import { Matrix } from 'transformation-matrix';

interface KicadSymbolLibPinAlternate {
    name: string;
    electricalType?: string;
    graphicStyle?: string;
}
interface KicadSymbolLibPin {
    name: string;
    number: string;
    electricalType?: string;
    graphicStyle?: string;
    at?: {
        x: number;
        y: number;
        angle: number;
    };
    length?: number;
    hidden?: boolean;
    alternates?: KicadSymbolLibPinAlternate[];
}
interface KicadSymbolLibPoint {
    x: number;
    y: number;
}
interface KicadSymbolLibStroke {
    width?: number;
    type?: string;
}
interface KicadSymbolLibFill {
    type?: string;
}
interface KicadSymbolLibPolyline {
    points: KicadSymbolLibPoint[];
    stroke?: KicadSymbolLibStroke;
    fill?: KicadSymbolLibFill;
}
interface KicadSymbolLibRectangle {
    start: KicadSymbolLibPoint;
    end: KicadSymbolLibPoint;
    stroke?: KicadSymbolLibStroke;
    fill?: KicadSymbolLibFill;
}
interface KicadSymbolLibCircle {
    center: KicadSymbolLibPoint;
    radius: number;
    stroke?: KicadSymbolLibStroke;
    fill?: KicadSymbolLibFill;
}
interface KicadSymbolLibArc {
    start: KicadSymbolLibPoint;
    mid: KicadSymbolLibPoint;
    end: KicadSymbolLibPoint;
    stroke?: KicadSymbolLibStroke;
}
interface KicadSymbolLibText {
    text: string;
    at: {
        x: number;
        y: number;
        angle: number;
    };
    fontSize?: number;
}
interface KicadSymbolLibSymbol {
    name: string;
    properties: Record<string, string>;
    pins: KicadSymbolLibPin[];
    polylines: KicadSymbolLibPolyline[];
    rectangles: KicadSymbolLibRectangle[];
    circles: KicadSymbolLibCircle[];
    arcs: KicadSymbolLibArc[];
    texts: KicadSymbolLibText[];
    subSymbols: KicadSymbolLibSymbol[];
}
interface KicadSymbolLib {
    version?: string;
    generator?: string;
    generatorVersion?: string;
    symbols: KicadSymbolLibSymbol[];
}
interface ConverterContext {
    db: CircuitJsonUtilObjects;
    kicadPcb?: KicadPcb;
    kicadSch?: KicadSch;
    kicadSymbolLib?: KicadSymbolLib;
    k2cMatSch?: Matrix;
    k2cMatPcb?: Matrix;
    netNumToName?: Map<number, string>;
    netNumToSourceNetId?: Map<number, string>;
    netNumToSourcePortIds?: Map<number, string[]>;
    footprintUuidToComponentId?: Map<string, string>;
    footprintUuidToSourceComponentId?: Map<string, string>;
    symbolUuidToComponentId?: Map<string, string>;
    warnings?: string[];
    stats?: {
        components?: number;
        pads?: number;
        vias?: number;
        traces?: number;
        labels?: number;
        copper_pours?: number;
    };
}
/**
 * Base class for converter stages that process KiCad data into Circuit JSON.
 * Each stage performs a specific transformation step and can run iteratively.
 */
declare abstract class ConverterStage {
    protected ctx: ConverterContext;
    protected MAX_ITERATIONS: number;
    protected iterationCount: number;
    finished: boolean;
    constructor(ctx: ConverterContext);
    /**
     * Perform one step of the conversion process.
     * Returns true if the stage has more work to do, false if finished.
     */
    abstract step(): boolean;
    /**
     * Run this stage until completion or max iterations reached.
     */
    runUntilFinished(): void;
}

declare class KicadToCircuitJsonConverter {
    fsMap: Record<string, string>;
    ctx?: ConverterContext;
    currentStageIndex: number;
    pipeline?: ConverterStage[];
    get currentStage(): ConverterStage | undefined;
    addFile(filePath: string, content: string): void;
    _findFileWithExtension(extension: string): string | null;
    initializePipeline(): void;
    step(): boolean;
    runUntilFinished(): void;
    getOutput(): AnyCircuitElement[];
    getOutputString(): string;
    getWarnings(): string[];
    getStats(): {
        components?: number;
        pads?: number;
        vias?: number;
        traces?: number;
        labels?: number;
        copper_pours?: number;
    };
}

/**
 * InitializeSchematicContextStage sets up the coordinate transformation
 * from KiCad schematic space to Circuit JSON space.
 *
 * KiCad→CJ schematic transform (inverse of CJ→KiCad):
 * - CJ→KiCad used: translate(KICAD_CENTER) ∘ scale(15, -15) ∘ translate(-center)
 * - KiCad→CJ uses: translate(center) ∘ scale(1/15, -1/15) ∘ translate(-KICAD_CENTER)
 */
declare class InitializeSchematicContextStage extends ConverterStage {
    step(): boolean;
}

/**
 * CollectLibrarySymbolsStage extracts KiCad schematic symbols and creates:
 * - source_component entries (with ftype inferred from library id)
 * - schematic_component entries with positions
 * - schematic_port entries for each pin
 */
declare class CollectLibrarySymbolsStage extends ConverterStage {
    private processedSymbols;
    step(): boolean;
    private processSymbol;
    private getProperty;
    private inferFtype;
    private estimateSize;
    private createPorts;
    private inferPinDirection;
}

/**
 * CollectSchematicTracesStage converts KiCad schematic wires and junctions
 * into Circuit JSON schematic_trace elements.
 */
declare class CollectSchematicTracesStage extends ConverterStage {
    step(): boolean;
    private processWire;
    private processJunction;
}

/**
 * InitializePcbContextStage sets up the coordinate transformation
 * from KiCad PCB space to Circuit JSON space.
 *
 * KiCad→CJ PCB transform (inverse of CJ→KiCad):
 * - CJ→KiCad used: translate(100, 100) ∘ scale(1, -1)
 * - KiCad→CJ uses: scale(1, -1) ∘ translate(-100, -100)
 */
declare class InitializePcbContextStage extends ConverterStage {
    step(): boolean;
    private calculateBoardCenter;
    private getGraphicRects;
    private getRectStartEnd;
}

/**
 * CollectNetsStage builds a mapping from KiCad net numbers to meaningful net names.
 * Prefers KiCad's actual net names, falls back to "Net-<n>" for unnamed nets.
 */
declare class CollectNetsStage extends ConverterStage {
    step(): boolean;
}

/**
 * CollectFootprintsStage converts KiCad footprints into Circuit JSON pcb_components,
 * along with their associated pads (SMT, plated holes, NPTH) and silkscreen text.
 */
declare class CollectFootprintsStage extends ConverterStage {
    private processedFootprints;
    step(): boolean;
}

/**
 * CollectTracesStage converts KiCad PCB segments (traces) into Circuit JSON pcb_trace elements.
 * Connected copper primitives are stitched into contiguous pcb_trace routes.
 */
declare class CollectTracesStage extends ConverterStage {
    private readonly PORT_MATCH_TOLERANCE;
    private readonly POINT_KEY_PRECISION;
    private readonly sourceTraceIdByNetTraceKey;
    step(): boolean;
    private getTracePrimitiveFromSegment;
    private getTracePrimitiveFromArc;
    private getTracePrimitiveFromVia;
    private createTracesFromPrimitives;
    private createTracesFromPrimitiveGroup;
    private createTraceGraph;
    private walkTracePath;
    private insertTracePath;
    private getPathRoutePoints;
    private isTerminalNode;
    private getPrimitiveGroupKey;
    private getPointKey;
    private getPointFromKey;
    private getTraceGraphNodeKey;
    private getTraceGraphNodeFromKey;
    private getOrientedTraceEdgeStartKey;
    private getOrientedTraceEdgeEndKey;
    private pointsMatch;
    private getPcbTraceNodeKey;
    private annotatePrimitivesWithConnectedSourcePorts;
    private getSegmentNet;
    private findPortAtPosition;
    private getConnectedSourcePortIds;
    private getSourcePortIdsForTrace;
    private getTraceConnectedSourcePortIds;
    private createSourceTraceForPath;
    private getNetTraceKey;
}

/**
 * CollectViasStage converts KiCad vias into Circuit JSON pcb_via elements.
 */
declare class CollectViasStage extends ConverterStage {
    private readonly POINT_KEY_PRECISION;
    step(): boolean;
    private processVia;
    private hasMatchingTraceRouteVia;
    private getPointKey;
}

/**
 * CollectZonesStage converts KiCad zones with filled copper into Circuit JSON pcb_copper_pour elements.
 * Zones define copper pours/planes that are typically used for ground and power nets.
 */
declare class CollectZonesStage extends ConverterStage {
    step(): boolean;
    private isZoneFilled;
    private createCopperPourFromZone;
    private getZonePolygonRecords;
    private createZonePolygonRecordsFromShape;
    private getPolygonLayers;
    private getZoneLayers;
    private getZoneLayerLabel;
    private extractPointsFromPts;
}

/**
 * CollectGraphicsStage processes KiCad graphics elements:
 * - gr_line on Edge.Cuts → pcb_board.outline
 * - gr_text on silk/fab layers → matching silkscreen/fabrication output
 * - gr_line/gr_arc on silk/fab/courtyard layers → matching PCB output
 * - gr_rect on copper layers (filled) → pcb_smtpad
 * - gr_poly on copper layers (filled) → pcb_smtpad (polygon)
 */
declare class CollectGraphicsStage extends ConverterStage {
    step(): boolean;
    private createBoardOutline;
    private createBoardContours;
    private getFootprintEdgeCutPrimitives;
    private transformFootprintPrimitive;
    private transformFootprintPoint;
    private orderConnectedContours;
    private reverseBoardPrimitive;
    private getRectEdgeCutPrimitives;
    private getRectStartEnd;
    private getBoardContourPoints;
    private getPrimitivePoints;
    private createEdgeCutCutout;
    private createEdgeCutCircleHole;
    private calculatePolygonArea;
    private createGraphicPath;
    private createGraphicArc;
    private insertRouteGraphic;
    private processRectangle;
    private createGraphicText;
    private pointsEqual;
    private pointsEqualKicad;
    private calculateWidth;
    private calculateHeight;
    private processPolygon;
}

/**
 * CollectSourceTracesStage extracts logical nets from KiCad PCB by analyzing net
 * assignments on pads and copper.
 *
 * This stage:
 * 1. Iterates through all footprints and their pads
 * 2. Builds a mapping of nets to connected pads
 * 3. Creates source_port elements for each pad
 * 4. Creates source_net elements for each net. Physical trace collection creates
 *    smaller source_trace elements that point at these source nets.
 */
declare class CollectSourceTracesStage extends ConverterStage {
    private processedNets;
    step(): boolean;
    private collectNetsFromCopper;
    private getSegmentNet;
    private processFootprintPads;
    private getPadNet;
    private getOrCreateSourcePort;
    private getSourcePortName;
    private getSourcePortPinNumber;
    private createSourceNet;
}

/**
 * InitializeSymbolLibraryContextStage prepares shared state for .kicad_sym
 * conversion. Symbol libraries have no schematic placements, so this branch
 * emits source-level Circuit JSON only.
 */
declare class InitializeSymbolLibraryContextStage extends ConverterStage {
    step(): boolean;
}

/**
 * CollectSymbolLibrarySymbolsStage converts KiCad symbol-library definitions
 * into source-level Circuit JSON:
 * - source_component for each top-level library symbol
 * - source_port for each physical pin in the symbol definition
 * - schematic_component and schematic_port preview geometry for snapshots
 */
declare class CollectSymbolLibrarySymbolsStage extends ConverterStage {
    private processedSymbols;
    private previewIndex;
    step(): boolean;
    private processSymbol;
    private getKicadSymbolExportFileName;
    private collectPins;
    private collectPolylines;
    private collectRectangles;
    private collectCircles;
    private collectArcs;
    private collectTexts;
    private createSchematicPreview;
    private getPreviewCenter;
    private getPinBounds;
    private getPreviewScale;
    private createSchematicPrimitives;
    private createPinLinePrimitives;
    private getPinLineEndPoint;
    private createPolylinePrimitives;
    private toSchematicPoint;
    private toStrokeWidth;
    private isFilled;
    private getFillColor;
    private getArcGeometry;
    private getAngleDegrees;
    private getManufacturerPartNumber;
    private createSourceComponentData;
    private inferFtype;
    private getPortName;
    private getSourcePortPinMetadata;
    private getSchematicPortPinMetadata;
}

export { CollectFootprintsStage, CollectGraphicsStage, CollectLibrarySymbolsStage, CollectNetsStage, CollectSchematicTracesStage, CollectSourceTracesStage, CollectSymbolLibrarySymbolsStage, CollectTracesStage, CollectViasStage, CollectZonesStage, type ConverterContext, ConverterStage, InitializePcbContextStage, InitializeSchematicContextStage, InitializeSymbolLibraryContextStage, KicadToCircuitJsonConverter };
