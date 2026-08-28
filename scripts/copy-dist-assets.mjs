// Post-build: copy the assets Vite's library build doesn't emit itself —
// the default theme CSS and the hand-written .d.ts files (the main one plus
// one per subpath entry point). Run by `npm run build` after `vite build`.
import { copyFileSync, readdirSync } from 'node:fs';

copyFileSync('src/style.css', 'dist/style.css');

for (const file of readdirSync('src')) {
  if (file.endsWith('.d.ts')) {
    copyFileSync(`src/${file}`, `dist/${file}`);
  }
}

console.log('copied style.css and *.d.ts to dist/');
