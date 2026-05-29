// ==UserScript==
// @name         Fshare Folder API Extractor
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Lấy danh sách file trong thư mục Fshare thông qua API nội bộ (bỏ qua CORS proxy)
// @author       Antigravity
// @match        *://www.fshare.vn/folder/*
// @grant        GM_setClipboard
// @grant        GM_notification
// ==/UserScript==

(function() {
    'use strict';

    // Tạo nút bấm giao diện floating ở góc phải màn hình
    function createUI() {
        // Tránh tạo nhiều nút nếu script chạy nhiều lần
        if (document.getElementById('fshare-api-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'fshare-api-btn';
        btn.innerHTML = '📥 Lấy API Data';
        btn.style.position = 'fixed';
        btn.style.bottom = '20px';
        btn.style.right = '20px';
        btn.style.zIndex = '999999';
        btn.style.padding = '12px 18px';
        btn.style.backgroundColor = '#ff6b00'; // Màu cam Fshare
        btn.style.color = '#fff';
        btn.style.border = 'none';
        btn.style.borderRadius = '50px';
        btn.style.cursor = 'pointer';
        btn.style.fontWeight = 'bold';
        btn.style.fontSize = '14px';
        btn.style.boxShadow = '0 4px 10px rgba(0,0,0,0.3)';
        btn.style.transition = 'all 0.2s ease-in-out';
        
        btn.addEventListener('mouseenter', () => {
            btn.style.transform = 'scale(1.05)';
            btn.style.backgroundColor = '#e56000';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'scale(1)';
            btn.style.backgroundColor = '#ff6b00';
        });
        
        btn.addEventListener('click', fetchFolderData);
        
        document.body.appendChild(btn);
    }

    // Hàm gọi API trực tiếp
    async function fetchFolderData() {
        const btn = document.getElementById('fshare-api-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '⏳ Đang lấy...';
        btn.style.pointerEvents = 'none';

        // Lấy linkcode từ URL
        const match = window.location.pathname.match(/\/folder\/([A-Z0-9_]+)/i);
        if (!match) {
            alert('Không tìm thấy mã thư mục trong URL!');
            resetButton(btn, originalText);
            return;
        }
        
        const linkcode = match[1];
        console.log('[Fshare API] Đang lấy dữ liệu cho thư mục:', linkcode);
        
        try {
            let allItemsMap = new Map();
            let page = 1;
            let hasMore = true;

            while (hasMore && page <= 200) { // Giới hạn an toàn 200 trang
                btn.innerHTML = `⏳ Đang lấy trang ${page}...`;
                
                const response = await fetch(`/api/v3/files/folder?linkcode=${linkcode}&sort=-modified&page=${page}&per-page=100`, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                });
                
                // Nếu quá trang mà API trả lỗi 404 (Not Found), coi như đã hết dữ liệu
                if (response.status === 404 && page > 1) {
                    hasMore = false;
                    break;
                }

                if (!response.ok) {
                    throw new Error(`Lỗi HTTP: ${response.status} ở trang ${page}`);
                }
                
                const data = await response.json();
                
                if (data && data.items && data.items.length > 0) {
                    let newItemsAdded = 0;
                    data.items.forEach(item => {
                        if (!allItemsMap.has(item.linkcode)) {
                            allItemsMap.set(item.linkcode, item);
                            newItemsAdded++;
                        }
                    });
                    
                    // Nếu page mới nhưng API chỉ trả về data cũ y hệt (bị lặp vô hạn), thì dừng loop
                    if (newItemsAdded === 0) {
                        hasMore = false;
                        break;
                    }
                    
                    // Cách tốt nhất để biết hết trang: kiểm tra thuộc tính _meta của Fshare nếu có
                    if (data._meta && data._meta.currentPage >= data._meta.pageCount) {
                        hasMore = false;
                    } else if (data.items.length === 0) {
                        hasMore = false;
                    } else {
                        page++;
                    }
                } else {
                    // Trả về rỗng -> đã hết
                    hasMore = false;
                }
            }
            
            const allItems = Array.from(allItemsMap.values());
            console.log('[Fshare API] Đã lấy thành công tổng cộng:', allItems.length, 'mục');
            
            if(allItems.length > 0) {
                showTableModal(allItems);
            } else {
                alert('Không tìm thấy file nào hoặc thư mục trống.');
            }
            
        } catch (error) {
            console.error('[Fshare API] Lỗi:', error);
            alert('Lỗi khi gọi API: ' + error.message);
        } finally {
            resetButton(btn, originalText);
        }
    }

    // Hàm tạo và hiển thị Modal dạng bảng
    function showTableModal(originalItems) {
        let items = [...originalItems];
        let sortConfig = { key: null, direction: 'asc' };
        let selectedLinkcodes = new Set(items.map(i => i.linkcode)); // Chọn tất cả mặc định
        let lastCheckedIndex = -1;

        // Xóa modal cũ nếu có
        const oldModal = document.getElementById('fshare-api-modal');
        if (oldModal) oldModal.remove();

        const modal = document.createElement('div');
        modal.id = 'fshare-api-modal';
        modal.style.position = 'fixed';
        modal.style.top = '50%';
        modal.style.left = '50%';
        modal.style.transform = 'translate(-50%, -50%)';
        modal.style.width = '80%';
        modal.style.maxWidth = '900px';
        modal.style.maxHeight = '80vh';
        modal.style.backgroundColor = '#fff';
        modal.style.zIndex = '9999999';
        modal.style.boxShadow = '0 10px 40px rgba(0,0,0,0.5)';
        modal.style.borderRadius = '8px';
        modal.style.display = 'flex';
        modal.style.flexDirection = 'column';
        modal.style.overflow = 'hidden';
        modal.style.fontFamily = 'Arial, sans-serif';

        // Header
        const header = document.createElement('div');
        header.style.padding = '15px 20px';
        header.style.backgroundColor = '#f8f9fa';
        header.style.borderBottom = '1px solid #ddd';
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';

        const title = document.createElement('h3');
        title.innerText = `Danh sách dữ liệu (${items.length} mục)`;
        title.style.margin = '0';
        title.style.color = '#333';
        title.style.fontSize = '18px';

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✖';
        closeBtn.style.background = 'none';
        closeBtn.style.border = 'none';
        closeBtn.style.fontSize = '18px';
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.color = '#666';

        header.appendChild(title);
        header.appendChild(closeBtn);

        // Content
        const content = document.createElement('div');
        content.style.padding = '20px';
        content.style.overflowY = 'auto';
        content.style.flex = '1';

        const table = document.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';

        const thead = document.createElement('thead');
        const tbody = document.createElement('tbody');
        table.appendChild(thead);
        table.appendChild(tbody);
        content.appendChild(table);

        // Footer
        const footer = document.createElement('div');
        footer.style.padding = '15px 20px';
        footer.style.backgroundColor = '#f8f9fa';
        footer.style.borderTop = '1px solid #ddd';
        footer.style.display = 'flex';
        footer.style.justifyContent = 'space-between';
        footer.style.alignItems = 'center';

        const copySelectedUrlsBtn = document.createElement('button');
        copySelectedUrlsBtn.innerHTML = '🔗 Copy URL (đã chọn)';
        copySelectedUrlsBtn.style.padding = '10px 15px';
        copySelectedUrlsBtn.style.backgroundColor = '#007bff';
        copySelectedUrlsBtn.style.color = '#fff';
        copySelectedUrlsBtn.style.border = 'none';
        copySelectedUrlsBtn.style.borderRadius = '5px';
        copySelectedUrlsBtn.style.cursor = 'pointer';
        copySelectedUrlsBtn.style.fontWeight = 'bold';
        copySelectedUrlsBtn.style.marginRight = '10px';
        
        const copyAllBtn = document.createElement('button');
        copyAllBtn.innerHTML = '📋 Copy JSON (đã chọn)';
        copyAllBtn.style.padding = '10px 15px';
        copyAllBtn.style.backgroundColor = '#ff6b00';
        copyAllBtn.style.color = '#fff';
        copyAllBtn.style.border = 'none';
        copyAllBtn.style.borderRadius = '5px';
        copyAllBtn.style.cursor = 'pointer';
        copyAllBtn.style.fontWeight = 'bold';

        const footerButtons = document.createElement('div');
        footerButtons.appendChild(copySelectedUrlsBtn);
        footerButtons.appendChild(copyAllBtn);

        const info = document.createElement('span');
        info.innerHTML = 'Mẹo: Click vào tiêu đề cột để sắp xếp.';
        info.style.color = '#777';
        info.style.fontSize = '13px';

        footer.appendChild(info);
        footer.appendChild(footerButtons);

        const getSortIcon = (key) => {
            if (sortConfig.key !== key) return '↕';
            return sortConfig.direction === 'asc' ? '▲' : '▼';
        };

        const sortItems = () => {
            if (!sortConfig.key) return;
            items.sort((a, b) => {
                let valA, valB;
                const isFolderA = a.folder == 1 || a.folder === true;
                const isFolderB = b.folder == 1 || b.folder === true;

                if (sortConfig.key === 'type') {
                    valA = isFolderA ? 0 : 1;
                    valB = isFolderB ? 0 : 1;
                } else if (sortConfig.key === 'name') {
                    valA = (a.name || '').toLowerCase();
                    valB = (b.name || '').toLowerCase();
                } else if (sortConfig.key === 'size') {
                    valA = a.size || 0;
                    valB = b.size || 0;
                }
                
                if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        };

        // Render Table Function
        const renderTable = () => {
            const allChecked = items.length > 0 && items.every(i => selectedLinkcodes.has(i.linkcode));
            thead.innerHTML = `
                <tr style="background-color: #f1f1f1; text-align: left; font-size: 14px; color: #333; user-select: none;">
                    <th style="padding: 10px; border: 1px solid #ddd; width: 40px; text-align: center;">
                        <input type="checkbox" id="selectAllCheckbox" ${allChecked ? 'checked' : ''} style="cursor: pointer;">
                    </th>
                    <th class="sortable" data-key="type" style="padding: 10px; border: 1px solid #ddd; width: 60px; text-align: center; cursor: pointer;">
                        Loại ${getSortIcon('type')}
                    </th>
                    <th class="sortable" data-key="name" style="padding: 10px; border: 1px solid #ddd; cursor: pointer;">
                        Tên ${getSortIcon('name')}
                    </th>
                    <th class="sortable" data-key="size" style="padding: 10px; border: 1px solid #ddd; width: 120px; cursor: pointer;">
                        Dung lượng ${getSortIcon('size')}
                    </th>
                    <th style="padding: 10px; border: 1px solid #ddd; width: 90px; text-align: center;">Thao tác</th>
                </tr>
            `;

            thead.querySelectorAll('.sortable').forEach(th => {
                th.onclick = () => {
                    const key = th.getAttribute('data-key');
                    if (sortConfig.key === key) {
                        sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
                    } else {
                        sortConfig.key = key;
                        sortConfig.direction = 'asc';
                    }
                    sortItems();
                    renderTable();
                };
            });

            const selectAllCheckbox = thead.querySelector('#selectAllCheckbox');
            if (selectAllCheckbox) {
                selectAllCheckbox.onchange = (e) => {
                    if (e.target.checked) {
                        items.forEach(i => selectedLinkcodes.add(i.linkcode));
                    } else {
                        items.forEach(i => selectedLinkcodes.delete(i.linkcode));
                    }
                    renderTable();
                };
            }

            tbody.innerHTML = '';
            items.forEach((item, index) => {
                const tr = document.createElement('tr');
                tr.style.fontSize = '14px';
                
                const isFolder = item.folder == 1 || item.folder === true;
                const typeIcon = isFolder ? '📁' : '📄';
                const url = isFolder ? `https://www.fshare.vn/folder/${item.linkcode}` : `https://www.fshare.vn/file/${item.linkcode}`;
                const sizeStr = isFolder ? '--' : formatBytes(item.size);
                const isChecked = selectedLinkcodes.has(item.linkcode);

                tr.innerHTML = `
                    <td style="padding: 10px; border: 1px solid #ddd; text-align: center;">
                        <input type="checkbox" class="item-checkbox" data-linkcode="${item.linkcode}" ${isChecked ? 'checked' : ''} style="cursor: pointer;">
                    </td>
                    <td style="padding: 10px; border: 1px solid #ddd; text-align: center; font-size: 18px;">${typeIcon}</td>
                    <td style="padding: 10px; border: 1px solid #ddd; word-break: break-all;">
                        <a href="${url}" target="_blank" style="color: #0056b3; text-decoration: none; font-weight: 500;">${item.name}</a>
                    </td>
                    <td style="padding: 10px; border: 1px solid #ddd; white-space: nowrap; color: #555;">${sizeStr}</td>
                    <td style="padding: 10px; border: 1px solid #ddd; text-align: center;">
                        <button class="copy-link-btn" data-url="${url}" style="padding: 6px 10px; cursor: pointer; border: 1px solid #ccc; border-radius: 4px; background: #fff; color: #333; font-size: 12px;">Copy Link</button>
                    </td>
                `;
                
                tr.addEventListener('mouseenter', () => tr.style.backgroundColor = '#f9f9f9');
                tr.addEventListener('mouseleave', () => tr.style.backgroundColor = 'transparent');
                
                const cb = tr.querySelector('.item-checkbox');
                cb.onclick = (e) => {
                    const checkedStatus = e.target.checked;
                    
                    // Hỗ trợ Shift-click
                    if (e.shiftKey && lastCheckedIndex !== -1) {
                        const start = Math.min(lastCheckedIndex, index);
                        const end = Math.max(lastCheckedIndex, index);
                        for (let i = start; i <= end; i++) {
                            const link = items[i].linkcode;
                            if (checkedStatus) {
                                selectedLinkcodes.add(link);
                            } else {
                                selectedLinkcodes.delete(link);
                            }
                        }
                        renderTable(); // Re-render toàn bộ bảng để update các checkbox
                        return;
                    }
                    
                    lastCheckedIndex = index;
                    
                    if (checkedStatus) {
                        selectedLinkcodes.add(item.linkcode);
                    } else {
                        selectedLinkcodes.delete(item.linkcode);
                    }
                    const allChecked = items.length > 0 && items.every(i => selectedLinkcodes.has(i.linkcode));
                    const selectAllCb = thead.querySelector('#selectAllCheckbox');
                    if (selectAllCb) selectAllCb.checked = allChecked;
                };

                const copyBtn = tr.querySelector('.copy-link-btn');
                copyBtn.onclick = () => doCopy(url, copyBtn, '✔ Copied');

                tbody.appendChild(tr);
            });
        };

        const doCopy = (text, btnElement, successText) => {
            if (typeof GM_setClipboard !== 'undefined') {
                GM_setClipboard(text);
            } else {
                navigator.clipboard.writeText(text);
            }
            
            const oldText = btnElement.innerHTML;
            const oldBg = btnElement.style.backgroundColor;
            const oldColor = btnElement.style.color;
            const oldBorder = btnElement.style.borderColor || '';
            
            btnElement.innerHTML = successText;
            btnElement.style.backgroundColor = '#28a745';
            btnElement.style.color = '#fff';
            btnElement.style.borderColor = '#28a745';
            
            setTimeout(() => {
                btnElement.innerHTML = oldText;
                btnElement.style.backgroundColor = oldBg;
                btnElement.style.color = oldColor;
                btnElement.style.borderColor = oldBorder;
            }, 1500);
        };

        copySelectedUrlsBtn.onclick = () => {
            const urls = items
                .filter(i => selectedLinkcodes.has(i.linkcode))
                .map(i => {
                    const isFolder = i.folder == 1 || i.folder === true;
                    return isFolder ? `https://www.fshare.vn/folder/${i.linkcode}` : `https://www.fshare.vn/file/${i.linkcode}`;
                })
                .join('\n');
                
            if (urls.length === 0) {
                alert('Chưa chọn mục nào!');
                return;
            }
            doCopy(urls, copySelectedUrlsBtn, '✔ Đã Copy URLs!');
        };

        copyAllBtn.onclick = () => {
            const exportData = items
                .filter(i => selectedLinkcodes.has(i.linkcode))
                .map(i => {
                    const isFolder = i.folder == 1 || i.folder === true;
                    return {
                        name: i.name,
                        size: formatBytes(i.size),
                        url: isFolder ? `https://www.fshare.vn/folder/${i.linkcode}` : `https://www.fshare.vn/file/${i.linkcode}`
                    };
                });
                
            if (exportData.length === 0) {
                alert('Chưa chọn mục nào!');
                return;
            }
            doCopy(JSON.stringify(exportData, null, 2), copyAllBtn, '✔ Đã Copy JSON!');
        };

        const overlay = document.createElement('div');
        overlay.id = 'fshare-api-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
        overlay.style.zIndex = '9999998';
        
        const closeModal = () => {
            modal.remove();
            overlay.remove();
        };
        overlay.onclick = closeModal;
        closeBtn.onclick = closeModal;

        modal.appendChild(header);
        modal.appendChild(content);
        modal.appendChild(footer);
        document.body.appendChild(overlay);
        document.body.appendChild(modal);

        renderTable();
    }

    // Hàm tiện ích format dung lượng byte
    function formatBytes(bytes, decimals = 2) {
        if (!+bytes) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    }

    function resetButton(btn, text) {
        btn.innerHTML = text;
        btn.style.pointerEvents = 'auto';
    }

    // Khởi tạo script
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createUI);
    } else {
        createUI();
    }

})();
