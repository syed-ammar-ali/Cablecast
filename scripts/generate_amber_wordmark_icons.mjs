import puppeteer from "puppeteer";
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

async function main() {
  const rootDir = process.cwd();
  const masterPath = "C:/Users/syeda/.gemini/antigravity-ide/brain/9d542736-ff28-4168-844b-47fddda131d4/scratch/amber_fullblack_preview.png";
  const masterBase64 = fs.readFileSync(masterPath).toString("base64");
  const dataUrl = `data:image/png;base64,${masterBase64}`;

  const publicDir = path.join(rootDir, "public");
  const appDir = path.join(rootDir, "src", "app");

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  // Helper to render icon at exact dimensions with optional safe zone scale
  async function renderIcon(size, scaleFactor = 1.0) {
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    const padding = (size * (1 - scaleFactor)) / 2;
    const innerSize = size * scaleFactor;

    const html = `<!DOCTYPE html><html><head><style>
      * { margin:0; padding:0; box-sizing:border-box; }
      html, body { width:${size}px; height:${size}px; background:#000000; overflow:hidden; }
      .wrapper { position:absolute; left:${padding}px; top:${padding}px; width:${innerSize}px; height:${innerSize}px; display:flex; align-items:center; justify-content:center; }
      img { width:100%; height:100%; object-fit:contain; display:block; }
    </style></head><body><div class="wrapper"><img src="${dataUrl}" /></div></body></html>`;

    await page.setContent(html);
    return await page.screenshot({ type: "png" });
  }

  console.log("Generating 512x512 icons...");
  const png512 = await renderIcon(512, 1.0);
  fs.writeFileSync(path.join(publicDir, "icon-512.png"), png512);

  const pngMaskable512 = await renderIcon(512, 0.78);
  fs.writeFileSync(path.join(publicDir, "icon-maskable-512.png"), pngMaskable512);

  console.log("Generating 192x192 icons...");
  const png192 = await renderIcon(192, 1.0);
  fs.writeFileSync(path.join(publicDir, "icon-192.png"), png192);
  fs.writeFileSync(path.join(appDir, "icon.png"), png192);

  const pngMaskable192 = await renderIcon(192, 0.78);
  fs.writeFileSync(path.join(publicDir, "icon-maskable-192.png"), pngMaskable192);

  console.log("Generating Apple Touch Icons (180x180)...");
  const png180 = await renderIcon(180, 0.92);
  fs.writeFileSync(path.join(publicDir, "apple-touch-icon.png"), png180);
  fs.writeFileSync(path.join(appDir, "apple-icon.png"), png180);

  console.log("Generating 48x48 Favicon...");
  const png48 = await renderIcon(48, 1.0);
  fs.writeFileSync(path.join(publicDir, "favicon-48.png"), png48);

  const icoBuffer = createIcoFromPng(png48);
  fs.writeFileSync(path.join(publicDir, "favicon.ico"), icoBuffer);
  console.log("Written public/favicon.ico successfully");

  // Generate crisp SVGs with embedded high-res master
  const svg512 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
    <rect width="512" height="512" fill="#000000"/>
    <image href="${dataUrl}" width="512" height="512" preserveAspectRatio="xMidYMid meet"/>
  </svg>`;

  fs.writeFileSync(path.join(publicDir, "icon.svg"), svg512, "utf8");
  fs.writeFileSync(path.join(publicDir, "icon-512.svg"), svg512, "utf8");
  fs.writeFileSync(path.join(publicDir, "icon-192.svg"), svg512, "utf8");
  fs.writeFileSync(path.join(appDir, "icon.svg"), svg512, "utf8");
  console.log("Written SVGs successfully");

  await browser.close();
  console.log("ALL Cablecast icons generated and deployed successfully!");
}

main().catch(console.error);
