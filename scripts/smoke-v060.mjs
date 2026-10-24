// v0.6.0 quick smoke - deform family + gradient tools compile cleanly
import { compile } from '../public/dssl/index.js';

const src = `
tokens { color { flame: #ff5533 } }

.card {
  bend: 20
  stretch: 1.2
  gradient: linear 135, color.flame -> #00d4ff
  gradient-flow: 6s alternate
}

.card:active {
  bend: 0
  stretch: 1 vertical
  fold: 18
}

.title { gradient-text: linear to right, color.flame, color.ok }
nav {
  bend-around: -24
  transition: 200 snap bend, 150 stretch
}
.fly { bend: 45deg }

motion bendy {
  from { bend: 0; stretch: 1 }
  to { bend: 30; stretch: 1.15 }
  at 50% { bend-y: -10 }
}
.loop { animate: bendy 900 infinite alternate }
`;

const r = compile(src, 'smoke.dssl');
console.log('ok:', r.ok);
for (const e of r.errors) console.log('ERR', e.line, e.message, '| hint:', e.hint || '');
const rule = (sel) => r.doc.rules.find(x => x.sel === sel);
const card = rule('.card');
console.log('\n.card decls:');
for (const d of card.decls) console.log(' ', d.prop, '=', typeof d.value === 'object' ? JSON.stringify(d.value) : d.value);
const active = rule('.card:active');
console.log('\n.card:active decls:');
for (const d of active.decls) console.log(' ', d.prop, '=', typeof d.value === 'object' ? JSON.stringify(d.value) : d.value);
const title = rule('.title');
console.log('\n.title decls:', title.decls.map(d => d.prop + '=' + d.value).join(' | '));
const nav = rule('nav');
console.log('\nnav decls:', nav.decls.map(d => d.prop + '=' + JSON.stringify(d.value)).join(' | '));
const loop = rule('.loop');
console.log('\n.loop @animate frames:', JSON.stringify(loop.decls[0].value.frames, null, 1));
const motion = Object.entries(r.doc.motions)[0];
console.log('\nmotion bendy parsed:', JSON.stringify(motion[1]._parsed, null, 1));
