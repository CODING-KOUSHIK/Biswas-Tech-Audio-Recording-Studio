/**
 * Biswas Tech – Audio Recording Studio
 * WAV Encoder & Resampler Module
 * 
 * Generates genuine 16-bit Linear PCM, 48,000 Hz, Mono .wav files
 * compliant with AI speech training dataset requirements.
 */

(function (window) {
  'use strict';

  const TARGET_SAMPLE_RATE = 48000;
  const TARGET_CHANNELS = 1;
  const TARGET_BIT_DEPTH = 16;
  const BYTES_PER_SAMPLE = TARGET_BIT_DEPTH / 8; // 2 bytes
  const BYTE_RATE = TARGET_SAMPLE_RATE * TARGET_CHANNELS * BYTES_PER_SAMPLE; // 96000
  const BLOCK_ALIGN = TARGET_CHANNELS * BYTES_PER_SAMPLE; // 2

  /**
   * High-quality linear resampling from arbitrary sample rate to 48,000 Hz
   * @param {Float32Array} inputSamples 
   * @param {number} inputSampleRate 
   * @returns {Float32Array} Resampled Float32 audio samples at 48,000 Hz
   */
  function resampleTo48k(inputSamples, inputSampleRate) {
    if (!inputSamples || inputSamples.length === 0) {
      return new Float32Array(0);
    }

    if (inputSampleRate === TARGET_SAMPLE_RATE) {
      return inputSamples;
    }

    const ratio = inputSampleRate / TARGET_SAMPLE_RATE;
    const targetLength = Math.round(inputSamples.length / ratio);
    const output = new Float32Array(targetLength);

    for (let i = 0; i < targetLength; i++) {
      const position = i * ratio;
      const index = Math.floor(position);
      const frac = position - index;

      const s0 = inputSamples[index] !== undefined ? inputSamples[index] : 0;
      const s1 = inputSamples[index + 1] !== undefined ? inputSamples[index + 1] : s0;

      // Linear interpolation between adjacent samples
      output[i] = s0 + frac * (s1 - s0);
    }

    return output;
  }

  /**
   * Convert normalized Float32 samples (-1.0 to +1.0) to signed 16-bit integer PCM
   * Handles clamping to prevent integer overflow and clipping artifacts
   * @param {Float32Array} floatSamples 
   * @returns {Int16Array}
   */
  function floatToInt16(floatSamples) {
    const length = floatSamples.length;
    const pcm16 = new Int16Array(length);

    for (let i = 0; i < length; i++) {
      let s = floatSamples[i];

      // Soft clamp to preserve signal boundaries
      if (s > 1.0) s = 1.0;
      else if (s < -1.0) s = -1.0;

      // Map to 16-bit signed range [-32768, 32767]
      // Correctly handle negative and positive boundaries
      pcm16[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7FFF);
    }

    return pcm16;
  }

  /**
   * Writes an ASCII string to DataView
   */
  function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  /**
   * Encodes audio samples into a standard RIFF/WAVE PCM 16-bit 48kHz Mono WAV Blob
   * @param {Float32Array} rawSamples Raw input audio samples
   * @param {number} inputSampleRate Source sample rate (e.g. 44100, 48000, 96000)
   * @returns {Blob} Valid .wav Blob
   */
  function encode(rawSamples, inputSampleRate) {
    if (!rawSamples || rawSamples.length === 0) {
      throw new Error('No audio samples provided for encoding.');
    }

    // Step 1: Resample to 48,000 Hz if needed
    const resampled = resampleTo48k(rawSamples, inputSampleRate);

    // Step 2: Convert to signed 16-bit PCM
    const pcm16 = floatToInt16(resampled);

    const dataSize = pcm16.length * BYTES_PER_SAMPLE;
    const headerSize = 44;
    const totalSize = headerSize + dataSize;

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);

    /* RIFF identifier */
    writeString(view, 0, 'RIFF');
    /* RIFF chunk length = 36 + dataSize */
    view.setUint32(4, 36 + dataSize, true);
    /* RIFF type */
    writeString(view, 8, 'WAVE');

    /* format chunk identifier */
    writeString(view, 12, 'fmt ');
    /* format chunk length (16 for PCM) */
    view.setUint32(16, 16, true);
    /* sample format (1 = Linear PCM) */
    view.setUint16(20, 1, true);
    /* channel count (1 = Mono) */
    view.setUint16(22, TARGET_CHANNELS, true);
    /* sample rate (48000 Hz) */
    view.setUint32(24, TARGET_SAMPLE_RATE, true);
    /* byte rate (sampleRate * channels * bytesPerSample = 96000) */
    view.setUint32(28, BYTE_RATE, true);
    /* block align (channels * bytesPerSample = 2) */
    view.setUint16(32, BLOCK_ALIGN, true);
    /* bits per sample (16-bit) */
    view.setUint16(34, TARGET_BIT_DEPTH, true);

    /* data chunk identifier */
    writeString(view, 36, 'data');
    /* data chunk length */
    view.setUint32(40, dataSize, true);

    // Write PCM 16-bit samples (little-endian)
    let offset = 44;
    for (let i = 0; i < pcm16.length; i++, offset += 2) {
      view.setInt16(offset, pcm16[i], true);
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  /**
   * Validates a WAV Blob against strict dataset quality specifications
   * @param {Blob} blob 
   * @returns {Promise<{valid: boolean, error?: string, sampleRate?: number, channels?: number, bitDepth?: number, duration?: number, fileSize?: number}>}
   */
  async function validateWavBlob(blob) {
    if (!blob || !(blob instanceof Blob)) {
      return { valid: false, error: 'Input is not a valid Blob object.' };
    }

    if (blob.size < 44) {
      return { valid: false, error: 'File size is too small for a valid WAV header (less than 44 bytes).' };
    }

    try {
      const headerSlice = blob.slice(0, 44);
      const arrayBuffer = await headerSlice.arrayBuffer();
      const view = new DataView(arrayBuffer);

      // Verify 'RIFF'
      const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
      if (riff !== 'RIFF') {
        return { valid: false, error: `Invalid RIFF header: expected 'RIFF', got '${riff}'.` };
      }

      // Verify 'WAVE'
      const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
      if (wave !== 'WAVE') {
        return { valid: false, error: `Invalid format: expected 'WAVE', got '${wave}'.` };
      }

      // Verify 'fmt '
      const fmt = String.fromCharCode(view.getUint8(12), view.getUint8(13), view.getUint8(14), view.getUint8(15));
      if (fmt !== 'fmt ') {
        return { valid: false, error: `Invalid fmt chunk: expected 'fmt ', got '${fmt}'.` };
      }

      // Format code: 1 = Linear PCM
      const format = view.getUint16(20, true);
      if (format !== 1) {
        return { valid: false, error: `Invalid audio format: expected 1 (Linear PCM), got ${format}.` };
      }

      // Channels: 1 = Mono
      const channels = view.getUint16(22, true);
      if (channels !== TARGET_CHANNELS) {
        return { valid: false, error: `Invalid channels: expected 1 (Mono), got ${channels}.` };
      }

      // Sample rate: 48000 Hz
      const sampleRate = view.getUint32(24, true);
      if (sampleRate !== TARGET_SAMPLE_RATE) {
        return { valid: false, error: `Invalid sample rate: expected 48000 Hz, got ${sampleRate} Hz.` };
      }

      // Byte rate: 96000
      const byteRate = view.getUint32(28, true);
      if (byteRate !== BYTE_RATE) {
        return { valid: false, error: `Invalid byte rate: expected 96000, got ${byteRate}.` };
      }

      // Block align: 2
      const blockAlign = view.getUint16(32, true);
      if (blockAlign !== BLOCK_ALIGN) {
        return { valid: false, error: `Invalid block align: expected 2, got ${blockAlign}.` };
      }

      // Bits per sample: 16
      const bitDepth = view.getUint16(34, true);
      if (bitDepth !== TARGET_BIT_DEPTH) {
        return { valid: false, error: `Invalid bit depth: expected 16-bit, got ${bitDepth}-bit.` };
      }

      // Verify 'data' chunk
      const dataTag = String.fromCharCode(view.getUint8(36), view.getUint8(37), view.getUint8(38), view.getUint8(39));
      if (dataTag !== 'data') {
        return { valid: false, error: `Invalid data chunk: expected 'data', got '${dataTag}'.` };
      }

      const dataChunkSize = view.getUint32(40, true);
      if (dataChunkSize <= 0) {
        return { valid: false, error: 'Audio data chunk is empty (0 bytes).' };
      }

      const duration = (dataChunkSize / BYTES_PER_SAMPLE) / sampleRate;

      return {
        valid: true,
        sampleRate,
        channels,
        bitDepth,
        duration: Math.round(duration * 100) / 100,
        fileSize: blob.size
      };
    } catch (err) {
      return { valid: false, error: `Failed to inspect WAV header: ${err.message}` };
    }
  }

  // Export module to global scope
  window.WavEncoder = {
    encode,
    resampleTo48k,
    floatToInt16,
    validateWavBlob,
    TARGET_SAMPLE_RATE,
    TARGET_CHANNELS,
    TARGET_BIT_DEPTH
  };

})(window);

