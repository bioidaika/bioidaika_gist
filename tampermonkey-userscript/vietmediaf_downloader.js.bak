// ==UserScript==
// @name         VietMediaF Downloader
// @namespace    https://gist.github.com/bioidaika/86835e0ca88be467d3ebbc9ed83302fb
// @version      1.0.0
// @updateURL    https://gist.githubusercontent.com/bioidaika/86835e0ca88be467d3ebbc9ed83302fb/raw/vietmediaf_downloader.js
// @downloadURL  https://gist.githubusercontent.com/bioidaika/86835e0ca88be467d3ebbc9ed83302fb/raw/vietmediaf_downloader.js
// @description  Hiển thị link tải VietMediaF + Radarr/Sonarr integration cho các tracker
// @match        https://www.themoviedb.org/*
// @match        https://www.imdb.com/title/*
// @match        https://m.imdb.com/title/*
// @match        https://*.imdb.com/title/*
// @match        *://*/torrents/*
// @match        *://*/requests/*
// @match        https://avistaz.to/torrent/*
// @match        https://cinemaz.to/torrent/*
// @match        https://privatehd.to/torrent/*
// @match        https://animez.to/torrent/*
// @match        https://exoticaz.to/torrent/*
// @match        *://*/*.html
// @match        *://*/details.php*
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      vietmediaf.store
// @connect      localhost
// @connect      *
// ==/UserScript==

