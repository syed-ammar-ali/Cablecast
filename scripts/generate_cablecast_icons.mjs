import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

// Generates an SVG arc path string given center (cx, cy), radius, startAngle and endAngle (in degrees)
function describeArc(cx, cy, radius, startAngle, endAngle) {
  const startRad = (startAngle * Math.PI) / 180;
  const endRad = (endAngle * Math.PI) / 180;
  const x1 = cx + radius * Math.cos(startRad);
  const y1 = cy + radius * Math.sin(startRad);
  const x2 = cx + radius * Math.cos(endRad);
  const y2 = cy + radius * Math.sin(endRad);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`;
}

// Generate the high-definition Cablecast SVG icon
function createCablecastSvg() {
  const cx = 222;
  const cy = 256;

  // Letter C: arc from 42 deg to 318 deg (clockwise through left side, open on right)
  const cArc = describeArc(cx, cy, 102, 42, 318);

  // Broadcast waves: arcs centered at (cx, cy) radiating rightward from -30 deg to +30 deg
  const wave1 = describeArc(cx, cy, 58, -30, 30);
  const wave2 = describeArc(cx, cy, 84, -32, 32);
  const wave3 = describeArc(cx, cy, 110, -34, 34);
  const wave4 = describeArc(cx, cy, 136, -36, 36);

  // Scanlines (horizontal lines across center)
  let scanlines = "";
  for (let y = 100; y <= 412; y += 6) {
    scanlines += `<line x1="80" y1="${y}" x2="432" y2="${y}" stroke="#ffffff" stroke-width="1" opacity="0.04" />`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <!-- Background Vignette Gradient -->
    <radialGradient id="bgGrad" cx="50%" cy="50%" r="70%">
      <stop offset="0%" stop-color="#181926" />
      <stop offset="55%" stop-color="#0c0d14" />
      <stop offset="100%" stop-color="#040407" />
    </radialGradient>

    <!-- Sleek Glass Rim Radial Gradient -->
    <radialGradient id="rimGlow" cx="50%" cy="15%" r="85%">
      <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.18" />
      <stop offset="60%" stop-color="#1e1b4b" stop-opacity="0.05" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0" />
    </radialGradient>

    <!-- Cablecast Master Brand Gold Phosphor Gradient -->
    <linearGradient id="goldBeam" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fef08a" />
      <stop offset="25%" stop-color="#fde047" />
      <stop offset="65%" stop-color="#eab308" />
      <stop offset="100%" stop-color="#ca8a04" />
    </linearGradient>

    <!-- Wave 4 Soft Fade Gradient -->
    <linearGradient id="waveFade" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#fde047" />
      <stop offset="100%" stop-color="#fde047" stop-opacity="0.4" />
    </linearGradient>

    <!-- Amber Neon Glow Filter for Broadcast Core -->
    <filter id="amberNeonGlow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="8" result="blur1" />
      <feGaussianBlur stdDeviation="18" result="blur2" />
      <feMerge>
        <feMergeNode in="blur2" />
        <feMergeNode in="blur1" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>

    <!-- Subtle Drop Shadow for 'C' Monogram -->
    <filter id="cShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="6" stdDeviation="12" flood-color="#000000" flood-opacity="0.8" />
    </filter>
  </defs>

  <!-- 1. Master Canvas Solid Base (100% Solid for Android Maskable & Apple Touch Icon) -->
  <rect width="512" height="512" fill="#06070a" />

  <!-- 2. Screen Bezel Recess with Subtle Radial Gradient -->
  <rect width="512" height="512" fill="url(#bgGrad)" />

  <!-- 3. CRT Monitor Rounded Chassis Outer Border Ring -->
  <rect x="18" y="18" width="476" height="476" rx="104" fill="none" stroke="#27273a" stroke-width="2" opacity="0.6" />
  <rect x="24" y="24" width="464" height="464" rx="98" fill="none" stroke="#12131c" stroke-width="1.5" />

  <!-- 4. Subtle Radial Broadcast Ambient Glow in Background -->
  <circle cx="${cx}" cy="${cy}" r="170" fill="url(#rimGlow)" />

  <!-- Background Radar Range Rings (Faint Retro CRT Alignment Guides) -->
  <g opacity="0.07" stroke="#eab308">
    <circle cx="${cx}" cy="${cy}" r="75" fill="none" stroke-width="1" stroke-dasharray="4 6" />
    <circle cx="${cx}" cy="${cy}" r="125" fill="none" stroke-width="1" stroke-dasharray="4 6" />
    <circle cx="${cx}" cy="${cy}" r="175" fill="none" stroke-width="1" />
  </g>

  <!-- 5. Authentic CRT Scanlines Pattern -->
  <g>${scanlines}</g>

  <!-- 6. Monogram & Broadcast Artwork Group (Safe Zone Bound: strictly inside r < 180 of (256,256)) -->
  <g filter="url(#cShadow)">
    <!-- Broadcast Signal Waves (Radiating from C mouth) -->
    <!-- Wave 1 (Inner pulse) -->
    <path d="${wave1}" fill="none" stroke="#ca8a04" stroke-width="7.5" stroke-linecap="round" opacity="0.85" />
    
    <!-- Wave 2 (Mid pulse) -->
    <path d="${wave2}" fill="none" stroke="url(#goldBeam)" stroke-width="7.5" stroke-linecap="round" />
    
    <!-- Wave 3 (Main energetic pulse) -->
    <path d="${wave3}" fill="none" stroke="#fef08a" stroke-width="7" stroke-linecap="round" filter="url(#amberNeonGlow)" />

    <!-- Wave 4 (Distant broadcast wave) -->
    <path d="${wave4}" fill="none" stroke="url(#waveFade)" stroke-width="5.5" stroke-linecap="round" opacity="0.55" />

    <!-- The Bold Geometric 'C' Monogram -->
    <path d="${cArc}" fill="none" stroke="url(#goldBeam)" stroke-width="36" stroke-linecap="round" stroke-linejoin="round" />

    <!-- High-Gloss Inner Core Highlight on 'C' -->
    <path d="${cArc}" fill="none" stroke="#fef9c3" stroke-width="8" stroke-linecap="round" opacity="0.75" />

    <!-- 7. Central Broadcast Transmitter Beacon Point -->
    <circle cx="${cx}" cy="${cy}" r="18" fill="#eab308" opacity="0.25" filter="url(#amberNeonGlow)" />
    <circle cx="${cx}" cy="${cy}" r="11" fill="url(#goldBeam)" />
    <circle cx="${cx}" cy="${cy}" r="5" fill="#ffffff" />
  </g>

  <!-- 8. Specular CRT Curved Screen Glare (Authentic 90s Glass Sheen) -->
  <path d="M 40 40 Q 256 12 472 40 Q 256 140 40 180 Z" fill="#ffffff" opacity="0.05" />

  <!-- 9. Crisp Metallic Corner Accents (Retro Studio Hardware Details) -->
  <g opacity="0.4" stroke="#eab308" stroke-width="1.5" stroke-linecap="round">
    <path d="M 68 84 L 84 84 L 84 68" fill="none" />
    <path d="M 444 84 L 428 84 L 428 68" fill="none" />
    <path d="M 68 428 L 84 428 L 84 444" fill="none" />
    <path d="M 444 428 L 428 428 L 428 444" fill="none" />
  </g>
</svg>`;
}

