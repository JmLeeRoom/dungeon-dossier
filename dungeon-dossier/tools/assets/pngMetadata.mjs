import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Byte offsets of the IHDR fields, which a valid PNG always places first. */
const IHDR_WIDTH_OFFSET = 16;
const IHDR_HEIGHT_OFFSET = 20;
const IHDR_BIT_DEPTH_OFFSET = 24;
const IHDR_COLOUR_TYPE_OFFSET = 25;
const IHDR_INTERLACE_OFFSET = 28;

export class PngFormatError extends Error {}

/**
 * Reads the header of an already-loaded PNG. Only IHDR is parsed: the importer
 * needs identity (size, digest), never pixels, so this stays allocation-free
 * next to a full decode.
 */
export function readPngMetadata(buffer) {
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new PngFormatError("not a PNG file (bad signature)");
  }
  if (buffer.toString("latin1", 12, 16) !== "IHDR") {
    throw new PngFormatError("PNG does not start with an IHDR chunk");
  }
  return {
    width: buffer.readUInt32BE(IHDR_WIDTH_OFFSET),
    height: buffer.readUInt32BE(IHDR_HEIGHT_OFFSET),
    bitDepth: buffer[IHDR_BIT_DEPTH_OFFSET],
    colourType: buffer[IHDR_COLOUR_TYPE_OFFSET],
    interlace: buffer[IHDR_INTERLACE_OFFSET],
    byteLength: buffer.length,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}

export async function readPngFile(absolutePath) {
  const buffer = await readFile(absolutePath);
  return { buffer, ...readPngMetadata(buffer) };
}

export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}
