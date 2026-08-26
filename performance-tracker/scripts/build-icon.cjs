const path = require('path');
const fs = require('fs');

// Use resvg-js (works headless, no display needed)
const { Resvg } = require('@resvg/resvg-js');

const svgPath = path.resolve(__dirname, '..', 'build', 'icon.svg');
const svg = fs.readFileSync(svgPath, 'utf8');

const opts = {
  fitTo: { mode: 'width', value: 256 },
};

const resvg = new Resvg(svg, opts);
const pngData = resvg.render();
const pngBuffer = pngData.asPng();

const pngPath = path.resolve(__dirname, '..', 'build', 'icon.png');
fs.writeFileSync(pngPath, pngBuffer);
console.log(`PNG written to ${pngPath} (${pngBuffer.length} bytes)`);

// Build a minimal valid ICO containing the single 256px PNG
// ICO header: 6 bytes  (reserved[2] + type[2] + count[2])
// 1 directory entry: 16 bytes
// Then raw PNG bytes (PNG-in-ICO, widely supported)
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);   // reserved
header.writeUInt16LE(1, 2);   // type: icon
header.writeUInt16LE(1, 4);   // count: 1 image

const entry = Buffer.alloc(16);
entry.writeUInt8(0, 0);        // width  (0 = 256)
entry.writeUInt8(0, 1);        // height (0 = 256)
entry.writeUInt8(0, 2);        // color palette
entry.writeUInt8(0, 3);        // reserved
entry.writeUInt16LE(1, 4);    // color planes
entry.writeUInt16LE(32, 6);   // bits per pixel
entry.writeUInt32LE(pngBuffer.length, 8);  // size of image data
entry.writeUInt32LE(22, 12);  // offset from beginning of file (6 + 16)

const ico = Buffer.concat([header, entry, pngBuffer]);

const icoPath = path.resolve(__dirname, '..', 'build', 'icon.ico');
fs.writeFileSync(icoPath, ico);
console.log(`ICO written to ${icoPath} (${ico.length} bytes)`);
