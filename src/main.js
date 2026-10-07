import { Actor, log } from 'apify';
import { load as cheerioLoad } from 'cheerio';
import { existsSync, readFileSync } from 'fs';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { chromium } from 'patchright';
import { join } from 'path';

const SITE_ORIGIN = 'https://realestate.co.jp';
const NAV_TIMEOUT_MS = 90000;
const WARM_TIMEOUT_MS = 45000;
const FETCH_RETRIES = 3;
const DETAIL_FETCH_CONCURRENCY = 6;
const SESSION_ROTATION_LIMIT = 3;

await Actor.init();

function loadInput() {
    const cachePath = 'storage/key_value_stores/default/INPUT.json';
    if (existsSync(cachePath)) {
        try {
            const cached = JSON.parse(readFileSync(cachePath, 'utf-8'));
            if (cached && Object.keys(cached).length > 0) return cached;
        } catch { /* ignore */ }
    }
    if (existsSync('INPUT.json')) {
        try {
            return JSON.parse(readFileSync('INPUT.json', 'utf-8'));
        } catch { /* ignore */ }
    }
    return {};
}

function sleep(ms) {
    return new Promise(resolve => { setTimeout(resolve, ms); });
}

function isChallenge(html) {
    if (!html) return true;
    return (
        html.includes('bm-verify')
        || html.includes('_sec/verify')
        || html.includes('Powered by Akamai')
        || html.includes('sec-if-cpt-container')
        || html.includes('errors.edgesuite.net')
        || /Access Denied/i.test(html)
    );
}

// The edge can serve a small (~7KB) pre-challenge shell without challenge markers.
// Treat it as "not ready" until the full server-rendered page (>=30KB) or cards appear.
function isListingHtml(html) {
    if (isChallenge(html)) return false;
    if (html.includes('id="property-')) return true;
    return html.length > 30000;
}

function isDetailHtml(html) {
    if (isChallenge(html)) return false;
    if (html.includes('property-details')) return true;
    return html.length > 30000;
}

function cleanObject(obj) {
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
        if (v !== null && v !== undefined && v !== '') {
            result[k] = v;
        }
    }
    return result;
}

function toCamelCase(str) {
    return str.toLowerCase()
        .replace(/[^a-z0-9]+(.)/g, (_, c) => c.toUpperCase())
        .replace(/^./, c => c.toLowerCase());
}

function getFullSizeImageUrl(src) {
    if (!src) return null;
    return src.replace(/\/_w\d+\.[a-z]+(?:\?.*)?$/i, '');
}

function extractListProperty($, el) {
    const $el = $(el);
    const id = $el.attr('id')?.replace('property-', '') || null;
    const rawUrl = $el.find('a[href^="/en/"]').first().attr('href') || null;
    const absoluteUrl = rawUrl ? `${SITE_ORIGIN}${rawUrl}` : `${SITE_ORIGIN}/en/forsale/view/${id}`;
    const url = new URL(absoluteUrl);
    url.search = '';
    const title = $el.find('h3').first().text().trim() || null;
    const location = $el.find('.text-lg.font-medium').first().text().trim() || null;
    const priceText = $el.find('[class*="font-bold"]').first().text().trim()
        || $el.find('.font-bold').first().text().trim();
    const price = priceText ? parseFloat(priceText.replace(/[¥￥,\s]/g, '')) : null;
    const station = $el.find('div.text-sm.font-medium').first().text().trim() || null;

    const infoEls = $el.find('.property-listing-info .property-listing-info-container');
    let size = null;
    let floors = null;
    infoEls.each((_i, info) => {
        const label = $(info).find('.property-listing-info-title').text().trim().toLowerCase();
        const value = $(info).find('.property-listing-info-content').text().trim();
        if (/size|m/i.test(label) && !/floor/i.test(label)) size = value;
        if (/floor/i.test(label)) floors = value;
    });

    const img = $el.find('img').first().attr('src') || null;
    const agentLogo = $el.find('.z-20 img').attr('src') || null;

    const item = { id, title, location, price, priceFormatted: priceText, station, size, floors, imageUrl: img, agentLogo, url: url.href };
    if (title) item.propertyType = title;

    return cleanObject(item);
}

