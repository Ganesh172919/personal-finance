class VoicePcmProcessor extends AudioWorkletProcessor {
  frame = new DataView(new ArrayBuffer(1024));
  offset = 0;

  process(inputs) {
    for (const sample of inputs[0]?.[0] ?? []) {
      const value = Math.max(-1, Math.min(1, sample));
      this.frame.setInt16(this.offset, value * (value < 0 ? 32768 : 32767), true);
      this.offset += 2;
      if (this.offset === this.frame.byteLength) {
        this.port.postMessage(this.frame.buffer, [this.frame.buffer]);
        this.frame = new DataView(new ArrayBuffer(1024));
        this.offset = 0;
      }
    }
    return true;
  }
}

registerProcessor("voice-pcm", VoicePcmProcessor);
