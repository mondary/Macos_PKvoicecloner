import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const version = '1.13.8';
const hash = '633c24321e06b1fe79feafa03ea16cbc0f8a286641e2da3559bac91bdb13bd96';
const target = new URL('../../../android/app/libs/sherpa-onnx.aar', import.meta.url);
const valid = data => createHash('sha256').update(data).digest('hex') === hash;
try { if (valid(await readFile(target))) process.exit(0); } catch {}
console.log(`Downloading sherpa-onnx ${version} Android runtime…`);
const r = await fetch(`https://github.com/k2-fsa/sherpa-onnx/releases/download/v${version}/sherpa-onnx-${version}.aar`);
if (!r.ok) throw new Error(`Runtime download: HTTP ${r.status}`);
const data = Buffer.from(await r.arrayBuffer());
if (!valid(data)) throw new Error('sherpa-onnx SHA-256 mismatch');
await mkdir(new URL('.',target), { recursive:true });
await writeFile(target,data);
console.log('Android runtime ready (SHA-256 verified).');