function extractListings($) {
    const items = [];
    $('[id^="property-"]').each((_, el) => {
        items.push(extractListProperty($, el));
    });
    return items;
}

function findNextPageUrl($, currentUrl) {
    const nextLink = $('a[rel="next"]').attr('href')
        || $('link[rel="next"]').attr('href');
    if (nextLink) {
        try { return new URL(nextLink, currentUrl).href; } catch { return null; }
    }
    try {
        const urlObj = new URL(currentUrl);
        const currentPage = parseInt(urlObj.searchParams.get('page') || '1', 10);
        urlObj.searchParams.set('page', String(currentPage + 1));
        return urlObj.href;
    } catch { return null; }
}

function enrichItem(html, baseItem) {
    const $ = cheerioLoad(html);

    const galleryImages = [];
    const seen = new Set();
    $('img').each((_, el) => {
        const src = $(el).attr('src');
        if (src && src.includes('media.realestate.co.jp/img/store')) {
            const full = getFullSizeImageUrl(src);
            if (full && !seen.has(full)) {
                seen.add(full);
                galleryImages.push(full);
            }
        }
    });

    const details = {};
    $('.property-details, .property-additional-details').each((_, el) => {
        const titleEl = $(el).find('.property-details-title, .property-additional-details-title').first();
        const contentEl = $(el).find('.property-details-content, .property-additional-details-content').first();
        const label = titleEl.text().trim();
        const value = contentEl.text().trim();
        if (label && value) {
            const key = toCamelCase(label);
            if (!details[key]) details[key] = value;
        }
    });

    let floorPlanImage = null;

    $('script[type="application/ld+json"]').each((_, el) => {
        try {
            const parsed = JSON.parse($(el).text());
            const items = Array.isArray(parsed) ? parsed : [parsed];
            for (const p of items) {
                if (p['@type'] === 'RealEstateListing' && p.datePosted && !details.datePosted) {
                    details.datePosted = p.datePosted;
                }
                if (p['@type'] === 'RealEstateAgent' && p.name && !details.agentName) {
                    details.agentName = p.name;
                }
                if (p['@type'] === 'Product') {
                    if (p.description && !details.description) details.description = p.description;
                    if (p.name && !details.buildingName) details.buildingName = p.name;
                }
                if (p['@type'] === 'Residence' && p.accommodationFloorPlan?.layoutImage) {
                    floorPlanImage = getFullSizeImageUrl(p.accommodationFloorPlan.layoutImage);
                }
            }
        } catch { /* ignore */ }
    });

    const enriched = {
        ...baseItem,
        galleryImages,
    };
    if (floorPlanImage) enriched.floorPlanImage = floorPlanImage;

    for (const [k, v] of Object.entries(details)) {
        if (!enriched[k]) enriched[k] = v;
    }

    return cleanObject(enriched);
}

function parseProxy(proxyUrl) {
    try {
        const u = new URL(proxyUrl);
        const options = { server: `${u.protocol}//${u.host}` };
        if (u.username) options.username = decodeURIComponent(u.username);
        if (u.password) options.password = decodeURIComponent(u.password);
        return options;
    } catch {
        return { server: proxyUrl };
    }
}

