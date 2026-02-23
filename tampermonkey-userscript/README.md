# Universal Tracker - Smart Quality Download

## 🎯 Tính năng

Script tự động tải xuống torrent với **2 chế độ lựa chọn**:

### 🎨 Chế độ tải xuống
1. **⚡ Smart Filter (Best Quality)** - Tự động chọn torrent chất lượng cao nhất từ mỗi nhóm
2. **📦 Download All** - Tải hết tất cả torrents trên trang

### Hỗ trợ Tracker
- ✅ **UNIT3D** (group view)
- ✅ **NexusPHP** (NetHD.org, HDVietNam, v.v.)

### Tính năng chính
- 🎯 Tự động chọn torrent chất lượng cao nhất từ mỗi nhóm
- 🔁 Retry vô hạn với exponential backoff
- 📊 Hiển thị tổng kết trước khi tải
- 📈 Thanh tiến trình realtime
- 🎨 Giao diện đẹp mắt

## 📋 Hệ thống chấm điểm

### Độ phân giải (ưu tiên cao nhất)
- 4K/2160p/UHD: **+1000 điểm**
- 1080p: **+500 điểm**
- 1080i: **+450 điểm**
- 720p: **+250 điểm**
- 576p/576i: **+100 điểm**
- 480p/480i: **+50 điểm**

### Nguồn gốc
- Remux: **+300 điểm**
- BluRay: **+200 điểm**
- WEB-DL: **+150 điểm**
- WEBRip: **+100 điểm**
- HDTV: **+50 điểm**

### Codec Video
- HEVC/x265/H.265: **+50 điểm**
- AV1: **+45 điểm**
- x264/AVC: **+30 điểm**

### Âm thanh
- Atmos/TrueHD: **+100 điểm**
- DTS-HD: **+80 điểm**
- DTS: **+50 điểm**
- DD+/EAC3: **+40 điểm**
- DD/AC3: **+30 điểm**

### HDR
- Dolby Vision: **+50 điểm**
- HDR10+: **+40 điểm**
- HDR: **+30 điểm**

## 🚀 Cài đặt

1. Cài đặt [Tampermonkey](https://www.tampermonkey.net/) hoặc [Greasemonkey](https://www.greasespot.net/)
2. Click vào file `batch-download-torrents.js` và copy toàn bộ code
3. Mở Tampermonkey → Create new script
4. Paste code và lưu lại

## 💡 Cách sử dụng

### Quy trình chung
1. Vào trang torrents trên tracker (UNIT3D hoặc NexusPHP)
2. Click nút **🎯 Best Quality** ở góc dưới bên phải
3. Chọn mode trong dialog popup:
   - **⚡ Smart Filter** - Chọn torrent tốt nhất từ mỗi nhóm
   - **📦 Download All** - Tải hết tất cả
4. Xác nhận số lượng torrent sẽ tải
5. Enjoy!

### Trên tracker UNIT3D
- **Smart Filter**: Yêu cầu **group view** đã bật
- **Download All**: Hoạt động với bất kỳ view nào

### Trên tracker NexusPHP (NetHD.org)
- **Smart Filter**: 
  - Thu thập tất cả torrents
  - Gom nhóm theo tên phim/series
  - Chọn torrent tốt nhất từ mỗi nhóm
- **Download All**: 
  - Tải hết tất cả torrents hiển thị trên trang

## 🔧 Cấu hình

Bạn có thể điều chỉnh các tham số trong code:

```javascript
const DELAY = 2200;              // Delay giữa các lần download (ms)
const RETRY_DELAY_BASE = 2200;   // Thời gian chờ retry cơ bản (ms)
const MAX_RETRY_DELAY = 30000;   // Tối đa delay retry (ms)
```

## 🎨 Mode Selection Dialog

Khi click nút **🎯 Best Quality**, bạn sẽ thấy dialog đẹp mắt với 2 tùy chọn:

### ⚡ Smart Filter (Best Quality)
- Màu gradient tím đẹp mắt
- Tự động chọn torrent chất lượng cao nhất từ mỗi nhóm
- Tiết kiệm bandwidth và storage
- **Khuyến nghị** cho hầu hết trường hợp

### 📦 Download All
- Màu xám/dark
- Tải hết tất cả torrents trên trang
- Không lọc, không group
- Hữu ích khi bạn muốn archive toàn bộ

## 📝 Ví dụ

### NexusPHP - NetHD.org

**Kịch bản:** Tìm tất cả torrent của uploader `quangsang44`

Script sẽ:
1. Phát hiện các torrent của cùng phim (ví dụ: "Sisu: Road to Revenge 2025")
2. Gom nhóm: 
   - 4K DV HDR10+ HEVC (điểm: 1570)
   - 1080p Atmos H.264 (điểm: 740)
3. Chọn torrent 4K (điểm cao nhất)
4. Download

**Kết quả:** Bạn chỉ tải 1 torrent chất lượng tốt nhất thay vì phải chọn thủ công!

### UNIT3D

Giống như trước, hoạt động với group view có sẵn của tracker.

## ⚠️ Lưu ý

- Script cần quyền truy cập DOM của trang
- Không hoạt động trên các tracker khác (chưa hỗ trợ)
- Delay 2.2s giữa các download để tránh bị rate limit
- Retry vô hạn - có thể cần can thiệp thủ công nếu link lỗi vĩnh viễn

## 🐛 Troubleshooting

### Script không hiện nút
- Kiểm tra xem đang ở trang torrents chưa
- Mở Console (F12) xem có lỗi không

### Không tải được torrent
- Kiểm tra Console log
- Xem có bị rate limit không
- Đảm bảo đã login vào tracker

### Grouping không chính xác (NexusPHP)
- Script dùng regex để gom nhóm theo tên
- Nếu tên torrent quá khác nhau, có thể không gom được
- Bạn có thể điều chỉnh hàm `groupTorrentsByTitle()` trong code

## 📊 Console Logging

Script ghi log chi tiết trong Console:

```
[Start] Scanning for torrent groups...
[Tracker Type] UNIT3D: false, NexusPHP: true
[Found] 50 torrent rows (NexusPHP)
[Collected] 47 torrents
[Grouped] 23 unique titles
[Group 1] Processing 2 torrents
  - Sisu: Road to Revenge 2025 2160p... (Score: 1570)
  - Sisu: Road to Revenge 2025 1080p... (Score: 740)
  ✓ Selected: 4K HEVC (Score: 1570)
...
[Download] Starting with infinite retry...
[1/23] Attempt 1: 4K HEVC
  ✓ Success after 1 attempt(s): 4K HEVC
[Done] 23 torrents downloaded successfully
```

## 📜 License

MIT License - Free to use and modify!

## 🙏 Credits

Created by [bioidaika](https://github.com/bioidaika)
