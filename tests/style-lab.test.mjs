import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {STYLE_PRESETS,installStyleLab} from '../src/style-lab.js';
test('Style lab exposes exactly ten numbered executable directions',()=>{assert.deepEqual(STYLE_PRESETS.map(p=>p.id),Array.from({length:10},(_,i)=>String(i+1).padStart(2,'0')));assert.ok(STYLE_PRESETS.every(p=>p.name&&p.note&&p.kind));});
test('Style installation refuses live gameplay and remains lazy inside the review branch',()=>{
 assert.throws(()=>installStyleLab({}, {reviewReady:false}, '01'),/restricted/);
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');const review=html.slice(html.indexOf("if (params.has('review'))"));assert.ok(review.includes("if (params.has('style'))"));assert.ok(review.indexOf("import('./src/style-lab.js')")<review.indexOf('game.showTitle()'));
});
test('Published style captures cover both scenes for every preset without recorded GPU or page errors',()=>{
 const data=JSON.parse(fs.readFileSync(new URL('../assets/style-lab/validation.json',import.meta.url),'utf8'));assert.equal(data.length,20);
 for(const p of STYLE_PRESETS)for(const scene of ['bethlehem','nathan']){const rows=data.filter(x=>x.style===p.id&&x.chapter===scene);assert.equal(rows.length,1);assert.deepEqual(rows[0].errors,[]);assert.ok(rows[0].render.calls>0);assert.ok(rows[0].render.triangles>1000);}
});
