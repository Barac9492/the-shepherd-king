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
for (const c of contracts) test(`${c.name} matches baseline apart from exact reviewed hooks and copy`,()=>{
  const start=src.indexOf(c.start),end=src.indexOf(c.end,start);
  assert.ok(start>=0&&end>start,`${c.name} boundaries exist`);
  let section=(c.name==='Chapters 1–9 rules and scenery' ? restoreReviewedRhythm(src.slice(start,end)) : src.slice(start,end)).replace(/\n    \/\* graphics-lifecycle:start \*\/[\s\S]*?\/\* graphics-lifecycle:end \*\//g,'');
  if (c.name === 'Player motion, collisions and sling') {
    // Only these two presentation notifications may differ. Removing their
    // exact, single occurrences must recover the frozen physics/input body.
    for (const hook of ['this.gameplayCues?.hit(s); ', 'this.gameplayCues?.removed(s); ']) {
      assert.equal(section.split(hook).length - 1, 1, `one cue notification: ${hook}`);
      section = section.replace(hook, '');
    }
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
