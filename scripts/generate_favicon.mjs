import fs from "fs";
import path from "path";

function createIcoFromPng(pngBuffer) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // ICO format
  header.writeUInt16LE(1, 4); // 1 image

  const dirEntry = Buffer.alloc(16);
  dirEntry.writeUInt8(48, 0); // Width 48
  dirEntry.writeUInt8(48, 1); // Height 48
  dirEntry.writeUInt8(0, 2);  // Palette
  dirEntry.writeUInt8(0, 3);  // Reserved
  dirEntry.writeUInt16LE(1, 4); // Color planes
  dirEntry.writeUInt16LE(32, 6); // Bits per pixel
  dirEntry.writeUInt32LE(pngBuffer.length, 8); // Image data size
  dirEntry.writeUInt32LE(22, 12); // Image data offset (6 + 16 = 22)

  return Buffer.concat([header, dirEntry, pngBuffer]);
}

const png48 = fs.readFileSync(path.join(process.cwd(), "public", "favicon-48.png"));
const icoBuffer = createIcoFromPng(png48);

fs.writeFileSync(path.join(process.cwd(), "public", "favicon.ico"), icoBuffer);
console.log("favicon.ico written to public/ successfully!");
