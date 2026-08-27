/**
 * Word-level LCS diff between two strings. Not a full Myers diff, but
 * version-history edits are typically a handful of scattered word changes
 * inside otherwise-unchanged paragraphs, so this is enough to render
 * accurate insertions/deletions instead of just "this whole block changed."
 * Whitespace runs are kept as their own tokens so re-joining segments
 * reproduces the original spacing exactly.
 */
export function diffWords(oldText, newText) {
  const oldTokens = tokenize(oldText);
  const newTokens = tokenize(newText);
  const n = oldTokens.length;
  const m = newTokens.length;

  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] =
        oldTokens[i] === newTokens[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const segments = [];
  const push = (type, text) => {
    const last = segments[segments.length - 1];
    if (last && last.type === type) last.text += text;
    else segments.push({ type, text });
  };

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldTokens[i] === newTokens[j]) {
      push('equal', oldTokens[i]);
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push('removed', oldTokens[i]);
      i += 1;
    } else {
      push('added', newTokens[j]);
      j += 1;
    }
  }
  while (i < n) {
    push('removed', oldTokens[i]);
    i += 1;
  }
  while (j < m) {
    push('added', newTokens[j]);
    j += 1;
  }
  return segments;
}

function tokenize(text) {
  return (text ?? '').match(/\s+|[^\s]+/g) ?? [];
}

const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}

/**
 * Flattens a DocumentJSON into an ordered list of its text-bearing blocks
 * (paragraphs, headings, list items, ...), keyed by block id. Only blocks
 * whose content resolves directly to text runs are collected -- container
 * blocks (page, columns, ...) are walked through but not themselves
 * represented, matching how they render (no text of their own to diff).
 */
function extractTextBlocks(doc) {
  const blockById = new Map(doc.blocks.map((b) => [b.id, b]));
  const runById = new Map(doc.runs.map((r) => [r.id, r]));
  const result = [];

  const textFromRunIds = (ids) => ids.map((id) => runById.get(id)?.value ?? '').join('');

  const walk = (id) => {
    const block = blockById.get(id);
    if (!block) return;
    const titleRunIds = block.props?.titleRunIds;
    if (Array.isArray(titleRunIds) && titleRunIds.length > 0) {
      result.push({ id, text: textFromRunIds(titleRunIds) });
    } else if (block.contentIds.length > 0 && block.contentIds.every((cid) => runById.has(cid))) {
      result.push({ id, text: textFromRunIds(block.contentIds) });
    }
    for (const childId of block.contentIds) {
      if (!runById.has(childId)) walk(childId);
    }
  };
  walk(doc.rootId);
  return result;
}

const EMPTY_DOC = {
  rootId: 'root',
  blocks: [{ id: 'root', type: 'page', parentId: null, contentIds: [], props: {} }],
  runs: [],
};

/**
 * Renders an HTML diff of `nextDoc` against `prevDoc` (Google Docs-style
 * "show changes" view) -- blocks that only exist in `nextDoc` render fully
 * highlighted as added, blocks that only existed in `prevDoc` render fully
 * struck-through as removed (appended after the surviving blocks, since
 * this is about surfacing *what* changed, not reproducing exact block
 * reordering), and blocks present in both get word-level diffed. Pass
 * `null`/`undefined` as `prevDoc` for "this is the first version" (everything
 * shows as added).
 */
export function diffDocumentsHTML(prevDoc, nextDoc) {
  const prevBlocks = extractTextBlocks(prevDoc ?? EMPTY_DOC);
  const nextBlocks = extractTextBlocks(nextDoc ?? EMPTY_DOC);
  const prevById = new Map(prevBlocks.map((b) => [b.id, b]));
  const nextIds = new Set(nextBlocks.map((b) => b.id));

  const parts = [];

  for (const block of nextBlocks) {
    const prevBlock = prevById.get(block.id);
    if (!prevBlock) {
      const text = escapeHtml(block.text) || '&nbsp;';
      parts.push(
        `<p class="be-version-diff-block"><span class="be-version-diff-added">${text}</span></p>`,
      );
      continue;
    }
    if (prevBlock.text === block.text) {
      parts.push(`<p class="be-version-diff-block">${escapeHtml(block.text) || '&nbsp;'}</p>`);
      continue;
    }
    const segments = diffWords(prevBlock.text, block.text);
    const html = segments
      .map((seg) => {
        const escaped = escapeHtml(seg.text);
        if (seg.type === 'added') return `<span class="be-version-diff-added">${escaped}</span>`;
        if (seg.type === 'removed')
          return `<span class="be-version-diff-removed">${escaped}</span>`;
        return escaped;
      })
      .join('');
    parts.push(`<p class="be-version-diff-block">${html}</p>`);
  }

  for (const block of prevBlocks) {
    if (!nextIds.has(block.id)) {
      const text = escapeHtml(block.text) || '&nbsp;';
      parts.push(
        `<p class="be-version-diff-block"><span class="be-version-diff-removed">${text}</span></p>`,
      );
    }
  }

  if (parts.length === 0) return '<p class="be-version-diff-empty">No text changes.</p>';
  return parts.join('');
}
