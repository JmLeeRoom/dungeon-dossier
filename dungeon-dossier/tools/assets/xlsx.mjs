import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";

/**
 * A read-only, dependency-free XLSX reader sized for exactly one job: proving
 * that the naming workbook and the 72-file allowlist decompose every filename
 * the same way. It understands the two ZIP compression methods Excel emits
 * (stored and deflate) and the handful of cell types this sheet uses.
 *
 * It never writes: the workbook is an art deliverable and stays byte-identical.
 */

const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x0605_4b50;
const CENTRAL_FILE_HEADER_SIGNATURE = 0x0201_4b50;
const STORED = 0;
const DEFLATED = 8;

function findEndOfCentralDirectory(buffer) {
  // The comment field is variable length, so the record has to be found by
  // scanning backwards from the end of the archive.
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) return offset;
  }
  throw new Error("not a ZIP archive: end-of-central-directory record is missing");
}

function readZipEntries(buffer) {
  const eocd = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  let cursor = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(cursor) !== CENTRAL_FILE_HEADER_SIGNATURE) {
      throw new Error("corrupt ZIP central directory");
    }
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength);

    // The local header repeats the name/extra lengths, and its extra field can
    // differ in size from the central one, so both must be re-read here.
    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const data = buffer.subarray(dataStart, dataStart + compressedSize);

    if (method === STORED) entries.set(name, Buffer.from(data));
    else if (method === DEFLATED) entries.set(name, inflateRawSync(data));
    else throw new Error(`unsupported ZIP compression method ${method} for ${name}`);

    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

const XML_ENTITIES = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decodeXmlText(value) {
  return value.replace(
    /&(?:amp|lt|gt|quot|apos);|&#(\d+);|&#x([0-9a-fA-F]+);/gu,
    (match, decimal, hex) => {
      if (decimal !== undefined) return String.fromCodePoint(Number(decimal));
      if (hex !== undefined) return String.fromCodePoint(Number.parseInt(hex, 16));
      return XML_ENTITIES[match] ?? match;
    },
  );
}

function readSharedStrings(xml) {
  if (xml === undefined) return [];
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gu)].map((item) =>
    [...item[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gu)]
      .map((run) => decodeXmlText(run[1]))
      .join(""),
  );
}

function columnOf(reference) {
  return /^([A-Z]+)/u.exec(reference)?.[1] ?? "";
}

/**
 * Returns one object per sheet row: `{ row, A, B, ... }` with every cell as the
 * string Excel displays. Numeric cells keep their raw serialization (`0` becomes
 * `"0"`), which is exactly the fidelity the key-parity check needs — the
 * workbook's `0.0` for `ui_pin_00` has to stay visible as a mismatch rather
 * than being coerced back into `00`.
 */
export function parseXlsxSheet(buffer, sheetPath = "xl/worksheets/sheet1.xml") {
  const files = readZipEntries(buffer);
  const sheet = files.get(sheetPath);
  if (sheet === undefined) throw new Error(`workbook has no ${sheetPath}`);
  const strings = readSharedStrings(files.get("xl/sharedStrings.xml")?.toString("utf8"));
  const xml = sheet.toString("utf8");

  return [...xml.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/gu)].map((match) => {
    const record = { row: Number(match[1]) };
    for (const cell of match[2].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gu)) {
      const column = columnOf(/\br="([A-Z]+\d+)"/u.exec(cell[1])?.[1] ?? "");
      if (column === "") continue;
      const type = /\bt="([^"]+)"/u.exec(cell[1])?.[1];
      if (type === "inlineStr") {
        const inline = /<is\b[^>]*>[\s\S]*?<t\b[^>]*>([\s\S]*?)<\/t>/u.exec(cell[2]);
        record[column] = inline === null ? "" : decodeXmlText(inline[1]);
        continue;
      }
      const value = /<v\b[^>]*>([\s\S]*?)<\/v>/u.exec(cell[2])?.[1];
      if (value === undefined) continue;
      record[column] = type === "s" ? (strings[Number(value)] ?? "") : decodeXmlText(value);
    }
    return record;
  });
}

export async function readXlsxSheet(absolutePath, sheetPath) {
  return parseXlsxSheet(await readFile(absolutePath), sheetPath);
}
