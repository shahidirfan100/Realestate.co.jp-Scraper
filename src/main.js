import { Actor, log } from 'apify';
import { load as cheerioLoad } from 'cheerio';
import { existsSync, readFileSync } from 'fs';
import { HeaderGenerator } from 'header-generator';
import { Impit } from 'impit';

const DETAIL_CONCURRENCY = 12;

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

const impitClient = new Impit({ timeout: 30000 });

function buildHeaders() {
    const hg = new HeaderGenerator({
        browsers: [{ name: 'chrome', minVersion: 120, maxVersion: 130 }],
        devices: ['desktop'],
        operatingSystems: ['windows', 'macos'],
        locales: ['en-US', 'en'],
    });
    const headers = hg.getHeaders({
        operatingSystems: ['windows'],
        browsers: ['chrome'],
        devices: ['desktop'],
        locales: ['en-US'],
    });
    return {
        ...headers,
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
        'cache-control': 'max-age=0',
        'sec-ch-ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'sec-fetch-user': '?1',
        'upgrade-insecure-requests': '1',
    };
}

async function fetchHtml(url, proxyUrl) {
    const requestOptions = { headers: buildHeaders() };
    if (proxyUrl) requestOptions.proxy = { url: proxyUrl };
    try {
        const response = await impitClient.fetch(url, requestOptions);
        if (response.status !== 200) return null;
        return await response.text();
    } catch {
        return null;
    }
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
    const absoluteUrl = rawUrl ? `https://realestate.co.jp${rawUrl}` : `https://realestate.co.jp/en/forsale/view/${id}`;
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

async function enrichItemSafe(item, proxyUrl) {
    const html = await fetchHtml(item.url, proxyUrl);
    if (html) return enrichItem(html, item);
    return item;
}

async function main() {
    try {
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

        let proxyUrl = null;
        if (proxyConfiguration?.useApifyProxy) {
            const proxy = await Actor.createProxyConfiguration({
                groups: proxyConfiguration.apifyProxyGroups || ['RESIDENTIAL'],
                countryCode: proxyConfiguration.apifyProxyCountry,
            });
            proxyUrl = proxy.newUrl();
        }

        const startUrls = [];
        if (startUrl) {
            startUrls.push(startUrl);
        } else {
            const url = new URL('https://realestate.co.jp/en/forsale/listing');
            if (locationInput) url.searchParams.set('prefecture', locationInput);
            if (propertyType) url.searchParams.set('building_type', propertyType);
            if (minPrice) url.searchParams.set('min_price', String(minPrice));
            if (maxPrice) url.searchParams.set('max_price', String(maxPrice));
            url.searchParams.set('page', '1');
            startUrls.push(url.href);
        }

        const withDetail = input.withDetail !== false;

        log.info(`Scrape | target=${RESULTS_WANTED} | detail=${withDetail} | proxy=${!!proxyUrl}`);

        const seenIds = new Set();
        const pendingItems = [];
        let listingDone = false;
        let totalSaved = 0;
        let done = false;

        function claimItem() {
            for (let i = 0; i < pendingItems.length; i++) {
                if (!pendingItems[i].claimed) {
                    pendingItems[i].claimed = true;
                    return pendingItems[i];
                }
            }
            return null;
        }

        async function detailWorker() {
            while (!done) {
                const item = claimItem();
                if (!item) {
                    if (listingDone) return;
                    await new Promise(resolve => { setTimeout(resolve, 50 + Math.random() * 100); });
                    continue;
                }
                if (totalSaved >= RESULTS_WANTED) { done = true; break; }
                const enriched = withDetail ? await enrichItemSafe(item, proxyUrl) : item;
                if (done) break;
                await Actor.pushData(enriched);
                totalSaved++;
                if (totalSaved >= RESULTS_WANTED) done = true;
            }
        }

        async function listingCrawler() {
            for (const initialUrl of startUrls) {
                let currentUrl = initialUrl;
                let page = 1;

                let retries = 0;
                while (!done && page <= SAFETY_MAX_PAGES) {
                    const html = await fetchHtml(currentUrl, proxyUrl);
                    if (!html) {
                        retries++;
                        if (retries >= 3) break;
                        await new Promise(resolve => { setTimeout(resolve, 2000 + Math.random() * 3000); });
                        continue;
                    }
                    retries = 0;

                    const $ = cheerioLoad(html);
                    const items = extractListings($);
                    if (items.length === 0) break;

                    for (const item of items) {
                        if (done) break;
                        if (!item.id || seenIds.has(item.id)) continue;
                        seenIds.add(item.id);
                        pendingItems.push(item);
                    }

                    if (done) break;

                    const nextUrl = findNextPageUrl($, currentUrl);
                    if (!nextUrl || nextUrl === currentUrl) break;
                    currentUrl = nextUrl;
                    page++;

                    await new Promise(resolve => { setTimeout(resolve, 300 + Math.random() * 700); });
                }
            }
            listingDone = true;
        }

        await Promise.all([
            listingCrawler(),
            ...Array.from({ length: DETAIL_CONCURRENCY }, () => detailWorker()),
        ]);

        log.info(`Done | saved=${totalSaved}`);
    } finally {
        await Actor.exit();
    }
}

main().catch(err => { log.error(err.message); process.exit(1); });