(function () {
    'use strict';

    // ========== CONSTANTS ==========
    const CONFIG = {
        API_BASE_URL: 'https://vietmediaf.store/api',
        TMDB_API_KEY: '431a8708161bcd1f1fbe7536137e61ed',
        API_TIMEOUT: 10000,
        RETRY_COUNT: 3,
        RETRY_DELAY: 1000, // Base delay for exponential backoff
        CACHE_TTL: 5 * 60 * 1000, // 5 minutes
        DEBOUNCE_DELAY: 300,
        WAIT_ELEMENT_TIMEOUT: 10000,
        WAIT_ELEMENT_INTERVAL: 100,
        AVISTAZ_DOMAINS: ['avistaz.to', 'cinemaz.to', 'privatehd.to', 'animez.to', 'exoticaz.to']
    };

    // ========== ARR SERVICE ==========
    const ArrService = {
        /**
         * Get saved settings from storage
         */
        getSettings() {
            return {
                radarrUrl: GM_getValue('vmf-radarr-url', ''),
                radarrApiKey: GM_getValue('vmf-radarr-apikey', ''),
                radarrProfile: GM_getValue('vmf-radarr-profile', ''),
                radarrRootFolder: GM_getValue('vmf-radarr-rootfolder', ''),
                radarrMonitor: GM_getValue('vmf-radarr-monitor', true),
                sonarrUrl: GM_getValue('vmf-sonarr-url', ''),
                sonarrApiKey: GM_getValue('vmf-sonarr-apikey', ''),
                sonarrProfile: GM_getValue('vmf-sonarr-profile', ''),
                sonarrRootFolder: GM_getValue('vmf-sonarr-rootfolder', ''),
                sonarrMonitor: GM_getValue('vmf-sonarr-monitor', true),
                sonarrSeasonFolder: GM_getValue('vmf-sonarr-seasonfolder', true)
            };
        },

        /**
         * Save settings to storage
         */
        saveSettings(settings) {
            GM_setValue('vmf-radarr-url', settings.radarrUrl || '');
            GM_setValue('vmf-radarr-apikey', settings.radarrApiKey || '');
            GM_setValue('vmf-radarr-profile', settings.radarrProfile || '');
            GM_setValue('vmf-radarr-rootfolder', settings.radarrRootFolder || '');
            GM_setValue('vmf-radarr-monitor', settings.radarrMonitor !== false);
            GM_setValue('vmf-sonarr-url', settings.sonarrUrl || '');
            GM_setValue('vmf-sonarr-apikey', settings.sonarrApiKey || '');
            GM_setValue('vmf-sonarr-profile', settings.sonarrProfile || '');
            GM_setValue('vmf-sonarr-rootfolder', settings.sonarrRootFolder || '');
            GM_setValue('vmf-sonarr-monitor', settings.sonarrMonitor !== false);
            GM_setValue('vmf-sonarr-seasonfolder', settings.sonarrSeasonFolder !== false);
        },

        /**
         * Get quality profiles from Radarr/Sonarr
         */
        async getProfiles(type) {
            try {
                return await this.apiRequest(type, '/qualityprofile');
            } catch (e) {
                console.error(`Failed to get ${type} profiles:`, e);
                return [];
            }
        },

        /**
         * Get root folders from Radarr/Sonarr
         */
        async getRootFolders(type) {
            try {
                return await this.apiRequest(type, '/rootfolder');
            } catch (e) {
                console.error(`Failed to get ${type} root folders:`, e);
                return [];
            }
        },

        /**
         * Check if Radarr/Sonarr is configured
         */
        isConfigured(type) {
            const s = this.getSettings();
            if (type === 'radarr') return s.radarrUrl && s.radarrApiKey;
            if (type === 'sonarr') return s.sonarrUrl && s.sonarrApiKey;
            return false;
        },

        /**
         * Make API request to Radarr/Sonarr
         */
        async apiRequest(type, endpoint, method = 'GET', body = null) {
            const s = this.getSettings();
            const baseUrl = type === 'radarr' ? s.radarrUrl : s.sonarrUrl;
            const apiKey = type === 'radarr' ? s.radarrApiKey : s.sonarrApiKey;

            if (!baseUrl || !apiKey) {
                throw new Error(`${type} not configured`);
            }

            const url = `${baseUrl.replace(/\/+$/, '')}/api/v3${endpoint}`;

            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method,
                    url,
                    headers: {
                        'X-Api-Key': apiKey,
                        'Content-Type': 'application/json'
                    },
                    data: body ? JSON.stringify(body) : null,
                    timeout: CONFIG.API_TIMEOUT,
                    onload: (res) => {
                        if (res.status >= 200 && res.status < 300) {
                            resolve(JSON.parse(res.responseText || '{}'));
                        } else if (res.status === 401) {
                            reject(new Error('Invalid API Key'));
                        } else {
                            reject(new Error(`API Error: ${res.status}`));
                        }
                    },
                    onerror: () => reject(new Error('Connection failed')),
                    ontimeout: () => reject(new Error('Request timeout'))
                });
            });
        },

        /**
         * Lookup movie in Radarr by IMDb ID
         */
        async lookupMovie(imdbId) {
            const results = await this.apiRequest('radarr', `/movie/lookup?term=imdb:${imdbId}`);
            if (results && results.length > 0) {
                return results[0]; // First match
            }
            return null;
        },

        /**
         * Lookup series in Sonarr by TVDB ID (preferred) or IMDb ID
         */
        async lookupSeries(ids) {
            let term = '';
            if (ids.tvdbId) {
                term = `tvdb:${ids.tvdbId}`;
            } else if (ids.imdbId) {
                term = `imdb:${ids.imdbId}`;
            } else if (typeof ids === 'string') {
                term = `imdb:${ids}`; // Backward compatibility
            } else {
                return null;
            }

            const results = await this.apiRequest('sonarr', `/series/lookup?term=${term}`);
            if (results && results.length > 0) {
                return results[0];
            }
            return null;
        },

        /**
         * Add movie to Radarr
         */
        async addMovie(movieData) {
            const s = this.getSettings();

            // Use saved profile or first available
            let profileId = parseInt(s.radarrProfile) || null;
            if (!profileId) {
                const profiles = await this.apiRequest('radarr', '/qualityprofile');
                profileId = profiles[0]?.id || 1;
            }

            // Use saved root folder or first available
            let rootFolder = s.radarrRootFolder || null;
            if (!rootFolder) {
                const folders = await this.apiRequest('radarr', '/rootfolder');
                rootFolder = folders[0]?.path || '/movies';
            }

            const payload = {
                ...movieData,
                qualityProfileId: profileId,
                rootFolderPath: rootFolder,
                monitored: s.radarrMonitor,
                addOptions: { searchForMovie: s.radarrMonitor }
            };

            return await this.apiRequest('radarr', '/movie', 'POST', payload);
        },

        /**
         * Add series to Sonarr
         */
        async addSeries(seriesData) {
            const s = this.getSettings();

            let profileId = parseInt(s.sonarrProfile) || null;
            if (!profileId) {
                const profiles = await this.apiRequest('sonarr', '/qualityprofile');
                profileId = profiles[0]?.id || 1;
            }

            // Use saved root folder or first available
            let rootFolder = s.sonarrRootFolder || null;
            if (!rootFolder) {
                const folders = await this.apiRequest('sonarr', '/rootfolder');
                rootFolder = folders[0]?.path || '/tv';
            }

            const payload = {
                ...seriesData,
                qualityProfileId: profileId,
                rootFolderPath: rootFolder,
                seasonFolder: s.sonarrSeasonFolder,
                monitored: s.sonarrMonitor,
                addOptions: { searchForMissingEpisodes: s.sonarrMonitor }
            };

            return await this.apiRequest('sonarr', '/series', 'POST', payload);
        }
    };

    const SITE_TYPE = detectSiteType();
    let lastUrl = location.href;
    let isMinimized = localStorage.getItem('vmf-minimized') === 'true';
    let boxPosition = JSON.parse(localStorage.getItem('vmf-position') || 'null');
    let currentIds = { imdbId: null, tvdbId: null }; // Track current IDs for Arr integration

    // ========== INITIALIZATION ==========
    injectStyles();

    if (SITE_TYPE === 'tmdb') {
        const debouncedMain = debounce(main, CONFIG.DEBOUNCE_DELAY);
        new MutationObserver(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                debouncedMain();
            }
        }).observe(document, { subtree: true, childList: true });

        waitForElement('body').then(main);
    } else if (SITE_TYPE === 'imdb') {
        // IMDb pages - use IMDb API endpoint
        waitForElement('body').then(mainImdb);
    } else if (SITE_TYPE === 'unit3d') {
        // Wait for movie wrapper (works for standard UNIT3D and forks like hawke.uno, fearnopeer)
        waitForElement('.movie-wrapper, .meta-info, .meta, body').then(main);
    } else if (SITE_TYPE === 'avistaz') {
        waitForElement('.iconx-tmdb').then(main);
    } else if (SITE_TYPE === 'nexusphp') {
        // NexusPHP trackers use IMDb, wait for page load
        waitForElement('body').then(mainImdb);
    }

    // ========== UTILITY FUNCTIONS ==========

    /**
     * Detect the type of site (TMDB, IMDb, UNIT3D, AvistaZ, or NexusPHP)
     * Dynamically detects trackers based on URL patterns and page content
     * @returns {string|null} 'tmdb', 'imdb', 'unit3d', 'avistaz', 'nexusphp', or null
     */
    function detectSiteType() {
        const host = location.hostname;
        const path = location.pathname;

        // TMDB detection
        if (host.includes('themoviedb.org')) return 'tmdb';

        // IMDb detection
        if (host.includes('imdb.com') && path.includes('/title/')) return 'imdb';

        // AvistaZ Network detection (must be before other patterns)
        if (CONFIG.AVISTAZ_DOMAINS.some(d => host.includes(d))) return 'avistaz';

        // UNIT3D detection: any site with /torrents/ or /requests/ path
        if (path.includes('/torrents/') || path.includes('/requests/')) return 'unit3d';

        // NexusPHP detection: common URL patterns
        // Pattern 1: *-torrent-*.html (NetHD style)
        // Pattern 2: details.php?id=* (classic NexusPHP)
        // Pattern 3: torrent page with IMDb link
        if (path.match(/-torrent-\d+\.html$/) ||
            path.includes('details.php') ||
            (path.endsWith('.html') && document.querySelector('a[href*="imdb.com/title/"]'))) {
            return 'nexusphp';
        }

        return null;
    }

    /**
     * Wait for an element to appear in the DOM
     * @param {string} selector - CSS selector
     * @param {number} timeout - Maximum wait time in ms
     * @returns {Promise<Element>}
     */
    function waitForElement(selector, timeout = CONFIG.WAIT_ELEMENT_TIMEOUT) {
        return new Promise((resolve, reject) => {
            const element = document.querySelector(selector);
            if (element) return resolve(element);

            const interval = setInterval(() => {
                const element = document.querySelector(selector);
                if (element) {
                    clearInterval(interval);
                    clearTimeout(timer);
                    resolve(element);
                }
            }, CONFIG.WAIT_ELEMENT_INTERVAL);

            const timer = setTimeout(() => {
                clearInterval(interval);
                reject(new Error(`Element ${selector} not found within ${timeout}ms`));
            }, timeout);
        });
    }

    /**
     * Debounce function calls
     * @param {Function} func - Function to debounce
     * @param {number} delay - Delay in ms
     * @returns {Function}
     */
    function debounce(func, delay) {
        let timeoutId;
        return function (...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }

    /**
     * Get cached data from SessionStorage
     * @param {string} key - Cache key
     * @returns {any|null}
     */
    function getCache(key) {
        try {
            const cached = sessionStorage.getItem(key);
            if (!cached) return null;

            const { data, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp > CONFIG.CACHE_TTL) {
                sessionStorage.removeItem(key);
                return null;
            }
            return data;
        } catch {
            return null;
        }
    }

    /**
     * Set cache data to SessionStorage
     * @param {string} key - Cache key
     * @param {any} data - Data to cache
     */
    function setCache(key, data) {
        try {
            sessionStorage.setItem(key, JSON.stringify({
                data,
                timestamp: Date.now()
            }));
        } catch (e) {
            console.warn('Failed to cache data:', e);
        }
    }

    /**
     * Fetch data with retry mechanism
     * @param {string} url - URL to fetch
     * @param {number} retries - Number of retries remaining
     * @returns {Promise<any>}
     */
    async function gmFetchWithRetry(url, retries = CONFIG.RETRY_COUNT) {
        try {
            return await gmFetch(url);
        } catch (error) {
            if (retries > 0) {
                const delay = CONFIG.RETRY_DELAY * Math.pow(2, CONFIG.RETRY_COUNT - retries);
                console.log(`Retrying in ${delay}ms... (${retries} retries left)`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return gmFetchWithRetry(url, retries - 1);
            }
            throw error;
        }
    }

    /**
     * Make HTTP request using GM_xmlhttpRequest
     * @param {string} url - URL to fetch
     * @returns {Promise<any>}
     */
    function gmFetch(url) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Request timeout'));
            }, CONFIG.API_TIMEOUT);

            GM_xmlhttpRequest({
                method: 'GET',
                url,
                responseType: 'json',
                onload: res => {
                    clearTimeout(timeout);
                    if (res.status >= 200 && res.status < 300) {
                        resolve(res.response);
                    } else {
                        reject(new Error(`API lỗi ${res.status}`));
                    }
                },
                onerror: () => {
                    clearTimeout(timeout);
                    reject(new Error('Không kết nối được API'));
                },
                ontimeout: () => {
                    clearTimeout(timeout);
                    reject(new Error('Request timeout'));
                }
            });
        });
    }

    /**
     * Extract TMDB information from the current page
     * @returns {{type: string, tmdbId: string}|null}
     */
    function extractTmdbInfo() {
        if (SITE_TYPE === 'tmdb') {
            const m = location.href.match(/\/(movie|tv)\/(\d+)/);
            return m ? { type: m[1], tmdbId: m[2] } : null;
        }

        if (SITE_TYPE === 'unit3d') {
            // Try standard UNIT3D selector first
            let link = document.querySelector('a.meta-id-tag[href*="themoviedb.org"]');

            // Fallback for hawke.uno and other forks without .meta-id-tag
            if (!link) {
                link = document.querySelector('a[href*="themoviedb.org"][title*="Movie Database"]');
            }

            if (!link) return null;
            const m = link.href.match(/themoviedb\.org\/(movie|tv)\/(\d+)/);
            return m ? { type: m[1], tmdbId: m[2] } : null;
        }

        if (SITE_TYPE === 'avistaz') {
            // AvistaZ uses anon.to wrapper: https://anon.to?https://www.themoviedb.org/tv/309828
            const tmdbIcon = document.querySelector('.iconx-tmdb');
            if (!tmdbIcon) return null;

            // Find the link next to the icon
            const link = tmdbIcon.nextElementSibling?.querySelector('a');
            if (!link) return null;

            // Extract TMDB URL from anon.to wrapper
            const anonUrl = link.href;
            const tmdbUrlMatch = anonUrl.match(/themoviedb\.org\/(movie|tv)\/(\d+)/);
            return tmdbUrlMatch ? { type: tmdbUrlMatch[1], tmdbId: tmdbUrlMatch[2] } : null;
        }

        return null;
    }

    /**
     * Copy text to clipboard
     * @param {string} text - Text to copy
     */
    function copyToClipboard(text) {
        GM_setClipboard(text);
    }

    // ========== MAIN LOGIC ==========

    /**
     * Main function to fetch and display download links
     */
    async function main() {
        const tmdbInfo = extractTmdbInfo();
        if (!tmdbInfo) return;

        // Get IDs for Arr integration
        if (SITE_TYPE === 'tmdb') {
            // Fetch IDs from TMDB API for TMDB pages
            currentIds = await fetchExternalIdsFromTmdb(tmdbInfo.type, tmdbInfo.tmdbId);
            console.log('[VietMediaF] Fetched IDs from TMDB:', currentIds);
        } else {
            // Extract IDs directly from page for tracker sites
            const imdbId = extractImdbId();
            const tvdbId = extractTvdbId();
            currentIds = { imdbId, tvdbId };
            console.log('[VietMediaF] Set currentIds:', currentIds);
        }

        // Show loading state
        renderDownloadBox(null, null, true);

        const apiUrl = `${CONFIG.API_BASE_URL}/${tmdbInfo.type}/${tmdbInfo.tmdbId}`;

        try {
            const data = await gmFetchWithRetry(apiUrl);
            renderDownloadBox(data);
        } catch (err) {
            console.error('Failed to fetch data:', err);
            renderDownloadBox(null, err.message);
        }
    }

    /**
     * Extract IMDb ID from current page (for IMDb.com, NexusPHP and similar trackers)
     * @returns {string|null} IMDb ID (ttXXXXXXX) or null
     */
    function extractImdbId() {
        console.log('[VietMediaF] Extracting IMDb ID, SITE_TYPE:', SITE_TYPE);

        // If on IMDb.com, extract from URL directly
        if (SITE_TYPE === 'imdb') {
            const match = location.pathname.match(/\/title\/(tt\d+)/);
            if (match) {
                console.log('[VietMediaF] IMDb ID from URL:', match[1]);
                return match[1];
            }
        }

        // Generic IMDb extraction - works for any site with IMDb link
        const imdbLink = document.querySelector('a[href*="imdb.com/title/"]');
        if (imdbLink) {
            console.log('[VietMediaF] Found IMDb link:', imdbLink.href);
            const match = imdbLink.href.match(/imdb\.com\/title\/(tt\d+)/);
            if (match) {
                console.log('[VietMediaF] IMDb ID from link:', match[1]);
                return match[1];
            }
        }

        // Fallback: search in page text for IMDb ID pattern
        const pageText = document.body?.innerText || '';
        const textMatch = pageText.match(/\b(tt\d{7,})\b/);
        if (textMatch) {
            console.log('[VietMediaF] IMDb ID from page text:', textMatch[1]);
            return textMatch[1];
        }

        console.log('[VietMediaF] No IMDb ID found');
        return null;
    }

    /**
     * Extract TVDB ID from current page
     * @returns {string|null} TVDB ID
     */
    function extractTvdbId() {
        console.log('[VietMediaF] Extracting TVDB ID, SITE_TYPE:', SITE_TYPE);

        // 1. Search for TVDB links (Generic + UNIT3D)
        const tvdbLinks = document.querySelectorAll('a[href*="thetvdb.com"]');
        for (const link of tvdbLinks) {
            const url = link.href;
            // Match id=12345 or /series/12345
            const idMatch = url.match(/id=(\d+)/) || url.match(/\/series\/(\d+)/);
            if (idMatch) {
                console.log('[VietMediaF] Found TVDB ID in link:', idMatch[1]);
                return idMatch[1];
            }
        }

        // 2. AvistaZ specific
        if (SITE_TYPE === 'avistaz') {
            const tvdbIcon = document.querySelector('.iconx-tvdb');
            if (tvdbIcon) {
                const link = tvdbIcon.nextElementSibling?.querySelector('a');
                if (link) {
                    // Method 1: ID is often the link text (e.g. "434660")
                    if (/^\d+$/.test(link.textContent.trim())) {
                        console.log('[VietMediaF] Found TVDB ID in AvistaZ link text:', link.textContent.trim());
                        return link.textContent.trim();
                    }

                    // Method 2: Extract from URL (handle anon.to wrapper)
                    const url = link.href;
                    const idMatch = url.match(/\/series\/(\d+)/) || url.match(/id=(\d+)/);
                    if (idMatch) return idMatch[1];
                }
            }
        }

        // 3. Fallback: Page text pattern
        const pageText = document.body?.innerText || '';
        const textMatch = pageText.match(/TVDB ID:\s*(\d+)/i);
        if (textMatch) {
            return textMatch[1];
        }

        return null;
    }

    /**
     * Fetch External IDs from TMDB API
     * @param {string} type - 'movie' or 'tv'
     * @param {string} tmdbId - TMDB ID
     * @returns {Promise<{imdbId: string|null, tvdbId: string|null}>}
     */
    async function fetchExternalIdsFromTmdb(type, tmdbId) {
        const cacheKey = `tmdb-ids-${type}-${tmdbId}`;
        const cached = getCache(cacheKey);
        if (cached) {
            console.log('[VietMediaF] Using cached IDs:', cached);
            return cached;
        }

        try {
            const url = `https://api.themoviedb.org/3/${type}/${tmdbId}/external_ids?api_key=${CONFIG.TMDB_API_KEY}`;
            const data = await gmFetch(url);

            const result = {
                imdbId: data?.imdb_id || null,
                tvdbId: data?.tvdb_id ? String(data.tvdb_id) : null
            };

            if (result.imdbId || result.tvdbId) {
                setCache(cacheKey, result);
            }

            return result;
        } catch (err) {
            console.error('[VietMediaF] Failed to fetch IDs from TMDB:', err);
            return { imdbId: null, tvdbId: null };
        }
    }

    /**
     * Main function for IMDb-based lookups (NetHD, IMDb.com, etc.)
     * Uses the /api/imdb/{id} endpoint
     */
    async function mainImdb() {
        const imdbId = extractImdbId();
        if (!imdbId) {
            console.log('VietMediaF: No IMDb ID found on this page');
            return;
        }

        // Set global IMDb ID for Arr integration
        currentIds = { imdbId, tvdbId: null };

        // Show loading state
        renderDownloadBox(null, null, true);

        // Use IMDb endpoint
        const apiUrl = `${CONFIG.API_BASE_URL}/imdb/${imdbId}`;

        try {
            const data = await gmFetchWithRetry(apiUrl);
            renderDownloadBox(data);
        } catch (err) {
            console.error('Failed to fetch data via IMDb:', err);
            renderDownloadBox(null, err.message);
        }
    }

    /**
     * Render the download box UI
     * @param {any} data - API response data
     * @param {string|null} errorMessage - Error message to display
     * @param {boolean} loading - Whether to show loading state
     */
    function renderDownloadBox(data, errorMessage = null, loading = false) {
        document.querySelector('#vmf-download-box')?.remove();

        const box = document.createElement('div');
        box.id = 'vmf-download-box';
        box.className = `vmf-box vmf-box--${SITE_TYPE}`;

        if (boxPosition) {
            box.style.left = `${boxPosition.x}px`;
            box.style.top = `${boxPosition.y}px`;
        }

        if (isMinimized) {
            box.classList.add('vmf-minimized');
        }

        box.innerHTML = `
            <div class="vmf-header" id="vmf-drag-handle">
                <div class="vmf-header-left">
                    <span class="vmf-logo">🎬</span>
                    <span class="vmf-title">VietMediaF</span>
                </div>
                <div class="vmf-controls">
                    <span class="vmf-settings-btn" title="Settings">⚙️</span>
                    <span class="vmf-minimize-btn" title="${isMinimized ? 'Maximize' : 'Minimize'}">${isMinimized ? '□' : '_'}</span>
                    <span class="vmf-close-btn" title="Close">×</span>
                </div>
            </div>
            <div class="vmf-content-wrapper">
                <div class="vmf-content"></div>
                <div class="vmf-arr-section"></div>
            </div>
        `;

        // Event handlers
        box.querySelector('.vmf-close-btn').onclick = () => box.remove();
        box.querySelector('.vmf-minimize-btn').onclick = () => toggleMinimize(box);
        box.querySelector('.vmf-settings-btn').onclick = () => renderSettingsModal();
        makeDraggable(box, box.querySelector('#vmf-drag-handle'));

        const content = box.querySelector('.vmf-content');
        const arrSection = box.querySelector('.vmf-arr-section');

        if (loading) {
            content.innerHTML = `
                <div class="vmf-loading">
                    <div class="vmf-spinner"></div>
                    <div>Đang tải...</div>
                </div>
            `;
        } else if (errorMessage) {
            content.innerHTML = `<div class="vmf-error">❌ ${errorMessage}</div>`;
        } else if (!data?.sources?.length) {
            content.innerHTML = `
                <div class="vmf-empty">
                    <div>📭 Chưa có link tải</div>
                    <small>Hãy thử lại sau</small>
                </div>
            `;
        } else {
            data.sources.forEach(src => {
                const item = document.createElement('div');
                item.className = 'vmf-item';
                item.innerHTML = `
                    <div class="vmf-item-row">
                        <span class="vmf-icon">📦</span>
                        <b class="vmf-sheet-name" title="${src.sheet_name}">
                            ${src.sheet_name}
                        </b>
                    </div>

                    <div class="vmf-item-meta">
                        <span class="vmf-meta-left">
                            <span class="vmf-uploader">👤 ${src.uploader || 'Unknown'}</span>
                            <span class="vmf-size">${src.size}</span>
                        </span>

                        <div class="vmf-actions">
                            <button class="vmf-copy-btn" data-url="${src.download_url}" title="Copy link">
                                📋
                            </button>
                            <a href="${src.download_url}" target="_blank" class="vmf-link">
                                Tải ngay ↗
                            </a>
                        </div>
                    </div>
                `;

                // Copy button handler
                const copyBtn = item.querySelector('.vmf-copy-btn');
                copyBtn.onclick = (e) => {
                    e.preventDefault();
                    const url = copyBtn.dataset.url;
                    copyToClipboard(url);
                    showCopyFeedback(copyBtn);
                };

                content.appendChild(item);
            });
        }

        // Render Arr section for any page with IMDb ID (including TMDB)
        console.log('[VietMediaF] Debug - currentIds:', currentIds, 'SITE_TYPE:', SITE_TYPE);
        if (currentIds.imdbId || currentIds.tvdbId) {
            console.log('[VietMediaF] Rendering Arr section...');
            renderArrSection(arrSection);
        } else {
            console.log('[VietMediaF] Skipping Arr section - no IDs found');
        }

        document.body.appendChild(box);
    }

    /**
     * Toggle minimize/maximize state
     * @param {HTMLElement} box - The download box element
     */
    function toggleMinimize(box) {
        isMinimized = !isMinimized;
        localStorage.setItem('vmf-minimized', isMinimized);
        box.classList.toggle('vmf-minimized');

        const btn = box.querySelector('.vmf-minimize-btn');
        btn.textContent = isMinimized ? '□' : '_';
        btn.title = isMinimized ? 'Maximize' : 'Minimize';
    }

    /**
     * Render Settings Modal for Radarr/Sonarr configuration
     */
    function renderSettingsModal() {
        document.querySelector('#vmf-settings-modal')?.remove();

        const s = ArrService.getSettings();

        const modal = document.createElement('div');
        modal.id = 'vmf-settings-modal';
        modal.className = 'vmf-modal-overlay';
        modal.innerHTML = `
            <div class="vmf-modal">
                <div class="vmf-modal-header">
                    <span>⚙️ Settings</span>
                    <span class="vmf-modal-close">×</span>
                </div>
                <div class="vmf-modal-body">
                    <div class="vmf-setting-group">
                        <label>🎬 Radarr (Movies)</label>
                        <input type="text" id="vmf-radarr-url" placeholder="URL (http://localhost:7878)" value="${s.radarrUrl}">
                        <input type="password" id="vmf-radarr-key" placeholder="API Key" value="${s.radarrApiKey}">
                        <button class="vmf-btn vmf-btn-test" id="vmf-radarr-test">🔌 Test Connection</button>
                        <div id="vmf-radarr-test-result" class="vmf-test-result"></div>
                        <div class="vmf-setting-row">
                            <select id="vmf-radarr-profile"><option value="">Loading...</option></select>
                            <select id="vmf-radarr-rootfolder"><option value="">Loading...</option></select>
                        </div>
                        <div class="vmf-setting-row">
                            <label class="vmf-toggle">
                                <input type="checkbox" id="vmf-radarr-monitor" ${s.radarrMonitor ? 'checked' : ''}>
                                <span>Monitor & Search</span>
                            </label>
                        </div>
                    </div>
                    <div class="vmf-setting-group">
                        <label>📺 Sonarr (TV Shows)</label>
                        <input type="text" id="vmf-sonarr-url" placeholder="URL (http://localhost:8989)" value="${s.sonarrUrl}">
                        <input type="password" id="vmf-sonarr-key" placeholder="API Key" value="${s.sonarrApiKey}">
                        <button class="vmf-btn vmf-btn-test" id="vmf-sonarr-test">🔌 Test Connection</button>
                        <div id="vmf-sonarr-test-result" class="vmf-test-result"></div>
                        <div class="vmf-setting-row">
                            <select id="vmf-sonarr-profile"><option value="">Loading...</option></select>
                            <select id="vmf-sonarr-rootfolder"><option value="">Loading...</option></select>
                        </div>
                        <div class="vmf-setting-row">
                            <label class="vmf-toggle">
                                <input type="checkbox" id="vmf-sonarr-monitor" ${s.sonarrMonitor ? 'checked' : ''}>
                                <span>Monitor & Search</span>
                            </label>
                            <label class="vmf-toggle">
                                <input type="checkbox" id="vmf-sonarr-seasonfolder" ${s.sonarrSeasonFolder ? 'checked' : ''}>
                                <span>Season Folder</span>
                            </label>
                        </div>
                    </div>
                </div>
                <div class="vmf-modal-footer">
                    <button class="vmf-btn vmf-btn-cancel">Cancel</button>
                    <button class="vmf-btn vmf-btn-save">Save</button>
                </div>
            </div>
        `;

        // Load profiles and root folders after modal is created
        loadProfiles('radarr', s.radarrProfile);
        loadProfiles('sonarr', s.sonarrProfile);
        loadRootFolders('radarr', s.radarrRootFolder);
        loadRootFolders('sonarr', s.sonarrRootFolder);

        async function loadProfiles(type, savedId) {
            const select = modal.querySelector(`#vmf-${type}-profile`);
            if (!ArrService.isConfigured(type)) {
                select.innerHTML = '<option value="">Configure first</option>';
                return;
            }
            try {
                const profiles = await ArrService.getProfiles(type);
                select.innerHTML = profiles.map(p =>
                    `<option value="${p.id}" ${p.id == savedId ? 'selected' : ''}>${p.name}</option>`
                ).join('');
            } catch (e) {
                select.innerHTML = '<option value="">Failed</option>';
            }
        }

        async function loadRootFolders(type, savedPath) {
            const select = modal.querySelector(`#vmf-${type}-rootfolder`);
            if (!ArrService.isConfigured(type)) {
                select.innerHTML = '<option value="">Configure first</option>';
                return;
            }
            try {
                const folders = await ArrService.getRootFolders(type);
                select.innerHTML = folders.map(f =>
                    `<option value="${f.path}" ${f.path == savedPath ? 'selected' : ''}>${f.path}</option>`
                ).join('');
            } catch (e) {
                select.innerHTML = '<option value="">Failed</option>';
            }
        }

        // Test connection buttons
        async function testConnection(type) {
            const urlInput = document.getElementById(`vmf-${type}-url`);
            const keyInput = document.getElementById(`vmf-${type}-key`);
            const testBtn = document.getElementById(`vmf-${type}-test`);
            const resultDiv = document.getElementById(`vmf-${type}-test-result`);

            const url = urlInput.value.trim();
            const apiKey = keyInput.value.trim();

            if (!url || !apiKey) {
                resultDiv.innerHTML = '<span class="vmf-test-error">⚠️ Please enter URL and API Key</span>';
                return;
            }

            testBtn.disabled = true;
            testBtn.textContent = '⏳ Testing...';
            resultDiv.innerHTML = '';

            try {
                const response = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: `${url}/api/v3/system/status`,
                        headers: {
                            'X-Api-Key': apiKey
                        },
                        timeout: 5000,
                        responseType: 'json',
                        onload: (res) => {
                            if (res.status >= 200 && res.status < 300) {
                                resolve(res.response);
                            } else {
                                reject(new Error(`HTTP ${res.status}`));
                            }
                        },
                        onerror: () => reject(new Error('Connection failed')),
                        ontimeout: () => reject(new Error('Connection timeout'))
                    });
                });

                resultDiv.innerHTML = `<span class="vmf-test-success">✅ Connected! Version: ${response.version}</span>`;
            } catch (err) {
                resultDiv.innerHTML = `<span class="vmf-test-error">❌ ${err.message}</span>`;
            } finally {
                testBtn.disabled = false;
                testBtn.textContent = '🔌 Test Connection';
            }
        }

        modal.querySelector('#vmf-radarr-test').onclick = () => testConnection('radarr');
        modal.querySelector('#vmf-sonarr-test').onclick = () => testConnection('sonarr');

        modal.querySelector('.vmf-modal-close').onclick = () => modal.remove();
        modal.querySelector('.vmf-btn-cancel').onclick = () => modal.remove();
        modal.querySelector('.vmf-btn-save').onclick = () => {
            ArrService.saveSettings({
                radarrUrl: document.getElementById('vmf-radarr-url').value,
                radarrApiKey: document.getElementById('vmf-radarr-key').value,
                radarrProfile: document.getElementById('vmf-radarr-profile').value,
                radarrRootFolder: document.getElementById('vmf-radarr-rootfolder').value,
                radarrMonitor: document.getElementById('vmf-radarr-monitor').checked,
                sonarrUrl: document.getElementById('vmf-sonarr-url').value,
                sonarrApiKey: document.getElementById('vmf-sonarr-key').value,
                sonarrProfile: document.getElementById('vmf-sonarr-profile').value,
                sonarrRootFolder: document.getElementById('vmf-sonarr-rootfolder').value,
                sonarrMonitor: document.getElementById('vmf-sonarr-monitor').checked,
                sonarrSeasonFolder: document.getElementById('vmf-sonarr-seasonfolder').checked
            });
            modal.remove();
            // Refresh arr section
            const arrSection = document.querySelector('.vmf-arr-section');
            if (arrSection && (currentIds.imdbId || currentIds.tvdbId)) {
                renderArrSection(arrSection);
            }
        };

        // Close on overlay click
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };

        document.body.appendChild(modal);
    }

    /**
     * Render Arr (Radarr/Sonarr) section with status and add buttons
     * @param {HTMLElement} container - Container element
     */
    async function renderArrSection(container) {
        if (!currentIds.imdbId && !currentIds.tvdbId) return;

        container.innerHTML = `
            <div class="vmf-arr-header">📡 Radarr / Sonarr</div>
            <div class="vmf-arr-content">
                <div class="vmf-arr-loading">Checking...</div>
            </div>
        `;

        const content = container.querySelector('.vmf-arr-content');
        let html = '';

        // Check Radarr (requires IMDb ID)
        if (ArrService.isConfigured('radarr') && currentIds.imdbId) {
            try {
                const movie = await ArrService.lookupMovie(currentIds.imdbId);
                if (movie) {
                    if (movie.id) {
                        // Already in library
                        html += `<div class="vmf-arr-item vmf-arr-exists">🎬 <b>${movie.title}</b> ✅ In Radarr</div>`;
                    } else {
                        // Can be added
                        html += `
                            <div class="vmf-arr-item">
                                <span>🎬 ${movie.title} (${movie.year})</span>
                                <button class="vmf-arr-add" data-type="radarr" data-imdb="${currentIds.imdbId}">➕ Add</button>
                            </div>`;
                    }
                }
            } catch (err) {
                html += `<div class="vmf-arr-item vmf-arr-error">🎬 Radarr: ${err.message}</div>`;
            }
        } else {
            html += `<div class="vmf-arr-item vmf-arr-hint">🎬 Radarr: Not configured</div>`;
        }

        // Check Sonarr
        if (ArrService.isConfigured('sonarr')) {
            try {
                const series = await ArrService.lookupSeries(currentIds);
                if (series) {
                    if (series.id) {
                        html += `<div class="vmf-arr-item vmf-arr-exists">📺 <b>${series.title}</b> ✅ In Sonarr</div>`;
                    } else {
                        const tvdbAttr = currentIds.tvdbId ? `data-tvdb="${currentIds.tvdbId}"` : '';
                        const imdbAttr = currentIds.imdbId ? `data-imdb="${currentIds.imdbId}"` : '';
                        html += `
                            <div class="vmf-arr-item">
                                <span>📺 ${series.title} (${series.year})</span>
                                <button class="vmf-arr-add" data-type="sonarr" ${tvdbAttr} ${imdbAttr}>➕ Add</button>
                            </div>`;
                    }
                }
            } catch (err) {
                html += `<div class="vmf-arr-item vmf-arr-error">📺 Sonarr: ${err.message}</div>`;
            }
        } else {
            html += `<div class="vmf-arr-item vmf-arr-hint">📺 Sonarr: Not configured</div>`;
        }

        content.innerHTML = html || '<div class="vmf-arr-hint">No results found</div>';

        // Add button handlers
        content.querySelectorAll('.vmf-arr-add').forEach(btn => {
            btn.onclick = async () => {
                const type = btn.dataset.type;
                const imdbId = btn.dataset.imdb;
                const tvdbId = btn.dataset.tvdb;

                btn.disabled = true;
                btn.textContent = '⏳';

                try {
                    if (type === 'radarr') {
                        const movie = await ArrService.lookupMovie(imdbId);
                        await ArrService.addMovie(movie);
                    } else {
                        const ids = { imdbId, tvdbId };
                        const series = await ArrService.lookupSeries(ids);
                        await ArrService.addSeries(series);
                    }
                    btn.textContent = '✅ Added';
                    btn.classList.add('vmf-arr-added');
                } catch (err) {
                    btn.textContent = '❌ Failed';
                    console.error(`Failed to add to ${type}:`, err);
                }
            };
        });
    }

    /**
     * Show visual feedback when copying
     * @param {HTMLElement} btn - The copy button element
     */
    function showCopyFeedback(btn) {
        const originalText = btn.textContent;
        btn.textContent = '✓';
        btn.classList.add('vmf-copied');

        setTimeout(() => {
            btn.textContent = originalText;
            btn.classList.remove('vmf-copied');
        }, 2000);
    }

    /**
     * Make an element draggable
     * @param {HTMLElement} element - Element to make draggable
     * @param {HTMLElement} handle - Drag handle element
     */
    function makeDraggable(element, handle) {
        let isDragging = false;
        let currentX;
        let currentY;
        let initialX;
        let initialY;

        handle.style.cursor = 'move';

        handle.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);

        function dragStart(e) {
            if (e.target.closest('.vmf-controls')) return;

            initialX = e.clientX - (boxPosition?.x || element.offsetLeft);
            initialY = e.clientY - (boxPosition?.y || element.offsetTop);

            isDragging = true;
            element.style.transition = 'none';
        }

        function drag(e) {
            if (!isDragging) return;

            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;

            element.style.left = `${currentX}px`;
            element.style.top = `${currentY}px`;
        }

        function dragEnd() {
            if (!isDragging) return;

            isDragging = false;
            element.style.transition = '';

            boxPosition = {
                x: parseInt(element.style.left),
                y: parseInt(element.style.top)
            };
            localStorage.setItem('vmf-position', JSON.stringify(boxPosition));
        }
    }

    // ========== STYLES ==========

    /**
     * Inject CSS styles into the page
     */
    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            :root {
                --vmf-primary: #00c4ff;
                --vmf-secondary: #00ff88;
                --vmf-bg: rgba(20, 20, 20, 0.95);
                --vmf-border: rgba(255, 255, 255, 0.1);
                --vmf-text: #fff;
                --vmf-text-muted: #bbb;
                --vmf-hover: rgba(255, 255, 255, 0.08);
                --vmf-radius: 12px;
                --vmf-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
            }

            #vmf-download-box {
                position: fixed;
                top: 85px;
                left: 20px;
                width: 320px;
                z-index: 999999;
                font-family: system-ui, -apple-system, sans-serif;
                color: var(--vmf-text);
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }

            .vmf-box {
                background: var(--vmf-bg);
                border-radius: var(--vmf-radius);
                box-shadow: var(--vmf-shadow);
                overflow: hidden;
                backdrop-filter: blur(10px);
            }

            .vmf-header {
                padding: 12px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-bottom: 1px solid var(--vmf-border);
                user-select: none;
            }

            .vmf-header-left {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .vmf-logo {
                font-size: 18px;
            }

            .vmf-title {
                font-weight: 700;
                font-size: 14px;
                background: linear-gradient(90deg, var(--vmf-primary), var(--vmf-secondary));
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
            }

            .vmf-controls {
                display: flex;
                gap: 8px;
                align-items: center;
            }

            .vmf-minimize-btn,
            .vmf-close-btn {
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                border-radius: 4px;
                transition: background 0.2s;
                font-size: 18px;
                line-height: 1;
            }

            .vmf-minimize-btn:hover,
            .vmf-close-btn:hover {
                background: var(--vmf-hover);
            }

            .vmf-content-wrapper {
                max-height: 500px;
                overflow-y: auto;
                overflow-x: hidden;
                transition: max-height 0.3s ease;
            }

            .vmf-minimized .vmf-content-wrapper {
                max-height: 0;
            }

            .vmf-content {
                padding: 12px;
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .vmf-loading {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 12px;
                padding: 20px;
                color: var(--vmf-text-muted);
            }

            .vmf-spinner {
                width: 32px;
                height: 32px;
                border: 3px solid var(--vmf-border);
                border-top-color: var(--vmf-primary);
                border-radius: 50%;
                animation: vmf-spin 0.8s linear infinite;
            }

            @keyframes vmf-spin {
                to { transform: rotate(360deg); }
            }

            .vmf-error {
                padding: 12px;
                background: rgba(255, 50, 50, 0.1);
                border: 1px solid rgba(255, 50, 50, 0.3);
                border-radius: 8px;
                color: #ff6b6b;
                text-align: center;
            }

            .vmf-empty {
                padding: 20px;
                text-align: center;
                color: var(--vmf-text-muted);
            }

            .vmf-empty small {
                display: block;
                margin-top: 8px;
                font-size: 11px;
                opacity: 0.7;
            }

            .vmf-item {
                background: rgba(255, 255, 255, 0.05);
                padding: 10px;
                border-radius: 8px;
                transition: background 0.2s;
            }

            .vmf-item:hover {
                background: rgba(255, 255, 255, 0.08);
            }

            .vmf-item-row {
                display: flex;
                gap: 6px;
                align-items: center;
                margin-bottom: 8px;
            }

            .vmf-icon {
                font-size: 16px;
            }

            .vmf-sheet-name {
                font-size: 13px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .vmf-item-meta {
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 12px;
                gap: 8px;
            }

            .vmf-meta-left {
                display: flex;
                gap: 6px;
                align-items: center;
                flex-wrap: wrap;
                flex: 1;
                min-width: 0;
            }

            .vmf-uploader {
                color: var(--vmf-text-muted);
                font-size: 11px;
                background: rgba(0, 0, 0, 0.25);
                padding: 2px 6px;
                border-radius: 4px;
                white-space: nowrap;
            }

            .vmf-size {
                color: #888;
                font-size: 11px;
            }

            .vmf-actions {
                display: flex;
                gap: 4px;
                align-items: center;
            }

            .vmf-copy-btn {
                background: rgba(255, 255, 255, 0.1);
                color: var(--vmf-text);
                border: none;
                padding: 4px 8px;
                border-radius: 8px;
                font-size: 12px;
                cursor: pointer;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .vmf-copy-btn:hover {
                background: rgba(255, 255, 255, 0.15);
            }

            .vmf-copy-btn.vmf-copied {
                background: rgba(0, 255, 136, 0.2);
                color: var(--vmf-secondary);
            }

            .vmf-link {
                background: linear-gradient(90deg, var(--vmf-primary), #0077ff);
                color: var(--vmf-text);
                text-decoration: none;
                padding: 4px 12px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: 600;
                white-space: nowrap;
                transition: transform 0.2s, box-shadow 0.2s;
                display: inline-block;
            }

            .vmf-link:hover {
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(0, 196, 255, 0.3);
            }

            /* Scrollbar styling */
            .vmf-content-wrapper::-webkit-scrollbar {
                width: 6px;
            }

            .vmf-content-wrapper::-webkit-scrollbar-track {
                background: rgba(255, 255, 255, 0.05);
            }

            .vmf-content-wrapper::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.2);
                border-radius: 3px;
            }

            .vmf-content-wrapper::-webkit-scrollbar-thumb:hover {
                background: rgba(255, 255, 255, 0.3);
            }

            /* Settings Button */
            .vmf-settings-btn {
                cursor: pointer;
                opacity: 0.7;
                transition: opacity 0.2s;
            }

            .vmf-settings-btn:hover {
                opacity: 1;
            }

            /* Modal Styles */
            .vmf-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 100001;
            }

            .vmf-modal {
                background: linear-gradient(145deg, #1a1a2e, #16213e);
                border-radius: 16px;
                width: 380px;
                max-width: 90vw;
                box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
                border: 1px solid rgba(255, 255, 255, 0.1);
            }

            .vmf-modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 16px 20px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                font-weight: 600;
                color: var(--vmf-text);
            }

            .vmf-modal-close {
                cursor: pointer;
                font-size: 20px;
                opacity: 0.7;
            }

            .vmf-modal-close:hover {
                opacity: 1;
            }

            .vmf-modal-body {
                padding: 20px;
            }

            .vmf-setting-group {
                margin-bottom: 16px;
            }

            .vmf-setting-group label {
                display: block;
                margin-bottom: 8px;
                font-size: 13px;
                color: var(--vmf-text);
            }

            .vmf-setting-group input {
                width: 100%;
                padding: 10px 12px;
                margin-bottom: 8px;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                color: var(--vmf-text);
                font-size: 13px;
                box-sizing: border-box;
            }

            .vmf-setting-group input:focus {
                outline: none;
                border-color: var(--vmf-primary);
            }

            .vmf-setting-row {
                display: flex;
                gap: 10px;
                align-items: center;
                margin-top: 4px;
            }

            .vmf-setting-group select {
                flex: 1;
                padding: 8px 10px;
                background: #1a1a2e;
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                color: var(--vmf-text);
                font-size: 12px;
            }

            .vmf-btn-test {
                width: 100%;
                margin-bottom: 8px;
                padding: 8px 12px;
                background: rgba(0, 196, 255, 0.1);
                border: 1px solid rgba(0, 196, 255, 0.3);
                border-radius: 8px;
                color: var(--vmf-primary);
                font-size: 13px;
                cursor: pointer;
                transition: background 0.2s;
            }

            .vmf-btn-test:hover:not(:disabled) {
                background: rgba(0, 196, 255, 0.2);
            }

            .vmf-btn-test:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

            .vmf-test-result {
                margin-bottom: 12px;
                padding: 8px;
                border-radius: 6px;
                font-size: 12px;
                text-align: center;
                min-height: 20px;
            }

            .vmf-test-success {
                color: #4ade80;
            }

            .vmf-test-error {
                color: #f87171;
            }

            .vmf-setting-group select option {
                background: #1a1a2e;
                color: var(--vmf-text);
            }

            .vmf-toggle {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 12px;
                cursor: pointer;
                white-space: nowrap;
            }

            .vmf-toggle input[type="checkbox"] {
                width: 16px;
                height: 16px;
                margin: 0;
                cursor: pointer;
            }

            .vmf-modal-footer {
                display: flex;
                justify-content: flex-end;
                gap: 10px;
                padding: 16px 20px;
                border-top: 1px solid rgba(255, 255, 255, 0.1);
            }

            .vmf-btn {
                padding: 8px 20px;
                border-radius: 8px;
                font-size: 13px;
                cursor: pointer;
                transition: all 0.2s;
                border: none;
            }

            .vmf-btn-cancel {
                background: rgba(255, 255, 255, 0.1);
                color: var(--vmf-text);
            }

            .vmf-btn-save {
                background: linear-gradient(90deg, var(--vmf-primary), #0077ff);
                color: white;
            }

            .vmf-btn:hover {
                transform: translateY(-1px);
            }

            /* Arr Section Styles */
            .vmf-arr-section {
                border-top: 1px solid rgba(255, 255, 255, 0.1);
                padding: 10px 12px;
            }

            .vmf-arr-header {
                font-size: 11px;
                font-weight: 600;
                color: var(--vmf-primary);
                margin-bottom: 8px;
            }

            .vmf-arr-content {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }

            .vmf-arr-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 12px;
                padding: 6px 0;
            }

            .vmf-arr-exists {
                color: var(--vmf-secondary);
            }

            .vmf-arr-error {
                color: #ff6b6b;
            }

            .vmf-arr-hint {
                color: #888;
                font-style: italic;
            }

            .vmf-arr-loading {
                color: #888;
                font-size: 12px;
            }

            .vmf-arr-add {
                background: linear-gradient(90deg, #ff8800, #ff6600);
                color: white;
                border: none;
                padding: 4px 10px;
                border-radius: 6px;
                font-size: 11px;
                cursor: pointer;
                transition: all 0.2s;
            }

            .vmf-arr-add:hover {
                transform: scale(1.05);
            }

            .vmf-arr-add:disabled {
                opacity: 0.7;
                cursor: not-allowed;
            }

            .vmf-arr-added {
                background: var(--vmf-secondary) !important;
            }
        `;
        document.head.appendChild(style);
    }
})();