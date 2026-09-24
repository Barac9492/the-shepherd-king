import test from 'node:test';import assert from 'node:assert/strict';import {renderPixelRatio} from '../src/render-budget.js';
test('Normal desktop and portrait mobile preserve existing native resolution',()=>{assert.equal(renderPixelRatio(1440,900,1),1);assert.equal(renderPixelRatio(390,844,3,true),1.5);});
test('Retina and 4K canvases stay within the fill-rate budget',()=>{for(const [w,h]of [[1440,900],[2560,1440],[3840,2160]]){const p=renderPixelRatio(w,h,2);assert.ok(p>0&&p<=1.75);assert.ok(w*h*p*p<=2600001);}});
