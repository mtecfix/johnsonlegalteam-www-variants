/**
 * jlt-ab-split: serves one of the landing-page variants per visitor.
 *
 * Variants live in the sandbox repo (served by GitHub Pages). Assignment is uniform random, stored in a
 * 30-day cookie, so a visitor sees the same variant on every test page.
 *   - Desktop/tablet visitors are split across A, B and C.
 *   - Phone visitors are split across A, B, C and D (D is a mobile-only design).
 * Preview any variant with ?v=a|b|c|d (does not change the visitor's cookie).
 * All other paths are proxied to the sandbox unchanged. Only GET/HEAD are accepted.
 */
const ORIGIN = 'https://mtecfix.github.io/johnsonlegalteam-www-variants';
const TEST_PAGES = new Set([
  'expungements', 'misdemeanors', 'personal-injury',
  'probate-estate-planning', 'traffic-tickets', 'practice-areas',
]);
const ALL_VARIANTS = ['a', 'b', 'c', 'd'];
const DESKTOP_VARIANTS = ['a', 'b', 'c'];
const COOKIE_NAME = 'jlt_ab';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
// Phones only. Tablets (iPad, Android tablets without "Mobile") get the desktop experience.
const MOBILE_UA = /Android.+Mobile|iPhone|iPod|Windows Phone|BlackBerry|Opera Mini|IEMobile|Mobile Safari/i;

function isMobile(headers) {
  const hint = headers.get('Sec-CH-UA-Mobile');
  if (hint === '?1') return true;
  if (hint === '?0') return false;
  return MOBILE_UA.test(headers.get('User-Agent') || '');
}

function readCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

function randomFrom(list) {
  // Rejection sampling keeps the choice unbiased for any list length.
  const limit = 256 - (256 % list.length);
  let byte;
  do { byte = crypto.getRandomValues(new Uint8Array(1))[0]; } while (byte >= limit);
  return list[byte % list.length];
}

function chooseVariant(url, headers) {
  const forced = (url.searchParams.get('v') || '').toLowerCase();
  if (ALL_VARIANTS.includes(forced)) return { variant: forced, forced: true };
  const allowed = isMobile(headers) ? ALL_VARIANTS : DESKTOP_VARIANTS;
  const existing = readCookie(headers.get('Cookie'), COOKIE_NAME);
  if (allowed.includes(existing)) return { variant: existing, forced: false };
  return { variant: randomFrom(allowed), forced: false };
}

export default {
  async fetch(request) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    const url = new URL(request.url);
    const pageName = url.pathname.replace(/^\/+/, '').replace(/\.html$/, '');

    if (!TEST_PAGES.has(pageName)) {
      const passthrough = await fetch(ORIGIN + url.pathname + url.search, { method: request.method });
      return new Response(passthrough.body, passthrough);
    }

    const { variant, forced } = chooseVariant(url, request.headers);
    const upstream = await fetch(`${ORIGIN}/${pageName}-${variant}.html`, { method: request.method });
    if (!upstream.ok) {
      // Fail visibly rather than silently serving a different page.
      return new Response(`Variant page unavailable (${upstream.status})`, { status: 502 });
    }
    const headers = new Headers(upstream.headers);
    headers.set('X-AB-Variant', variant.toUpperCase());
    headers.set('Cache-Control', 'private, no-store');
    headers.append('Vary', 'Cookie, User-Agent, Sec-CH-UA-Mobile');
    if (!forced) {
      headers.append('Set-Cookie',
        `${COOKIE_NAME}=${variant}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Secure; SameSite=Lax`);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
