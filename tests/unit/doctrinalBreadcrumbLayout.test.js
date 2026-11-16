import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync('src/App.vue','utf8');
test('long doctrinal paths wrap whole crumbs instead of shrinking CJK into vertical columns',()=>{
 const bar=app.match(/\.sticky-doctrinal-bar\s*\{([^}]+)\}/)?.[1];
 const crumb=app.match(/\.chain-crumb\s*\{([^}]+)\}/)?.[1];
 assert.ok(bar && /flex-wrap:\s*wrap/.test(bar));
 assert.ok(crumb && /flex-shrink:\s*0/.test(crumb));
 assert.match(crumb,/max-width:\s*100%/);
 assert.ok(app.includes('v-for="(node, idx) in activeTOCChain"'));
});
