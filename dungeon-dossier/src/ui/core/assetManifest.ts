import { z } from 'zod';
import { ASSET_DIMENSION_IDS, type AssetDimensionId } from './assetDimensions';
import {
  DEFAULT_TARGET_SCALE,
  HD_HEIGHT,
  HD_WIDTH,
  INTERNAL_HEIGHT,
  INTERNAL_WIDTH,
} from './integerScale';

export const ASSET_MANIFEST_SCHEMA_VERSION = '2.0';

const FiniteNumber = z.number().finite();
const PositiveScale = FiniteNumber.gt(0).max(64);

/**
 * A workbench placement. Rotation is stored in radians because that is what the
 * renderer consumes; the workbench converts to degrees only for display.
 */
export const AssetTransformSchema = z.strictObject({
  x: FiniteNumber,
  y: FiniteNumber,
  rotation: FiniteNumber,
  scaleX: PositiveScale,
  scaleY: PositiveScale,
});
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
};

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

export function parseAssetManifest(input: unknown): AssetManifest {
  return AssetManifestSchema.parse(input);
}

export function serializeAssetManifest(manifest: AssetManifest): string {
  return `${JSON.stringify(AssetManifestSchema.parse(manifest), null, 2)}\n`;
}
