# API Discovery - RealEstate.co.jp Scraper

This document is the reference for how the actor reaches RealEstate.co.jp data and
how it recovers from failures. Read this before changing the request layer.

## Target

- Site: `https://realestate.co.jp`
- Listing path: `/en/forsale/listing?prefecture=<code>&page=<n>` (also `/en/rent/listing`)
- Detail path: `/en/forsale/view/<id>` (and `/en/rent/view/<id>`)
- The `/en/forsale/listing` route redirects to `/en/forsale` once the session is valid.

## Edge protection (critical)

The site is protected by **Akamai Bot Manager**. Evidence from a direct probe:

- The first unauthenticated GET returns HTTP 200 with an Akamai interstitial containing
  `bm-verify`, `/_sec/verify?provider=interstitial`, `Powered by Akamai`, an inline
  proof-of-work (`var i = ...; var j = i + Number("..." + "...")`) and a self-reload script.
- The arithmetic `pow` alone does not clear it. POSTing `{"bm-verify": <token>, "pow": j}`
  to `/_sec/verify?provider=interstitial` returns `{"reload":true}` (HTTP 400) but the
  follow-up request is then served an Akamai `Access Denied` page (`errors.edgesuite.net`).
- The interstitial is **behavioral**: the real validation depends on the sensor script
  running in a browser and advancing the `ak_bmsc` cookie. A static HTTP client cannot
  complete it.

### impit profile matrix (all profiles tested)

Every impit browser profile was tested against both the listing and a detail URL.
None returned real content.

| Result | Profiles |
|---|---|
| HTTP 200 Akamai interstitial/challenge | `chrome`, `chrome100`, `chrome101`, `chrome104`, `chrome107`, `chrome110`, `chrome116`, `chrome124`, `chrome136`, `chrome142`, `chrome151`, `firefox133`, `firefox135`, `firefox144`, `ios18` |
| HTTP 403 `Access Denied` | `chrome125`, `chrome131`, `firefox`, `firefox128`, `okhttp`, `okhttp3`, `okhttp4`, `okhttp5` |

Conclusion: **impit cannot reach this target on a direct connection.** Reusing cookies
harvested from a real browser session with impit also failed (`chrome` -> interstitial,
`chrome131` -> `Access Denied`), because Akamai binds the session to the client
TLS/HTTP fingerprint, not only to cookies.

### impit + Apify Unblocker proxy (online test)

Through the Apify Unblocker proxy (`groups-UNBLOCKER`) impit **requires
`ignoreTlsErrors: true`**, because the Unblocker edge intercepts TLS and presents a
certificate impit does not trust (`ConnectError: InvalidCertificate(UnknownIssuer)`).

Results (8 listing/detail requests per profile, 45s timeout):

| Profile | Success | Failures observed |
|---|---|---|
| `chrome131` | 5/8 | Akamai challenge, empty body, timeouts |
| `firefox` | 3/8 | Akamai challenge, empty body, timeouts |

So impit **can** retrieve data through Unblocker, but it is inconsistent (~40-60%) and
can time out. Unblocker also has no sticky sessions, so the server-side warm-up cookie
cannot be pinned. impit is therefore **not used as the primary path**; the real browser
is more reliable. Reusing a browser-warm session with impit still fails.

### Browser + Unblocker

Patchright/Chrome through the Unblocker proxy additionally needs
`ignoreHTTPSErrors: true` (otherwise Chrome shows a `Privacy error`). The browser can
eventually load the full page through Unblocker, but it needs several navigations and a
stable exit IP, which Unblocker does not provide. **Residential with a sticky session is
the recommended proxy group.**

## Selected approach

Browser automation with **Patchright + real Google Chrome** in headful mode
(`channel: 'chrome'`, `headless: false`) inside an Apify Playwright Chrome image.
This runs the Akamai sensor and obtains a valid session.

Tested behavior:

- `headless: true` -> 403 / interstitial (blocked).
- `headless: false` with real Chrome -> HTTP 200 with 16 listing cards (`id="property-*"`).
- The first navigation after a cold start can land on a partial page; the session is
  considered warm only after challenge markers disappear and real content is present.

