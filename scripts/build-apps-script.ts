/**
 * Build Write Gateway → apps-script/dist/Code.gs
 *
 *   npm run apps-script:build    สร้างไฟล์ใหม่
 *   npm run apps-script:check    ตรวจว่าไฟล์ใน repository ตรงกับซอร์สปัจจุบัน (ใช้ใน `npm run verify`)
 *
 * ไฟล์ผลลัพธ์ถูก commit ไว้ เพื่อให้ผู้ดูแลระบบนำไปวางใน Apps Script ได้โดยไม่ต้องมีเครื่องมือพัฒนา
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(root, 'apps-script/src/main.ts');
const outFile = path.join(root, 'apps-script/dist/Code.gs');

const BANNER = `/**
 * TUNS Academic Office — Write Gateway (Google Apps Script)
 *
 * ไฟล์นี้สร้างอัตโนมัติจาก apps-script/src และ src/lib/storage/gateway-core
 * ห้ามแก้ไขโดยตรง ให้แก้ที่ซอร์สแล้วรัน \`npm run apps-script:build\`
 * วิธีติดตั้ง: ดู apps-script/README.md
 */`;

const FOOTER = `
// Apps Script เรียกฟังก์ชันระดับบนสุดเท่านั้น
function doPost(e) {
  return TunsGateway.doPost(e);
}

function doGet(e) {
  return TunsGateway.doGet(e);
}
`;

async function bundle(): Promise<string> {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'TunsGateway',
    target: 'es2019',
    platform: 'neutral',
    charset: 'utf8',
    legalComments: 'none',
    minify: false,
    logLevel: 'silent',
  });
  const code = result.outputFiles[0]?.text;
  if (!code) throw new Error('esbuild produced no output');
  return `${BANNER}\n${code}${FOOTER}`;
}

async function main(): Promise<void> {
  const check = process.argv.includes('--check');
  const output = await bundle();

  if (check) {
    const current = existsSync(outFile) ? readFileSync(outFile, 'utf8') : '';
    if (current !== output) {
      console.error(
        'apps-script/dist/Code.gs ไม่ตรงกับซอร์สปัจจุบัน — รัน `npm run apps-script:build` แล้ว commit',
      );
      process.exit(1);
    }
    console.log('apps-script/dist/Code.gs is up to date');
    return;
  }

  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, output);
  console.log(`wrote ${path.relative(root, outFile)} (${output.length.toLocaleString()} bytes)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
