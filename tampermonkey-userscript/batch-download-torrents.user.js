// ==UserScript==
// @name         Universal Tracker - Smart Quality Download v3.0 (UNIT3D + NexusPHP)
// @namespace    https://github.com/bioidaika/bioidaika_gist
// @version      3.0.1
// @updateURL    https://raw.githubusercontent.com/bioidaika/bioidaika_gist/master/tampermonkey-userscript/batch-download-torrents.user.js
// @downloadURL  https://raw.githubusercontent.com/bioidaika/bioidaika_gist/master/tampermonkey-userscript/batch-download-torrents.user.js
// @description  Download BEST QUALITY torrent from each group (UNIT3D + NexusPHP) with infinite auto-retry
// @match        https://*/torrents*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const DELAY = 2200;
    const RETRY_DELAY_BASE = 2200;
    const MAX_RETRY_DELAY = 30000; // Cap retry delay at 30 seconds

    // Quality scoring function
    function getQualityScore(name) {
        let score = 0;
        const n = name.toLowerCase();

        // Resolution (highest priority)
        if (n.includes('2160p') || n.includes('4k') || n.includes('uhd')) score += 1000;
        else if (n.includes('1080p')) score += 500;
        else if (n.includes('1080i')) score += 450;
        else if (n.includes('720p')) score += 250;
        else if (n.includes('576p') || n.includes('576i')) score += 100;
        else if (n.includes('480p') || n.includes('480i')) score += 50;

        // Source quality
        if (n.includes('remux')) score += 300;
        else if (n.includes('bluray') || n.includes('blu-ray')) score += 200;
        else if (n.includes('web-dl') || n.includes('webdl')) score += 150;
        else if (n.includes('webrip')) score += 100;
        else if (n.includes('hdtv')) score += 50;

        // Codec
        if (n.includes('x265') || n.includes('hevc') || n.includes('h.265')) score += 50;
        else if (n.includes('av1')) score += 45;
        else if (n.includes('x264') || n.includes('avc')) score += 30;

        // Audio
        if (n.includes('atmos') || n.includes('truehd')) score += 100;
        else if (n.includes('dts-hd')) score += 80;
        else if (n.includes('dts')) score += 50;
        else if (n.includes('dd+') || n.includes('eac3')) score += 40;
        else if (n.includes('dd') || n.includes('ac3')) score += 30;

        // HDR
        if (n.includes('dv') || n.includes('dolby vision')) score += 50;
        else if (n.includes('hdr10+')) score += 40;
        else if (n.includes('hdr')) score += 30;

        return score;
    }

    // Get quality label
    function getLabel(name) {
        const n = name.toLowerCase();
        let p = [];
        if (n.includes('2160p') || n.includes('4k')) p.push('4K');
        else if (n.includes('1080p')) p.push('1080p');
        else if (n.includes('720p')) p.push('720p');
        if (n.includes('remux')) p.push('REMUX');
        else if (n.includes('bluray')) p.push('BluRay');
        else if (n.includes('web-dl')) p.push('WEB-DL');
        if (n.includes('hevc') || n.includes('x265')) p.push('HEVC');
        return p.join(' ') || 'SD';
    }

    // Group torrents by base title (remove quality/codec info)
    function groupTorrentsByTitle(torrents) {
        const groups = new Map();

        torrents.forEach(torrent => {
            // Extract base title by removing common quality markers
            let baseTitle = torrent.name
                .replace(/\b(2160p|1080p|720p|576p|480p|4k|uhd)\b/gi, '')
                .replace(/\b(remux|bluray|blu-ray|web-dl|webdl|webrip|hdtv|brrip|bdrip)\b/gi, '')
                .replace(/\b(x264|x265|h\.?264|h\.?265|hevc|avc|av1)\b/gi, '')
                .replace(/\b(atmos|truehd|dts-hd|dts|dd\+?|eac3|ac3|aac)\b/gi, '')
                .replace(/\b(hdr10\+?|dolby vision|dv|hdr)\b/gi, '')
                .replace(/\b(proper|repack|internal|limited)\b/gi, '')
                .replace(/[-_.]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase();

            // Extract year if present
            const yearMatch = torrent.name.match(/\b(19|20)\d{2}\b/);
            if (yearMatch) {
                baseTitle = baseTitle.replace(yearMatch[0].toLowerCase(), '').trim() + ' ' + yearMatch[0];
            }

            if (!groups.has(baseTitle)) {
                groups.set(baseTitle, []);
            }
            groups.get(baseTitle).push(torrent);
        });

        return Array.from(groups.values());
    }

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

    btn.onclick = async () => {
        // Show mode selection dialog
        const mode = await showModeDialog();

        if (!mode) {
            console.log('[Cancelled] User cancelled the operation');
            return;
        }

        console.log(`[Start] Mode: ${mode}, Scanning for torrents...`);

        // Detect tracker type
        const isUNIT3D = document.querySelectorAll('table.torrent-search--grouped__torrents').length > 0;
        const isNexusPHP = document.querySelectorAll('table.torrent').length > 0;

        console.log(`[Tracker Type] UNIT3D: ${isUNIT3D}, NexusPHP: ${isNexusPHP}`);

        let bestTorrents = [];
        const qualityCounts = {};

        // MODE: Download All - Collect all torrents without filtering
        if (mode === 'all') {
            console.log('[Mode] Download All - Collecting all torrents...');

            if (isUNIT3D) {
                const tables = document.querySelectorAll('table.torrent-search--grouped__torrents');
                console.log(`[Found] ${tables.length} torrent groups (UNIT3D)`);

                tables.forEach((table) => {
                    const rows = table.querySelectorAll('tr');
                    rows.forEach(tr => {
                        const downloadLink = tr.querySelector('a[href*="/torrents/download/"]');
                        const nameLink = tr.querySelector('a[href*="/torrents/"]:not([href*="/download/"])');

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
                });
            } else if (isNexusPHP) {
                const table = document.querySelector('table.torrent');
                if (!table) {
                    alert('❌ No torrent table found');
                    return;
                }

                const rows = table.querySelectorAll('tr');
                rows.forEach(tr => {
                    const downloadLink = tr.querySelector('a[href*="download.php?id="]');
                    const nameLinks = tr.querySelectorAll('td.name a[href*="torrent"]');
                    let nameLink = null;

                    for (const link of nameLinks) {
                        if (!link.href.includes('download') && !link.href.includes('bookmark')) {
                            const text = link.textContent.trim();
                            if (text.length > 10) {
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
            }

            console.log(`[Collected] ${bestTorrents.length} torrents (all)`);

            // MODE: Smart Filter - Select best quality from each group
        } else if (mode === 'smart') {
            console.log('[Mode] Smart Filter - Selecting best quality...');

            if (isUNIT3D) {
                // UNIT3D - Original logic with grouped tables
                const tables = document.querySelectorAll('table.torrent-search--grouped__torrents');
                console.log(`[Found] ${tables.length} torrent groups (UNIT3D)`);

                if (!tables.length) {
                    alert('❌ Not in group view or no torrents found');
                    return;
                }

                tables.forEach((table, idx) => {
                    const rows = table.querySelectorAll('tr');
                    let best = null;
                    let bestScore = -1;

                    console.log(`[Group ${idx + 1}] Processing ${rows.length} torrents`);

                    rows.forEach(tr => {
                        const downloadLink = tr.querySelector('a[href*="/torrents/download/"]');
                        const nameLink = tr.querySelector('a[href*="/torrents/"]:not([href*="/download/"])');

                        if (downloadLink && nameLink) {
                            const name = nameLink.textContent.trim();
                            const score = getQualityScore(name);

                            console.log(`  - ${name.substring(0, 60)}... (Score: ${score})`);

                            if (score > bestScore) {
                                bestScore = score;
                                best = {
                                    link: downloadLink,
                                    name: name,
                                    score: score,
                                    label: getLabel(name)
                                };
                            }
                        }
                    });

                    if (best) {
                        console.log(`  ✓ Selected: ${best.label} (Score: ${best.score})`);
                        bestTorrents.push(best);
                        qualityCounts[best.label] = (qualityCounts[best.label] || 0) + 1;
                    }
                });

            } else if (isNexusPHP) {
                // NexusPHP - Parse table rows and group by title
                const table = document.querySelector('table.torrent');

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
                    const downloadLink = tr.querySelector('a[href*="download.php?id="]');

                    // Find torrent name link (links to torrent details page, not download)
                    const nameLinks = tr.querySelectorAll('td.name a[href*="torrent"]');
                    let nameLink = null;

                    // Find the main torrent title link (usually the longest or contains the full name)
                    for (const link of nameLinks) {
                        if (!link.href.includes('download') && !link.href.includes('bookmark')) {
                            const text = link.textContent.trim();
                            if (text.length > 10) { // Ignore short labels
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

            } else {
                alert('❌ Unsupported tracker type');
                return;
            }
        } // End of mode === 'smart' block

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

        console.log('[Download] Starting with infinite retry...');
        btn.textContent = '⏳ Downloading...';
        btn.disabled = true;

        let completed = 0;
        let succeeded = 0;

        // Function to download torrent with infinite retry
        const downloadWithRetry = (torrent, index, attempt = 1) => {
            try {
                console.log(`[${index + 1}/${bestTorrents.length}] Attempt ${attempt}: ${torrent.label}`);
                torrent.link.click();
                succeeded++;
                console.log(`  ✓ Success after ${attempt} attempt(s): ${torrent.label}`);
                checkCompletion();
            } catch (error) {
                console.error(`  ✗ Error: ${torrent.label}`, error);

                // Calculate retry delay with exponential backoff, capped at MAX_RETRY_DELAY
                const retryDelay = Math.min(
                    RETRY_DELAY_BASE * Math.pow(2, attempt - 1),
                    MAX_RETRY_DELAY
                );

                console.log(`  ↻ Retry #${attempt + 1} in ${retryDelay / 1000}s...`);

                // Infinite retry - no max attempts check
                setTimeout(() => {
                    downloadWithRetry(torrent, index, attempt + 1);
                }, retryDelay);
            }
        };

        const checkCompletion = () => {
            completed++;
            const progress = Math.round((completed / bestTorrents.length) * 100);
            btn.textContent = `⏳ ${progress}% (${completed}/${bestTorrents.length})`;

            if (completed === bestTorrents.length) {
                setTimeout(() => {
                    btn.textContent = '✅ All Done!';
                    console.log(`[Done] ${succeeded} torrents downloaded successfully`);

                    setTimeout(() => {
                        btn.textContent = '🎯 Best Quality';
                        btn.disabled = false;
                    }, 3000);
                }, 500);
            }
        };

        // Start downloading with delays
        bestTorrents.forEach((t, i) => {
            setTimeout(() => {
                downloadWithRetry(t, i);
            }, i * DELAY);
        });
    };
})();
