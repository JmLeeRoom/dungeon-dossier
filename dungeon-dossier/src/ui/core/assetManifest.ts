import { z } from 'zod';
import {
  ASSET_DIMENSION_IDS,
  assetDimension,
  type AssetDimensionId,
} from './assetDimensions.ts';
import {
  DEFAULT_TARGET_SCALE,
  HD_HEIGHT,
  HD_WIDTH,
  INTERNAL_HEIGHT,
  INTERNAL_WIDTH,
} from './integerScale.ts';

export const ASSET_MANIFEST_SCHEMA_VERSION = '3.0';
/** Manifests written before arbitrary sizing existed. Read-only; migrated on load. */
export const LEGACY_ASSET_MANIFEST_SCHEMA_VERSION = '2.0';

const FiniteNumber = z.number().finite();
const PositiveScale = FiniteNumber.gt(0).max(64);
/** Explicit on-stage size in the 640x400 grid. Overrides scaleX/scaleY when set. */
const PositiveSize = FiniteNumber.gt(0).max(4096);

/**
 * A workbench placement. Rotation is stored in radians because that is what the
 * renderer consumes; the workbench converts to degrees only for display.
 *
 * `customWidth`/`customHeight` express an absolute placement size and win over
 * `scaleX`/`scaleY`. `preserveAspectRatio` defaults to true so every manifest
 * written before this field existed keeps its exact rendered size.
 */
export const AssetTransformSchema = z
  .strictObject({
    x: FiniteNumber,
    y: FiniteNumber,
    rotation: FiniteNumber,
    scaleX: PositiveScale,
    scaleY: PositiveScale,
    customWidth: PositiveSize.optional(),
    customHeight: PositiveSize.optional(),
    preserveAspectRatio: z.boolean().default(true),
  })
  .refine(
    (transform) =>
      transform.preserveAspectRatio === false ||
      transform.customWidth === undefined ||
      transform.customHeight === undefined,
    {
      message:
        'preserveAspectRatio requires at most one of customWidth/customHeight; set it to false to distort deliberately',
    },
  );
export type AssetTransform = z.infer<typeof AssetTransformSchema>;

export const AssetManifestSlotSchema = z.strictObject({
  dimension: z.enum(ASSET_DIMENSION_IDS),
  image: z.string().trim().min(1).nullable(),
  transform: AssetTransformSchema,
  isLocked: z.boolean(),
});
export type AssetManifestSlot = z.infer<typeof AssetManifestSlotSchema>;

export const AssetManifestSchema = z.strictObject({
  schema_version: z.literal(ASSET_MANIFEST_SCHEMA_VERSION),
  stage: z.strictObject({
    width: z.literal(INTERNAL_WIDTH),
    height: z.literal(INTERNAL_HEIGHT),
    render_width: z.literal(HD_WIDTH),
    render_height: z.literal(HD_HEIGHT),
    render_scale: z.literal(DEFAULT_TARGET_SCALE),
  }),
  slots: z.record(z.string().trim().min(1), AssetManifestSlotSchema),
});
export type AssetManifest = z.infer<typeof AssetManifestSchema>;

export const DEFAULT_ASSET_TRANSFORM: AssetTransform = {
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  preserveAspectRatio: true,
};

export interface ResolvedSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Snaps a placement onto the HD pixel grid. One HD pixel is `1 / renderScale`
 * of a logical unit, so this is the finest step that still lands on a texel
 * boundary and keeps pixel art crisp.
 */
export function snapToRenderGrid(
  size: ResolvedSize,
  renderScale: number = DEFAULT_TARGET_SCALE,
): ResolvedSize {
  const scale = Number.isFinite(renderScale) && renderScale > 0 ? renderScale : 1;
  const step = 1 / scale;
  return {
    width: Math.max(step, Math.round(size.width / step) * step),
    height: Math.max(step, Math.round(size.height / step) * step),
  };
}

/** Reciprocal integer ratios (1, 1/2, 1/3, ...) keep pixel art perfectly sharp. */
// Only repair floating-point noise around an intended reciprocal. A wider
// window changes authored scales such as 3/16 (card hand) and 11/64 (partner)
// into 1/5 and 1/6, moving otherwise exact placements by several pixels.
const RECIPROCAL_SNAP_TOLERANCE = 0.002;

function snapToReciprocalScale(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 1) return ratio;
  const denominator = Math.round(1 / ratio);
  if (denominator < 1) return ratio;
  const candidate = 1 / denominator;
  return Math.abs(candidate - ratio) <= RECIPROCAL_SNAP_TOLERANCE ? candidate : ratio;
}

