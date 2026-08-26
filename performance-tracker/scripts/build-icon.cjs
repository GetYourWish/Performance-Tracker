const path = require('path');
const fs = require('fs');

// Use resvg-js (works headless, no display needed)
const { Resvg } = require('@resvg/resvg-js');

const svgPath = path.resolve(__dirname, '..', 'build', 'icon.svg');
const svg = fs.readFileSync(svgPath, 'utf8');

// --- Step 1: Render SVG → 256px PNG ---
const resvg256 = new Resvg(svg, { fitTo: { mode: 'width', value: 256 } });
const png256 = resvg256.render().asPng();

const pngPath = path.resolve(__dirname, '..', 'build', 'icon.png');
fs.writeFileSync(pngPath, png256);
console.log(`PNG 256x256 written to ${pngPath} (${png256.length} bytes)`);

// --- Step 2: Render smaller sizes for the ICO ---
const SIZES = [16, 32, 48, 64, 128, 256];

/** Render the SVG at a given pixel width and return the PNG buffer. */
function renderPng(size) {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: size } });
  return r.render().asPng();
}

/** Build a multi-image ICO (PNG-in-ICO format) from an array of {size, pngBuf}. */
function buildIco(entries) {
  const count = entries.length;
  // ICO header: reserved(2) + type(2) + count(2) = 6 bytes
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);   // reserved
  header.writeUInt16LE(1, 2);   // type: 1 = icon
  header.writeUInt16LE(count, 4);

  // Directory entries: 16 bytes each
  const dirSize = 16 * count;
  const dataOffset = 6 + dirSize;

  let currentOffset = dataOffset;
  const dirEntries = [];
  const pngBuffers = [];

  for (const { size, pngBuf } of entries) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);  // width (0 = 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1);  // height (0 = 256)
    entry.writeUInt8(0, 2);                         // color palette
    entry.writeUInt8(0, 3);                         // reserved
    entry.writeUInt16LE(1, 4);                     // color planes
    entry.writeUInt16LE(32, 6);                    // bits per pixel
    entry.writeUInt32LE(pngBuf.length, 8);         // image data size
    entry.writeUInt32LE(currentOffset, 12);        // offset

    dirEntries.push(entry);
    pngBuffers.push(pngBuf);
    currentOffset += pngBuf.length;
  }

  return Buffer.concat([header, ...dirEntries, ...pngBuffers]);
}

// --- Step 3: Build multi-size ICO ---
const icoEntries = SIZES.map((size) => ({
  size,
  pngBuf: renderPng(size),
}));

const ico = buildIco(icoEntries);
const icoPath = path.resolve(__dirname, '..', 'build', 'icon.ico');
fs.writeFileSync(icoPath, ico);
console.log(`ICO written to ${icoPath} (${ico.length} bytes, ${SIZES.length} sizes: ${SIZES.join(', ')}px)`);
