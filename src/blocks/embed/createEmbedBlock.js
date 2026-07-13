import { genId } from '../../utils/idGen.js';

/**
 * factory(parentId) -> {block, runs} for a media embed — a pure "widget"
 * block with no runs at all (contentIds always []), same shape as divider:
 * `kind` is one of 'image' | 'video' | 'audio' | 'file'; `src` is either an
 * external URL or a data: URL (for a locally-uploaded file — see
 * EmbedBlock.jsx for why there's no upload-to-a-server path in a
 * zero-runtime-dependency package with no backend); `name` is the original
 * filename or the URL itself, used as download name / link text depending
 * on kind — deliberately NOT used as alt text (a raw filename like
 * "IMG_2481.HEIC" isn't a meaningful image description). `alt` is the
 * real, separately-authored description (image kind only — see
 * EmbedBlock's "Alt text" toolbar button), empty by default. `align`
 * ('left' | 'center' | 'right') positions the whole widget within the
 * line; `width` (a percentage, 20-100) is only meaningful for image/video
 * kinds — see EmbedBlock's resize handle.
 */
export function createEmbedBlock({
  kind = 'file',
  src = '',
  name = '',
  alt = '',
  mimeType = '',
  align = 'left',
  width = 100,
} = {}) {
  return function factory(parentId) {
    return {
      block: { id: genId(), type: 'embed', parentId, contentIds: [], props: { kind, src, name, alt, mimeType, align, width } },
      runs: [],
    };
  };
}
