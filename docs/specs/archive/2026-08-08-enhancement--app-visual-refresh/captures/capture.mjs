// T-6 capture harness — app-visual-refresh
// Captures the design.md §5.4 surface set (+ LF-1 dashboard) at 375/768/1440.
// Runs against the deployed CloudFront origin, NOT localhost (see tasks.md T-6 env note).
// Not vendored into the repo: scratchpad-only, run via npx.

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const CF = process.env.CF || 'https://d3idqvvg0xa1r7.cloudfront.net';
const OUT = process.env.OUT || './captures';
const STATE = process.env.STATE || null; // storageState json for authed surfaces
const ONLY = process.env.ONLY || null;   // comma-separated surface ids

const WIDTHS = [
  { w: 375, h: 812, label: '375' },
  { w: 768, h: 1024, label: '768' },
  { w: 1440, h: 900, label: '1440' },
];

// id, path, auth?, prep(page) -> optional extra work before shot
const SURFACES = [
  { id: '1-home-hero', path: '/', auth: false, full: false },
  { id: '2-directory', path: '/directory', auth: false, full: false },
  { id: '3-admin-actors', path: '/admin/actors', auth: true, full: false },
  { id: '4-import-preview', path: '/admin/actors/import', auth: true, full: false },
  { id: '5-map', path: '/map', auth: false, full: false },
  { id: '6-footer', path: '/', auth: false, full: false, bottom: true },
  { id: '7-dialog', path: '/admin/actors', auth: true, full: false, dialog: true },
  { id: '8-dashboard', path: '/dashboard', auth: false, full: false },
  // register form: the VF-4 legend surface + the 375px legend-wrap advisory
  { id: '9-register-form', path: '/register', auth: false, full: false, legend: true },
];

const results = [];

const browser = await chromium.launch();
const ctxOpts = STATE ? { storageState: STATE } : {};

for (const s of SURFACES) {
  if (ONLY && !ONLY.split(',').includes(s.id)) continue;
  if (s.auth && !STATE) {
    results.push({ id: s.id, status: 'SKIPPED_NO_CREDENTIALS' });
    continue;
  }
  for (const v of WIDTHS) {
    const context = await browser.newContext({
      ...ctxOpts,
      viewport: { width: v.w, height: v.h },
      deviceScaleFactor: 2,
      isMobile: v.w < 768,
      hasTouch: v.w < 768,
    });
    const page = await context.newPage();
    let status = 'OK';
    try {
      await page.goto(CF + s.path, { waitUntil: 'networkidle', timeout: 45000 });
    } catch {
      try { await page.waitForLoadState('load', { timeout: 15000 }); } catch { /* noop */ }
      status = 'PARTIAL_LOAD';
    }
    await page.waitForTimeout(2500); // leaflet tiles / recharts animation settle

    // PROOF the viewport is what we asked for — the failure mode that voided the last run
    const real = await page.evaluate(() => ({
      inner: window.innerWidth,
      dpr: window.devicePixelRatio,
      docW: document.documentElement.clientWidth,
    }));
    if (real.inner !== v.w) status = `VIEWPORT_MISMATCH asked=${v.w} got=${real.inner}`;

    if (s.bottom) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(800);
    }
    if (s.dialog) {
      const btn = page.locator('button', { hasText: /delete|remove|deactivate|confirm/i }).first();
      if (await btn.count()) {
        await btn.click().catch(() => {});
        await page.waitForTimeout(900);
      } else {
        status += ' NO_DIALOG_TRIGGER';
      }
    }

    // legend geometry: the VF-4 protrusion + the 375px wrap advisory, measured not eyeballed
    let legendMeta = null;
    if (s.legend) {
      legendMeta = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('legend').forEach((el) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
          out.push({
            text: (el.textContent || '').trim().slice(0, 60),
            h: +r.height.toFixed(1),
            lineHeight: +lh.toFixed(1),
            lines: Math.round(r.height / lh),
            fontWeight: cs.fontWeight,
            fontSize: cs.fontSize,
            background: cs.backgroundColor,
          });
        });
        const lab = document.querySelector('label');
        const labCs = lab ? getComputedStyle(lab) : null;
        return {
          legends: out,
          label: labCs ? { fontWeight: labCs.fontWeight, fontSize: labCs.fontSize } : null,
        };
      });
    }

    const file = `${OUT}/${s.id}__${v.label}.png`;
    await page.screenshot({ path: file, fullPage: s.full });
    results.push({ id: s.id, width: v.label, status, real, file, legendMeta });
    console.log(`${status === 'OK' ? 'ok  ' : 'WARN'} ${s.id} @${v.label}  inner=${real.inner} dpr=${real.dpr}  ${status}`);
    await context.close();
  }
}

await browser.close();
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/manifest.json`, JSON.stringify(results, null, 2));
console.log('\n--- manifest written ---');
