import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";

import { sha256 } from "./pngMetadata.mjs";

/**
 * One palette policy, shared by the standalone checker and the workbench save
 * handler so a file cannot pass one and fail the other.
 *
 * Generated placeholder art stays inside the 16-colour house style. Approved
 * production art is exempt, but the exemption is bound to an exact SHA-256, not
 * to a path glob: a path rule would let any later file dropped at that path
 * inherit the exemption, which is precisely how unreviewed art ships. Replacing
 * approved art therefore fails until the importer is re-run and the new digest
 * is reviewed into the allowlist.
 */

export const MAX_OPAQUE_RGBA_COLOURS = 16;
export const ALLOWLIST_PATH = fileURLToPath(new URL("./nhn-png-allowlist.json", import.meta.url));

export const PALETTE_POLICIES = ["strict16", "approved-production"];

let approvedDigests;

/** `runtimePath` (e.g. `assets/ui/ui_tag_base.png`) to its approved digest. */
export async function approvedProductionDigests(allowlistPath = ALLOWLIST_PATH) {
  approvedDigests ??= new Map(
    JSON.parse(await readFile(allowlistPath, "utf8")).entries.map((entry) => [
      entry.targetPath,
      entry.sha256,
    ]),
  );
  return approvedDigests;
}

/** Test seam: drop the memoized allowlist so a fixture can be loaded instead. */
export function resetApprovedProductionDigests() {
  approvedDigests = undefined;
}

export function toRuntimePath(assetRootRelativePath) {
  const posix = assetRootRelativePath.split(path.sep).join("/");
  return posix.startsWith("assets/") ? posix : `assets/${posix}`;
}

export function countVisibleRgbaColours(png) {
  const colours = new Set();
  for (let offset = 0; offset < png.data.length; offset += 4) {
    const alpha = png.data[offset + 3];
    if (alpha === 0) continue;
    colours.add(
      ((png.data[offset] << 24) |
        (png.data[offset + 1] << 16) |
        (png.data[offset + 2] << 8) |
        alpha) >>>
        0,
    );
  }
  return colours.size;
}

/**
 * Decides one file. Returns `{ policy, colourCount, problem }`; `problem` is
 * undefined when the file is acceptable.
 */
export async function evaluatePalette({ runtimePath, buffer, png, allowlistPath = ALLOWLIST_PATH }) {
  const approved = await approvedProductionDigests(allowlistPath);
  const expectedDigest = approved.get(runtimePath);
  const colourCount = countVisibleRgbaColours(png);

  if (expectedDigest === undefined) {
    return {
      policy: "strict16",
      colourCount,
      problem:
        colourCount > MAX_OPAQUE_RGBA_COLOURS
          ? `${colourCount} visible RGBA colours (maximum ${MAX_OPAQUE_RGBA_COLOURS})`
          : undefined,
    };
  }

  const digest = sha256(buffer);
  if (digest !== expectedDigest) {
    return {
      policy: "approved-production",
      colourCount,
      problem: `digest ${digest} does not match the approved ${expectedDigest}; production art is importer-only, re-run "pnpm assets:import"`,
    };
  }
  return { policy: "approved-production", colourCount, problem: undefined };
}
