import './style.css';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const MAX_MB = 150;
const OK_EXT = ['mp4', 'mov', 'webm', 'mkv'];
const CORE = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';
const $ = (id) => document.getElementById(id);

const ffmpeg = new FFmpeg();
let loaded = false, busy = false, file = null, origURL = null, outURL = null;

function show(text, ok = false) {
  const m = $('msg');
  m.textContent = text; m.className = 'msg' + (ok ? ' ok' : ''); m.hidden = !text;
}
function setProgress(p) {
  const v = Math.max(0, Math.min(100, Math.round(p * 100)));
  $('fill').style.width = v + '%'; $('pct').textContent = v + '%';
}

[['sharp', 'o-sharp', (v) => (+v).toFixed(1)], ['den', 'o-den', (v) => v],
 ['bri', 'o-bri', (v) => (+v).toFixed(2)], ['con', 'o-con', (v) => (+v).toFixed(2)]]
  .forEach(([i, o, f]) => $(i).addEventListener('input', () => ($(o).textContent = f($(i).value))));

$('file').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f || busy) return;
  const ext = f.name.split('.').pop().toLowerCase();
  if (!OK_EXT.includes(ext)) return show('Format belum didukung. Pakai MP4, MOV, WebM, atau MKV.');
  if (f.size > MAX_MB * 1024 * 1024) return show(`Video terlalu besar (${(f.size / 1048576).toFixed(0)} MB). Maksimal ${MAX_MB} MB. Potong atau kompres dulu.`);
  show('');
  file = f;
  if (origURL) URL.revokeObjectURL(origURL);
  if (outURL) { URL.revokeObjectURL(outURL); outURL = null; }
  origURL = URL.createObjectURL(f);
  $('orig').src = origURL;
  $('resBox').hidden = true; $('dl').hidden = true; $('bar').hidden = true;
  $('panel').hidden = false;
});

async function loadCore() {
  if (loaded) return;
  show('Memuat mesin pemroses (sekali saja, ±30 MB)…', true);
  await ffmpeg.load({
    coreURL: await toBlobURL(`${CORE}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${CORE}/ffmpeg-core.wasm`, 'application/wasm'),
  });
  ffmpeg.on('progress', ({ progress }) => setProgress(progress));
  loaded = true;
}

$('start').addEventListener('click', async () => {
  if (!file || busy) return;
  busy = true; $('start').disabled = true; $('dl').hidden = true;
  $('bar').hidden = false; setProgress(0);
  const ext = file.name.split('.').pop().toLowerCase();
  const inName = `in.${ext}`, outName = 'out.mp4';
  try {
    await loadCore();
    show('Memproses video… jangan tutup halaman ini.', true);
    await ffmpeg.writeFile(inName, await fetchFile(file));

    const h = $('res').value, sharp = +$('sharp').value, den = +$('den').value;
    const vf = [`scale=-2:${h}:flags=lanczos`];
    if (den > 0) vf.push(`hqdn3d=${den}:${den}:${den * 1.5}:${den * 1.5}`);
    if (sharp > 0) vf.push(`unsharp=5:5:${sharp}:5:5:0`);
    vf.push(`eq=brightness=${$('bri').value}:contrast=${$('con').value}`);
    vf.push('format=yuv420p');

    const code = await ffmpeg.exec([
      '-i', inName, '-map', '0:v:0', '-map', '0:a:0?', '-vf', vf.join(','),
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26',
      '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', outName,
    ]);
    if (code !== 0) throw new Error('ffmpeg exit ' + code);

    const data = await ffmpeg.readFile(outName);
    if (outURL) URL.revokeObjectURL(outURL);
    outURL = URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));
    $('out').src = outURL; $('resBox').hidden = false;
    $('dl').href = outURL; $('dl').hidden = false;
    setProgress(1); show('Selesai. Bandingkan hasilnya, lalu download.', true);
  } catch (err) {
    console.error(err);
    show('Gagal memproses video. Coba resolusi lebih rendah, video lebih pendek, atau tutup aplikasi lain agar memori HP cukup.');
    $('bar').hidden = true;
  } finally {
    for (const n of [inName, outName]) { try { await ffmpeg.deleteFile(n); } catch {} }
    busy = false; $('start').disabled = false;
  }
});
