import { domInlineToRuns } from '../inline/runOps.js';
import { genId } from '../utils/idGen.js';

export function textToParagraphs(text) {
  return text
    .split(/\r\n|\r|\n/)
    .filter((line) => line.length > 0)
    .map((line) => {
      const runId = genId();
      return {
        block: { id: genId(), type: 'paragraph', parentId: null, contentIds: [runId], props: {} },
        runs: [{ id: runId, type: 'text', value: line, marks: {} }],
      };
    });
}

/**
 * Parses an HTML string and walks its top-level nodes, dispatching each to
 * whichever registered block type's `fromHTML` claims it (first match
 * wins). `<ul>/<ol>` are handled specially here rather than via a matcher,
 * since there's no standalone "list" block type in this model — only
 * `listItem` blocks carrying an `ordered` flag, one per `<li>`.
 */
export function walkDomToBlocks(html, registry, inlineRegistry) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const ctx = { registry, inlineRegistry };
  const matchers = registry.listHtmlMatchers();
  const results = [];

  const consumeList = (listNode) => {
    const ordered = listNode.tagName === 'OL';
    const items = [];
    for (const li of listNode.children) {
      if (li.tagName !== 'LI') continue;
      const result = registry.get('listItem')?.fromHTML(li, ctx);
      if (result) {
        result.block.props.ordered = ordered;
        items.push(result);
      }
    }
    return items;
  };

  /**
   * A <blockquote> with several nested <p>s (a multi-line quote, matching
   * what serializeHTML's own grouping now emits) becomes one sibling
   * `blockquote` block per <p> — this model keeps multi-line quotes as
   * separate leaf siblings rather than one container block. A <blockquote>
   * with no nested <p> at all (plain external HTML, just inline content
   * directly inside it) falls back to the registered single-block fromHTML.
   */
  const consumeBlockquote = (bqNode) => {
    const paragraphs = Array.from(bqNode.children).filter((c) => c.tagName === 'P');
    if (paragraphs.length === 0) {
      const result = registry.get('blockquote')?.fromHTML(bqNode, ctx);
      return result ? [result] : [];
    }
    return paragraphs.map((p) => {
      const runs = domInlineToRuns(p, ctx);
      return {
        block: { id: genId(), type: 'blockquote', parentId: null, contentIds: runs.map((r) => r.id), props: {} },
        runs,
      };
    });
  };

  for (const node of doc.body.childNodes) {
    if (node.nodeType === 3 /* TEXT_NODE */) {
      const text = node.textContent.trim();
      if (text) results.push(...textToParagraphs(text));
      continue;
    }
    if (node.nodeType !== 1 /* ELEMENT_NODE */) continue;

    if (node.tagName === 'UL' || node.tagName === 'OL') {
      results.push(...consumeList(node));
      continue;
    }

    if (node.tagName === 'BLOCKQUOTE') {
      results.push(...consumeBlockquote(node));
      continue;
    }

    let matched = null;
    for (const entry of matchers) {
      const result = entry.fromHTML(node, ctx);
      if (result) {
        matched = result;
        break;
      }
    }

    if (matched) {
      results.push(matched);
    } else if (node.textContent.trim()) {
      const runs = domInlineToRuns(node, ctx);
      results.push({
        block: { id: genId(), type: 'paragraph', parentId: null, contentIds: runs.map((r) => r.id), props: {} },
        runs,
      });
    }
  }

  return results;
}
