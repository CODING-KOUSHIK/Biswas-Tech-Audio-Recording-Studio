/**
 * Biswas Tech – Audio Recording Studio
 * ZIP Archive & Dataset Manifest Generator
 * 
 * Bundles verified 16-bit 48kHz PCM WAV recordings and standardized
 * manifest.json into a single downloadable ZIP archive using JSZip.
 */

(function (window) {
  'use strict';

  class ZipManager {
    constructor() {
      this.isGenerating = false;
    }

    /**
     * Ensures JSZip is loaded; loads from CDN dynamically if needed
     */
    static async ensureJSZip() {
      if (window.JSZip) {
        return window.JSZip;
      }

      const cdnUrls = [
        'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
        'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
        'https://unpkg.com/jszip@3.10.1/dist/jszip.min.js'
      ];

      for (const url of cdnUrls) {
        try {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load ${url}`));
            document.head.appendChild(script);
          });
          if (window.JSZip) return window.JSZip;
        } catch (e) {
          console.warn(`Failed loading JSZip from ${url}, trying fallback...`);
        }
      }

      throw new Error('Could not load JSZip library from CDNs. Please check your internet connection.');
    }

    /**
     * Formats current local date and time for filename: YYYY-MM-DD_HH-mm-ss
     */
    static formatLocalDateTime(date = new Date()) {
      const pad = (n) => String(n).padStart(2, '0');
      const year = date.getFullYear();
      const month = pad(date.getMonth() + 1);
      const day = pad(date.getDate());
      const hours = pad(date.getHours());
      const minutes = pad(date.getMinutes());
      const seconds = pad(date.getSeconds());

      return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
    }

    /**
     * Clean phone number to safe string for filenames
     */
    static sanitizePhoneNumber(phone) {
      if (!phone) return 'recording_session';
      // Strip everything except alphanumeric characters
      const clean = phone.replace(/[^a-zA-Z0-9]/g, '');
      return clean || 'recording_session';
    }

    /**
     * Generates ZIP file containing all completed WAV recordings and manifest.json
     * 
     * @param {Object} session Session metadata
     * @param {Array} scripts Array of script objects
     * @param {Array} recordings Array of recording objects with wavBlob
     * @param {Function} onProgress Progress callback (0 - 100)
     * @returns {Promise<{zipBlob: Blob, filename: string, totalFiles: number, totalSize: number}>}
     */
    async generateSessionZip(session, scripts, recordings, onProgress = null) {
      if (this.isGenerating) {
        throw new Error('ZIP generation is already in progress.');
      }

      this.isGenerating = true;

      try {
        const JSZipClass = await ZipManager.ensureJSZip();
        const zip = new JSZipClass();

        // Map recordings by scriptId for quick lookup
        const recMap = new Map();
        for (const rec of recordings) {
          recMap.set(rec.scriptId, rec);
        }

        const manifestFiles = [];
        let totalBytes = 0;
        let validRecordingsCount = 0;

        // Process each completed script
        for (let i = 0; i < scripts.length; i++) {
          const script = scripts[i];
          const rec = recMap.get(script.scriptId);

          if (!rec || !rec.wavBlob) {
            continue;
          }

          // Validate WAV blob integrity
          const validation = await window.WavEncoder.validateWavBlob(rec.wavBlob);
          if (!validation.valid) {
            console.warn(`Skipping invalid recording for script ${script.scriptId}: ${validation.error}`);
            continue;
          }

          const filename = `${script.scriptId}.wav`;

          // Add WAV file directly to root of ZIP
          zip.file(filename, rec.wavBlob);

          validRecordingsCount++;
          totalBytes += rec.wavBlob.size;

          manifestFiles.push({
            scriptId: script.scriptId,
            filename: filename,
            duration: validation.duration || rec.duration || 0,
            fileSize: rec.wavBlob.size
          });

          if (typeof onProgress === 'function') {
            // Processing files is 0% - 30% of progress
            const fileProgress = Math.round(((i + 1) / scripts.length) * 30);
            onProgress(fileProgress, `Adding ${filename}...`);
          }
        }

        if (validRecordingsCount === 0) {
          throw new Error('No valid completed recordings found to package.');
        }

        // Generate standardized manifest.json
        const nowIso = new Date().toISOString();
        const manifestData = {
          company: "Biswas Tech",
          whatsappNumber: session.whatsappNumber || "unknown",
          createdAt: session.createdAt || nowIso,
          exportTimestamp: nowIso,
          totalScripts: scripts.length,
          completedScripts: validRecordingsCount,
          audioFormat: "WAV",
          encoding: "PCM",
          sampleRate: 48000,
          channels: 1,
          bitDepth: 16,
          files: manifestFiles
        };

        zip.file("manifest.json", JSON.stringify(manifestData, null, 2));

        if (typeof onProgress === 'function') {
          onProgress(35, 'Compressing archive...');
        }

        // Generate ZIP Blob with compression
        const zipBlob = await zip.generateAsync(
          {
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 }
          },
          (metadata) => {
            if (typeof onProgress === 'function') {
              // Compression is 35% - 100% of progress
              const percent = 35 + Math.round(metadata.percent * 0.65);
              onProgress(Math.min(100, percent), `Compressing: ${Math.round(metadata.percent)}%`);
            }
          }
        );

        const safePhone = ZipManager.sanitizePhoneNumber(session.whatsappNumber);
        const dateStamp = ZipManager.formatLocalDateTime();
        const zipFilename = `${safePhone}_${dateStamp}.zip`;

        return {
          zipBlob,
          filename: zipFilename,
          totalFiles: validRecordingsCount,
          totalSize: zipBlob.size
        };
      } finally {
        this.isGenerating = false;
      }
    }

    /**
     * Triggers safe browser download of Blob and revokes URL
     */
    static downloadBlob(blob, filename) {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.style.display = 'none';
      anchor.href = url;
      anchor.download = filename;

      document.body.appendChild(anchor);
      anchor.click();

      // Defer revocation so browser has time to initiate download
      setTimeout(() => {
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
      }, 3000);
    }
  }

  const instance = new ZipManager();
  instance.downloadBlob = ZipManager.downloadBlob;
  window.ZipManager = instance;

})(window);

