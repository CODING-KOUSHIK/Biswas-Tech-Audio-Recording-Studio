/**
 * Biswas Tech – Audio Recording Studio
 * AudioWorklet Processor for Direct Uncompressed PCM Float32 Capture
 * 
 * Captures raw microphone audio samples directly in the audio rendering thread
 * without intermediate lossy compression (no WebM/Opus).
 */

class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.isRecording = false;

    this.port.onmessage = (event) => {
      const data = event.data;
      if (!data) return;

      switch (data.action) {
        case 'start':
        case 'resume':
          this.isRecording = true;
          break;
        case 'pause':
          this.isRecording = false;
          break;
        case 'stop':
          this.isRecording = false;
          break;
      }
    };
  }

  process(inputs, outputs, parameters) {
    if (!this.isRecording) {
      return true;
    }

    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }

    const channelCount = input.length;
    const channel0 = input[0];

    if (!channel0 || channel0.length === 0) {
      return true;
    }

    const sampleCount = channel0.length;
    const monoBuffer = new Float32Array(sampleCount);

    if (channelCount === 1) {
      // Mono input: copy directly
      monoBuffer.set(channel0);
    } else {
      // Multi-channel (stereo) input: downmix to mono by averaging channels
      const channel1 = input[1];
      for (let i = 0; i < sampleCount; i++) {
        const c0 = channel0[i] || 0;
        const c1 = (channel1 && channel1[i]) || 0;
        monoBuffer[i] = (c0 + c1) * 0.5;
      }
    }

    // Post chunk to the main thread with transferable ArrayBuffer
    this.port.postMessage(
      {
        event: 'chunk',
        buffer: monoBuffer
      },
      [monoBuffer.buffer]
    );

    return true;
  }
}

registerProcessor('recorder-worklet-processor', RecorderProcessor);

