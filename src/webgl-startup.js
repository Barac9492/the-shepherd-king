const CONTEXT_TYPES = ['webgl2', 'webgl', 'experimental-webgl'];

const BASE_ATTRIBUTES = {
  alpha: true,
  depth: true,
  premultipliedAlpha: true,
  preserveDrawingBuffer: false,
  failIfMajorPerformanceCaveat: false,
};

function attributesFor(touch, compatibility) {
  return {
    ...BASE_ATTRIBUTES,
    alpha: !compatibility,
    antialias: !compatibility,
    stencil: !compatibility,
    powerPreference: compatibility || touch ? 'default' : 'high-performance',
  };
}

function releaseContext(context) {
  try {
    context?.getExtension?.('WEBGL_lose_context')?.loseContext?.();
  } catch (_) { }
}

function freshCanvas(canvas) {
  const clone = canvas.cloneNode(false);
  clone.width = canvas.width;
  clone.height = canvas.height;
  return clone;
}

function replaceCanvas(original, replacement) {
  if (replacement === original || !original.parentNode) return;
  original.parentNode.replaceChild(replacement, original);
}

function startupError(code, attempts) {
  const error = new Error(code === 'GL_CONTEXT'
    ? 'Unable to create a WebGL context.'
    : 'Unable to initialize the WebGL renderer.');
  error.code = code;
  error.attempts = attempts;
  return error;
}

export function createGameRenderer({ THREE, canvas, touch = false, forceCompatibility = false }) {
  const profiles = forceCompatibility ? [true] : [false, true];
  const attempts = [];
  let acquiredContext = false;
  let attemptNumber = 0;

  for (const compatibility of profiles) {
    const attributes = attributesFor(touch, compatibility);
    for (const api of CONTEXT_TYPES) {
      const candidate = attemptNumber++ === 0 ? canvas : freshCanvas(canvas);
      const onCreationError = event => event?.preventDefault?.();
      let context = null;
      candidate.addEventListener?.('webglcontextcreationerror', onCreationError);
      try {
        try {
          context = candidate.getContext(api, attributes);
        } catch (_) {
          attempts.push({ profile: compatibility ? 'compatibility' : 'normal', api, result: 'exception' });
          continue;
        }
        if (!context) {
          attempts.push({ profile: compatibility ? 'compatibility' : 'normal', api, result: 'null' });
          continue;
        }

        acquiredContext = true;
        try {
          const renderer = new THREE.WebGLRenderer({ canvas: candidate, context, ...attributes });
          try {
            // r160 reads alpha from a supplied context; retain the original opaque clear.
            renderer.setClearAlpha(1);
            replaceCanvas(canvas, candidate);
          } catch (_) {
            try { renderer.dispose?.(); } catch (_) { }
            releaseContext(context);
            attempts.push({ profile: compatibility ? 'compatibility' : 'normal', api, result: 'renderer' });
            continue;
          }
          return {
            renderer,
            canvas: candidate,
            compatibility: forceCompatibility || compatibility,
            diagnostic: forceCompatibility ? 'COMPATIBILITY_FORCED' : compatibility ? 'COMPATIBILITY' : 'STANDARD',
          };
        } catch (_) {
          releaseContext(context);
          attempts.push({ profile: compatibility ? 'compatibility' : 'normal', api, result: 'renderer' });
        }
      } finally {
        candidate.removeEventListener?.('webglcontextcreationerror', onCreationError);
      }
    }
  }

  throw startupError(acquiredContext ? 'RENDERER_INIT' : 'GL_CONTEXT', attempts);
}

function diagnosticCode(error) {
  return error?.code === 'GL_CONTEXT' || error?.code === 'RENDERER_INIT'
    ? error.code
    : 'GAME_START';
}

function isIOSNavigator(navigator) {
  const userAgent = navigator?.userAgent || '';
  const platform = navigator?.platform || navigator?.userAgentData?.platform || '';
  const touchPoints = Number(navigator?.maxTouchPoints || 0);
  return /iPad|iPhone|iPod/i.test(userAgent)
    || ((platform === 'MacIntel' || /Macintosh/i.test(userAgent)) && touchPoints > 1);
}

function makeRetryButton({ document, ko, location, primary = true }) {
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = primary ? 'btn primary' : 'btn';
  retry.textContent = ko ? '다시 시도' : 'Retry';
  retry.addEventListener('click', () => location.reload());
  return retry;
}

