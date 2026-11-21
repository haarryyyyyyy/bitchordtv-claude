// Zips app/ into build/BitChord-<version>-unsigned.wgt. Signing needs your Samsung certificate
// (it carries your TV's DUID), so it runs on your side: see README, "Install on your TV".
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const APP = path.join(__dirname, '..', 'app');
const version = /<widget[^>]*\sversion="([\d.]+)"/.exec(fs.readFileSync(path.join(APP, 'config.xml'), 'utf8'))[1];
const out = path.join(__dirname, '..', 'build', 'BitChord-' + version + '-unsigned.wgt');

const files = [];
(function walk(d) { for (const f of fs.readdirSync(d).sort()) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : files.push(p); } })(APP);

const table = [];
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
const crc = (b) => { let c = 0xffffffff; for (const v of b) c = table[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

const locals = [], central = [];
let offset = 0;
for (const f of files) {
  const name = Buffer.from(path.relative(APP, f).split(path.sep).join('/'));
  const data = fs.readFileSync(f);
  const comp = zlib.deflateRawSync(data, { level: 9 });
  const c = crc(data);
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(8, 8);
  h.writeUInt32LE(c, 14); h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(name.length, 26);
  locals.push(h, name, comp);
  const e = Buffer.alloc(46);
  e.writeUInt32LE(0x02014b50, 0); e.writeUInt16LE(20, 4); e.writeUInt16LE(20, 6); e.writeUInt16LE(8, 10);
  e.writeUInt32LE(c, 16); e.writeUInt32LE(comp.length, 20); e.writeUInt32LE(data.length, 24); e.writeUInt16LE(name.length, 28); e.writeUInt32LE(offset, 42);
  central.push(e, name);
  offset += 30 + name.length + comp.length;
}
const cd = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.concat([...locals, cd, end]));
console.log(path.relative(process.cwd(), out), files.length + ' files', Math.round(fs.statSync(out).size / 1024) + ' KB');
