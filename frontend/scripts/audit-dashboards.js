// Drives Chromium against localhost:3000 for each role's dashboard, captures a
// screenshot at a fixed viewport, and records the computed widths/paddings of
// .container, .section, and the first .card so we can spot any cross-role
// layout drift. Run: `node scripts/audit-dashboards.js` (frontend dir).

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
const WEB = 'http://localhost:3000';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@ewaste.local';
const ADMIN_PASS = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe!123';
const STAMP = Date.now();

const VIEWPORT = { width: 1440, height: 900 };
const OUT = path.join(__dirname, '..', 'audit');
fs.mkdirSync(OUT, { recursive: true });

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    method: opts.method || 'POST',
    headers: { 'Content-Type': 'application/json', ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${JSON.stringify(data).slice(0, 200)}`);
  return data;
}

async function login(email, password) {
  const r = await api('/api/auth/login', { body: { email, password } });
  return { accessToken: r.accessToken, refreshToken: r.refreshToken, user: r.user };
}

async function register(role) {
  const email = `audit-${role}-${STAMP}@audit.local`;
  const password = 'Audit123!';
  const r = await api('/api/auth/register', { body: { name: `Audit ${role}`, email, password, role } });
  return { email, password, accessToken: r.accessToken, refreshToken: r.refreshToken, user: r.user };
}

async function createStoreForRecycler(token, name, lat, lng) {
  return api('/api/recycler/stores', {
    body: {
      storeName: name,
      address: 'Audit address',
      latitude: lat,
      longitude: lng,
      categories: ['laptops', 'phones'],
      description: 'Audit-only store created by scripts/audit-dashboards.js',
      serviceMode: 'both',
      paymentPolicy: 'free'
    },
    token
  });
}

// Sets the access token + minimal user blob into localStorage so the SPA boots authenticated.
// Keys come from frontend/lib/auth.ts: ewaste_token / ewaste_refresh / ewaste_user.
function injectAuthScript(role, accessToken, refreshToken, user) {
  return `
    try {
      localStorage.setItem('ewaste_token', ${JSON.stringify(accessToken)});
      localStorage.setItem('ewaste_refresh', ${JSON.stringify(refreshToken)});
      localStorage.setItem('ewaste_user', ${JSON.stringify(JSON.stringify(user))});
    } catch (e) {}
  `;
}

async function measure(page, role) {
  return page.evaluate((role) => {
    const out = { role, viewport: { w: window.innerWidth, h: window.innerHeight }, container: null, sections: [], firstCard: null };
    const c = document.querySelector('.container');
    if (c) {
      const cs = getComputedStyle(c);
      const r = c.getBoundingClientRect();
      out.container = {
        width: Math.round(r.width),
        maxWidth: cs.maxWidth,
        padding: cs.padding,
        marginLeft: cs.marginLeft,
        marginRight: cs.marginRight,
        bodyFontSize: getComputedStyle(document.body).fontSize
      };
    }
    document.querySelectorAll('.container > .section').forEach((s, i) => {
      const r = s.getBoundingClientRect();
      const cs = getComputedStyle(s);
      out.sections.push({ idx: i, width: Math.round(r.width), padding: cs.padding });
    });
    const card = document.querySelector('.container .card');
    if (card) {
      const r = card.getBoundingClientRect();
      const cs = getComputedStyle(card);
      const inH3 = card.querySelector('h3');
      const inMuted = card.querySelector('.muted');
      out.firstCard = {
        width: Math.round(r.width),
        padding: cs.padding,
        border: cs.border,
        marginBottom: cs.marginBottom,
        h3FontSize: inH3 ? getComputedStyle(inH3).fontSize : null,
        h3FontWeight: inH3 ? getComputedStyle(inH3).fontWeight : null,
        mutedFontSize: inMuted ? getComputedStyle(inMuted).fontSize : null,
        depthFromContainer: (() => {
          let d = 0; let n = card;
          while (n && !n.classList.contains('container')) { d++; n = n.parentElement; }
          return d;
        })()
      };
    }
    return out;
  }, role);
}

async function auditRole(browser, role, accessToken, refreshToken, user, dashboardPath) {
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    permissions: role === 'user' ? ['geolocation'] : [],
    geolocation: role === 'user' ? { latitude: 30.3335, longitude: 77.9634 } : undefined
  });
  await ctx.addInitScript(injectAuthScript(role, accessToken, refreshToken, user));
  const page = await ctx.newPage();
  await page.goto(WEB + dashboardPath, { waitUntil: 'networkidle' });
  // Give React time to hydrate + render data
  await page.waitForTimeout(1500);
  const m = await measure(page, role);
  await page.screenshot({ path: path.join(OUT, `${role}.png`), fullPage: false });
  await ctx.close();
  return m;
}

(async () => {
  console.log('Logging in / registering accounts...');
  const admin = await login(ADMIN_EMAIL, ADMIN_PASS);
  const recycler = await register('recycler');
  const user = await register('user');

  // Create two stores so the recycler dashboard StorePicker has cards visible
  console.log('Seeding test stores for recycler...');
  await createStoreForRecycler(recycler.accessToken, `Audit Store A ${STAMP}`, 30.3335, 77.9634);
  await createStoreForRecycler(recycler.accessToken, `Audit Store B ${STAMP}`, 30.34, 77.97);

  console.log('Launching Chromium and visiting each dashboard...');
  const browser = await chromium.launch({ headless: true });

  const results = [];
  results.push(await auditRole(browser, 'admin', admin.accessToken, admin.refreshToken, admin.user, '/admin/dashboard'));
  results.push(await auditRole(browser, 'recycler', recycler.accessToken, recycler.refreshToken, recycler.user, '/recycler/dashboard'));
  results.push(await auditRole(browser, 'user', user.accessToken, user.refreshToken, user.user, '/user/dashboard'));

  await browser.close();

  fs.writeFileSync(path.join(OUT, 'widths.json'), JSON.stringify(results, null, 2));
  console.log('\n=== AUDIT RESULT ===');
  for (const r of results) {
    console.log(`\n[${r.role}]  viewport ${r.viewport.w}x${r.viewport.h}`);
    if (r.container) console.log(`  .container width=${r.container.width}px  maxWidth=${r.container.maxWidth}  padding=${r.container.padding}  bodyFontSize=${r.container.bodyFontSize}`);
    console.log(`  direct .container > .section count = ${r.sections.length}`);
    r.sections.forEach((s) => console.log(`    section[${s.idx}] width=${s.width}px padding=${s.padding}`));
    if (r.firstCard) {
      const c = r.firstCard;
      console.log(`  firstCard width=${c.width}px padding=${c.padding} border=${c.border} marginBottom=${c.marginBottom}`);
      console.log(`           h3 fontSize=${c.h3FontSize} weight=${c.h3FontWeight}  muted fontSize=${c.mutedFontSize}  depthFromContainer=${c.depthFromContainer}`);
    } else {
      console.log('  firstCard: <none rendered>');
    }
  }
  console.log(`\nScreenshots + widths.json written to ${OUT}`);
})().catch((err) => { console.error('AUDIT FAILED:', err); process.exit(1); });