export function showStartupFailure({
  container,
  error,
  lang = 'ko',
  location = globalThis.location,
  navigator = globalThis.navigator,
}) {
  const ko = lang === 'ko';
  const document = container.ownerDocument;
  const code = diagnosticCode(error);
  const iosContextFailure = code === 'GL_CONTEXT' && isIOSNavigator(navigator);
  const panel = document.createElement('section');
  const heading = document.createElement('h1');
  const guidance = document.createElement('p');
  const actions = document.createElement('div');
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  const diagnostic = document.createElement('p');

  panel.className = 'startup-error';
  panel.setAttribute('role', 'alert');
  panel.setAttribute('aria-labelledby', 'startup-error-title');
  heading.id = 'startup-error-title';
  actions.className = 'startup-error__actions';
  guidance.className = 'startup-error__guidance';
  details.className = 'startup-error__details';
  summary.textContent = ko ? '진단 정보' : 'Technical details';
  diagnostic.textContent = `${ko ? '진단 코드' : 'Diagnostic code'}: ${code}`;
  details.append(summary, diagnostic);

  if (iosContextFailure) {
    heading.textContent = ko ? '3D 화면을 열지 못했어요' : 'The 3D view could not open';
    guidance.textContent = ko
      ? '현재 브라우저에서 3D 화면을 열지 못했어요. 다시 시도하거나 설정 안내를 확인해 주세요.'
      : 'This browser could not open the 3D view. Retry, or check the optional settings guide.';

    const reveal = document.createElement('button');
    const walkthrough = document.createElement('section');
    const walkthroughHeading = document.createElement('h2');
    const steps = document.createElement('ol');
    const returnNote = document.createElement('p');
    const warning = document.createElement('p');
    const alternative = document.createElement('p');
    const finish = makeRetryButton({ document, ko, location });

    reveal.type = 'button';
    reveal.className = 'btn primary';
    reveal.textContent = ko ? 'Safari 설정 확인' : 'Check Safari settings';
    reveal.setAttribute('aria-expanded', 'false');
    reveal.setAttribute('aria-controls', 'iphone-startup-guidance');

    walkthrough.id = 'iphone-startup-guidance';
    walkthrough.className = 'startup-error__walkthrough';
    walkthrough.setAttribute('aria-labelledby', 'iphone-startup-guidance-title');
    walkthrough.hidden = true;
    walkthroughHeading.id = 'iphone-startup-guidance-title';
    walkthroughHeading.setAttribute('tabindex', '-1');
    walkthroughHeading.textContent = ko ? 'Safari 설정 확인' : 'Check Safari settings';

    const stepText = ko
      ? [
        'Safari에서 이 페이지를 열고, 주소창의 페이지 메뉴 → ‘웹 사이트 설정’을 여세요.',
        '‘차단 모드(Lockdown Mode)’가 켜져 있다면 이 사이트에서만 끄세요.',
      ]
      : [
        'Open this page in Safari, then its address bar page menu → Website Settings.',
        'If Lockdown Mode is on, turn it off for this website only.',
      ];
    for (const text of stepText) {
      const item = document.createElement('li');
      item.textContent = text;
      steps.append(item);
    }

    returnNote.className = 'startup-error__return-note';
    returnNote.textContent = ko
      ? '설정을 바꿨다면 이 페이지로 돌아와 다시 시도하세요.'
      : 'If you changed the setting, return here and retry.';
    warning.className = 'startup-error__warning';
    warning.textContent = ko
      ? '선택 사항입니다. 신뢰하는 경우에만 선택하세요. 이 사이트의 보호가 줄어듭니다.'
      : 'Optional: only choose this if you trust the site. Protection is reduced for this site.';
    alternative.className = 'startup-error__alternative';
    alternative.textContent = ko
      ? '보호를 유지하려면 설정을 바꾸지 말고 다른 기기에서 열어 주세요.'
      : 'To keep protection unchanged, use another device.';
    finish.textContent = ko ? '다시 시도' : 'Retry';

    reveal.addEventListener('click', () => {
      reveal.setAttribute('aria-expanded', 'true');
      heading.hidden = true;
      guidance.hidden = true;
      actions.hidden = true;
      walkthrough.hidden = false;
      panel.setAttribute('aria-labelledby', walkthroughHeading.id);
      walkthroughHeading.focus?.();
    });

    actions.append(reveal, makeRetryButton({ document, ko, location, primary: false }));
    walkthrough.append(walkthroughHeading, steps, warning, returnNote, finish, alternative);
    panel.append(heading, guidance, actions, walkthrough, details);
  } else {
    heading.textContent = ko ? '게임을 시작할 수 없어요' : 'The game could not start';
    guidance.textContent = ko
      ? (code === 'GAME_START'
        ? '게임을 불러오는 중 문제가 생겼어요. 다시 시도해 주세요.'
        : '3D 화면을 준비하지 못했어요. 다시 시도해 주세요.')
      : (code === 'GAME_START'
        ? 'There was a problem loading the game. Please retry.'
        : 'The 3D view could not be prepared. Please retry.');
    actions.append(makeRetryButton({ document, ko, location }));
    panel.append(heading, guidance, actions, details);
  }

  container.setAttribute('data-startup-error', '');
  container.hidden = false;
  container.replaceChildren(panel);
  return panel;
}
