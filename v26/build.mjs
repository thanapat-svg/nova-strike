import {build} from 'esbuild';
import fs from 'fs';
const r = await build({entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'iife', target: 'es2019', write: false, legalComments: 'none'});
const js = r.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const out = fs.readFileSync('template.html', 'utf8').replace('/*__JS__*/', () => js);
fs.writeFileSync(process.argv[2] || 'dist/index.html', out);
console.log('built', (out.length / 1024 | 0) + ' KB');
