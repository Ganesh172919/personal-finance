/**
 * @fileoverview Pure Node.js in-memory Audio Fixture Generator for FinWise Bharat Voice E2E Tests.
 *
 * Provides byte-accurate RIFF/WAVE header generation and mathematical PCM waveform synthesis
 * for 16kHz clean speech, 8kHz telephonic narrowband audio, synthetic ~25KB audible chimes,
 * simulated street noise, and pathological corrupted buffers.
 *
 * Zero external codec dependencies — operates strictly with native Node.js Buffers.
 *
 * @module test/e2e/fixtures/audioFixtures
 */

/**
 * Creates a valid 44-byte RIFF/WAVE header Buffer for 16-bit Mono PCM audio.
 *
 * Header Layout:
 * - [00..03] "RIFF"
 * - [04..07] ChunkSize = 36 + dataSize (uint32 LE)
 * - [08..11] "WAVE"
 * - [12..15] "fmt "
 * - [16..19] Subchunk1Size = 16 (uint32 LE)
 * - [20..21] AudioFormat = 1 (Linear PCM, uint16 LE)
 * - [22..23] NumChannels = 1 (Mono, uint16 LE)
 * - [24..27] SampleRate (e.g. 16000 or 8000 Hz, uint32 LE)
 * - [28..31] ByteRate = SampleRate * NumChannels * BitsPerSample / 8 (uint32 LE)
 * - [32..33] BlockAlign = NumChannels * BitsPerSample / 8 (= 2, uint16 LE)
 * - [34..35] BitsPerSample = 16 (uint16 LE)
 * - [36..39] "data"
 * - [40..43] Subchunk2Size = dataSize (uint32 LE)
 */
export function createWavHeader(sampleRate: number = 16000, dataSize: number = 0): Buffer {
  const header = Buffer.alloc(44);
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = Math.floor((sampleRate * numChannels * bitsPerSample) / 8);
  const blockAlign = Math.floor((numChannels * bitsPerSample) / 8);

  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // Subchunk1Size for PCM
  header.writeUInt16LE(1, 20);  // PCM format
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataSize, 40);

  return header;
}

/**
 * Generates a clean 16kHz 16-bit Mono PCM WAV audio buffer.
 */
export function createClean16kHzWav(durationSeconds: number = 1.0): Buffer {
  const sampleRate = 16000;
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const dataSize = numSamples * 2;
  const header = createWavHeader(sampleRate, dataSize);
  const pcmData = Buffer.alloc(dataSize);

  // Gentle 220Hz test carrier wave
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.floor(Math.sin(2 * Math.PI * 220 * t) * 32767 * 0.1);
    pcmData.writeInt16LE(sample, i * 2);
  }

  return Buffer.concat([header, pcmData]);
}

/**
 * Generates an 8kHz narrowband telephonic 16-bit Mono PCM WAV audio buffer.
 * Simulates PSTN / 2G mobile carrier audio profile (bandpass limited).
 */
export function createTelephonic8kHzWav(durationSeconds: number = 1.0): Buffer {
  const sampleRate = 8000;
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const dataSize = numSamples * 2;
  const header = createWavHeader(sampleRate, dataSize);
  const pcmData = Buffer.alloc(dataSize);

  // Bandpass-like speech tone (300Hz - 3400Hz center at 1000Hz)
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.floor(Math.sin(2 * Math.PI * 1000 * t) * 32767 * 0.15);
    pcmData.writeInt16LE(sample, i * 2);
  }

  return Buffer.concat([header, pcmData]);
}

/**
 * Generates a synthetic audible chime WAV (~25KB).
 *
 * Parameters:
 * - Sample rate: 16,000 Hz (16-bit Mono)
 * - Duration: 0.8 seconds
 * - Samples: 16000 * 0.8 = 12,800 samples
 * - Data bytes: 12,800 * 2 = 25,600 bytes
 * - Header: 44 bytes
 * - Total size: 25,644 bytes (~25.04 KB)
 *
 * Creates a rich two-tone chord (C5 523.25Hz + E5 659.25Hz) with exponential decay envelope
 * so offline demos and tests produce genuine audible chime sound.
 */
