// Optional local QA compatibility adapter: close Playwright contexts before Chrome.
// Used only with NODE_OPTIONS=--import, never imported by the game or its default tests.
// Preserves every assertion and propagates cleanup failures.
import { chromium } from '../../node_modules/playwright-core/index.mjs';
const launch = chromium.launch.bind(chromium);
chromium.launch = async (...args) => {
  const browser = await launch(...args);
  const close = browser.close.bind(browser);
  browser.close = async (...closeArgs) => {
    for (const context of browser.contexts()) await context.close();
    return close(...closeArgs);
  };
  return browser;
};
