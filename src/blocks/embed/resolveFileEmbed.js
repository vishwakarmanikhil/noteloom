import { genId } from '../../utils/idGen.js';

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function kindForMimeType(mimeType) {
  if (mimeType?.startsWith('image/')) return 'image';
  if (mimeType?.startsWith('video/')) return 'video';
  if (mimeType?.startsWith('audio/')) return 'audio';
  return 'file';
}

/**
 * Resolves a raw `File` to `{ src, name, mimeType }` — a `data:` URL (or
 * wherever `uploadFile` sends it) — same `uploadFile`/`maxFileSize`
 * contract as `useFileUpload`'s own doc comment. This is the ONE place
 * that actually does that resolution; both `EmbedBlock`'s own upload
 * dropzone/file-input/drag-drop AND `useClipboardHandlers`' "paste an
 * image straight from the clipboard" path call through here, so a host's
 * configured `uploadFile`/`maxFileSize` behaves identically no matter
 * which of those triggered it.
 *
 * `kind` is passed in rather than derived from `file.type` here — an
 * existing `EmbedBlock` instance already has its own fixed kind (e.g. an
 * "image" block stays "image" for its whole lifetime, even if someone
 * drops a mismatched file type into it — HTML5 drag/drop doesn't enforce
 * an `accept` filter), so callers with an existing block pass that block's
 * own kind through unchanged. `resolveFileToEmbedInsert` (below), which
 * has no pre-existing block to take a kind from, derives it from the
 * file's own `type` instead via `kindForMimeType`.
 *
 * Throws (with a human-readable `.message`) on an oversized file (no
 * `uploadFile` configured) or a rejected `uploadFile` call — callers
 * decide how to surface that (EmbedBlock shows it inline; a multi-file
 * paste skips just the failed one and keeps the rest, see
 * useClipboardHandlers).
 */
export async function resolveFileToSrc(file, { uploadFile, maxFileSize, kind }) {
  if (uploadFile) {
    const result = await uploadFile(file, { kind });
    return {
      src: result.src,
      name: result.name ?? file.name,
      mimeType: result.mimeType ?? file.type,
    };
  }
  if (maxFileSize && file.size > maxFileSize) {
    throw new Error(
      `This file is ${formatBytes(file.size)} — larger than the ${formatBytes(maxFileSize)} limit.`,
    );
  }
  const src = await readFileAsDataURL(file);
  return { src, name: file.name, mimeType: file.type };
}

/**
 * Same resolution as `resolveFileToSrc`, packaged as a ready-to-insert
 * `{ block, runs, subtreeBlocks }` — the shape every clipboard/paste
 * insertion path already expects (see `insertBlock`/`deserializeClipboard`
 * call sites). `kind` is derived from the file's own `type` (see its own
 * doc comment on `resolveFileToSrc` for why that differs from EmbedBlock's
 * own call site) — used by `useClipboardHandlers`' file-paste path, which
 * has no pre-existing embed block to inherit a kind from.
 */
export async function resolveFileToEmbedInsert(file, uploadConfig) {
  const kind = kindForMimeType(file.type);
  const { src, name, mimeType } = await resolveFileToSrc(file, { ...uploadConfig, kind });
  return {
    block: {
      id: genId(),
      type: 'embed',
      parentId: null,
      contentIds: [],
      props: { kind, src, name, mimeType, align: 'left', width: 100 },
    },
    runs: [],
    subtreeBlocks: [],
  };
}
