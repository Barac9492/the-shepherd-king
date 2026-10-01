import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameRenderer, showStartupFailure } from '../src/webgl-startup.js';

function makeContext(name) {
  const state = { lost: 0 };
  return {
    name,
    state,
    getExtension(extension) {
      return extension === 'WEBGL_lose_context'
        ? { loseContext: () => { state.lost++; } }
        : null;
    },
  };
}

function makeCanvas(handler) {
  const state = { calls: [], canvases: [], replacements: [] };
  class MockCanvas {
    constructor() {
      this.width = 960;
      this.height = 540;
      this.listeners = new Map();
      this.index = state.canvases.length;
      state.canvases.push(this);
    }
    cloneNode() { return new MockCanvas(); }
    addEventListener(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(listener);
    }
    removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
    getContext(type, attributes) {
      const call = { canvas: this, type, attributes };
      state.calls.push(call);
      return handler(call, state.calls.length - 1);
    }
  }
  const canvas = new MockCanvas();
  const parent = {
    replaceChild(next, previous) {
      assert.equal(previous, canvas);
      state.replacements.push({ next, previous });
      next.parentNode = parent;
      previous.parentNode = null;
    },
  };
  canvas.parentNode = parent;
  return { canvas, state };
}

function makeThree(behavior = () => {}) {
  const calls = [];
  class WebGLRenderer {
    constructor(options) {
      calls.push(options);
      behavior(options, calls.length - 1);
      this.options = options;
      this.disposeCount = 0;
    }
    setClearAlpha(value) { this.clearAlpha = value; }
    dispose() { this.disposeCount++; }
  }
  return { THREE: { WebGLRenderer }, calls };
}

function assertNoCreationListeners(state) {
  for (const canvas of state.canvases) {
    assert.equal(canvas.listeners.get('webglcontextcreationerror')?.size || 0, 0);
  }
}

const normalAttributes = {
  alpha: true,
  depth: true,
  premultipliedAlpha: true,
  preserveDrawingBuffer: false,
  failIfMajorPerformanceCaveat: false,
  antialias: true,
  stencil: true,
  powerPreference: 'high-performance',
};

const compatibilityAttributes = {
  alpha: false,
  depth: true,
  premultipliedAlpha: true,
  preserveDrawingBuffer: false,
  failIfMajorPerformanceCaveat: false,
  antialias: false,
  stencil: false,
  powerPreference: 'default',
};

test('a webgl2 exception is isolated and the acquired webgl context is reused', () => {
  const context = makeContext('webgl');
  const { canvas, state } = makeCanvas(({ type }) => {
    if (type === 'webgl2') throw new Error('driver detail must stay private');
    if (type === 'webgl') return context;
    return null;
  });
  const { THREE, calls } = makeThree();
  const result = createGameRenderer({ THREE, canvas });

  assert.deepEqual(state.calls.map(call => call.type), ['webgl2', 'webgl']);
  assert.deepEqual(state.calls[1].attributes, normalAttributes);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].context, context);
  assert.equal(calls[0].canvas, state.calls[1].canvas);
  assert.deepEqual({ ...calls[0], canvas: undefined, context: undefined }, {
    ...normalAttributes, canvas: undefined, context: undefined,
  });
  assert.equal(result.canvas, calls[0].canvas);
  assert.equal(result.compatibility, false);
  assert.equal(result.diagnostic, 'STANDARD');
  assert.equal(state.replacements.length, 1);
  assertNoCreationListeners(state);
});

test('exceptions from later context APIs do not stop the final API attempt', () => {
  const context = makeContext('experimental');
  const { canvas, state } = makeCanvas(({ type }) => {
    if (type === 'webgl2') return null;
    if (type === 'webgl') throw new Error('webgl failed');
    return context;
  });
  const { THREE } = makeThree();
  const result = createGameRenderer({ THREE, canvas });
  assert.equal(result.renderer.options.context, context);
  assert.deepEqual(state.calls.map(call => call.type), ['webgl2', 'webgl', 'experimental-webgl']);
  assertNoCreationListeners(state);
});

test('all-null context creation is bounded and reports GL_CONTEXT safely', () => {
  const { canvas, state } = makeCanvas(() => null);
  const { THREE, calls } = makeThree();
  assert.throws(
    () => createGameRenderer({ THREE, canvas }),
    error => {
      assert.equal(error.code, 'GL_CONTEXT');
      assert.equal(error.attempts.length, 6);
      assert.deepEqual(error.attempts.map(a => a.api), [
        'webgl2', 'webgl', 'experimental-webgl',
        'webgl2', 'webgl', 'experimental-webgl',
      ]);
      assert.ok(error.attempts.every(a => ['normal', 'compatibility'].includes(a.profile)));
      assert.ok(error.attempts.every(a => a.result === 'null'));
      return true;
    },
  );
  assert.equal(calls.length, 0);
  assert.equal(state.replacements.length, 0);
  assertNoCreationListeners(state);
});

