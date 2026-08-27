/**
 * Pattern-based URL → iframe-embed-URL resolution for a handful of common
 * providers — deliberately NOT a real oEmbed client (no network fetch, no
 * discovery/autodiscovery, no provider metadata like title/thumbnail).
 * Every provider here has a stable, documented iframe embed URL shape that
 * can be derived from the original URL alone, so this stays true to the
 * package's zero-runtime-dependency, no-backend design — same reasoning as
 * `uploadFile` being optional rather than baking in a fetch call.
 *
 * Returns `{ provider, embedUrl }` on a match, `null` otherwise. Order
 * matters only in that more specific patterns should precede more general
 * ones; today's list has no such overlap.
 */
const PROVIDERS = [
  {
    name: 'youtube',
    test: /(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([\w-]{6,})/,
    embed: (m) => `https://www.youtube.com/embed/${m[1]}`,
  },
  {
    name: 'vimeo',
    test: /vimeo\.com\/(?:video\/)?(\d+)/,
    embed: (m) => `https://player.vimeo.com/video/${m[1]}`,
  },
  {
    name: 'loom',
    test: /loom\.com\/share\/([\w-]+)/,
    embed: (m) => `https://www.loom.com/embed/${m[1]}`,
  },
  {
    name: 'figma',
    test: /figma\.com\/(?:file|design|proto)\/[\w-]+/,
    embed: (_m, url) =>
      `https://www.figma.com/embed?embed_host=noteloom&url=${encodeURIComponent(url)}`,
  },
  {
    name: 'codepen',
    test: /codepen\.io\/([\w-]+)\/pen\/([\w-]+)/,
    embed: (m) => `https://codepen.io/${m[1]}/embed/${m[2]}?default-tab=result`,
  },
  {
    name: 'spotify',
    test: /open\.spotify\.com\/(track|album|playlist|episode|show)\/([\w]+)/,
    embed: (m) => `https://open.spotify.com/embed/${m[1]}/${m[2]}`,
  },
];

export function resolveOEmbedUrl(rawUrl) {
  if (!rawUrl) return null;
  for (const provider of PROVIDERS) {
    const match = rawUrl.match(provider.test);
    if (match) return { provider: provider.name, embedUrl: provider.embed(match, rawUrl) };
  }
  return null;
}
