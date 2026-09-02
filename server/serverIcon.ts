import { constants } from 'node:fs';
import { open } from 'node:fs/promises';

const MAX_ICON_BYTES = 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// The caller resolves this fixed filename inside the selected server's sandbox.
export async function readServerIcon(filename: string): Promise<string | null> {
  try {
    const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size < 33 || info.size > MAX_ICON_BYTES) return null;
      // Bounded read even if the file changes between stat and read.
      const buffer = Buffer.alloc(MAX_ICON_BYTES + 1);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
        if (!bytesRead) break;
        length += bytesRead;
      }
      const bytes = buffer.subarray(0, length);
      if (length < 33 || length > MAX_ICON_BYTES || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)
        || bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR') return null;
      const width = bytes.readUInt32BE(16); const height = bytes.readUInt32BE(20);
      if (width < 1 || width > 1024 || height < 1 || height > 1024) return null;
      return 'data:image/png;base64,' + bytes.toString('base64');
    } finally { await handle.close(); }
  } catch (error) {
    if (['ENOENT', 'EACCES', 'EPERM', 'ELOOP'].includes((error as NodeJS.ErrnoException).code ?? '')) return null;
    throw error;
  }
}
