import test from 'node:test';
import assert from 'node:assert/strict';
import { showStartupFailure } from '../src/webgl-startup.js';

class MockElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.attributes = new Map();
    this.events = new Map();
    this._text = '';
    this.hidden = false;
    this.id = '';
    this.className = '';
    this.type = '';
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(type, listener) { this.events.set(type, listener); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this._text = ''; this.children = [...children]; }
  click() { this.events.get('click')?.({ type: 'click' }); }
  focus() { this.ownerDocument.activeElement = this; }
}

function makeDocument() {
  const document = { activeElement: null };
  document.createElement = tag => new MockElement(tag, document);
  return document;
}

function descendants(element) {
  return [element, ...element.children.flatMap(descendants)];
}

function findAll(element, tagName) {
  return descendants(element).filter(node => node.tagName === tagName.toUpperCase());
}

function makeHarness({ code = 'GL_CONTEXT', lang = 'ko', navigator } = {}) {
  const document = makeDocument();
  const container = new MockElement('div', document);
  const calls = { reload: 0, assign: 0 };
  const location = {
    href: 'https://example.test/play?chapter=4&lang=ko#checkpoint',
    reload() { calls.reload++; },
    assign() { calls.assign++; },
  };
  const panel = showStartupFailure({
    container,
    error: { code, message: 'secret=must-not-render' },
    lang,
    location,
    navigator,
  });
  return { document, container, location, calls, panel };
}

const iphoneNavigator = {
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
  platform: 'iPhone',
  maxTouchPoints: 5,
};

const ipadDesktopNavigator = {
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
  platform: 'MacIntel',
  maxTouchPoints: 5,
};

const desktopNavigator = {
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/128 Safari/537.36',
  platform: 'Linux x86_64',
  maxTouchPoints: 0,
};

test('iOS GL_CONTEXT shows advisory Safari help without claiming a detected mode', () => {
  const { container, calls, panel } = makeHarness({ navigator: iphoneNavigator });
  const buttons = findAll(panel, 'button');
  const walkthrough = descendants(panel).find(node => node.id === 'iphone-startup-guidance');
  const details = findAll(panel, 'details')[0];

  assert.match(container.textContent, /현재 브라우저에서 3D 화면을 열지 못했어요/);
  assert.deepEqual(buttons.map(button => button.textContent), [
    'Safari 설정 확인',
    '다시 시도',
    '다시 시도',
  ]);
  assert.equal(buttons[0].className, 'btn primary');
  assert.equal(buttons[0].getAttribute('aria-controls'), walkthrough.id);
  assert.equal(buttons[0].getAttribute('aria-expanded'), 'false');
  assert.equal(walkthrough.hidden, true);
  assert.equal(details.getAttribute('open'), null);
  assert.equal(calls.reload, 0);
  assert.equal(calls.assign, 0);
  assert.ok(!container.textContent.includes('감지'));
  assert.ok(!container.textContent.includes('켜져 있습니다'));
  assert.ok(!container.textContent.includes('secret=must-not-render'));
});

test('revealed guidance has two short conditional steps, trust warning, focus, and exact-URL retry', () => {
  const { document, container, location, calls, panel } = makeHarness({ navigator: iphoneNavigator });
  const buttons = findAll(panel, 'button');
  const reveal = buttons[0];
  const walkthrough = descendants(panel).find(node => node.id === 'iphone-startup-guidance');
  const walkthroughHeading = findAll(walkthrough, 'h2')[0];
  const initialActions = descendants(panel).find(node => node.className === 'startup-error__actions');
  const steps = findAll(walkthrough, 'li');
  const originalHref = location.href;

  reveal.click();
  assert.equal(calls.reload, 0);
  assert.equal(calls.assign, 0);
  assert.equal(initialActions.hidden, true);
  assert.equal(reveal.getAttribute('aria-expanded'), 'true');
  assert.equal(walkthrough.hidden, false);
  assert.equal(document.activeElement, walkthroughHeading);
  assert.equal(panel.getAttribute('aria-labelledby'), walkthroughHeading.id);
  assert.equal(walkthroughHeading.getAttribute('tabindex'), '-1');
  assert.equal(steps.length, 2);
  assert.match(steps[0].textContent, /페이지 메뉴.*웹 사이트 설정/);
  assert.match(steps[1].textContent, /켜져 있다면.*이 사이트에서만 끄세요/);
  assert.match(container.textContent, /신뢰하는 경우에만/);
  assert.match(container.textContent, /이 사이트의 보호가 줄어듭니다/);
  assert.match(container.textContent, /보호를 유지하려면.*다른 기기/);

  const finish = buttons[2];
  finish.click();
  assert.equal(calls.reload, 1);
  assert.equal(calls.assign, 0);
  assert.equal(location.href, originalHref);
  assert.match(location.href, /\?chapter=4&lang=ko#checkpoint$/);
});

test('iPad desktop user agent with touch receives the same Safari guidance', () => {
  const { panel } = makeHarness({ navigator: ipadDesktopNavigator, lang: 'en' });
  const buttons = findAll(panel, 'button');
  assert.equal(buttons[0].textContent, 'Check Safari settings');
  buttons[0].click();
  assert.match(panel.textContent, /If Lockdown Mode is on/);
  assert.match(panel.textContent, /this website only/);
});

test('desktop GL_CONTEXT gets one retry and no Lockdown guidance', () => {
  const { container, calls, panel } = makeHarness({ navigator: desktopNavigator });
  const buttons = findAll(panel, 'button');
  assert.deepEqual(buttons.map(button => button.textContent), ['다시 시도']);
  assert.ok(!container.textContent.includes('차단 모드'));
  assert.ok(!container.textContent.includes('Lockdown'));
  assert.equal(descendants(panel).some(node => node.id === 'iphone-startup-guidance'), false);
  assert.equal(calls.reload, 0);
  buttons[0].click();
  assert.equal(calls.reload, 1);
});

test('GAME_START on iPhone has no Lockdown mention and retries only on click', () => {
  const { container, calls, panel } = makeHarness({ code: 'GAME_START', navigator: iphoneNavigator, lang: 'en' });
  const buttons = findAll(panel, 'button');
  assert.deepEqual(buttons.map(button => button.textContent), ['Retry']);
  assert.match(container.textContent, /problem loading the game/);
  assert.ok(!container.textContent.includes('Lockdown'));
  assert.ok(!container.textContent.includes('Safari settings'));
  assert.equal(calls.reload, 0);
  buttons[0].click();
  assert.equal(calls.reload, 1);
});

test('unknown raw errors are never rendered into guidance or diagnostics', () => {
  const document = makeDocument();
  const container = new MockElement('div', document);
  showStartupFailure({
    container,
    error: new Error('apiKey=super-secret-value'),
    lang: 'ko',
    location: { href: 'https://example.test/', reload() {} },
    navigator: iphoneNavigator,
  });
  assert.match(container.textContent, /진단 코드: GAME_START/);
  assert.ok(!container.textContent.includes('super-secret-value'));
  assert.ok(!container.textContent.includes('차단 모드'));
});