async function main() {
  const svgContent = createCablecastSvg();
  const rootDir = process.cwd();
  const publicDir = path.join(rootDir, "public");
  const appDir = path.join(rootDir, "src", "app");

  // 1. Save SVG files
  fs.writeFileSync(path.join(publicDir, "icon.svg"), svgContent, "utf8");
  fs.writeFileSync(path.join(publicDir, "icon-512.svg"), svgContent, "utf8");
  fs.writeFileSync(path.join(publicDir, "icon-192.svg"), svgContent, "utf8");
  fs.writeFileSync(path.join(appDir, "icon.svg"), svgContent, "utf8");
  console.log("Written SVGs successfully");

  // 2. Launch Puppeteer to rasterize PNGs at exact native resolutions
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  const html = `<!DOCTYPE html><html><head><style>html,body{margin:0;padding:0;width:100%;height:100%;background:#06070a;overflow:hidden;}svg{width:100%;height:100%;display:block;}</style></head><body>${svgContent}</body></html>`;

  // 512x512 Master PNG & Maskable PNG
  await page.setViewport({ width: 512, height: 512, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.screenshot({ path: path.join(publicDir, "icon-512.png") });
  await page.screenshot({ path: path.join(publicDir, "icon-maskable-512.png") });
  console.log("Generated 512x512 icons");

  // 192x192 Standard & Maskable PNG
  await page.setViewport({ width: 192, height: 192, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.screenshot({ path: path.join(publicDir, "icon-192.png") });
  await page.screenshot({ path: path.join(publicDir, "icon-maskable-192.png") });
  await page.screenshot({ path: path.join(appDir, "icon.png") });
  console.log("Generated 192x192 icons");

  // 180x180 Apple Touch Icon
  await page.setViewport({ width: 180, height: 180, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.screenshot({ path: path.join(publicDir, "apple-touch-icon.png") });
  await page.screenshot({ path: path.join(appDir, "apple-icon.png") });
  console.log("Generated Apple Touch Icons");

  // 48x48 Favicon PNG
  await page.setViewport({ width: 48, height: 48, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.screenshot({ path: path.join(publicDir, "favicon-48.png") });
  console.log("Generated Favicon 48x48");

  await browser.close();
  console.log("All Cablecast icons generated successfully!");
}

main().catch((err) => {
  console.error("Error generating icons:", err);
  process.exit(1);
});
