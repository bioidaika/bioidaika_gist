// ==UserScript==
// @name         Universal Tracker - Reliable Smart Torrent Download v4.1
// @namespace    https://github.com/bioidaika/bioidaika_gist
// @version      4.1.0
// @updateURL    https://raw.githubusercontent.com/bioidaika/bioidaika_gist/master/tampermonkey-userscript/batch-download-torrents.user.js
// @downloadURL  https://raw.githubusercontent.com/bioidaika/bioidaika_gist/master/tampermonkey-userscript/batch-download-torrents.user.js
// @description  Download validated torrent files from modern/legacy UNIT3D, NexusPHP, Kokocon and IPTorrents with bounded retry and cancellation
// @match        https://*/torrents*
// @match        https://tracker.kokocon.net/index.php*
// @match        https://www.iptorrents.com/t*
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    const DELAY = 2200;
    const RETRY_DELAY_BASE = 2200;
    const MAX_RETRY_DELAY = 30000; // Cap retry delay at 30 seconds
    const MAX_ATTEMPTS = 4;
    const REQUEST_TIMEOUT = 45000;
    const MAX_RESPONSE_BYTES = 64 * 1024 * 1024;

    const QUALITY_FEATURES = {
        resolution: [
            { label: '8K', score: 7000, pattern: '(?:4320p|8k)' },
            { label: '4K', score: 6000, pattern: '(?:2160p|4k|uhd)' },
            { label: '1440p', score: 5000, pattern: '1440p' },
            { label: '1080p', score: 4000, pattern: '1080p' },
            { label: '1080i', score: 3800, pattern: '1080i' },
            { label: '720p', score: 3000, pattern: '720p' },
            { label: '576p', score: 2000, pattern: '(?:576p|576i)' },
            { label: '480p', score: 1000, pattern: '(?:480p|480i)' }
        ],
        source: [
            { label: 'REMUX', score: 600, pattern: 'remux' },
            { label: 'BluRay', score: 500, pattern: '(?:blu[\\s._-]*ray|bdrip|brrip)' },
            { label: 'WEB-DL', score: 400, pattern: 'web[\\s._-]*dl' },
            { label: 'WEBRip', score: 300, pattern: 'web[\\s._-]*rip' },
            { label: 'HDTV', score: 200, pattern: 'hdtv' },
            { label: 'DVD', score: 100, pattern: 'dvd(?:[\\s._-]*rip)?' }
        ],
        codec: [
            { label: 'AV1', score: 100, pattern: 'av1' },
            { label: 'HEVC', score: 90, pattern: '(?:x265|h[\\s._-]*265|hevc)' },
            { label: 'AVC', score: 60, pattern: '(?:x264|h[\\s._-]*264|avc)' }
        ],
        audio: [
            { label: 'Atmos', score: 250, pattern: 'atmos' },
            { label: 'TrueHD', score: 220, pattern: 'true[\\s._-]*hd' },
            { label: 'DTS-HD', score: 190, pattern: 'dts[\\s._-]*hd(?:[\\s._-]*ma)?' },
            { label: 'DTS', score: 140, pattern: 'dts' },
            { label: 'DD+', score: 120, pattern: '(?:dd\\+|ddp|e[\\s._-]*ac[\\s._-]*3|eac3)' },
            { label: 'DD', score: 90, pattern: '(?:dd|ac[\\s._-]*3|ac3)' },
            { label: 'AAC', score: 60, pattern: 'aac' }
        ],
        hdr: [
            { label: 'DV', score: 180, pattern: '(?:dolby[\\s._-]*vision|dovi|dv)' },
            { label: 'HDR10+', score: 150, pattern: 'hdr10\\+' },
            { label: 'HDR10', score: 130, pattern: 'hdr10' },
            { label: 'HDR', score: 100, pattern: '(?:hdr|hlg)' }
        ]
    };
    const BAD_SOURCE_PATTERN = '(?:hd[\\s._-]*cam|cam[\\s._-]*rip|cam|hdts|telesync|telecine|workprint|dvd[\\s._-]*scr|screener)';

    function normalizeTorrentText(value) {
        return String(value || '')
            .normalize('NFKC')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/\u00A0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // Match release tokens, not arbitrary substrings such as "dv" in "adventure".
    function hasQualityToken(text, pattern) {
        return new RegExp('(?:^|[^a-z0-9])(?:' + pattern + ')(?=$|[^a-z0-9])', 'i').test(text);
    }

    function removeQualityToken(text, pattern) {
        return text.replace(
            new RegExp('(?:^|[^a-z0-9])(?:' + pattern + ')(?=$|[^a-z0-9])', 'gi'),
            ' '
        );
    }

    function firstQualityFeature(text, features) {
        return features.find(function (feature) {
            return hasQualityToken(text, feature.pattern);
        }) || null;
    }

    function parseQuality(name) {
        const text = normalizeTorrentText(name).toLowerCase();
        const resolution = firstQualityFeature(text, QUALITY_FEATURES.resolution);
        const source = firstQualityFeature(text, QUALITY_FEATURES.source);
        const codec = firstQualityFeature(text, QUALITY_FEATURES.codec);
        const audio = firstQualityFeature(text, QUALITY_FEATURES.audio);
        const hdr = firstQualityFeature(text, QUALITY_FEATURES.hdr);
        const badSource = hasQualityToken(text, BAD_SOURCE_PATTERN);
        const upscale = hasQualityToken(text, 'upscal(?:e|ed)');
        const proper = hasQualityToken(text, 'proper');
        const repack = hasQualityToken(text, 'repack');

        const score =
            (resolution ? resolution.score : 0) +
            (source ? source.score : 0) +
            (codec ? codec.score : 0) +
            (audio ? audio.score : 0) +
            (hdr ? hdr.score : 0) +
            (proper ? 60 : 0) +
            (repack ? 60 : 0) -
            (badSource ? 10000 : 0) -
            (upscale ? 800 : 0);

        return {
            resolution: resolution,
            source: source,
            codec: codec,
            audio: audio,
            hdr: hdr,
            proper: proper,
            repack: repack,
            score: score,
            label: [
                resolution && resolution.label,
                source && source.label,
                codec && codec.label,
                hdr && hdr.label,
                repack ? 'REPACK' : (proper ? 'PROPER' : null)
            ].filter(Boolean).join(' ') || 'Unknown'
        };
    }

    function getQualityScore(name) {
        return parseQuality(name).score;
    }

    function getLabel(name) {
        return parseQuality(name).label;
    }

    // Group by title while preserving year, episode, edition and language markers.
    function groupTorrentsByTitle(torrents) {
        const groups = new Map();
        const removablePatterns = []
            .concat(QUALITY_FEATURES.resolution)
            .concat(QUALITY_FEATURES.source)
            .concat(QUALITY_FEATURES.codec)
            .concat(QUALITY_FEATURES.audio)
            .concat(QUALITY_FEATURES.hdr)
            .map(function (feature) { return feature.pattern; })
            .concat([
                BAD_SOURCE_PATTERN,
                'upscal(?:e|ed)',
                '(?:proper|repack|rerip|internal)',
                '(?:(?:8|10|12)[\\s._-]*bit)',
                '(?:1[\\s._-]*0|2[\\s._-]*0|5[\\s._-]*1|7[\\s._-]*1)',
                '(?:mkv|mp4)'
            ]);

        torrents.forEach(function (torrent) {
            const parsed = parseQuality(torrent.name);
            let baseTitle = normalizeTorrentText(torrent.name).toLowerCase();

            // Strip a release-group suffix only when a technical marker precedes it.
            baseTitle = baseTitle.replace(
                /((?:x26[45]|h[\s._]?26[45]|hevc|av1|web[\s._-]?dl|blu[\s._-]?ray|remux|dts(?:[\s._-]*hd)?|ddp?))-([a-z0-9][a-z0-9._]{1,30})$/i,
                '$1'
            );
            removablePatterns.forEach(function (pattern) {
                baseTitle = removeQualityToken(baseTitle, pattern);
            });
            baseTitle = baseTitle
                .replace(/[\[\](){}]/g, ' ')
                .replace(/[._]+/g, ' ')
                .replace(/\s+-\s+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            const key = baseTitle || normalizeTorrentText(torrent.name).toLowerCase();
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key).push(torrent);
            torrent.parsedQuality = parsed;
        });

        return Array.from(groups.values());
    }

    const UNIT3D_DOWNLOAD_SELECTOR = [
        'a.torrent-search-row__action--download[href]',
        'a.similar-torrent-row__action--download[href]',
        'a.torrent-search--list__file[href]',
        '.torrent-search--grouped__download a[href]',
        'td.torrent-listings-download a[href]',
        'a[href*="/torrents/download/"]',
        'a[href*="/torrents/download_check/"]',
        'a[href*="/download/"]',
        'a[href*="/download_check/"]'
    ].join(', ');

    function unit3dDownloadInfo(downloadLink) {
        const rawHref = downloadLink && (
            downloadLink.getAttribute('href') ||
            downloadLink.href
        );
        let url;
        try {
            url = new URL(rawHref, location.href);
        } catch (error) {
            return null;
        }

        if (
            url.protocol !== 'https:' ||
            url.origin !== location.origin ||
            url.username ||
            url.password
        ) {
            return null;
        }

        const match = url.pathname.match(
            /^\/(?:torrents\/)?(download|download_check)\/(\d+)\/?$/i
        );
        if (!match) {
            return null;
        }

        const sourceType = match[1].toLowerCase();
        if (sourceType === 'download_check') {
            url.pathname = url.pathname.replace(/\/download_check\//i, '/download/');
        }
        url.hash = '';

        return {
            id: match[2],
            sourceType: sourceType,
            url: url
        };
    }

    function unit3dDetailId(link) {
        let url;
        try {
            url = new URL(link.getAttribute('href') || link.href, location.href);
        } catch (error) {
            return '';
        }
        if (url.protocol !== 'https:' || url.origin !== location.origin) {
            return '';
        }
        const match = url.pathname.match(/^\/torrents\/(\d+)(?:\.[^/]+)?\/?$/i);
        return match ? match[1] : '';
    }

    function findUnit3dNameLink(downloadLink) {
        const download = unit3dDownloadInfo(downloadLink);
        if (!download) {
            return null;
        }

        const row = downloadLink.closest([
            'article.torrent-search-row',
            'article.similar-torrent-row',
            'article.torrent-card',
            'tr[data-torrent-id]',
            'tr',
            '[data-torrent-id]'
        ].join(', '));
        if (!row) {
            return null;
        }

        const semanticSelectors = [
            '.torrent-search-row__name a[href]',
            '.similar-torrent-row__name a[href]',
            'a.torrent-search--list__name[href]',
            '.torrent-search--grouped__name a[href]',
            'a.torrent-card__link[href]',
            'a.view-torrent.torrent-listings-name[href]'
        ];

        for (const selector of semanticSelectors) {
            const candidates = Array.from(row.querySelectorAll(selector));
            const exact = candidates.find(link => unit3dDetailId(link) === download.id);
            if (exact) {
                return exact;
            }
        }

        return Array.from(row.querySelectorAll('a[href]'))
            .filter(link => unit3dDetailId(link) === download.id)
            .sort((left, right) => (
                normalizeTorrentText(right.textContent).length -
                normalizeTorrentText(left.textContent).length
            ))[0] || null;
    }

    function hasUnit3dDownloadLinks(root) {
        return Array.from(root.querySelectorAll(UNIT3D_DOWNLOAD_SELECTOR))
            .some(link => unit3dDownloadInfo(link) !== null);
    }

    function collectUnit3dTorrents(root) {
        const torrents = [];
        const seenIds = new Set();

        root.querySelectorAll(UNIT3D_DOWNLOAD_SELECTOR).forEach(downloadLink => {
            const download = unit3dDownloadInfo(downloadLink);
            if (!download || seenIds.has(download.id)) {
                return;
            }

            const nameLink = findUnit3dNameLink(downloadLink);
            const row = downloadLink.closest(
                'article.torrent-search-row, article.similar-torrent-row, article.torrent-card, ' +
                'tr, [data-torrent-id]'
            );
            const name =
                normalizeTorrentText(nameLink && nameLink.textContent) ||
                normalizeTorrentText(row && row.getAttribute('data-torrent-name')) ||
                'Torrent ' + download.id;

            torrents.push({
                link: downloadLink,
                url: download.url.href,
                torrentId: download.id,
                name: name,
                score: getQualityScore(name),
                label: getLabel(name)
            });
            seenIds.add(download.id);
        });

        return torrents;
    }

    function getUnit3dGroupRoots() {
        const modernLists = Array.from(
            document.querySelectorAll(
                '.torrent-search--grouped__results .similar-torrents-list, ' +
                '.torrent-search--grouped__result .similar-torrents-list, ' +
                '.torrent-search--grouped__dropdown > .similar-torrents-list'
            )
        ).filter(list => hasUnit3dDownloadLinks(list));
        if (modernLists.length) {
            return modernLists;
        }

        const legacyTables = Array.from(
            document.querySelectorAll('table.torrent-search--grouped__torrents')
        ).filter(table => hasUnit3dDownloadLinks(table));
        if (legacyTables.length) {
            return legacyTables;
        }

        return Array.from(
            document.querySelectorAll('article.torrent-search--grouped__result')
        ).filter(card => hasUnit3dDownloadLinks(card));
    }

    function collectUnit3dGroups(groupRoots) {
        return groupRoots
            .map(root => collectUnit3dTorrents(root))
            .filter(group => group.length);
    }

    function getUnit3dFlatRoot() {
        const selectors = [
            '.torrent-results__list',
            '.torrent-search--list__results',
            '.torrent-search--card__results',
            '.torrent-listings-overview',
            '.torrent-search__component'
        ];
        for (const selector of selectors) {
            const root = document.querySelector(selector);
            if (root && hasUnit3dDownloadLinks(root)) {
                return root;
            }
        }
        return document;
    }

    function normalizeTorrentJobs(torrents) {
        const seenUrls = new Set();
        const jobs = [];

        torrents.forEach(function (torrent) {
            const rawHref = torrent.url || (
                torrent.link &&
                (torrent.link.getAttribute('href') || torrent.link.href)
            );
            let url;
            try {
                url = new URL(rawHref, location.href);
            } catch (error) {
                return;
            }

            const unit3dCheckPath = url.pathname.match(
                /^\/(?:torrents\/)?download_check\/(\d+)\/?$/i
            );
            if (unit3dCheckPath) {
                url.pathname = url.pathname.replace(/\/download_check\//i, '/download/');
            }
            const allowedPath =
                /^\/(?:torrents\/)?download\/\d+\/?$/i.test(url.pathname) ||
                /\/download\.php(?:\/|$)/i.test(url.pathname);
            if (
                url.protocol !== 'https:' ||
                url.origin !== location.origin ||
                url.username ||
                url.password ||
                !allowedPath
            ) {
                return;
            }

            url.hash = '';
            if (seenUrls.has(url.href)) {
                return;
            }
            seenUrls.add(url.href);
            jobs.push(Object.assign({}, torrent, {
                url: url.href,
                link: null
            }));
        });

        return jobs;
    }

    const initialHostname = location.hostname.toLowerCase().replace(/\.$/, '');
    const knownTrackerHost =
        initialHostname === 'kokocon.net' ||
        initialHostname.endsWith('.kokocon.net') ||
        initialHostname === 'iptorrents.com' ||
        initialHostname.endsWith('.iptorrents.com');
    const hasTrackerMarkup = Boolean(document.querySelector(
        '.torrent-search__component, .page__torrents, .torrent-results, ' +
        'article.torrent-search--grouped__result, article.torrent-search-row, ' +
        'article.similar-torrent-row, article.torrent-card, ' +
        'table.torrent-search--grouped__torrents, table.torrent, table.torrents, #torrenttable, ' +
        'a[href*="/torrents/download/"], a[href*="/torrents/download_check/"], ' +
        'a[href*="download.php"]'
    ));
    // Avoid injecting a control on an unrelated page that merely happens to match /torrents.
    if (!knownTrackerHost && !hasTrackerMarkup) {
        return;
    }

    let activeDownloadController = null;
    const btn = document.createElement('button');
    btn.textContent = '🎯 Best Quality';
    btn.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;padding:12px 16px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;box-shadow:0 4px 15px rgba(102,126,234,0.4)';

    document.body.appendChild(btn);

    // Create mode selection dialog
    function showModeDialog() {
        return new Promise((resolve) => {
            // Create overlay
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.3s;';

            // Create dialog
            const dialog = document.createElement('div');
            dialog.style.cssText = 'background:#1e1e2e;border-radius:16px;padding:32px;max-width:500px;box-shadow:0 20px 60px rgba(0,0,0,0.3);animation:slideUp 0.3s;';

            dialog.innerHTML = `
                <style>
                    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                    @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                    .mode-title { color: #cdd6f4; font-size: 24px; font-weight: 700; margin-bottom: 8px; text-align: center; }
                    .mode-subtitle { color: #a6adc8; font-size: 14px; margin-bottom: 24px; text-align: center; }
                    .mode-btn { width: 100%; padding: 16px; margin: 8px 0; border: 2px solid; border-radius: 12px; cursor: pointer; font-size: 16px; font-weight: 600; transition: all 0.3s; display: flex; flex-direction: column; align-items: flex-start; }
                    .mode-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(0,0,0,0.2); }
                    .smart-btn { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-color: #667eea; color: white; }
                    .smart-btn:hover { background: linear-gradient(135deg, #7c8ef5 0%, #8a5bb5 100%); }
                    .all-btn { background: #313244; border-color: #45475a; color: #cdd6f4; }
                    .all-btn:hover { background: #45475a; border-color: #585b70; }
                    .btn-title { font-size: 18px; margin-bottom: 4px; }
                    .btn-desc { font-size: 13px; opacity: 0.8; font-weight: 400; }
                    .cancel-btn { margin-top: 16px; width: 100%; padding: 12px; background: transparent; border: 1px solid #45475a; border-radius: 8px; color: #a6adc8; cursor: pointer; font-size: 14px; transition: all 0.3s; }
                    .cancel-btn:hover { background: #313244; border-color: #585b70; }
                </style>
                <div class="mode-title">🎯 Select Download Mode</div>
                <div class="mode-subtitle">Choose how you want to download torrents</div>
                
                <button class="mode-btn smart-btn" data-mode="smart">
                    <div class="btn-title">⚡ Smart Filter (Best Quality)</div>
                    <div class="btn-desc">Automatically selects the highest quality torrent from each group</div>
                </button>
                
                <button class="mode-btn all-btn" data-mode="all">
                    <div class="btn-title">📦 Download All</div>
                    <div class="btn-desc">Download every single torrent on this page</div>
                </button>
                
                <button class="cancel-btn">✕ Cancel</button>
            `;

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            // Handle button clicks
            dialog.querySelectorAll('.mode-btn').forEach(btn => {
                btn.onclick = () => {
                    const mode = btn.getAttribute('data-mode');
                    overlay.style.animation = 'fadeIn 0.2s reverse';
                    setTimeout(() => {
                        document.body.removeChild(overlay);
                        resolve(mode);
                    }, 200);
                };
            });

            // Handle cancel
            dialog.querySelector('.cancel-btn').onclick = () => {
                overlay.style.animation = 'fadeIn 0.2s reverse';
                setTimeout(() => {
                    document.body.removeChild(overlay);
                    resolve(null);
                }, 200);
            };

            // Handle click outside
            overlay.onclick = (e) => {
                if (e.target === overlay) {
                    overlay.style.animation = 'fadeIn 0.2s reverse';
                    setTimeout(() => {
                        document.body.removeChild(overlay);
                        resolve(null);
                    }, 200);
                }
            };
        });
    }

    class TorrentDownloadError extends Error {
        constructor(message, retryable, retryAfterMs) {
            super(message);
            this.name = 'TorrentDownloadError';
            this.retryable = Boolean(retryable);
            this.retryAfterMs = Number.isFinite(retryAfterMs) ? retryAfterMs : null;
        }
    }

    function abortError() {
        try {
            return new DOMException('Download cancelled', 'AbortError');
        } catch (error) {
            const result = new Error('Download cancelled');
            result.name = 'AbortError';
            return result;
        }
    }

    function throwIfAborted(signal) {
        if (signal && signal.aborted) {
            throw abortError();
        }
    }

    function abortableDelay(milliseconds, signal) {
        return new Promise((resolve, reject) => {
            let timer;
            const onAbort = () => {
                clearTimeout(timer);
                cleanup();
                reject(abortError());
            };
            const cleanup = () => {
                if (signal) signal.removeEventListener('abort', onAbort);
            };
            throwIfAborted(signal);
            if (signal) signal.addEventListener('abort', onAbort, { once: true });
            timer = setTimeout(() => {
                cleanup();
                resolve();
            }, milliseconds);
        });
    }

    function parseRetryAfter(value) {
        if (!value) return null;
        const seconds = Number(value);
        if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
        const date = Date.parse(value);
        return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
    }

    async function readTorrentBytes(response, signal) {
        const declaredLength = Number(response.headers.get('content-length'));
        if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
            throw new TorrentDownloadError('Torrent response exceeds the safety limit', false);
        }

        if (!response.body || typeof response.body.getReader !== 'function') {
            const buffer = await response.arrayBuffer();
            if (buffer.byteLength > MAX_RESPONSE_BYTES) {
                throw new TorrentDownloadError('Torrent response exceeds the safety limit', false);
            }
            return new Uint8Array(buffer);
        }

        const reader = response.body.getReader();
        const chunks = [];
        let total = 0;
        try {
            while (true) {
                throwIfAborted(signal);
                const part = await reader.read();
                if (part.done) break;
                total += part.value.byteLength;
                if (total > MAX_RESPONSE_BYTES) {
                    await reader.cancel();
                    throw new TorrentDownloadError('Torrent response exceeds the safety limit', false);
                }
                chunks.push(part.value);
            }
        } finally {
            reader.releaseLock();
        }

        const bytes = new Uint8Array(total);
        let offset = 0;
        chunks.forEach(chunk => {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
        });
        return bytes;
    }

    // Validate the bencode structure and require a root-level dictionary named "info".
    function validateTorrentBytes(bytes) {
        if (!(bytes instanceof Uint8Array) || bytes.length < 10 || bytes[0] !== 100) {
            throw new TorrentDownloadError('Response is not a torrent file', false);
        }

        let cursor = 0;
        let foundInfo = false;
        const fail = () => {
            throw new TorrentDownloadError('Response is not a valid bencoded torrent', false);
        };
        const digit = value => value >= 48 && value <= 57;

        function stringValue() {
            if (!digit(bytes[cursor])) fail();
            const start = cursor;
            let length = 0;
            while (cursor < bytes.length && digit(bytes[cursor])) {
                length = length * 10 + bytes[cursor] - 48;
                if (!Number.isSafeInteger(length) || length > MAX_RESPONSE_BYTES) fail();
                cursor++;
            }
            if (bytes[cursor] !== 58 || (cursor - start > 1 && bytes[start] === 48)) fail();
            cursor++;
            const valueStart = cursor;
            cursor += length;
            if (cursor > bytes.length) fail();
            return { start: valueStart, end: cursor };
        }

        function isKey(range, value) {
            if (range.end - range.start !== value.length) return false;
            for (let i = 0; i < value.length; i++) {
                if (bytes[range.start + i] !== value.charCodeAt(i)) return false;
            }
            return true;
        }

        function integerValue() {
            cursor++;
            const start = cursor;
            if (bytes[cursor] === 45) cursor++;
            const digits = cursor;
            while (cursor < bytes.length && digit(bytes[cursor])) cursor++;
            const count = cursor - digits;
            if (!count || bytes[cursor] !== 101 || (count > 1 && bytes[digits] === 48)) fail();
            if (bytes[start] === 45 && count === 1 && bytes[digits] === 48) fail();
            cursor++;
        }

        function value(depth) {
            if (depth > 100 || cursor >= bytes.length) fail();
            const type = bytes[cursor];
            if (digit(type)) {
                stringValue();
                return;
            }
            if (type === 105) {
                integerValue();
                return;
            }
            if (type === 108) {
                cursor++;
                while (bytes[cursor] !== 101) value(depth + 1);
                cursor++;
                return;
            }
            if (type === 100) {
                cursor++;
                while (bytes[cursor] !== 101) {
                    const key = stringValue();
                    const infoKey = depth === 0 && isKey(key, 'info');
                    if (infoKey && bytes[cursor] !== 100) fail();
                    value(depth + 1);
                    if (infoKey) foundInfo = true;
                }
                cursor++;
                return;
            }
            fail();
        }

        value(0);
        if (cursor !== bytes.length || !foundInfo) fail();
    }

    function responseFilename(response, fallback) {
        const header = response.headers.get('content-disposition') || '';
        let filename = '';
        const extended = header.match(/filename\*\s*=\s*(?:"([^"]+)"|([^;]+))/i);
        const basic = header.match(/filename\s*=\s*(?:"([^"]*)"|([^;]*))/i);
        if (extended) {
            filename = (extended[1] || extended[2]).trim();
            const separator = filename.indexOf("''");
            if (separator >= 0) filename = filename.slice(separator + 2);
            try { filename = decodeURIComponent(filename); } catch (error) { /* keep raw */ }
        } else if (basic) {
            filename = (basic[1] || basic[2]).trim();
        }
        filename = normalizeTorrentText(filename || fallback)
            .replace(/[\u0000-\u001F\u007F]/g, '')
            .replace(/[\u202A-\u202E\u2066-\u2069]/g, '')
            .replace(/[\\/:*?"<>|]/g, '_')
            .replace(/\.torrent$/i, '')
            .replace(/[.\s]+$/g, '')
            .slice(0, 180);
        return (filename || 'torrent') + '.torrent';
    }

    function uniqueFilename(filename, used) {
        const lower = filename.toLowerCase();
        if (!used.has(lower)) {
            used.add(lower);
            return filename;
        }
        const base = filename.replace(/\.torrent$/i, '');
        let index = 2;
        let candidate = base + ' (' + index + ').torrent';
        while (used.has(candidate.toLowerCase())) {
            index++;
            candidate = base + ' (' + index + ').torrent';
        }
        used.add(candidate.toLowerCase());
        return candidate;
    }

    async function fetchTorrentFile(torrent, signal) {
        const requestController = new AbortController();
        let timedOut = false;
        const timeout = setTimeout(() => {
            timedOut = true;
            requestController.abort();
        }, REQUEST_TIMEOUT);
        const onAbort = () => requestController.abort();
        signal.addEventListener('abort', onAbort, { once: true });

        try {
            const response = await fetch(torrent.url, {
                credentials: 'same-origin',
                redirect: 'follow',
                cache: 'no-store',
                signal: requestController.signal,
                headers: { Accept: 'application/x-bittorrent, application/octet-stream;q=0.9, */*;q=0.1' }
            });
            const finalUrl = new URL(response.url || torrent.url, location.href);
            if (finalUrl.protocol !== 'https:' || finalUrl.origin !== location.origin) {
                throw new TorrentDownloadError('Download redirected outside the tracker origin', false);
            }
            if (!response.ok) {
                throw new TorrentDownloadError(
                    'Tracker returned HTTP ' + response.status,
                    [408, 425, 429, 500, 502, 503, 504].includes(response.status),
                    parseRetryAfter(response.headers.get('retry-after'))
                );
            }
            const contentType = (response.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('text/html') || contentType.includes('application/json')) {
                throw new TorrentDownloadError('Tracker returned a login/error page', false);
            }
            const bytes = await readTorrentBytes(response, requestController.signal);
            validateTorrentBytes(bytes);
            return { bytes: bytes, filename: responseFilename(response, torrent.name) };
        } catch (error) {
            if (signal.aborted) throw abortError();
            if (timedOut) throw new TorrentDownloadError('Request timed out', true);
            if (error instanceof TorrentDownloadError) throw error;
            if (error.name === 'AbortError' || error instanceof TypeError) {
                throw new TorrentDownloadError('Network request failed or was blocked', true);
            }
            throw error;
        } finally {
            clearTimeout(timeout);
            signal.removeEventListener('abort', onAbort);
        }
    }

    function saveTorrentFile(file, filename, signal) {
        throwIfAborted(signal);
        const objectUrl = URL.createObjectURL(new Blob([file.bytes], { type: 'application/x-bittorrent' }));
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = filename;
        anchor.rel = 'noopener';
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        try {
            throwIfAborted(signal);
            anchor.click();
        } finally {
            anchor.remove();
            setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
        }
    }

    async function downloadTorrentWithRetry(torrent, index, total, signal, usedNames, onProgress) {
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            throwIfAborted(signal);
            onProgress('download', index, total, torrent, attempt);
            try {
                const file = await fetchTorrentFile(torrent, signal);
                saveTorrentFile(file, uniqueFilename(file.filename, usedNames), signal);
                return;
            } catch (error) {
                if (error.name === 'AbortError') throw error;
                if (!(error instanceof TorrentDownloadError) || !error.retryable || attempt === MAX_ATTEMPTS) {
                    throw error;
                }
                const exponential = Math.min(RETRY_DELAY_BASE * Math.pow(2, attempt - 1), MAX_RETRY_DELAY);
                const retryAfter = Number.isFinite(error.retryAfterMs) ? error.retryAfterMs : 0;
                const delay = Math.min(Math.max(exponential, retryAfter), MAX_RETRY_DELAY);
                onProgress('retry', index, total, torrent, attempt + 1, delay);
                await abortableDelay(delay, signal);
            }
        }
    }

    async function runDownloadQueue(torrents, controller, onProgress) {
        const result = { handedToBrowser: 0, failed: 0, cancelled: false };
        const usedNames = new Set();
        for (let index = 0; index < torrents.length; index++) {
            try {
                await downloadTorrentWithRetry(
                    torrents[index],
                    index,
                    torrents.length,
                    controller.signal,
                    usedNames,
                    onProgress
                );
                result.handedToBrowser++;
            } catch (error) {
                if (error.name === 'AbortError') {
                    result.cancelled = true;
                    break;
                }
                result.failed++;
                console.error('[Download] Item ' + (index + 1) + ' failed: ' + (error.message || 'unknown error'));
            }
            if (index < torrents.length - 1) {
                try {
                    await abortableDelay(DELAY, controller.signal);
                } catch (error) {
                    result.cancelled = true;
                    break;
                }
            }
        }
        return result;
    }

    btn.onclick = async () => {
        if (activeDownloadController) {
            activeDownloadController.abort();
            btn.textContent = '⏳ Cancelling...';
            return;
        }

        // Show mode selection dialog
        const mode = await showModeDialog();

        if (!mode) {
            console.log('[Cancelled] User cancelled the operation');
            return;
        }

        console.log(`[Start] Mode: ${mode}, Scanning for torrents...`);

        // Detect tracker type
        const unit3dGroupRoots = getUnit3dGroupRoots();
        const isUNIT3DGrouped = unit3dGroupRoots.length > 0;
        const unit3dFlatRoot = getUnit3dFlatRoot();
        const isUNIT3DFlat =
            !isUNIT3DGrouped &&
            hasUnit3dDownloadLinks(unit3dFlatRoot);
        const isUNIT3D = isUNIT3DGrouped || isUNIT3DFlat;
        const isNexusPHP = !isUNIT3D &&
            document.querySelector('table.torrent, table.torrents, #torrenttable') !== null;
        const hostname = location.hostname.toLowerCase().replace(/\.$/, '');
        const isKokocon = hostname === 'kokocon.net' || hostname.endsWith('.kokocon.net');
        const isIPTorrents = hostname === 'iptorrents.com' || hostname.endsWith('.iptorrents.com');
        const trackerType = isKokocon
            ? 'kokocon'
            : (isIPTorrents
                ? 'iptorrents'
                : (isUNIT3D
                    ? 'unit3d'
                    : (isNexusPHP ? 'nexusphp' : 'unknown')));

        console.log(`[Tracker Type] UNIT3D-Grouped: ${isUNIT3DGrouped}, UNIT3D-Flat: ${isUNIT3DFlat}, NexusPHP: ${isNexusPHP}, Kokocon: ${isKokocon}, IPTorrents: ${isIPTorrents}`);

        let bestTorrents = [];
        const qualityCounts = {};

        // MODE: Download All - Collect all torrents without filtering
        if (mode === 'all') {
            console.log('[Mode] Download All - Collecting all torrents...');

            if (trackerType === 'unit3d') {
                if (isUNIT3DGrouped) {
                    const groups = collectUnit3dGroups(unit3dGroupRoots);
                    console.log(`[Found] ${groups.length} torrent groups (UNIT3D Grouped)`);

                    groups.flat().forEach(torrent => {
                        bestTorrents.push(torrent);
                        qualityCounts[torrent.label] = (qualityCounts[torrent.label] || 0) + 1;
                    });
                } else {
                    const torrents = collectUnit3dTorrents(unit3dFlatRoot);
                    console.log(`[Found] ${torrents.length} torrents (UNIT3D Flat)`);

                    torrents.forEach(torrent => {
                        bestTorrents.push(torrent);
                        qualityCounts[torrent.label] = (qualityCounts[torrent.label] || 0) + 1;
                    });
                }
            } else if (trackerType === 'nexusphp') {
                const table = document.querySelector('table.torrent, table.torrents, #torrenttable');
                if (!table) {
                    alert('❌ No torrent table found');
                    return;
                }

                const rows = table.querySelectorAll('tr');
                rows.forEach(tr => {
                    const downloadLink = tr.querySelector('a[href*="download.php"]');
                    const nameLinks = tr.querySelectorAll(
                        'td.name a, a[href*="details.php"], a[href*="torrent.php"]'
                    );
                    let nameLink = null;

                    for (const link of nameLinks) {
                        if (!link.href.includes('download') && !link.href.includes('bookmark')) {
                            const text = link.textContent.trim();
                            if (text && !/^(?:download|bookmark|view|details?)$/i.test(text)) {
                                nameLink = link;
                                break;
                            }
                        }
                    }

                    if (downloadLink && nameLink) {
                        const name = nameLink.textContent.trim();
                        const label = getLabel(name);

                        bestTorrents.push({
                            link: downloadLink,
                            name: name,
                            score: 0,
                            label: label
                        });
                        qualityCounts[label] = (qualityCounts[label] || 0) + 1;
                    }
                });
            } else if (trackerType === 'kokocon') {
                // Kokocon - plain table with no CSS classes
                const rows = document.querySelectorAll('table tr');
                console.log(`[Found] ${rows.length} rows (Kokocon)`);

                rows.forEach(tr => {
                    const downloadLink = tr.querySelector('a[href*="download.php"]');
                    const nameLink = tr.querySelector('a[href*="/torrent/"]');

                    if (downloadLink && nameLink) {
                        const name = nameLink.textContent.trim();
                        const label = getLabel(name);

                        bestTorrents.push({
                            link: downloadLink,
                            name: name,
                            score: 0,
                            label: label
                        });
                        qualityCounts[label] = (qualityCounts[label] || 0) + 1;
                    }
                });
            } else if (trackerType === 'iptorrents') {
                // IPTorrents - table#torrents has the search results, skip top_torrents sections
                const rows = document.querySelectorAll('table#torrents tr');
                console.log(`[Found] ${rows.length} rows (IPTorrents)`);

                rows.forEach(tr => {
                    const downloadLink = tr.querySelector('a[href*="download.php"]');
                    const nameLink = tr.querySelector('a.hv');

                    if (downloadLink && nameLink) {
                        const name = nameLink.textContent.trim();
                        if (name.length < 5) return; // Skip short labels
                        const label = getLabel(name);

                        bestTorrents.push({
                            link: downloadLink,
                            name: name,
                            score: 0,
                            label: label
                        });
                        qualityCounts[label] = (qualityCounts[label] || 0) + 1;
                    }
                });
            }

            console.log(`[Collected] ${bestTorrents.length} torrents (all)`);

            // MODE: Smart Filter - Select best quality from each group
        } else if (mode === 'smart') {
            console.log('[Mode] Smart Filter - Selecting best quality...');

            if (trackerType === 'unit3d') {
                let groups;
                if (isUNIT3DGrouped) {
                    groups = collectUnit3dGroups(unit3dGroupRoots);
                    console.log(`[Found] ${groups.length} torrent groups (UNIT3D Grouped)`);

                    groups.forEach((group, idx) => {
                        let best = null;
                        let bestScore = -1;

                        console.log(`[Group ${idx + 1}] Processing ${group.length} torrents`);

                        group.forEach(torrent => {
                            console.log(`  - ${torrent.name.substring(0, 60)}... (Score: ${torrent.score})`);

                            if (torrent.score > bestScore) {
                                bestScore = torrent.score;
                                best = torrent;
                            }
                        });

                        if (best) {
                            console.log(`  ✓ Selected: ${best.label} (Score: ${best.score})`);
                            bestTorrents.push(best);
                            qualityCounts[best.label] = (qualityCounts[best.label] || 0) + 1;
                        }
                    });
                } else {
                    const allTorrents = collectUnit3dTorrents(unit3dFlatRoot);
                    console.log(`[Collected] ${allTorrents.length} torrents (UNIT3D Flat)`);

                    groups = groupTorrentsByTitle(allTorrents);
                    console.log(`[Grouped] ${groups.length} unique titles`);

                    groups.forEach((group, idx) => {
                        let best = null;
                        let bestScore = -1;

                        console.log(`[Group ${idx + 1}] Processing ${group.length} torrents`);

                        group.forEach(torrent => {
                            console.log(`  - ${torrent.name.substring(0, 60)}... (Score: ${torrent.score})`);

                            if (torrent.score > bestScore) {
                                bestScore = torrent.score;
                                best = torrent;
                            }
                        });

                        if (best) {
                            console.log(`  ✓ Selected: ${best.label} (Score: ${best.score})`);
                            bestTorrents.push(best);
                            qualityCounts[best.label] = (qualityCounts[best.label] || 0) + 1;
                        }
                    });
                }

            } else if (trackerType === 'nexusphp') {
                // NexusPHP - Parse table rows and group by title
                const table = document.querySelector('table.torrent, table.torrents, #torrenttable');

                if (!table) {
                    alert('❌ No torrent table found');
                    return;
                }

                const rows = table.querySelectorAll('tr');
                console.log(`[Found] ${rows.length} torrent rows (NexusPHP)`);

                // Collect all torrents
                const allTorrents = [];

                rows.forEach(tr => {
                    // NexusPHP: download.php?id=xxxxx
                    const downloadLink = tr.querySelector('a[href*="download.php"]');

                    // Find torrent name link (links to torrent details page, not download)
                    const nameLinks = tr.querySelectorAll(
                        'td.name a, a[href*="details.php"], a[href*="torrent.php"]'
                    );
                    let nameLink = null;

                    // Find the main torrent title link (usually the longest or contains the full name)
                    for (const link of nameLinks) {
                        if (!link.href.includes('download') && !link.href.includes('bookmark')) {
                            const text = link.textContent.trim();
                            if (text && !/^(?:download|bookmark|view|details?)$/i.test(text)) {
                                nameLink = link;
                                break;
                            }
                        }
                    }

                    if (downloadLink && nameLink) {
                        const name = nameLink.textContent.trim();
                        const score = getQualityScore(name);

                        allTorrents.push({
                            link: downloadLink,
                            name: name,
                            score: score,
                            label: getLabel(name)
                        });
                    }
                });

                console.log(`[Collected] ${allTorrents.length} torrents`);

                // Group torrents by title
                const groups = groupTorrentsByTitle(allTorrents);
                console.log(`[Grouped] ${groups.length} unique titles`);

                // Select best from each group
                groups.forEach((group, idx) => {
                    let best = null;
                    let bestScore = -1;

                    console.log(`[Group ${idx + 1}] Processing ${group.length} torrents`);

                    group.forEach(torrent => {
                        console.log(`  - ${torrent.name.substring(0, 60)}... (Score: ${torrent.score})`);

                        if (torrent.score > bestScore) {
                            bestScore = torrent.score;
                            best = torrent;
                        }
                    });

                    if (best) {
                        console.log(`  ✓ Selected: ${best.label} (Score: ${best.score})`);
                        bestTorrents.push(best);
                        qualityCounts[best.label] = (qualityCounts[best.label] || 0) + 1;
                    }
                });

            } else if (trackerType === 'kokocon') {
                // Kokocon - plain table, group by title
                const rows = document.querySelectorAll('table tr');
                console.log(`[Found] ${rows.length} rows (Kokocon)`);

                const allTorrents = [];

                rows.forEach(tr => {
                    const downloadLink = tr.querySelector('a[href*="download.php"]');
                    const nameLink = tr.querySelector('a[href*="/torrent/"]');

                    if (downloadLink && nameLink) {
                        const name = nameLink.textContent.trim();
                        const score = getQualityScore(name);

                        allTorrents.push({
                            link: downloadLink,
                            name: name,
                            score: score,
                            label: getLabel(name)
                        });
                    }
                });

                console.log(`[Collected] ${allTorrents.length} torrents (Kokocon)`);

                const groups = groupTorrentsByTitle(allTorrents);
                console.log(`[Grouped] ${groups.length} unique titles`);

                groups.forEach((group, idx) => {
                    let best = null;
                    let bestScore = -1;

                    console.log(`[Group ${idx + 1}] Processing ${group.length} torrents`);

                    group.forEach(torrent => {
                        console.log(`  - ${torrent.name.substring(0, 60)}... (Score: ${torrent.score})`);

                        if (torrent.score > bestScore) {
                            bestScore = torrent.score;
                            best = torrent;
                        }
                    });

                    if (best) {
                        console.log(`  ✓ Selected: ${best.label} (Score: ${best.score})`);
                        bestTorrents.push(best);
                        qualityCounts[best.label] = (qualityCounts[best.label] || 0) + 1;
                    }
                });

            } else if (trackerType === 'iptorrents') {
                // IPTorrents - table#torrents has the search results, skip top_torrents sections
                const rows = document.querySelectorAll('table#torrents tr');
                console.log(`[Found] ${rows.length} rows (IPTorrents)`);

                const allTorrents = [];

                rows.forEach(tr => {
                    const downloadLink = tr.querySelector('a[href*="download.php"]');
                    const nameLink = tr.querySelector('a.hv');

                    if (downloadLink && nameLink) {
                        const name = nameLink.textContent.trim();
                        if (name.length < 5) return; // Skip short labels
                        const score = getQualityScore(name);

                        allTorrents.push({
                            link: downloadLink,
                            name: name,
                            score: score,
                            label: getLabel(name)
                        });
                    }
                });

                console.log(`[Collected] ${allTorrents.length} torrents (IPTorrents)`);

                const groups = groupTorrentsByTitle(allTorrents);
                console.log(`[Grouped] ${groups.length} unique titles`);

                groups.forEach((group, idx) => {
                    let best = null;
                    let bestScore = -1;

                    console.log(`[Group ${idx + 1}] Processing ${group.length} torrents`);

                    group.forEach(torrent => {
                        console.log(`  - ${torrent.name.substring(0, 60)}... (Score: ${torrent.score})`);

                        if (torrent.score > bestScore) {
                            bestScore = torrent.score;
                            best = torrent;
                        }
                    });

                    if (best) {
                        console.log(`  ✓ Selected: ${best.label} (Score: ${best.score})`);
                        bestTorrents.push(best);
                        qualityCounts[best.label] = (qualityCounts[best.label] || 0) + 1;
                    }
                });

            } else {
                alert('❌ Unsupported tracker type');
                return;
            }
        } // End of mode === 'smart' block

        bestTorrents = normalizeTorrentJobs(bestTorrents);
        Object.keys(qualityCounts).forEach(key => delete qualityCounts[key]);
        bestTorrents.forEach(torrent => {
            qualityCounts[torrent.label] = (qualityCounts[torrent.label] || 0) + 1;
        });

        if (!bestTorrents.length) {
            alert('❌ No torrents found to download');
            return;
        }

        // Show summary
        const summary = Object.entries(qualityCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([q, c]) => `${c}x ${q}`)
            .join(', ');

        const modeTitle = mode === 'all' ? '📦 Download All' : '⚡ Smart Filter';
        const msg = `${modeTitle}\n\nWill download ${bestTorrents.length} torrents:\n\n${summary}\n\nContinue?`;

        if (!confirm(msg)) return;

        console.log('[Download] Fetching and validating torrent files...');
        btn.textContent = '⏳ Starting...';
        btn.disabled = false;
        const controller = new AbortController();
        activeDownloadController = controller;

        let result;
        try {
            result = await runDownloadQueue(
                bestTorrents,
                controller,
                (phase, index, total, torrent, attempt, delay) => {
                    if (phase === 'retry') {
                        btn.textContent = '⏳ Retry ' + attempt + '/' + MAX_ATTEMPTS +
                            ' (' + (index + 1) + '/' + total + ')';
                    } else {
                        btn.textContent = '⏳ ' + (index + 1) + '/' + total + ' · ' + torrent.label;
                    }
                }
            );
        } catch (error) {
            result = {
                handedToBrowser: 0,
                failed: bestTorrents.length,
                cancelled: error && error.name === 'AbortError'
            };
            console.error('[Download] Batch stopped unexpectedly:', error);
        } finally {
            if (activeDownloadController === controller) {
                activeDownloadController = null;
            }
        }

        if (result.cancelled) {
            btn.textContent = '⏹ Stopped (' + result.handedToBrowser + ' ready)';
        } else if (result.failed) {
            btn.textContent = '⚠ ' + result.handedToBrowser + ' ready · ' + result.failed + ' failed';
        } else {
            btn.textContent = '✅ ' + result.handedToBrowser + ' validated';
        }
        console.log(
            '[Done] ' + result.handedToBrowser +
            ' torrent(s) validated and handed to the browser; ' +
            result.failed + ' failed' + (result.cancelled ? ', cancelled' : '')
        );
        setTimeout(() => {
            if (!activeDownloadController) {
                btn.textContent = '🎯 Best Quality';
                btn.disabled = false;
            }
        }, 5000);
    };

    window.addEventListener('pagehide', () => {
        if (activeDownloadController) {
            activeDownloadController.abort();
        }
    }, { once: true });
})();
