// Strict ZIP metadata validation BEFORE inflate. No external paths or executable ZIP metadata.
export const MAX_ZIP_BYTES = 30 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 120 * 1024 * 1024;
export const MAX_ENTRY_BYTES = 12 * 1024 * 1024;
export const MAX_FILES = 3000;
export const MAX_ARCHIVE_ENTRIES = 6000; // File + thư mục; tách khỏi giới hạn số file thực sự ghi
const u16 = (v, p) => v.getUint16(p, true);
const u32 = (v, p) => v.getUint32(p, true);
const encoder = new TextDecoder('utf-8', {fatal: false});

export function chatIdFromUrl(url) {
  try {
    const u = new URL(url);
    if (!['chatgpt.com', 'chat.openai.com'].includes(u.hostname) || u.protocol !== 'https:') return null;
    const m = u.pathname.match(/(?:^|\/)c\/([A-Za-z0-9-]{8,})(?:\/|$)/);
    return m ? m[1] : null;
  } catch { return null; }
}
export function safeChatId(id) { return typeof id === 'string' && /^[A-Za-z0-9-]{8,}$/.test(id); }
export function zipName(name) { return typeof name === 'string' && /\.zip$/i.test(name); }
export function basename(value) { return (String(value || '').split(/[\\/]/).pop() || '').trim(); }
export function isBlockedPath(path) {
  const p = path.toLowerCase().split('/');
  const dirs = ['.git', '.svn', '.hg', 'node_modules', '.next', '.nuxt', '.venv', 'venv', '.chatpatch-backups', '.lantern-backups', '.ssh', '.aws', '.config', '__macosx'];
  return p.some((s) => dirs.includes(s)) || p.some(s => /^\.env(?:\.|$)/i.test(s)) ||
    p.some(s => /\.(?:pem|key|p12|pfx|keystore|secret)$/i.test(s)) ||
    p.some(s => ['id_rsa', 'id_ed25519', '.ds_store', 'thumbs.db'].includes(s));
}
export function normalizedPath(raw) {
  if (typeof raw !== 'string' || !raw || raw.length > 1500 || raw.includes('\0') || raw.includes('\\')) throw new Error('Đường dẫn ZIP không hợp lệ');
  if (raw.startsWith('/') || raw.startsWith('~') || /^[A-Za-z]:/.test(raw)) throw new Error('ZIP chứa đường dẫn tuyệt đối');
  const parts = raw.split('/');
  if (parts.some(p => p === '..' || p === '.' || !p || p.endsWith('.') || /[<>:"|?*]/.test(p))) throw new Error('ZIP chứa đường dẫn không an toàn: ' + raw);
  return parts.join('/');
}
export function inspectZipHeaders(arrayBuffer) {
  if (!(arrayBuffer instanceof ArrayBuffer)) throw new Error('Dữ liệu ZIP không hợp lệ');
  if (arrayBuffer.byteLength > MAX_ZIP_BYTES) throw new Error('ZIP vượt giới hạn 30 MB');
  const view = new DataView(arrayBuffer);
  let end = -1;
  // Một EOCD ZIP hợp lệ có thể có comment (tối đa 65.535 byte).
  // Tìm ngược và yêu cầu commentLength khớp để không nhận nhầm chữ ký nằm trong dữ liệu.
  for (let i = view.byteLength - 22; i >= Math.max(0, view.byteLength - 65557); i--) {
    if (u32(view, i) === 0x06054b50 && i + 22 + u16(view, i+20) === view.byteLength) {end=i;break;}
  }
  if (end < 0) throw new Error('ZIP không có phần kết thúc hợp lệ (EOCD); file có thể tải chưa đủ hoặc không phải ZIP thật');
  const disk = u16(view,end+4), cdDisk = u16(view,end+6);
  const diskCount = u16(view,end+8), count = u16(view,end+10);
  const cdSize = u32(view,end+12), declaredOffset = u32(view,end+16);
  if (disk || cdDisk || diskCount !== count) throw new Error('ZIP nhiều phần/ổ đĩa không được hỗ trợ');
  if (count === 65535 || declaredOffset === 0xffffffff || cdSize === 0xffffffff) throw new Error('ZIP64 chưa được hỗ trợ');
  if (count > MAX_ARCHIVE_ENTRIES) throw new Error(`ZIP có ${count} mục (file + thư mục), vượt giới hạn ${MAX_ARCHIVE_ENTRIES} mục`);
  if (cdSize > end) throw new Error(`Bảng ZIP bị hỏng: kích thước Central Directory ${cdSize} vượt dữ liệu có sẵn`);
  // Một vài công cụ ZIP thêm phần mở đầu (self-extracting/preamble). Khi đó
  // cdOffset tính từ phần ZIP bên trong. Chỉ chấp nhận vị trí bù nếu chữ ký khớp.
  const validCentralAt = pos => pos >= 0 && pos + 4 <= end && u32(view,pos) === 0x02014b50;
  let cdOffset = declaredOffset;
  if (count > 0 && !validCentralAt(cdOffset)) {
    const alternate = end - cdSize;
    if (alternate >= declaredOffset && validCentralAt(alternate)) cdOffset = alternate;
    else throw new Error(`ZIP có Central Directory không hợp lệ (offset=${declaredOffset}, size=${cdSize}, file=${view.byteLength}, entries=${count})`);
  }
  const cdEnd = cdOffset + cdSize;
  if (cdEnd > end) throw new Error(`Bảng ZIP vượt quá phần dữ liệu lưu trữ (offset=${cdOffset}, size=${cdSize}, end=${end})`);
  const entries=[]; let offset=cdOffset, total=0;
  for (let i=0;i<count;i++) {
    if (offset + 46 > cdEnd || u32(view,offset) !== 0x02014b50) throw new Error(`ZIP Central Directory lỗi tại mục ${i+1}/${count}`);
    const flags=u16(view,offset+8), method=u16(view,offset+10);
    const compressed=u32(view,offset+20), uncompressed=u32(view,offset+24);
    const nameLen=u16(view,offset+28),extraLen=u16(view,offset+30),commentLen=u16(view,offset+32);
    const external=u32(view,offset+38), madeBy=view.getUint8(offset+5);
    if ((flags & 1) || ![0,8].includes(method)) throw new Error('ZIP mã hóa hoặc phương thức nén không được hỗ trợ');
    if (uncompressed > MAX_ENTRY_BYTES) throw new Error('File trong ZIP quá lớn');
    if (compressed && uncompressed / compressed > 600) throw new Error('ZIP có tỉ lệ nén bất thường');
    if (madeBy === 3 && ((external >>> 16) & 0xf000) === 0xa000) throw new Error('ZIP chứa symbolic link');
    const nameBytes=new Uint8Array(arrayBuffer,offset+46,nameLen), name=encoder.decode(nameBytes);
    offset += 46 + nameLen + extraLen + commentLen;
    if (offset > cdEnd) throw new Error(`ZIP metadata mục ${i+1} vượt giới hạn Central Directory`);
    const isDir=name.endsWith('/');
    if (!isDir) {
      const p=normalizedPath(name);
      entries.push({name:p, size:uncompressed});
      total+=uncompressed;
      if (total>MAX_TOTAL_BYTES) throw new Error('ZIP vượt 120 MB dữ liệu giải nén');
      if (entries.length>MAX_FILES) throw new Error(`ZIP có ${entries.length} file, vượt giới hạn ${MAX_FILES} file`);
    }
  }
  if (entries.length === 0) throw new Error('ZIP không chứa file');
  // Lỗi metadata được phân biệt rõ với giới hạn dung lượng và số lượng file.
  if (offset !== cdEnd) {
    // Cho phép chữ ký số Central Directory, không chấp nhận byte dư tùy ý.
    if (offset + 6 > cdEnd || u32(view,offset) !== 0x05054b50 || offset + 6 + u16(view,offset+4) !== cdEnd)
      throw new Error(`Bảng ZIP có ${cdEnd-offset} byte metadata không xác định`);
  }
  const unique = new Set();
  for (const item of entries) {const key=item.name.toLowerCase(); if (unique.has(key)) throw new Error('ZIP trùng đường dẫn: ' + item.name);unique.add(key);}
  return entries;
}
// A project ZIP may contain one extra packaging directory (e.g. "wikex-login/src/").
// Keep genuine source directories (e.g. "src/App.tsx") and already-existing
// destination subdirectories. Users can override automatic detection per chat.
const PROJECT_SUBDIRECTORIES = new Set([
  'src', 'app', 'apps', 'pages', 'components', 'public', 'assets', 'static',
  'images', 'img', 'fonts', 'icons', 'styles', 'css', 'js', 'lib', 'libs',
  'server', 'client', 'api', 'routes', 'utils', 'hooks', 'features',
  'tests', 'test', '__tests__', 'docs', 'examples', 'scripts',
  'config', 'configs', 'data', 'locales', 'translations', 'types',
  'dist', 'build', 'out', 'android', 'ios', 'native', 'packages',
  'database', 'migrations', 'prisma', 'web', 'mobile', 'backend', 'frontend',
  'resources', 'templates', 'views', 'storage', 'uploads'
]);
const comparable = s => String(s||'').toLowerCase().normalize('NFKC');
const compactName = s => comparable(s).replace(/[^a-z0-9]/g, '');

export function mapArchivePaths(entries, folderName, mode='auto', destinationNames=[]) {
  // Backwards compatibility: previous versions stored stripRoot:boolean per chat.
  if (mode === true) mode='always';
  if (mode === false || mode == null) mode='auto';
  if (!['auto','always','never'].includes(mode)) throw new Error('Chế độ cấu trúc ZIP không hợp lệ');
  // Ignore macOS ZIP metadata and secrets BEFORE checking for one shared root.
  const allowed=entries.filter(e=>!isBlockedPath(e.name));
  const first=allowed[0]?.name.split('/')[0];
  const allNested=!!first && allowed.every(e=>e.name.startsWith(first+'/'));
  const destination=new Set(destinationNames.map(comparable));
  const folderMatches=compactName(first)===compactName(folderName);
  const commonSourceFolder=PROJECT_SUBDIRECTORIES.has(comparable(first));
  const existingTopLevel=destination.has(comparable(first));
  const children=new Set(allowed.map(e=>comparable(e.name.slice((first||'').length+1).split('/')[0])));
  const manifestFiles=new Set(['package.json','cargo.toml','go.mod','pom.xml','composer.json','pyproject.toml','index.html','readme.md','pnpm-workspace.yaml','angular.json','vite.config.ts','next.config.js']);
  const looksLikeProject= [...children].some(c=>manifestFiles.has(c));
  const overlapsDestination=[...children].some(c=>destination.has(c));
  // By default: flatten a sole packaging directory unless it is clearly a
  // real project subdirectory. Never strip mixed/multiple top-level entries.
  const stripped=allNested && (mode==='always' || (mode==='auto' && (
    folderMatches || (!commonSourceFolder && (!existingTopLevel || looksLikeProject || overlapsDestination))
  )));
  const result=[];const seen=new Set();
  for (const entry of allowed) {
    const path=normalizedPath(stripped?entry.name.slice(first.length+1):entry.name);
    if (isBlockedPath(path)) continue;
    const lower=path.toLowerCase();
    if (seen.has(lower)) throw new Error('ZIP trùng đường dẫn sau xử lý: '+path);
    seen.add(lower);result.push({...entry,path});
  }
  if (!result.length) throw new Error('Không có file an toàn để cập nhật');
  return {files:result,stripped,wrapper:stripped?first:null,skipped:entries.length-result.length};
}
