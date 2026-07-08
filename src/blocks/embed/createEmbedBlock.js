import { genId } from '../../utils/idGen.js';

/**
 * factory(parentId) -> {block, runs} for a media embed — a pure "widget"
 * block with no runs at all (contentIds always []), same shape as divider:
 * `kind` is one of 'image' | 'video' | 'audio' | 'file'; `src` is either an
 * external URL or a data: URL (for a locally-uploaded file — see
 * EmbedBlock.jsx for why there's no upload-to-a-server path in a
 * zero-runtime-dependency package with no backend); `name` is the original
 * filename or the URL itself, used as alt text / download name / link text
 * depending on kind.
 */
export function createEmbedBlock({ kind = 'file', src = '', name = '', mimeType = '' } = {}) {
  return function factory(parentId) {
    return {
      block: { id: genId(), type: 'embed', parentId, contentIds: [], props: { kind, src, name, mimeType } },
      runs: [],
    };
  };
}