function buildProxySettings(proxyConfiguration) {
    const cfg = (proxyConfiguration && typeof proxyConfiguration === 'object') ? proxyConfiguration : {};
    const customUrls = Array.isArray(cfg.proxyUrls) ? cfg.proxyUrls.filter(Boolean) : [];
    let apifyGroups = ['RESIDENTIAL'];
    if (Array.isArray(cfg.apifyProxyGroups) && cfg.apifyProxyGroups.length) {
        apifyGroups = cfg.apifyProxyGroups;
    } else if (Array.isArray(cfg.groups) && cfg.groups.length) {
        apifyGroups = cfg.groups;
    }
    const requestedApify = cfg.useApifyProxy === true
        || (Array.isArray(cfg.apifyProxyGroups) && cfg.apifyProxyGroups.length > 0)
        || (Array.isArray(cfg.groups) && cfg.groups.length > 0);
    return {
        requestedApify,
        hasCustomUrls: customUrls.length > 0,
        groups: apifyGroups,
        countryCode: cfg.apifyProxyCountry || cfg.countryCode,
    };
}

// Keep the browser fingerprint coherent with the exit IP. Only the target market
// (Japan) is mapped, so no wrong timezone is forced for other countries.
function resolveTimezone(countryCode) {
    if (!countryCode) return undefined;
    const map = { JP: 'Asia/Tokyo' };
    return map[String(countryCode).toUpperCase()];
}

// Stealth profile for Patchright + real Chrome (see API_DISCOVERY.md).
// Patchright already patches driver/runtime/command-flag leaks. Do NOT override
// user-agent or fingerprint headers: real Chrome must stay internally consistent,
// otherwise Akamai flags the mismatch. Data is fetched in-page with `fetch()`, so
// requests inherit this exact browser identity.
function buildStealthContextOptions(proxyUrl, countryCode) {
    const timezoneId = resolveTimezone(countryCode);
    return {
        channel: 'chrome',
        headless: false,
        noViewport: true,
        ignoreHTTPSErrors: true,
        locale: 'en-US',
        colorScheme: 'light',
        ...(timezoneId ? { timezoneId } : {}),
        ...(proxyUrl ? { proxy: parseProxy(proxyUrl) } : {}),
    };
}

class BrowserSession {
    constructor(proxyConfiguration, proxySettings) {
        this.proxyConfiguration = proxyConfiguration;
        this.proxySettings = proxySettings;
        this.context = null;
        this.page = null;
        this.userDataDir = null;
        this.rotations = 0;
    }

    async start() {
        this.userDataDir = await mkdtemp(join(tmpdir(), 'rejp-'));
        const proxyUrl = await this.resolveProxyUrl();
        const options = buildStealthContextOptions(proxyUrl, this.proxySettings.countryCode);
        try {
            this.context = await chromium.launchPersistentContext(this.userDataDir, options);
        } catch (err) {
            log.warning(`Real Chrome channel unavailable (${err.message}); falling back to bundled Chromium.`);
            const fallbackOptions = { ...options };
            delete fallbackOptions.channel;
            this.context = await chromium.launchPersistentContext(this.userDataDir, fallbackOptions);
        }
        this.page = await this.context.newPage();
    }

