/**
 * File System Access permission states. A saved handle is NOT necessarily a
 * saved permission: after restarting Chrome, its state can become `prompt`.
 * `requestPermission()` must be initiated directly from a user gesture in a
 * Window context (the side panel), never by the offscreen worker.
 */
export async function readPermissionState(handle, mode = 'read') {
  if (!handle) return 'missing';
  try {
    const state = await handle.queryPermission({mode});
    return ['granted','prompt','denied'].includes(state) ? state : 'error';
  } catch {
    return 'error';
  }
}

export function permissionLabel(state) {
  switch (state) {
    case 'granted': return 'Đã cấp quyền';
    case 'prompt': return 'Cần xác nhận lại';
    case 'denied': return 'Bị từ chối';
    case 'missing': return 'Thiếu liên kết';
    default: return 'Không kiểm tra được';
  }
}

export function firstRestorable(entries) {
  return entries.find(entry => entry.handle && entry.state !== 'granted') || null;
}

export function summarizePermissions(entries) {
  const granted = entries.filter(x=>x.state === 'granted').length;
  const missing = entries.filter(x=>x.state === 'missing').length;
  return {granted,total:entries.length,remaining:entries.length-granted,missing};
}