test('normal failure falls back to the compatibility profile', () => {
  const context = makeContext('safe-webgl2');
  const { canvas, state } = makeCanvas(({ attributes }) => attributes.antialias ? null : context);
  const { THREE, calls } = makeThree();
  const result = createGameRenderer({ THREE, canvas, touch: false });

  assert.deepEqual(state.calls.slice(0, 3).map(call => call.type), ['webgl2', 'webgl', 'experimental-webgl']);
  assert.deepEqual(state.calls[3].attributes, compatibilityAttributes);
  assert.equal(calls[0].context, context);
  assert.equal(result.compatibility, true);
  assert.equal(result.diagnostic, 'COMPATIBILITY');
  assertNoCreationListeners(state);
});

test('touch keeps the normal profile but requests default power preference', () => {
  const context = makeContext('touch');
  const { canvas, state } = makeCanvas(() => context);
  const { THREE } = makeThree();
  const result = createGameRenderer({ THREE, canvas, touch: true });

  assert.equal(result.compatibility, false);
  assert.deepEqual(state.calls[0].attributes, {
    ...normalAttributes,
    powerPreference: 'default',
  });
  assertNoCreationListeners(state);
});

test('forceCompatibility starts directly with the safe profile', () => {
  const context = makeContext('forced');
  const { canvas, state } = makeCanvas(() => context);
  const { THREE } = makeThree();
  const result = createGameRenderer({ THREE, canvas, forceCompatibility: true });

  assert.equal(state.calls.length, 1);
  assert.deepEqual(state.calls[0].attributes, compatibilityAttributes);
  assert.equal(result.compatibility, true);
  assert.equal(result.diagnostic, 'COMPATIBILITY_FORCED');
  assert.equal(result.renderer.clearAlpha, 1);
  assert.equal(result.canvas, canvas);
  assert.equal(state.replacements.length, 0);
  assertNoCreationListeners(state);
});

test('renderer failure releases its context and retries on a fresh canvas', () => {
  const contexts = [];
  const { canvas, state } = makeCanvas(({ type }) => {
    const context = makeContext(type);
    contexts.push(context);
    return context;
  });
  const { THREE, calls } = makeThree((_, index) => {
    if (index === 0) throw new Error('renderer internals');
  });
  const result = createGameRenderer({ THREE, canvas });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].canvas, canvas);
  assert.notEqual(calls[1].canvas, canvas);
  assert.equal(calls[1].canvas, result.canvas);
  assert.equal(calls[0].context, contexts[0]);
  assert.equal(calls[1].context, contexts[1]);
  assert.equal(contexts[0].state.lost, 1);
  assert.equal(contexts[1].state.lost, 0);
  assert.equal(state.replacements.length, 1);
  assert.equal(state.replacements[0].next, result.canvas);
  assertNoCreationListeners(state);
});

test('renderer-only failures report RENDERER_INIT and release every context', () => {
  const contexts = [];
  const { canvas, state } = makeCanvas(({ type }) => {
    const context = makeContext(type);
    contexts.push(context);
    return context;
  });
  const { THREE } = makeThree(() => { throw new Error('secret renderer message'); });
  assert.throws(
    () => createGameRenderer({ THREE, canvas }),
    error => {
      assert.equal(error.code, 'RENDERER_INIT');
      assert.equal(error.attempts.length, 6);
      assert.ok(error.attempts.every(a => a.result === 'renderer'));
      assert.ok(!JSON.stringify(error.attempts).includes('secret'));
      return true;
    },
  );
  assert.ok(contexts.every(context => context.state.lost === 1));
  assert.equal(state.replacements.length, 0);
  assertNoCreationListeners(state);
});

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

test('failure UI keeps renderer diagnostics fixed and private', () => {
  const document = makeDocument();
  const container = new MockElement('div', document);
  const location = { href: 'https://example.test/game', reload() {} };
  const panel = showStartupFailure({
    container,
    error: new Error('token=do-not-render-this'),
    lang: 'en',
    location,
    navigator: { userAgent: 'Desktop', platform: 'Linux', maxTouchPoints: 0 },
  });

  assert.equal(container.getAttribute('data-startup-error'), '');
  assert.equal(panel.className, 'startup-error');
  assert.equal(panel.getAttribute('role'), 'alert');
  assert.equal(panel.getAttribute('aria-labelledby'), 'startup-error-title');
  assert.match(container.textContent, /The game could not start/);
  assert.match(container.textContent, /Diagnostic code: GAME_START/);
  assert.ok(!container.textContent.includes('do-not-render-this'));
  assert.equal(descendants(panel).filter(element => element.tagName === 'DETAILS').length, 1);
});

test('renderer initialization failure offers one explicit retry only', () => {
  const document = makeDocument();
  const container = new MockElement('div', document);
  const calls = { reload: 0 };
  const location = {
    href: 'https://example.test/game?chapter=4#checkpoint',
    reload() { calls.reload++; },
  };
  const panel = showStartupFailure({
    container,
    error: { code: 'RENDERER_INIT' },
    lang: 'ko',
    location,
    navigator: { userAgent: 'Desktop', platform: 'Linux', maxTouchPoints: 0 },
  });
  const buttons = descendants(panel).filter(element => element.tagName === 'BUTTON');

  assert.deepEqual(buttons.map(button => button.textContent), ['다시 시도']);
  assert.ok(!container.textContent.includes('낮은 그래픽'));
  assert.equal(calls.reload, 0);
  buttons[0].click();
  assert.equal(calls.reload, 1);
  assert.equal(location.href, 'https://example.test/game?chapter=4#checkpoint');
});
