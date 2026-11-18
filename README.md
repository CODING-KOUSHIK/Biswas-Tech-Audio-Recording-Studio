# Biswas Tech – Audio Recording Studio

Professional, responsive, browser-based audio recording and data collection studio engineered for high-fidelity speech training datasets and AI model development.

**Developed for:** Biswas Tech  
**Tagline:** *"Your Voice. Your Data. Your Contribution."*  
**Hosting Compatibility:** 100% Client-Side – Fully ready for GitHub Pages.

---

## Table of Contents
1. [Overview & Purpose](#overview--purpose)
2. [Audio Quality Specifications](#audio-quality-specifications)
3. [Key Features](#key-features)
4. [Technology Stack](#technology-stack)
5. [Architecture & Project Structure](#architecture--project-structure)
6. [Local Setup & Running](#local-setup--running)
7. [GitHub Pages Deployment Guide](#github-pages-deployment-guide)
8. [Script Formatting & Parsing Guide](#script-formatting--parsing-guide)
9. [Data Storage, Persistence & Backups](#data-storage-persistence--backups)
10. [Browser Permissions & Hardware Support](#browser-permissions--hardware-support)
11. [Testing & Quality Verification Checklist](#testing--quality-verification-checklist)

---

## 1. Overview & Purpose

The **Biswas Tech – Audio Recording Studio** is a client-side web application designed for crowdsourced and controlled voice dataset collection. It eliminates backend dependencies, servers, and recurring hosting costs by operating entirely within modern web browsers using the Web Audio API, AudioWorklet, and IndexedDB.

Participants can input their WhatsApp phone number, paste one or hundreds of recording scripts in any language (Hindi, Bengali, Assamese, Odia, English, etc.), record audio with live visual feedback, listen to and re-record clips, and export standard PCM WAV datasets complete with `manifest.json`.

---

## 2. Audio Quality Specifications

This platform enforces strict recording standards tailored for speech AI and Acoustic Model Training (e.g., Whisper, FastConformer, VITS, Bark):

| Parameter | Value | AI Training Requirement |
| :--- | :--- | :--- |
| **Container** | WAV (RIFF Header) | Standard lossless container |
| **Encoding** | Linear PCM | Uncompressed audio |
| **Sample Rate** | 48,000 Hz (48 kHz) | Resampled in real-time to exact 48 kHz |
| **Channels** | 1 (Mono) | Clean speech channel; stereo downmixed |
| **Bit Depth** | 16-bit | Signed 16-bit Little-Endian Integer PCM |
| **Sample Format** | Linear signed integers | Clamped [-32768, 32767] |
| **Byte Rate** | 96,000 Bytes/sec | `48000 * 1 * 2` |
| **Block Align** | 2 Bytes | `1 * 2` |
| **DSP Filters** | Disabled | No browser AEC, NS, or AGC to preserve natural acoustic dynamics |

---

## 3. Key Features

- **Zero-Backend Architecture:** Runs entirely in the browser. No external API, database server, or server infrastructure required.
- **Microphone Hardware Independence:** Inspects actual hardware audio sample rate; automatically resamples from 44.1 kHz, 96 kHz, or other device rates to 48 kHz.
- **AudioWorklet with Fallback:** Low-latency sample capture in the audio rendering thread with automatic `ScriptProcessorNode` fallback.
- **Multi-Language Script Parser:** Preserves UTF-8 Unicode characters for Hindi, Bengali, Assamese, Tamil, Telugu, Odia, English, and more without normalization.
- **Duplicate ID Detection:** Warns users and prevents silent overwrites if identical script IDs are supplied.
- **Rock-Solid Autosave & Persistence:** Stores scripts, metadata, and binary WAV Blobs immediately into IndexedDB (`biswasTechAudioDB`).
- **Crash & Reload Resilience:** If a participant refreshes, navigates away, or closes Chrome, their completed recordings and exact script position are automatically restored.
- **Safe Re-recording:** When re-recording, the previous audio file is preserved in database until the new recording is successfully finalized.
- **Dataset ZIP Packaging:** Uses JSZip to generate structured ZIP files containing individual WAV files named after each Script ID plus a comprehensive `manifest.json`.
- **Live Visualizer & VU Meter:** Real-time canvas oscilloscope showing the incoming audio waveform and a responsive decibel level meter.
- **Responsive 3-Column Studio Layout:** Left script list/drawer, central script reader and recording action dock, right session progress and audio specs.

---

## 4. Technology Stack

- **HTML5:** Semantic, accessible layout.
- **CSS3:** Custom responsive design system with CSS custom properties, smooth transitions, and high-contrast typography.
- **Vanilla JavaScript (ES6+):** Clean, modular scripts without heavy frameworks or build steps.
- **Web Audio API & AudioWorklet:** Direct sample access and real-time visualization.
- **IndexedDB:** Durable local client-side persistence for multi-megabyte audio Blobs.
- **JSZip:** In-memory compression and client-side ZIP packaging.

---

## 5. Architecture & Project Structure

```text
biswas-tech-audio-studio/
│
├── index.html            # Main single-page application shell
├── style.css             # SaaS layout, responsive grid, visualizer styles
├── app.js                # Core app controller, UI binding, script parser, router
├── audio-recorder.js     # Web Audio API engine, mic manager, visualizer hooks
├── audio-worklet.js      # AudioWorklet processor for raw PCM Float32 stream
├── database.js           # IndexedDB storage layer (sessions, scripts, recordings)
├── wav-encoder.js        # 48kHz 16-bit Mono PCM WAV encoder, resampler & validator
├── zip-manager.js        # Dataset packaging with manifest.json & JSZip
├── manifest.json         # Web App Manifest
├── README.md             # Complete technical guide & documentation
└── assets/
    ├── logo.svg          # Biswas Tech studio vector logo
    └── favicon.svg       # Studio tab favicon
```

---

## 6. Local Setup & Running

Because the application uses modern browser features like `AudioWorklet` and `getUserMedia`, modern browsers require the website to run under either `http://localhost`, `http://127.0.0.1`, or an `https://` origin.

### Method 1: Using Python Built-in Server
```bash
# Navigate to project folder
cd "path/to/biswas-tech-audio-studio"

# Start lightweight server (Python 3)
python -m http.server 8000
```
Open [http://localhost:8000](http://localhost:8000) in Google Chrome, Microsoft Edge, or Firefox.

### Method 2: Using Node.js / npx
```bash
npx serve .
# or
npx http-server -p 8080
```

### Method 3: VS Code Live Server
Right-click `index.html` in VS Code and click **"Open with Live Server"**.

---

## 7. GitHub Pages Deployment Guide

Deploying to GitHub Pages takes less than two minutes:

1. **Create a GitHub Repository:**
   - Log into your GitHub account and create a new repository (e.g. `biswas-tech-audio-studio`).
   - Choose **Public** (or Private if you have GitHub Pro).

2. **Push the Files to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Biswas Tech Audio Recording Studio"
   git branch -M main
   git remote add origin https://github.com/<your-username>/biswas-tech-audio-studio.git
   git push -u origin main
   ```

3. **Enable GitHub Pages:**
   - Go to your repository on GitHub.
   - Click **Settings** (gear icon) -> **Pages** (under Code and automation in sidebar).
   - Under **Build and deployment** -> **Source**, select **Deploy from a branch**.
   - Under **Branch**, select `main` and root folder `/ (root)`.
   - Click **Save**.

4. **Access the Live Studio:**
   - Your website will be live in ~60 seconds at:  
     `https://<your-username>.github.io/biswas-tech-audio-studio/`
   - GitHub Pages serves over HTTPS by default, which is required for microphone permissions.

---

## 8. Script Formatting & Parsing Guide

Scripts can be pasted as a batch into the script submission interface.

### Format Structure
Surround each script identifier with asterisks on its own line:

```text
*hi_04724*
Umm, papa ke phone mein balance khatam hote hi sab band ho jaata hai aur woh ghabra jaate hain.

*hi_04769*
Haan ji, papa ke phone mein balance khatam hote hi sab band ho jaata hai. Isliye auto recharge laga dijiye, uh, three hundred forty nine rupees wale plan ka.

*bn_01021*
নমস্কার, আমি জানতে চাই আমার বর্তমান প্ল্যানের মেয়াদ কবে শেষ হবে?
```

### Parsing Rules
- The text following `*<id>*` belongs to that script until the next `*<id>*` line.
- Punctuation, newlines, and unicode characters are 100% preserved.
- If plain text without IDs is pasted, automatic identifiers `SCRIPT_001`, `SCRIPT_002`... are provided.
- Duplicate IDs are caught immediately and surfaced before the recording session can begin.

---

## 9. Data Storage, Persistence & Backups

### Storage Architecture
- **IndexedDB (`biswasTechAudioDB`):**
  - `sessions`: Stores session ID, participant WhatsApp number, timestamp, script index, completion counts.
  - `scripts`: Stores script ID, session ID, script text, index, and status (`pending`, `completed`).
  - `recordings`: Stores binary PCM WAV Blobs, audio duration, sample rate (48000), channel count (1), bit depth (16), and byte size.
- **LocalStorage:** Only stores the participant's WhatsApp phone number for session restoration.
- **Storage Durability:** Automatically requests `navigator.storage.persist()`.
- **Backup & Restore:** Users can export a complete studio backup archive (`.zip`) from the Settings page and re-import it on another machine or browser.

---

## 10. Browser Permissions & Hardware Support

- **HTTPS Requirement:** Web browsers enforce that `navigator.mediaDevices.getUserMedia` is only available in secure contexts (`https://` or `http://localhost`).
- **Microphone Access:** Microphone permission is requested only when the user clicks **Start Recording**.
- **Hardware Agnostic:** If a microphone records at 44,100 Hz (common on standard laptops), the built-in linear resampler automatically interpolates the samples to 48,000 Hz.

---

## 11. Testing & Quality Verification Checklist

Use this checklist to verify your installation:

- [x] **Test 1:** Enter international WhatsApp number (e.g. `+91 96355 27675`) and proceed.
- [x] **Test 2:** Paste batch scripts with `*id*` notation and verify table detection.
- [x] **Test 3:** Verify multilingual Unicode scripts (Hindi, Bengali, English).
- [x] **Test 4:** Grant microphone permission and record audio.
- [x] **Test 5:** Check live oscilloscope and decibel level meter animation.
- [x] **Test 6:** Stop recording and verify audio player displays duration.
- [x] **Test 7:** Test playback scrubber seeking and volume control.
- [x] **Test 8:** Click "Re-record" and confirm existing audio is not destroyed until replacement is saved.
- [x] **Test 9:** Refresh the page and confirm previous session and completed audio clips are intact.
- [x] **Test 10:** Test Next Script navigation warning when skipping an unrecorded script.
- [x] **Test 11:** Complete scripts and click **Generate ZIP & Download**.
- [x] **Test 12:** Open downloaded ZIP and verify presence of `<scriptId>.wav` and `manifest.json`.
- [x] **Test 13:** Inspect WAV header in VLC, Audacity, or MediaInfo: verifies `PCM 16-bit, 48000 Hz, 1 channel Mono`.
- [x] **Test 14:** Test Settings backup export and import.

---

**Biswas Tech – Audio Recording Studio**  
*Empowering High-Quality AI Speech Datasets.*

