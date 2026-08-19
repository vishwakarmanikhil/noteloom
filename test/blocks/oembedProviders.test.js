import { describe, it, expect } from 'vitest';
import { resolveOEmbedUrl } from '../../src/blocks/embed/oembedProviders.js';

describe('resolveOEmbedUrl', () => {
  it('resolves a youtube watch URL', () => {
    expect(resolveOEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
      provider: 'youtube',
      embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    });
  });

  it('resolves a youtu.be short link', () => {
    expect(resolveOEmbedUrl('https://youtu.be/dQw4w9WgXcQ')).toEqual({
      provider: 'youtube',
      embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    });
  });

  it('resolves a youtube shorts URL', () => {
    expect(resolveOEmbedUrl('https://www.youtube.com/shorts/abc123XYZ_-')).toEqual({
      provider: 'youtube',
      embedUrl: 'https://www.youtube.com/embed/abc123XYZ_-',
    });
  });

  it('resolves a vimeo URL', () => {
    expect(resolveOEmbedUrl('https://vimeo.com/76979871')).toEqual({
      provider: 'vimeo',
      embedUrl: 'https://player.vimeo.com/video/76979871',
    });
  });

  it('resolves a loom share link', () => {
    expect(resolveOEmbedUrl('https://www.loom.com/share/abcdef1234567890')).toEqual({
      provider: 'loom',
      embedUrl: 'https://www.loom.com/embed/abcdef1234567890',
    });
  });

  it('resolves a figma file link, embedding the original URL', () => {
    const result = resolveOEmbedUrl('https://www.figma.com/file/abc123/My-Design');
    expect(result.provider).toBe('figma');
    expect(result.embedUrl).toBe(
      'https://www.figma.com/embed?embed_host=noteloom&url=' + encodeURIComponent('https://www.figma.com/file/abc123/My-Design'),
    );
  });

  it('resolves a codepen pen link', () => {
    expect(resolveOEmbedUrl('https://codepen.io/someuser/pen/abCdEf')).toEqual({
      provider: 'codepen',
      embedUrl: 'https://codepen.io/someuser/embed/abCdEf?default-tab=result',
    });
  });

  it('resolves a spotify track link', () => {
    expect(resolveOEmbedUrl('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT')).toEqual({
      provider: 'spotify',
      embedUrl: 'https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT',
    });
  });

  it('returns null for a URL that matches no known provider', () => {
    expect(resolveOEmbedUrl('https://example.com/some-page')).toBeNull();
  });

  it('returns null for empty/undefined input', () => {
    expect(resolveOEmbedUrl('')).toBeNull();
    expect(resolveOEmbedUrl(undefined)).toBeNull();
  });
});
