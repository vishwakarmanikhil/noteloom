import { CodeBlock } from './CodeBlock.jsx';
import { runToHTML, runToPlainText, escapeHTML } from '../../inline/marks.js';
import { genId } from '../../utils/idGen.js';
import { trimSlashQueryAndInsertAfter } from '../shared/blockCommands.js';
import { createTextLeafBlock } from '../shared/leafBlockFactory.js';
import { CodeIcon } from '../../react/icons.jsx';

function toHTML(block, ctx) {
  const runs = block.contentIds.map((runId) => ctx.store.getRun(runId));
  const language = block.props?.language;
  const langAttr = language && language !== 'plaintext' ? ` data-language="${escapeHTML(language)}"` : '';
  return `<pre><code${langAttr}>${runs.map((r) => runToHTML(r, ctx)).join('')}</code></pre>`;
}

function toPlainText(block, ctx) {
  return block.contentIds.map((runId) => runToPlainText(ctx.store.getRun(runId), ctx)).join('');
}

function fromHTML(node, ctx) {
  if (node.tagName !== 'PRE') return null;
  const codeEl = node.querySelector('code') ?? node;
  const language = codeEl.getAttribute?.('data-language');
  const runId = genId();
  const block = {
    id: genId(),
    type: 'code',
    parentId: null,
    contentIds: [runId],
    props: language ? { language } : {},
  };
  return { block, runs: [{ id: runId, type: 'text', value: codeEl.textContent ?? '', marks: {} }] };
}

export const codeBlockType = {
  component: CodeBlock,
  isLeaf: true,
  defaultProps: { language: 'plaintext' },
  toHTML,
  toPlainText,
  fromHTML,
  slashCommand: {
    label: 'Code',
    icon: CodeIcon,
    keywords: ['code', 'codeblock', 'snippet', 'pre'],
    run: (store, ctx) => trimSlashQueryAndInsertAfter(store, ctx, createTextLeafBlock('code')),
  },
};