/**
 * The single size calculator shared by the workbench editor, the workbench
 * renderer, and every in-game sprite. Absent custom fields reproduce the
 * pre-3.0 `source x scale` behaviour exactly.
 */
export function resolveTransformSize(
  transform: AssetTransform,
  dimension: AssetDimensionId,
): ResolvedSize {
  const source = assetDimension(dimension);
  const aspect = source.width / source.height;
  const { customWidth, customHeight, preserveAspectRatio } = transform;

  if (!preserveAspectRatio) {
    return snapToRenderGrid({
      width: customWidth ?? source.width * transform.scaleX,
      height: customHeight ?? source.height * transform.scaleY,
    });
  }
  if (customWidth !== undefined) {
    return snapToRenderGrid({ width: customWidth, height: customWidth / aspect });
  }
  if (customHeight !== undefined) {
    return snapToRenderGrid({ width: customHeight * aspect, height: customHeight });
  }
  return snapToRenderGrid({
    width: source.width * snapToReciprocalScale(transform.scaleX),
    height: source.height * snapToReciprocalScale(transform.scaleY),
  });
}

/**
 * Relative aspect deviation of a placement from its authored source, used by the
 * workbench to badge deliberate distortion. 0 means the ratio is untouched.
 */
export function transformDistortion(
  transform: AssetTransform,
  dimension: AssetDimensionId,
): number {
  const source = assetDimension(dimension);
  const resolved = resolveTransformSize(transform, dimension);
  const sourceAspect = source.width / source.height;
  const resolvedAspect = resolved.width / resolved.height;
  if (!Number.isFinite(resolvedAspect) || resolvedAspect <= 0) return 0;
  return Math.abs(resolvedAspect - sourceAspect) / sourceAspect;
}

/** Above this the workbench shows a distortion badge; it never fails a build. */
export const DISTORTION_WARNING_THRESHOLD = 0.02;

const TAU = Math.PI * 2;

export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/** Keeps a dragged rotation handle inside [0, 2π) so saved values stay comparable. */
export function normalizeRotation(radians: number): number {
  if (!Number.isFinite(radians)) return 0;
  return ((radians % TAU) + TAU) % TAU;
}

export function createAssetTransform(patch: Partial<AssetTransform> = {}): AssetTransform {
  return AssetTransformSchema.parse({ ...DEFAULT_ASSET_TRANSFORM, ...patch });
}

export function createAssetManifest(
  slots: Readonly<Record<string, AssetManifestSlot>>,
): AssetManifest {
  return {
    schema_version: ASSET_MANIFEST_SCHEMA_VERSION,
    stage: {
      width: INTERNAL_WIDTH,
      height: INTERNAL_HEIGHT,
      render_width: HD_WIDTH,
      render_height: HD_HEIGHT,
      render_scale: DEFAULT_TARGET_SCALE,
    },
    slots: { ...slots },
  };
}

export function createAssetManifestSlot(
  dimension: AssetDimensionId,
  patch: Partial<Omit<AssetManifestSlot, 'dimension'>> = {},
): AssetManifestSlot {
  return AssetManifestSlotSchema.parse({
    dimension,
    image: patch.image ?? null,
    transform: patch.transform ?? DEFAULT_ASSET_TRANSFORM,
    isLocked: patch.isLocked ?? false,
  });
}

const LegacyManifestProbeSchema = z.looseObject({
  schema_version: z.string(),
});

/**
 * Upgrades a 2.0 manifest in place. A 2.0 slot carries no size fields, and the
 * aspect-locked default reproduces its rendered size exactly, so migration is a
 * version stamp rather than a geometry change.
 */
export function migrateAssetManifest(input: unknown): AssetManifest {
  const probe = LegacyManifestProbeSchema.safeParse(input);
  if (probe.success && probe.data.schema_version === LEGACY_ASSET_MANIFEST_SCHEMA_VERSION) {
    return AssetManifestSchema.parse({
      ...probe.data,
      schema_version: ASSET_MANIFEST_SCHEMA_VERSION,
    });
  }
  return AssetManifestSchema.parse(input);
}

export function parseAssetManifest(input: unknown): AssetManifest {
  return migrateAssetManifest(input);
}

export function serializeAssetManifest(manifest: AssetManifest): string {
  return `${JSON.stringify(AssetManifestSchema.parse(manifest), null, 2)}\n`;
}
