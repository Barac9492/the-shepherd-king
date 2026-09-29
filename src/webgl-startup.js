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

export function showStartupFailure({ container, error, lang = 'ko', location = window.location }) {
  const ko = lang === 'ko';
  const document = container.ownerDocument;
  const panel = document.createElement('section');
  const heading = document.createElement('h1');
  const guidance = document.createElement('p');
  const diagnostic = document.createElement('p');
  const actions = document.createElement('div');
  const retry = document.createElement('button');
  const compatibility = document.createElement('button');

  panel.className = 'startup-error';
  panel.setAttribute('role', 'alert');
  panel.setAttribute('aria-labelledby', 'startup-error-title');
  heading.id = 'startup-error-title';
  heading.textContent = ko ? '게임을 시작할 수 없어요' : 'The game could not start';
  const graphicsFailure = diagnosticCode(error) !== 'GAME_START';
  guidance.textContent = ko
    ? `${graphicsFailure ? '그래픽을 초기화하지 못했습니다.' : '게임을 불러오는 중 문제가 생겼습니다.'} 다시 시도해 주세요. 계속 실행되지 않으면 PC로 접속해 주세요.`
    : `${graphicsFailure ? 'Graphics could not be initialized.' : 'A problem occurred while loading the game.'} Please try again. If it still does not start, try on a PC.`;
  diagnostic.textContent = `${ko ? '진단 코드' : 'Diagnostic code'}: ${diagnosticCode(error)}`;

  retry.type = 'button';
  retry.className = 'btn';
  retry.textContent = ko ? '다시 시도' : 'Retry';
  retry.addEventListener('click', () => location.reload());

  compatibility.type = 'button';
  compatibility.className = 'btn primary';
  compatibility.textContent = ko ? '낮은 그래픽으로 다시 시도' : 'Try again with lower graphics';
  compatibility.addEventListener('click', () => {
    const url = new URL(location.href);
    url.searchParams.set('compatibility', '1');
    location.assign(url.href);
  });

  actions.append(retry, compatibility);
  panel.append(heading, guidance, diagnostic, actions);
  container.setAttribute('data-startup-error', '');
  container.hidden = false;
  container.replaceChildren(panel);
  return panel;
}
