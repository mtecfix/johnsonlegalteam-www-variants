import worker from './jlt-ab-split.js';
const base = 'https://x.example';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36';
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1';
const get = (path, { ua = DESKTOP, cookie, hints } = {}) =>
  worker.fetch(new Request(base + path, { headers: { 'User-Agent': ua, ...(cookie ? { Cookie: cookie } : {}), ...(hints || {}) } }));
let failures = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + ' ' + extra); if (!ok) failures++; };
const tally = async (opts, n = 300) => { const c = { A: 0, B: 0, C: 0, D: 0 }; for (let i = 0; i < n; i++) { const r = await get('/expungements', opts); c[r.headers.get('x-ab-variant')]++; await r.arrayBuffer(); } return c; };

const desk = await tally({});
check('desktop: A/B/C only, evenly', desk.D === 0 && Math.min(desk.A, desk.B, desk.C) >= 60, JSON.stringify(desk));
const ph = await tally({ ua: IPHONE });
check('iPhone: all four, evenly', Math.min(ph.A, ph.B, ph.C, ph.D) >= 35, JSON.stringify(ph));
const an = await tally({ ua: ANDROID });
check('Android phone gets D in the mix', an.D > 0, JSON.stringify(an));
const ip = await tally({ ua: IPAD });
check('iPad is NOT treated as phone (no D)', ip.D === 0, JSON.stringify(ip));
const hint = await tally({ ua: DESKTOP, hints: { 'Sec-CH-UA-Mobile': '?1' } });
check('client hint ?1 counts as mobile', hint.D > 0, JSON.stringify(hint));
const hint0 = await tally({ ua: IPHONE, hints: { 'Sec-CH-UA-Mobile': '?0' } });
check('client hint ?0 overrides UA', hint0.D === 0, JSON.stringify(hint0));

const dc = await get('/expungements', { cookie: 'jlt_ab=d' }); await dc.arrayBuffer();
check('desktop with stale cookie=d is reassigned to A/B/C', ['A','B','C'].includes(dc.headers.get('x-ab-variant')) && /jlt_ab=[abc];/.test(dc.headers.get('set-cookie')));
const pc = await get('/expungements', { ua: IPHONE, cookie: 'jlt_ab=d' }); await pc.arrayBuffer();
check('phone with cookie=d keeps D', pc.headers.get('x-ab-variant') === 'D');
const fd = await get('/expungements?v=d'); const fb = await fd.text();
check('?v=d preview works on desktop, sets no cookie', fd.headers.get('x-ab-variant') === 'D' && !fd.headers.get('set-cookie') && fb.includes('content="D"'));

for (const page of ['expungements','misdemeanors','personal-injury','probate-estate-planning','traffic-tickets','practice-areas']) {
  for (const v of ['a','b','c','d']) {
    const r = await get('/' + page, { ua: IPHONE, cookie: 'jlt_ab=' + v }); const body = await r.text();
    check(`${page} variant ${v}`, r.status === 200 && r.headers.get('x-ab-variant') === v.toUpperCase() && body.includes(`name="ab-variant" content="${v.toUpperCase()}"`));
  }
}
const other = await get('/about.html'); const ob = await other.text();
check('non-test page proxied', other.status === 200 && !other.headers.get('x-ab-variant') && ob.includes('Johnson Legal Team'));
const post = await worker.fetch(new Request(base + '/expungements', { method: 'POST' })); check('POST rejected', post.status === 405);
console.log(failures ? `${failures} FAILURES` : 'ALL TESTS PASSED'); process.exit(failures ? 1 : 0);
