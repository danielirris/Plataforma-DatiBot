// Renderiza todas las composiciones de un proyecto de anuncio a mp4.
// Uso: node render.mjs <projDir> <outDir>
//   projDir: carpeta del proyecto generado (contiene src/index.ts, public/, ad.json)
//   outDir:  carpeta donde escribir clip_1.mp4, clip_2.mp4, ...
import { bundle } from '@remotion/bundler';
import { getCompositions, renderMedia, ensureBrowser } from '@remotion/renderer';
import path from 'node:path';
import fs from 'node:fs';

const projDir = path.resolve(process.argv[2]);
const outDir = path.resolve(process.argv[3]);
const entry = path.join(projDir, 'src', 'index.ts');
const publicDir = path.join(projDir, 'public');

fs.mkdirSync(outDir, { recursive: true });

console.log('[render] asegurando navegador…');
await ensureBrowser();

console.log('[render] bundling', entry);
const serveUrl = await bundle({ entryPoint: entry, publicDir });

const comps = await getCompositions(serveUrl, { logLevel: 'error' });
console.log('[render] composiciones:', comps.map((c) => c.id).join(', '));

// Concurrencia: nº de pestañas Chromium en paralelo. NUNCA "auto": en auto,
// Remotion abre ~1 por núcleo y el pico de RAM revienta el contenedor (OOM).
// Si REMOTION_CONCURRENCY no llega (0/ausente/NaN), caemos a un tope fijo de 1
// (lo más seguro para VPS pequeños; los clips ya se renderizan de a uno). Sube a
// 2 por env solo si el contenedor tiene RAM de sobra.
const conc = Number(process.env.REMOTION_CONCURRENCY) || 1;
console.log('[render] concurrency:', conc);

// Tope del caché de fotogramas de OffthreadVideo (footage). SIN esto Remotion lo
// deja crecer sin límite y, con anuncios llenos de video, es lo que más suele
// reventar el contenedor (OOM -> reinicio -> 502). Configurable por env.
const cacheMB = Number(process.env.REMOTION_VIDEO_CACHE_MB) || 300;
const offthreadVideoCacheSizeInBytes = Math.max(64, cacheMB) * 1024 * 1024;
console.log('[render] video cache MB:', cacheMB);

const total = comps.length;
let i = 1;
for (const comp of comps) {
  const out = path.join(outDir, `clip_${i}.mp4`);
  console.log(`[render] ${comp.id} -> ${out} (${comp.durationInFrames}f)`);
  let ultimo = -1;
  await renderMedia({
    composition: comp,
    serveUrl,
    codec: 'h264',
    outputLocation: out,
    concurrency: conc,
    offthreadVideoCacheSizeInBytes,
    logLevel: 'error',
    // Progreso en vivo: el motor Python parsea estas líneas "PROGRESS ..." para
    // mover el % del job mientras Chromium dibuja los fotogramas.
    onProgress: ({ renderedFrames }) => {
      if (renderedFrames - ultimo >= 10 || renderedFrames === comp.durationInFrames) {
        ultimo = renderedFrames;
        console.log(`PROGRESS ${i} ${total} ${renderedFrames} ${comp.durationInFrames}`);
      }
    },
  });
  console.log(`[render] OK ${out}`);
  i++;
}
console.log(`[render] LISTO ${i - 1} video(s)`);
