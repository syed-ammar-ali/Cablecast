import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

async function run() {
  const imagePath = "C:/Users/syeda/.gemini/antigravity-ide/brain/9d542736-ff28-4168-844b-47fddda131d4/cablecast_amber_fullblack_1788602933790.jpg";
  const imageBase64 = fs.readFileSync(imagePath).toString("base64");
  const dataUrl = `data:image/jpeg;base64,${imageBase64}`;

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 1 });

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body { width: 1024px; height: 1024px; background: #000000; overflow: hidden; }
          canvas { display: block; }
        </style>
      </head>
      <body>
        <canvas id="c" width="1024" height="1024"></canvas>
        <script>
          const canvas = document.getElementById('c');
          const ctx = canvas.getContext('2d');
          const img = new Image();
          img.onload = () => {
            // Draw pure black base
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, 1024, 1024);

            // Draw image scaled so the black surface extends 100% edge-to-edge
            const scale = 1.34;
            const offset = (1024 * (scale - 1)) / 2;
            ctx.drawImage(img, -offset, -offset, 1024 * scale, 1024 * scale);
            const imgData = ctx.getImageData(0, 0, 1024, 1024);
            const d = imgData.data;

            // Pure pitch black thresholding for background
            for (let i = 0; i < d.length; i += 4) {
              const r = d[i];
              const g = d[i + 1];
              const b = d[i + 2];

              // If it's a dark pixel (shadow/background), force to absolute #000000
              if (r < 45 && g < 40 && b < 30) {
                d[i] = 0;
                d[i + 1] = 0;
                d[i + 2] = 0;
                d[i + 3] = 255;
              }
              // If it's grayish or light corner residue
              if (r > 150 && g > 150 && b > 150) {
                d[i] = 0;
                d[i + 1] = 0;
                d[i + 2] = 0;
                d[i + 3] = 255;
              }
            }
            ctx.putImageData(imgData, 0, 0);
            window.done = true;
          };
          img.src = "${dataUrl}";
        </script>
      </body>
    </html>
  `;

  await page.setContent(html);
  await page.waitForFunction(() => window.done === true);

  const previewPath = "C:/Users/syeda/.gemini/antigravity-ide/brain/9d542736-ff28-4168-844b-47fddda131d4/scratch/amber_fullblack_preview.png";
  await page.screenshot({ path: previewPath });
  console.log("Saved preview to", previewPath);

  await browser.close();
}

run().catch(console.error);