export function createAudibleChimeWav(frequencyHz: number = 523.25, durationSeconds: number = 0.8): Buffer {
  const sampleRate = 16000;
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const dataSize = numSamples * 2;
  const header = createWavHeader(sampleRate, dataSize);
  const pcmData = Buffer.alloc(dataSize);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-3.5 * t); // Natural chime exponential decay
    const wave1 = Math.sin(2 * Math.PI * frequencyHz * t);
    const wave2 = Math.sin(2 * Math.PI * (frequencyHz * 1.25) * t) * 0.6; // Major third harmony
    const combined = (wave1 + wave2) * envelope;
    const sample = Math.max(-32768, Math.min(32767, Math.floor(combined * 32767 * 0.4)));
    pcmData.writeInt16LE(sample, i * 2);
  }

  return Buffer.concat([header, pcmData]);
}

/**
 * Generates an audio buffer simulating speech embedded in Indian bazaar / street noise.
 */
export function createBazaarNoiseWav(durationSeconds: number = 1.0, snrDb: number = 3): Buffer {
  const sampleRate = 16000;
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const dataSize = numSamples * 2;
  const header = createWavHeader(sampleRate, dataSize);
  const pcmData = Buffer.alloc(dataSize);

  const noiseScale = Math.pow(10, -snrDb / 20);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Main voice component (fundamental at 300Hz + harmonics)
    const voice = Math.sin(2 * Math.PI * 300 * t) * 0.3;
    // Complex bazaar noise: traffic hum (80Hz) + market chatter (multiple random harmonics)
    const noise = (
      Math.sin(2 * Math.PI * 80 * t) * 0.4 +
      Math.sin(2 * Math.PI * 720 * t) * 0.2 +
      Math.sin(2 * Math.PI * 1450 * t) * 0.15 +
      (Math.random() * 2 - 1) * 0.25
    ) * noiseScale;

    const sample = Math.max(-32768, Math.min(32767, Math.floor((voice + noise) * 32767 * 0.5)));
    pcmData.writeInt16LE(sample, i * 2);
  }

  return Buffer.concat([header, pcmData]);
}

/**
 * Generates an 8kHz telephonic audio buffer with 50Hz AC mains power hum.
 */
export function createHummingTelephonicWav(durationSeconds: number = 1.0, humFreqHz: number = 50): Buffer {
  const sampleRate = 8000;
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const dataSize = numSamples * 2;
  const header = createWavHeader(sampleRate, dataSize);
  const pcmData = Buffer.alloc(dataSize);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const voice = Math.sin(2 * Math.PI * 800 * t) * 0.3;
    const hum = Math.sin(2 * Math.PI * humFreqHz * t) * 0.25;
    const sample = Math.max(-32768, Math.min(32767, Math.floor((voice + hum) * 32767 * 0.5)));
    pcmData.writeInt16LE(sample, i * 2);
  }

  return Buffer.concat([header, pcmData]);
}

/**
 * Pre-synthesized fixtures and pathological corner cases for Tier 2 testing.
 */
export const AudioFixtures = {
  /** Empty 0-byte buffer */
  emptyBuffer: Buffer.alloc(0),

  /** Truncated 12-byte RIFF header without fmt chunk */
  truncatedHeader: Buffer.from("RIFF\x04\x00\x00\x00WAVE", "ascii"),

  /** Completely corrupt non-audio ASCII string */
  garbagePayload: Buffer.from("CORRUPT_PAYLOAD_NOT_AN_AUDIO_FILE_1234567890", "utf-8"),

  /** JPEG image magic bytes masquerading as audio */
  spoofedImage: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]),

  /** Corrupted fmt chunk (subchunk1Size = 0) */
  corruptFmtChunk: (() => {
    const b = createWavHeader(16000, 100);
    b.writeUInt32LE(0, 16);
    return b;
  })(),

  /** Truncated PCM stream mid-sample with odd byte count */
  oddLengthBuffer: (() => {
    const header = createWavHeader(16000, 17);
    const oddData = Buffer.alloc(17, 0x7f);
    return Buffer.concat([header, oddData]);
  })(),

  /** Oversized audio buffer (> 10MB) to test Multer LIMIT_FILE_SIZE boundary */
  oversizedBuffer: Buffer.alloc(11 * 1024 * 1024, 0x00),

  /** Standard 1.0s clean 16kHz PCM WAV */
  clean16kHz: createClean16kHzWav(1.0),

  /** Standard 1.0s 8kHz telephonic narrowband WAV */
  telephonic8kHz: createTelephonic8kHzWav(1.0),

  /** Audible ~25KB chime WAV (25,644 bytes) */
  chime25kb: createAudibleChimeWav(523.25, 0.8),
};
