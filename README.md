# 🚀 VietMediaF - Setup Guide / Hướng Dẫn Thiết Lập

---

## 📡 IRC Channel / Kênh IRC

Official IRC channel for VietMediaF. Torrents are announced here in real-time.
Kênh IRC chính thức của VietMediaF. Torrent mới được thông báo tại đây.

| | |
|---|---|
| **Network** | Libera.Chat |
| **Server** | `irc.libera.chat` |
| **Port** | `6667` (plaintext) / `6697` (TLS/SSL) |
| **Channel** | `#vietmediaf` |
| **Bot** | `VietMediaF` |

Web client / Truy cập nhanh: https://web.libera.chat/#vietmediaf

---

## 🔍 Prowlarr - Custom Indexer

VietMediaF is not available in Prowlarr by default. You need to add a custom indexer definition.
VietMediaF chưa có sẵn trong Prowlarr. Bạn cần thêm custom indexer definition.

### Installation / Cài đặt

1. **Download / Tải:** [vietmediaf.yml](https://www.mediafire.com/file/todd9ee8vll3ig0/install_vietmediaf.zip/file)

2. **Copy** `vietmediaf.yml` to the custom definitions folder / vào thư mục custom definitions:
   - **Windows:** `C:\ProgramData\Prowlarr\Definitions\Custom\`
   - **Linux:** `~/.config/Prowlarr/Definitions/Custom/`
   - **Docker:** `/config/Definitions/Custom/`

3. **Restart** Prowlarr

4. Go to **Settings → Indexers → Add** → search **VietMediaF**
   Vào **Settings → Indexers → Add** → tìm **VietMediaF**

5. Enter your **API Key** (found at: Profile → Settings → API Key)
   Nhập **API Key** (lấy tại: Profile → Settings → API Key)

---

## 📤 Upload-Assistant

A fork of Upload-Assistant with VietMediaF support for automated torrent creation and uploading.
Fork Upload-Assistant hỗ trợ VietMediaF, giúp tự động tạo và upload torrent.

**GitHub:** https://github.com/bioidaika/Upload-Assistant

### Quick Start / Bắt đầu nhanh

```bash
git clone https://github.com/bioidaika/Upload-Assistant.git
cd Upload-Assistant
pip install -r requirements.txt
```

### Configuration / Cấu hình

Add VietMediaF to `data/config.py`:
Thêm VietMediaF vào `data/config.py`:

```python
"VMF": {
    "api_key": "YOUR_API_KEY",
    "announce_url": "https://tracker.vietmediaf.store/announce/YOUR_PID",
},
```

### Usage / Sử dụng

```bash
python upload.py /path/to/media --trackers VMF
```

---

## ⚡ Autobrr - Custom Indexer Definition

VietMediaF is not available in autobrr by default. Add a custom definition to auto-snatch torrents from IRC.
VietMediaF chưa có sẵn trong autobrr. Thêm custom definition để tự động snatch torrent từ IRC.

### Installation / Cài đặt

1. **Download / Tải:** [vietmediaf.yaml](https://www.mediafire.com/file/todd9ee8vll3ig0/install_vietmediaf.zip/file)

2. **Copy** `vietmediaf.yaml` to the autobrr definitions folder / vào thư mục definitions:
   - **Docker:** `/config/definitions/`
   - **Linux:** `~/.config/autobrr/definitions/`
   - **Windows:** `%APPDATA%\autobrr\definitions\`

3. Add to `config.toml` / Thêm vào `config.toml`:
   ```toml
   customDefinitions = "/path/to/definitions"
   ```

4. **Restart** autobrr

### Configuration / Cấu hình

1. **Settings → Indexers** → Add → select **VietMediaF**
   Chọn **VietMediaF**

2. Enter **RSS Key (RID)** (found at: Profile → Settings → Security → RSS Key)
   Nhập **RSS Key (RID)** (lấy tại: Profile → Settings → Security → RSS Key)

3. **Settings → IRC** → Enable **Libera.Chat** network
   - **Nick:** Register a personal nick on Libera.Chat (different from bot `VietMediaF`)
     Đăng ký nick riêng trên Libera.Chat (khác bot `VietMediaF`)
   - **Channel:** `#vietmediaf`

4. Create **Filters** and add **Download Client** as needed
   Tạo **Filter** và thêm **Download Client** theo nhu cầu

### Announce Format / Định dạng thông báo

```
Category [Movie] Type [WEB-DL] Name [Movie.Name.2024.1080p.WEB-DL.x264] Resolution [1080p] Freeleech [0%] Internal [No] Double Upload [No] Size [4.2 GB] Uploader [Anonymous] Url [https://tracker.vietmediaf.store/torrents/150]
```

---

## 📋 Summary / Tóm Tắt

| Tool | File | Folder / Thư mục |
|---|---|---|
| **Prowlarr** | `vietmediaf.yml` | `Definitions/Custom/` |
| **Autobrr** | `vietmediaf.yaml` | `definitions/` |
| **Upload-Assistant** | — | [GitHub](https://github.com/bioidaika/Upload-Assistant) |

Need help? Join us on IRC `#vietmediaf` or use the tracker chatbox. 💬
Cần hỗ trợ? Tham gia IRC `#vietmediaf` hoặc chatbox trên tracker. 💬
