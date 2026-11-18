/**
 * Biswas Tech – Audio Recording Studio
 * Audio Recorder Engine Module
 * 
 * High-performance Web Audio API recording engine using AudioWorklet
 * (with automatic ScriptProcessor fallback), AnalyserNode for live visualizer,
 * sample accumulator, and direct PCM WAV generation.
 */

(function (window) {
  'use strict';

  class AudioRecorderEngine {
    constructor() {
      this.state = 'idle'; // 'idle' | 'recording' | 'paused' | 'stopped'
      this.audioContext = null;
      this.mediaStream = null;
      this.sourceNode = null;
      this.workletNode = null;
      this.scriptProcessorNode = null;
      this.analyserNode = null;

      this.recordedChunks = [];
      this.totalRecordedSamples = 0;

      // Timer tracking
      this.startTime = 0;
      this.pausedDuration = 0;
      this.pauseStartTime = 0;
      this.timerInterval = null;

      // Callbacks
      this.onStateChange = null;
      this.onTimeUpdate = null;
      this.onError = null;
    }

    /**
     * Checks whether browser supports required Web Audio APIs
     */
    static isSupported() {
      return !!(
        navigator.mediaDevices &&
        navigator.mediaDevices.getUserMedia &&
        (window.AudioContext || window.webkitAudioContext)
      );
    }

    /**
     * Set recorder state and notify listener
     */
    _setState(newState) {
      this.state = newState;
      if (typeof this.onStateChange === 'function') {
        this.onStateChange(newState);
      }
    }

    /**
     * Initializes AudioContext and Microphone stream with AI speech dataset constraints
     */
    async _initAudioPipeline() {
      // Create AudioContext
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error('Web Audio API is not supported in this browser.');
      }

      this.audioContext = new AudioContextClass({
        latencyHint: 'interactive',
        // Request 48000 Hz if hardware supports it; WavEncoder will resample if not
        sampleRate: 48000
      });

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Request microphone stream without browser DSP processing (echo cancellation/noise suppression)
      // to preserve authentic speech dataset quality
      try {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 48000,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          }
        });
      } catch (err) {
        // Fallback to relaxed constraints if strict constraints fail on older devices
        if (err.name === 'OverconstrainedError' || err.name === 'ConstraintNotSatisfiedError') {
          this.mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: true
          });
        } else {
          throw err;
        }
      }

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Create AnalyserNode for live visualizer & volume meter
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 512;
      this.analyserNode.smoothingTimeConstant = 0.8;
      this.sourceNode.connect(this.analyserNode);

      // Try setting up AudioWorklet first; fallback to ScriptProcessor if needed
      let workletSuccess = false;
      if (this.audioContext.audioWorklet && typeof this.audioContext.audioWorklet.addModule === 'function') {
        try {
          try {
            await this.audioContext.audioWorklet.addModule('./audio-worklet.js');
          } catch (moduleLoadErr) {
            // If relative module fails (e.g. CORS/blob restriction), load inline blob
            const inlineWorkletCode = `
              class RecorderProcessor extends AudioWorkletProcessor {
                constructor() {
                  super();
                  this.isRecording = false;
                  this.port.onmessage = (e) => {
                    if (!e.data) return;
                    if (e.data.action === 'start' || e.data.action === 'resume') this.isRecording = true;
                    if (e.data.action === 'pause' || e.data.action === 'stop') this.isRecording = false;
                  };
                }
                process(inputs) {
                  if (!this.isRecording) return true;
                  const input = inputs[0];
                  if (!input || input.length === 0) return true;
                  const ch0 = input[0];
                  if (!ch0 || ch0.length === 0) return true;
                  const mono = new Float32Array(ch0.length);
                  if (input.length === 1) {
                    mono.set(ch0);
                  } else {
                    const ch1 = input[1];
                    for (let i = 0; i < ch0.length; i++) {
                      mono[i] = (ch0[i] + (ch1 ? ch1[i] : 0)) * 0.5;
                    }
                  }
                  this.port.postMessage({ event: 'chunk', buffer: mono }, [mono.buffer]);
                  return true;
                }
              }
              registerProcessor('recorder-worklet-processor', RecorderProcessor);
            `;
            const blob = new Blob([inlineWorkletCode], { type: 'application/javascript' });
            const blobUrl = URL.createObjectURL(blob);
            await this.audioContext.audioWorklet.addModule(blobUrl);
            URL.revokeObjectURL(blobUrl);
          }

          this.workletNode = new AudioWorkletNode(this.audioContext, 'recorder-worklet-processor');
          this.workletNode.port.onmessage = (event) => {
            if (event.data && event.data.event === 'chunk' && this.state === 'recording') {
              const chunk = event.data.buffer;
              this.recordedChunks.push(chunk);
              this.totalRecordedSamples += chunk.length;
            }
          };

          this.sourceNode.connect(this.workletNode);
          // Connect to destination to keep worklet alive without creating feedback
          const silenceGain = this.audioContext.createGain();
          silenceGain.gain.value = 0;
          this.workletNode.connect(silenceGain);
          silenceGain.connect(this.audioContext.destination);

          workletSuccess = true;
        } catch (e) {
          console.warn('AudioWorklet initialization failed, falling back to ScriptProcessor:', e);
          workletSuccess = false;
        }
      }

      // ScriptProcessor fallback for older browsers or restricted sandboxes
      if (!workletSuccess) {
        const bufferSize = 4096;
        this.scriptProcessorNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
        this.scriptProcessorNode.onaudioprocess = (audioProcessingEvent) => {
          if (this.state !== 'recording') return;
          const inputBuffer = audioProcessingEvent.inputBuffer;
          const inputData = inputBuffer.getChannelData(0);
          const chunk = new Float32Array(inputData.length);
          chunk.set(inputData);
          this.recordedChunks.push(chunk);
          this.totalRecordedSamples += chunk.length;
        };

        this.sourceNode.connect(this.scriptProcessorNode);
        const silenceGain = this.audioContext.createGain();
        silenceGain.gain.value = 0;
        this.scriptProcessorNode.connect(silenceGain);
        silenceGain.connect(this.audioContext.destination);
      }
    }

    /**
     * Start microphone recording
     */
    async start() {
      if (this.state === 'recording') return;

      try {
        this.recordedChunks = [];
        this.totalRecordedSamples = 0;
        this.pausedDuration = 0;

        await this._initAudioPipeline();

        if (this.workletNode) {
          this.workletNode.port.postMessage({ action: 'start' });
        }

        this.startTime = Date.now();
        this._startTimer();
        this._setState('recording');
      } catch (err) {
        this._cleanup();
        this._setState('idle');
        if (typeof this.onError === 'function') {
          this.onError(err);
        }
        throw err;
      }
    }

    /**
     * Pause recording
     */
    pause() {
      if (this.state !== 'recording') return;

      if (this.workletNode) {
        this.workletNode.port.postMessage({ action: 'pause' });
      }

      this.pauseStartTime = Date.now();
      this._stopTimer();
      this._setState('paused');
    }

    /**
     * Resume recording
     */
    resume() {
      if (this.state !== 'paused') return;

      if (this.pauseStartTime > 0) {
        this.pausedDuration += (Date.now() - this.pauseStartTime);
        this.pauseStartTime = 0;
      }

      if (this.workletNode) {
        this.workletNode.port.postMessage({ action: 'resume' });
      }

      this._startTimer();
      this._setState('recording');
    }

    /**
     * Stop recording and generate genuine 48kHz 16-bit Mono WAV
     * @returns {Promise<{blob: Blob, duration: number, sampleRate: number, channels: number, bitDepth: number, fileSize: number}>}
     */
    async stop() {
      if (this.state !== 'recording' && this.state !== 'paused') {
        throw new Error('Recorder is not active.');
      }

      if (this.workletNode) {
        this.workletNode.port.postMessage({ action: 'stop' });
      }

      this._stopTimer();
      this._setState('stopped');

      const actualSampleRate = this.audioContext ? this.audioContext.sampleRate : 48000;

      // Merge collected Float32 chunks into a single contiguous array
      const mergedSamples = new Float32Array(this.totalRecordedSamples);
      let offset = 0;
      for (const chunk of this.recordedChunks) {
        mergedSamples.set(chunk, offset);
        offset += chunk.length;
      }

      // Cleanup microphone tracks & audio nodes
      this._cleanup();

      if (mergedSamples.length === 0) {
        this._setState('idle');
        throw new Error('No audio was captured. Please check your microphone.');
      }

      // Encode into genuine PCM WAV 16-bit 48,000 Hz Mono
      if (!window.WavEncoder || typeof window.WavEncoder.encode !== 'function') {
        this._setState('idle');
        throw new Error('WAV encoder module is not available.');
      }

      const wavBlob = window.WavEncoder.encode(mergedSamples, actualSampleRate);

      // Validate resulting WAV
      const validation = await window.WavEncoder.validateWavBlob(wavBlob);
      if (!validation.valid) {
        this._setState('idle');
        throw new Error(`WAV verification failed: ${validation.error}`);
      }

      this._setState('idle');

      return {
        blob: wavBlob,
        duration: validation.duration,
        sampleRate: validation.sampleRate,
        channels: validation.channels,
        bitDepth: validation.bitDepth,
        fileSize: validation.fileSize
      };
    }

    /**
     * Cancel and discard current recording
     */
    cancel() {
      this._stopTimer();
      this.recordedChunks = [];
      this.totalRecordedSamples = 0;
      this._cleanup();
      this._setState('idle');
    }

    /**
     * Stop and cleanup hardware resources
     */
    _cleanup() {
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => {
          try { track.stop(); } catch (e) { /* ignore */ }
        });
        this.mediaStream = null;
      }

      if (this.sourceNode) {
        try { this.sourceNode.disconnect(); } catch (e) { /* ignore */ }
        this.sourceNode = null;
      }

      if (this.workletNode) {
        try { this.workletNode.disconnect(); } catch (e) { /* ignore */ }
        this.workletNode = null;
      }

      if (this.scriptProcessorNode) {
        try {
          this.scriptProcessorNode.disconnect();
          this.scriptProcessorNode.onaudioprocess = null;
        } catch (e) { /* ignore */ }
        this.scriptProcessorNode = null;
      }

      if (this.analyserNode) {
        try { this.analyserNode.disconnect(); } catch (e) { /* ignore */ }
        this.analyserNode = null;
      }

      if (this.audioContext && this.audioContext.state !== 'closed') {
        try { this.audioContext.close(); } catch (e) { /* ignore */ }
        this.audioContext = null;
      }
    }

    _startTimer() {
      this._stopTimer();
      this.timerInterval = setInterval(() => {
        if (this.state === 'recording' && typeof this.onTimeUpdate === 'function') {
          const elapsed = (Date.now() - this.startTime) - this.pausedDuration;
          this.onTimeUpdate(Math.max(0, elapsed));
        }
      }, 100);
    }

    _stopTimer() {
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
    }

    /**
     * Fetches current time-domain audio data for waveform visualization
     */
    getWaveformData(dataArray) {
      if (this.analyserNode && this.state === 'recording') {
        this.analyserNode.getByteTimeDomainData(dataArray);
      } else {
        // Flatline if not recording
        dataArray.fill(128);
      }
    }

    /**
     * Calculates current RMS volume level (0.0 to 1.0)
     */
    getRMSLevel() {
      if (!this.analyserNode || this.state !== 'recording') return 0;

      const buffer = new Uint8Array(this.analyserNode.fftSize);
      this.analyserNode.getByteTimeDomainData(buffer);

      let sum = 0;
      for (let i = 0; i < buffer.length; i++) {
        const normalized = (buffer[i] - 128) / 128;
        sum += normalized * normalized;
      }

      const rms = Math.sqrt(sum / buffer.length);
      return Math.min(1.0, rms * 3.5); // Boost gain curve slightly for clear UI feedback
    }
  }

  window.AudioRecorderEngine = AudioRecorderEngine;

})(window);