### Request pattern

- One session = one browser + one proxy URL (sticky residential session). Cookies and
  the Akamai session are bound to that browser/IP.
- After warm-up, the actor fetches listing and detail HTML **inside the page** via
  `page.evaluate(fetch(url, { credentials: 'include' }))`, which uses the browser network
  stack and shares the validated session. This is faster than full navigation and keeps
  the same fingerprint.
- Parsing stays on `cheerio` over the returned HTML; selectors are unchanged.

### Stealth configuration (default client)

Patchright + real Chrome is the **default and only data client** (impit was removed).
The launch profile follows Patchright's own guidance for Akamai-class targets:

- `channel: 'chrome'` (real Chrome; falls back to Patchright's patched Chromium only if
  the Chrome channel is missing), `headless: false`, `noViewport: true`.
- Persistent context per session (disposable temp profile, removed on close/rotation).
- `ignoreHTTPSErrors: true` so MITM proxies such as Unblocker do not break TLS.
- Coherent values only: `locale: 'en-US'`, `colorScheme: 'light'`, and
  `timezoneId: 'Asia/Tokyo'` when the exit IP is Japanese.
- **No user-agent or fingerprint header overrides** — the real Chrome profile is already
  internally consistent, and overriding it is what triggers Akamai.
- Patchright patches the driver-level leaks (`navigator.webdriver`, `Runtime.enable`,
  command-flag leaks) itself; no extra flags are added.
- All data (listing + detail) is fetched **inside the page** with
  `page.evaluate(fetch(url, { credentials: 'include' }))`, so every request carries the
  stealthy browser identity and session cookies.

### Pre-challenge shell (important)

A cold session can receive a ~7KB server-rendered shell with the correct title but **no
property cards and no challenge markers**. Listings are server-rendered into the full
~147KB page only after the Akamai pixel cookie resolves. The actor therefore treats a
page as ready only when it contains `id="property-"` (or `property-details` for details)
or exceeds ~30KB, and retries/re-warms otherwise. Reading the shell as valid is what
produces `saved=0`.

## Field / selector reference (verified against live HTML)

- Listing cards: `[id^="property-"]`
- Card title: `h3`
- Card view link: `a[href^="/en/"]` (absolute link `/en/forsale/view/<id>`)
- Card info rows: `.property-listing-info .property-listing-info-container`
  with `.property-listing-info-title` / `.property-listing-info-content`
- Gallery images: `img[src*="media.realestate.co.jp/img/store"]`
- Detail blocks: `.property-details`, `.property-additional-details`
  with `.property-details-title` / `.property-details-content`
- Structured data: `script[type="application/ld+json"]` (`RealEstateListing`,
  `RealEstateAgent`, `Product`, `Residence`)

## Pagination

- No `rel="next"` link is present. Pagination uses the `page` query parameter and the
  `?page=<n>` link in `a.btn-circle.btn-default`.
- The actor increments the `page` parameter, capped by `max_pages`.

## Recovery strategy (auto-healing)

1. `isChallenge(html)` detects `bm-verify`, `_sec/verify`, `Powered by Akamai`,
   `sec-if-cpt-container`, `Access Denied`, and `errors.edgesuite.net`.
2. `ensureWarm()` navigates, waits until challenge markers clear, and retries a bounded
   number of times with backoff.
3. A failed/challenged fetch triggers `recover()`: re-warm in place, then rotate the
   browser session + proxy session (up to a limit) and re-warm.
4. Fetches use a bounded retry budget; individual item failures are skipped without
   terminating the run. Temporary 429/5xx/timeouts are retried, permanent blocks rotate.
5. Browser header/UA/fingerprint values are never hardcoded; the real Chrome profile
   supplies them, so changing browser values do not break the actor.

## Proxy

- Apify Residential (default) with one sticky session per browser, country match when the
  caller provides one. Custom `proxyUrls` are supported and take precedence.
- Locally, Apify Proxy settings are ignored; use custom `proxyUrls` to test.