    async resolveProxyUrl() {
        const { proxyConfiguration, proxySettings } = this;
        if (!proxyConfiguration) return null;
        if (proxySettings.hasCustomUrls) {
            const conf = await Actor.createProxyConfiguration(proxyConfiguration);
            return conf ? conf.newUrl() : null;
        }
        if (proxySettings.requestedApify && Actor.isAtHome()) {
            const conf = await Actor.createProxyConfiguration({
                groups: proxySettings.groups,
                ...(proxySettings.countryCode ? { countryCode: proxySettings.countryCode } : {}),
            });
            const sessionId = `rejp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            return conf ? conf.newUrl(sessionId) : null;
        }
        if (proxySettings.requestedApify && !Actor.isAtHome()) {
            log.info('Local run detected: Apify Proxy settings are ignored. Provide custom proxyUrls to test locally.');
        }
        return null;
    }

    async stop() {
        const { context, userDataDir } = this;
        this.context = null;
        this.page = null;
        try { if (context) await context.close(); } catch { /* ignore */ }
        if (userDataDir) {
            try { await rm(userDataDir, { recursive: true, force: true }); } catch { /* ignore */ }
        }
        this.userDataDir = null;
    }

    async rotate() {
        this.rotations++;
        log.warning(`Rotating browser session and proxy session (rotation ${this.rotations}).`);
        await this.stop();
        await this.start();
    }
}

async function ensureWarm(session, warmUrl) {
    const { page } = session;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            await page.goto(warmUrl, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
            await page.waitForFunction(
                () => {
                    const html = document.documentElement.outerHTML;
                    if (/bm-verify|_sec\/verify|Powered by Akamai|sec-if-cpt-container/i.test(html)) return false;
                    return /id="property-/.test(html) || html.length > 30000;
                },
                { timeout: WARM_TIMEOUT_MS },
            ).catch(() => {});
        } catch (err) {
            log.warning(`Warm-up navigation attempt ${attempt} failed: ${err.message}`);
        }
        const html = await page.content();
        if (isListingHtml(html) || isDetailHtml(html)) return true;
        log.warning(`Session not ready after warm-up attempt ${attempt}.`);
        await sleep(1500 * attempt + Math.random() * 1000);
    }
    return false;
}

async function recover(session, warmUrl) {
    if (await ensureWarm(session, warmUrl)) return true;
    if (session.rotations >= SESSION_ROTATION_LIMIT) {
        log.warning('Session rotation limit reached; stopping recovery attempts.');
        return false;
    }
    await session.rotate();
    return ensureWarm(session, warmUrl);
}

async function fetchInPage(page, url) {
    try {
        return await page.evaluate(async (u) => {
            try {
                const res = await fetch(u, {
                    credentials: 'include',
                    headers: { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
                });
                return { status: res.status, text: await res.text() };
            } catch (err) {
                return { status: 0, error: String(err && err.message ? err.message : err) };
            }
        }, url);
    } catch (err) {
        return { status: 0, error: String(err && err.message ? err.message : err) };
    }
}

async function fetchListing(session, url, warmUrl) {
    for (let attempt = 1; attempt <= FETCH_RETRIES; attempt++) {
        const res = await fetchInPage(session.page, url);
        if (res.status === 200 && isListingHtml(res.text)) return res.text;
        log.warning(`Listing fetch blocked or not ready (status=${res.status}) on attempt ${attempt}.`);
        const recovered = await recover(session, warmUrl);
        if (!recovered) break;
    }
    return null;
}

async function fetchDetailBatch(session, urls, warmUrl) {
    const results = new Map();
    let queue = [...urls];
    for (let round = 0; round <= FETCH_RETRIES && queue.length > 0; round++) {
        const retry = [];
        for (let i = 0; i < queue.length; i += DETAIL_FETCH_CONCURRENCY) {
            const chunk = queue.slice(i, i + DETAIL_FETCH_CONCURRENCY);
            const settled = await Promise.all(chunk.map(async (url) => ({ url, res: await fetchInPage(session.page, url) })));
            for (const { url, res } of settled) {
                if (res.status === 200 && isDetailHtml(res.text)) {
                    results.set(url, res.text);
                } else {
                    retry.push(url);
                }
            }
        }
        if (retry.length === 0) break;
        log.warning(`Retrying ${retry.length} detail request(s) after challenge/error (round ${round + 1}).`);
        const recovered = await recover(session, warmUrl);
        if (!recovered) break;
        queue = retry;
    }
    return results;
}

async function enrichMany(session, items, warmUrl) {
    const urls = items.map(item => item.url);
    const htmlMap = await fetchDetailBatch(session, urls, warmUrl);
    return items.map((item) => {
        const html = htmlMap.get(item.url);
        if (!html) return item;
        try {
            return enrichItem(html, item);
        } catch (err) {
            log.warning(`Detail enrichment failed for ${item.url}: ${err.message}`);
            return item;
        }
    });
}

async function main() {
    const actorInput = await Actor.getInput();
    const fileInput = loadInput();
    const input = (actorInput && Object.keys(actorInput).length > 0) ? actorInput : fileInput;
    const {
        startUrl,
        location: locationInput,
        propertyType,
        minPrice,
        maxPrice,
        results_wanted: RESULTS_WANTED_RAW = 20,
        max_pages: MAX_PAGES_RAW = 10,
        proxyConfiguration,
    } = input;

    const RESULTS_WANTED = Number.isFinite(+RESULTS_WANTED_RAW) ? Math.max(1, +RESULTS_WANTED_RAW) : 20;
    const MAX_PAGES = Number.isFinite(+MAX_PAGES_RAW) ? Math.max(1, +MAX_PAGES_RAW) : 10;
    const SAFETY_MAX_PAGES = Math.max(MAX_PAGES, Math.ceil(RESULTS_WANTED / 5) + 5);
    const withDetail = input.withDetail !== false;

    const startUrls = [];
    if (startUrl) {
        startUrls.push(startUrl);
    } else {
        const url = new URL(`${SITE_ORIGIN}/en/forsale/listing`);
        if (locationInput) url.searchParams.set('prefecture', locationInput);
        if (propertyType) url.searchParams.set('building_type', propertyType);
        if (minPrice) url.searchParams.set('min_price', String(minPrice));
        if (maxPrice) url.searchParams.set('max_price', String(maxPrice));
        url.searchParams.set('page', '1');
        startUrls.push(url.href);
    }

    const proxySettings = buildProxySettings(proxyConfiguration);
    log.info(`Scrape | browser=patchright-chrome | target=${RESULTS_WANTED} | detail=${withDetail} | proxy=${proxySettings.hasCustomUrls || proxySettings.requestedApify}`);

    const session = new BrowserSession(proxyConfiguration, proxySettings);
    await session.start();

    let totalSaved = 0;

    try {
        const warmed = await ensureWarm(session, startUrls[0]);
        if (!warmed) {
            throw new Error('Could not establish a valid browser session (edge challenge not cleared). Enable Apify Proxy (Residential) and retry.');
        }

        const seenIds = new Set();

        for (const initialUrl of startUrls) {
            let currentUrl = initialUrl;
            let page = 1;
            let retries = 0;

            while (totalSaved < RESULTS_WANTED && page <= SAFETY_MAX_PAGES) {
                const html = await fetchListing(session, currentUrl, initialUrl);
                if (!html) {
                    retries++;
                    if (retries >= FETCH_RETRIES) {
                        log.warning(`Giving up on listing page ${page} after ${retries} failed attempts.`);
                        break;
                    }
                    await sleep(2000 + Math.random() * 3000);
                    continue;
                }
                retries = 0;

                const $ = cheerioLoad(html);
                const items = extractListings($);
                if (items.length === 0) break;

                const fresh = [];
                for (const item of items) {
                    if (!item.id || seenIds.has(item.id)) continue;
                    seenIds.add(item.id);
                    fresh.push(item);
                }

                const needed = fresh.slice(0, RESULTS_WANTED - totalSaved);
                const toSave = withDetail ? await enrichMany(session, needed, initialUrl) : needed;

                for (const item of toSave) {
                    if (totalSaved >= RESULTS_WANTED) break;
                    await Actor.pushData(item);
                    totalSaved++;
                }

                if (totalSaved >= RESULTS_WANTED) break;

                const nextUrl = findNextPageUrl($, currentUrl);
                if (!nextUrl || nextUrl === currentUrl) break;
                currentUrl = nextUrl;
                page++;

                await sleep(300 + Math.random() * 700);
            }
        }

        log.info(`Done | saved=${totalSaved}`);
    } finally {
        await session.stop();
    }
}

main()
    .then(async () => { await Actor.exit(); })
    .catch(async (err) => {
        log.error(err.message);
        await Actor.exit({ exitCode: 1 });
    });
