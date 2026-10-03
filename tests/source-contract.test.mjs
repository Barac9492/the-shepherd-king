import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const src = fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const contracts=JSON.parse(fs.readFileSync(new URL('./gameplay-contracts.json',import.meta.url),'utf8'));
// Only the six translated reflection strings below may differ from the frozen
// chapter baseline. Restore them before hashing so gameplay drift still fails.
const audienceCopy = [
  [`What would holding nothing back in worship look like for you?`, `What would holding nothing back look like in our young adults\\' worship?`],
  [`하나님 앞에서 아무것도 아끼지 않고 예배한다는 것은 내 삶에서 어떤 모습일까요?`, `우리 청년부 예배에서 \\'아무것도 아끼지 않는 것\\'은 어떤 모습일까요?`],
  [`Who around you might be like the two hundred left at the brook, too tired to go on?`, `Who in our young adults group might be one of the two hundred left at the brook, too tired to go on?`],
  [`내 주변에 \\'브솔 시내에 남은 200명\\'처럼 지쳐서 뒤처진 사람은 누구일까요?`, `우리 청년부에서 \\'브솔 시내에 남은 200명\\'처럼 지쳐서 뒤처진 사람은 누구일까요?`],
  [`Is there someone around you living in a place like Lo-debar? How could you reach out?`, `Who in our group is living in a Lo-debar? Who could go and find them?`],
  [`내 주변에 로드발에 있는 것처럼 숨어 지내는 사람이 있나요? 내가 먼저 다가갈 수 있을까요?`, `우리 청년부에서 로드발에 있는 것 같은 사람은 누구일까요? 누가 찾아갈 수 있을까요?`],
];
function restoreApprovedCopy(source) {
  for (const [revised, original] of audienceCopy) {
    assert.equal(source.split(revised).length - 1, 1, `one approved occurrence: ${revised}`);
    source = source.replace(revised, original);
  }
  return source;
}
// User-requested harp smoothing is the ONLY gameplay exception. Pin both old and new bodies.
function restoreReviewedRhythm(source) {
  const start=source.indexOf('function rhythmGame(g, o) {'), end=source.indexOf('function dodge(g,',start);
  assert.ok(start>=0&&end>start);
  const actual=source.slice(start,end);
  assert.equal(crypto.createHash('sha256').update(actual).digest('hex'),'ceb35dfe0aecbc92fdeb9f80f4df1fdd138258714384824016f84c191ef46da6','exact reviewed rhythm function');
  const original=fs.readFileSync(new URL('./fixtures/rhythm-original.txt',import.meta.url),'utf8');
  assert.equal(crypto.createHash('sha256').update(original).digest('hex'),'f37ad019a745e2bd7e0b4213b62c57c8d2a4d5e17ccdd5e3631ec2cb6469a3c8','pinned original rhythm fixture');
  return source.slice(0,start)+original+source.slice(end);
}
function replaceReviewed(source, revised, original, label) {
  assert.equal(source.split(revised).length - 1, 1, `one reviewed ${label}`);
  return source.replace(revised, original);
}
function restoreReviewedLion(source) {
  source = replaceReviewed(source,
`    // lion
    S.lion = new Actor(g, makeQuadruped('lion', { scale: 1.05 }), DEN[0] + 4, DEN[1] - 4, -2.4); S.lion.m.root.visible = false;
    S.lionMarker = new T3.Mesh(new T3.OctahedronGeometry(0.42, 0), MAT.lionMarker); S.lionMarker.position.y = 3.25; S.lionMarker.renderOrder = 50; S.lion.m.root.add(S.lionMarker);`,
`    // lion
    S.lion = new Actor(g, makeQuadruped('lion', { scale: 1.05 }), DEN[0] + 4, DEN[1] - 4, -2.4); S.lion.m.root.visible = false;`, 'lion marker');
  source = replaceReviewed(source,
`    g.enableSling(true, 5, 5); g.aimSideOffset = -1.15; g.onChapterCleanup?.(() => { g.aimSideOffset = null; });
    g.setObjective({ en: 'Chase the lion and strike it with your sling', ko: '사자를 쫓아가 물매로 맞히기' }, '0 / 3');
    const foldExit = new V3(FOLD[0], 0, FOLD[1] + 6.4); S.lionGuideExit = true;
    g.setWaypoint(() => {
      if (S.lionGuideExit) {
        const P = g.player.pos;
        if (Math.hypot(P.x - foldExit.x, P.z - foldExit.z) < 3.2 || Math.hypot(P.x - FOLD[0], P.z - FOLD[1]) > 8.2) S.lionGuideExit = false;
        else return foldExit;
      }
      return lion.pos;
    }, { pos: () => lion.pos, label: { en: 'Lion', ko: '사자까지' } });
    const slingHelp = IS_TOUCH ? tr({ en: 'Hold the Sling button, drag to aim, let go to throw', ko: '물매 버튼을 누르고, 끌어서 조준하고, 떼서 던져요' }) : tr({ en: 'Hold the mouse button to swing the sling. Let go to throw.', ko: '마우스 버튼을 누르고 있으면 물매를 돌려요. 놓으면 던져요.' });
    g.toast(tr({ en: 'Leave through the south entrance and find the lion on the eastern hill', ko: '남쪽 출입구로 나가 동쪽 언덕의 사자를 찾아보세요' }), slingHelp, 7);`,
`    g.enableSling(true, 5, 5);
    g.setObjective({ en: 'Chase the lion and strike it with your sling', ko: '사자를 쫓아가 물매로 맞히기' }, '0 / 3');
    g.setWaypoint(() => lion.pos);
    g.toast(IS_TOUCH ? tr({ en: 'Hold the Sling button, drag to aim, let go to throw', ko: '물매 버튼을 누르고, 끌어서 조준하고, 떼서 던져요' }) : tr({ en: 'Hold the mouse button to swing the sling. Let go to throw.', ko: '마우스 버튼을 누르고 있으면 물매를 돌려요. 놓으면 던져요.' }), '', 5);`, 'lion route guidance');
  source = replaceReviewed(source,
`    S.lionMode = 'carry'; let flinch = 0;
    g.every(dt => {
      if (S.lionMode !== 'carry') return;
      S.lionMarker.rotation.y += dt * 2.4; S.lionMarker.position.y = 3.25 + Math.sin(g.time * 3) * 0.18;
      flinch -= dt; const P = g.player.pos, d = Math.hypot(P.x - lion.pos.x, P.z - lion.pos.z);
      if (flinch > 0) lion.stop();
      else if (d < 14) {
        let ax = lion.pos.x - P.x, az = lion.pos.z - P.z; const L = Math.hypot(ax, az) || 1; ax /= L; az /= L;
        const cx = lion.pos.x - DEN[0], cz = lion.pos.z - DEN[1]; const cd = Math.hypot(cx, cz); if (cd > 18) { ax -= cx / cd * 0.8; az -= cz / cd * 0.8; }
        lion.dest = new V3(lion.pos.x + ax * 3, 0, lion.pos.z + az * 3); lion.walkSpeed = d < 8 ? 3 : 1.8;
      } else if (lion.dest == null || Math.random() < 0.01) { lion.dest = new V3(DEN[0] + (Math.random() - 0.5) * 14, 0, DEN[1] + (Math.random() - 0.5) * 14); lion.walkSpeed = 1.2; }
    });
    const lp = new V3();
    g.targets.push({
      pos: () => lp.set(lion.pos.x, lion.pos.y + 0.9, lion.pos.z), r: 1.7, aimR: 2.8, aimRange: 65, ignoreAimGround: true, active: () => S.lionMode === 'carry',
      onHit: p => { S.lionHits++; flinch = 1; g.audio.sfx('hit'); g.audio.sfx('roar'); g.particles.emit(p, 18, { color: 0xffd28a, speed: 4, up: 0.6, life: 0.5, gravity: 4 }); g.setObjective({ en: 'Chase the lion and strike it with your sling', ko: '사자를 쫓아가 물매로 맞히기' }, \`\${S.lionHits} / 3\`); }
    });`,
`    S.lionMode = 'carry'; let flinch = 0;
    g.every(dt => {
      if (S.lionMode !== 'carry') return;
      flinch -= dt; const P = g.player.pos, d = Math.hypot(P.x - lion.pos.x, P.z - lion.pos.z);
      if (d < 22 || flinch > 0) {
        let ax = lion.pos.x - P.x, az = lion.pos.z - P.z; const L = Math.hypot(ax, az) || 1; ax /= L; az /= L;
        const cx = lion.pos.x - DEN[0], cz = lion.pos.z - DEN[1]; const cd = Math.hypot(cx, cz); if (cd > 18) { ax -= cx / cd * 0.8; az -= cz / cd * 0.8; }
        lion.dest = new V3(lion.pos.x + ax * 4, 0, lion.pos.z + az * 4); lion.walkSpeed = flinch > 0 ? 5 : d < 10 ? 3.6 : 2.2;
      } else if (lion.dest == null || Math.random() < 0.01) { lion.dest = new V3(DEN[0] + (Math.random() - 0.5) * 14, 0, DEN[1] + (Math.random() - 0.5) * 14); lion.walkSpeed = 1.2; }
    });
    const lp = new V3();
    g.targets.push({
      pos: () => lp.set(lion.pos.x, lion.pos.y + 0.9, lion.pos.z), r: 1.2, aimR: 1.7, active: () => S.lionMode === 'carry',
      onHit: p => { S.lionHits++; flinch = 1.2; g.audio.sfx('hit'); g.audio.sfx('roar'); g.particles.emit(p, 18, { color: 0xffd28a, speed: 4, up: 0.6, life: 0.5, gravity: 4 }); g.setObjective({ en: 'Chase the lion and strike it with your sling', ko: '사자를 쫓아가 물매로 맞히기' }, \`\${S.lionHits} / 3\`); }
    });`, 'lion evasion and targeting');
  return replaceReviewed(source,
`    S.lionMode = 'flee'; S.lionMarker.visible = false; lamb.st = 'graze'; lamb.a.ground = true; lamb.home = [lamb.a.pos.x, lamb.a.pos.z]; lamb.noFollow = false; lamb.t = 5; lamb.a.stop();
    g.audio.sfx('baa', 560); g.setWaypoint(null); g.aimSideOffset = null;`,
`    S.lionMode = 'flee'; lamb.st = 'graze'; lamb.a.ground = true; lamb.home = [lamb.a.pos.x, lamb.a.pos.z]; lamb.noFollow = false; lamb.t = 5; lamb.a.stop();
    g.audio.sfx('baa', 560); g.setWaypoint(null);`, 'lion completion cleanup');
}
for (const c of contracts) test(`${c.name} matches baseline apart from exact reviewed hooks and copy`,()=>{
  const start=src.indexOf(c.start),end=src.indexOf(c.end,start);
  assert.ok(start>=0&&end>start,`${c.name} boundaries exist`);
  let section=src.slice(start,end);
  if (c.name==='Chapters 1–9 rules and scenery') section=restoreReviewedRhythm(restoreReviewedLion(section));
  section=section.replace(/\n    \/\* graphics-lifecycle:start \*\/[\s\S]*?\/\* graphics-lifecycle:end \*\//g,'');
  if (c.name === 'Player motion, collisions and sling') {
    // Only these two presentation notifications may differ. Removing their
    // exact, single occurrences must recover the frozen physics/input body.
    for (const hook of ['this.gameplayCues?.hit(s); ', 'this.gameplayCues?.removed(s); ']) {
      assert.equal(section.split(hook).length - 1, 1, `one cue notification: ${hook}`);
      section = section.replace(hook, '');
    }
    section = replaceReviewed(section,
`      if (t.active && !t.active()) continue; const c = t.pos(); const targetDistance = o.distanceTo(c);
      const r = t.aimRange != null && targetDistance > t.aimRange ? t.r : (t.aimR ?? t.r);`,
`      if (t.active && !t.active()) continue; const c = t.pos(); const r = t.aimR ?? t.r;`, 'range-limited aim assist');
    section = replaceReviewed(section,
`    for (let s = 2; s < best; s += 0.5) { const x = o.x + dir.x * s, y = o.y + dir.y * s, z = o.z + dir.z * s; if (y < this.groundAt(x, z)) { best = s; if (!hit?.ignoreAimGround) hit = null; break; } }`,
`    for (let s = 2; s < best; s += 0.5) { const x = o.x + dir.x * s, y = o.y + dir.y * s, z = o.z + dir.z * s; if (y < this.groundAt(x, z)) { best = s; hit = null; break; } }`, 'slope-safe lion lock');
  }
  if (c.name === 'Chapter switching and progression') {
    // The approved detour happens only after the existing completion/save/card.
    // Restore this one exact branch, rather than replacing the frozen story hash.
    const detour = "if (r === 'challenge' && i === 0) this.slingChallenge.openFromStory(1);\n    else if (r === 'next')";
    assert.equal(section.split(detour).length - 1, 1, 'one chapter-one completion detour');
    section = section.replace(detour, "if (r === 'next')");
  }
  assert.equal(crypto.createHash('sha256').update(c.name==='Chapters 1–9 rules and scenery' ? restoreApprovedCopy(section) : section).digest('hex'),c.sha256);
});
test('the challenge card is optional, chapter-one-only and keeps next-story primary',()=>{
  assert.match(src,/first = mk\(tr\(STR.next\), 'primary'/);
  assert.match(src,/if \(idx === 0 && this.slingChallenge\) \{ const challenge = mk/);
  assert.match(src,/challenge.id = 'cChallenge'/);
  assert.match(src,/this.saveProgress\(i \+ 1\);[\s\S]*?await this.card\(ch, i, 'end'\);[\s\S]*?openFromStory\(1\)/);
});
test('Three.js and GLTFLoader are pinned locally, not dependent on CDN availability',()=>{
  assert.match(src,/import \* as THREE from '\.\/vendor\/three\.module\.js'/);
  assert.ok(!src.includes('cdn.jsdelivr.net'));
  assert.match(fs.readFileSync(new URL('../vendor/GLTFLoader.js',import.meta.url),'utf8'),/from '\.\/three\.module\.js'/);
});
test('Review harness does not save progress or invoke story',()=>{
  const review=fs.readFileSync(new URL('../src/review.js',import.meta.url),'utf8');
  assert.ok(!review.includes('saveProgress('));assert.ok(!review.includes('ch.run('));
  assert.match(review,/game\.paused\s*=\s*true/);
});

test('Only the two reviewed chapter cleanup hooks may differ from chapter baseline',()=>{
  const hooks=[...src.matchAll(/\/\* graphics-lifecycle:start \*\/([\s\S]*?)\/\* graphics-lifecycle:end \*\//g)].map(m=>m[1].trim());
  assert.deepEqual(hooks,[
    "g.onChapterCleanup?.(() => { cancel(); });",
    "g.onChapterCleanup?.(() => { over = true; removeEventListener('keydown', onKey); el.remove(); });"
  ]);
});
