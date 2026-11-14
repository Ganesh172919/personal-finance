/**
 * @fileoverview Synthetic Audible Linear PCM Chime Audio Synthesizer.
 *
 * Mathematically generates an audible, brand-grade ascending dual-chord confirmation
 * chime (C5 523.25Hz -> E5 659.25Hz) encoded as 16kHz linear 16-bit signed mono PCM WAV.
 *
 * Fully adheres to the canonical 44-byte RIFF/WAVE header specification without
 * requiring external binary dependencies (e.g. ffmpeg, sox).
 *
 * Audio specs:
 * - Format: RIFF WAVE, Linear PCM (AudioFormat 1)
 * - Sample Rate: 16,000 Hz
 * - Bit Depth: 16-bit Signed Integer (Little-Endian)
 * - Channels: 1 (Mono)
 * - Duration: ~800 ms (12,800 sample frames)
 * - Payload size: 25,600 bytes audio data + 44 bytes header = 25,644 bytes total (~25.6 KB)
 *
 * Developed for The Great Indian AI Internship Challenge 2026.
 *
 * @module services/providers/pcmChimeGenerator
 */

export interface PcmChimeOptions {
  durationSeconds?: number;
  sampleRate?: number;
  frequency1?: number;
  frequency2?: number;
  peakAmplitude?: number;
}

/**
 * Generates a valid 16kHz mono 16-bit linear PCM WAV chime buffer (~25.6KB for 800ms).
 *
 * @param durationSeconds Duration of synthesized chime in seconds (default: 0.8s)
 * @param options Custom frequency and synthesis parameters
 * @returns Node.js Buffer containing standard RIFF/WAVE audio
 */
export function generatePcmChimeWav(
  durationSeconds: number = 0.8,
  options?: PcmChimeOptions
): Buffer {
  const sampleRate = options?.sampleRate || 16000;
  const numChannels = 1;
  const bytesPerSample = 2; // 16-bit PCM (2 bytes per sample frame)
  const duration = Math.max(0.2, Math.min(5.0, durationSeconds));
  const totalSamples = Math.floor(sampleRate * duration);
  const dataByteLength = totalSamples * numChannels * bytesPerSample;
  const headerByteLength = 44;
  const totalLength = headerByteLength + dataByteLength;

  const buffer = Buffer.alloc(totalLength);

  // 1. RIFF Header Descriptor
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataByteLength, 4); // ChunkSize: 36 + Subchunk2Size
  buffer.write("WAVE", 8);

  // 2. "fmt " Subchunk
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size: 16 for uncompressed PCM
  buffer.writeUInt16LE(1, 20);  // AudioFormat: 1 = Linear PCM
  buffer.writeUInt16LE(numChannels, 22); // NumChannels: 1 (mono)
  buffer.writeUInt32LE(sampleRate, 24);  // SampleRate: 16000
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28); // ByteRate: 32000
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32);             // BlockAlign: 2
  buffer.writeUInt16LE(16, 34);                                      // BitsPerSample: 16

  // 3. "data" Subchunk
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataByteLength, 40); // Subchunk2Size

  // 4. Acoustic Synthesis: Ascending Dual-Chord with ADSR Exponential Decay
  // Note 1: C5 (523.25 Hz) with 2nd harmonic (1046.5 Hz)
  const f1 = options?.frequency1 || 523.25;
  // Note 2: E5 (659.25 Hz) with 2nd (1318.5 Hz) & 3rd (1977.75 Hz) harmonics
  const f2 = options?.frequency2 || 659.25;
  const peakAmp = options?.peakAmplitude || 24000; // ~73% of 32767 full scale for clean headroom

  const note2StartSec = Math.min(0.25, duration * 0.3);

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;

    // Note 1 synthesis (starts at t = 0)
    const attack1 = Math.min(1.0, t / 0.015); // 15ms smooth anti-click attack
    const decay1 = Math.exp(-8.0 * Math.max(0, t - 0.015));
    const env1 = attack1 * decay1;
    const s1 = Math.sin(2 * Math.PI * f1 * t) + 0.25 * Math.sin(2 * Math.PI * (2 * f1) * t);

    // Note 2 synthesis (ascending resolution tone starts at note2StartSec)
    let env2 = 0;
    let s2 = 0;
    if (t >= note2StartSec) {
      const tau = t - note2StartSec;
      const attack2 = Math.min(1.0, tau / 0.02); // 20ms attack
      const decay2 = Math.exp(-5.5 * Math.max(0, tau - 0.02));
      env2 = attack2 * decay2;
      s2 = Math.sin(2 * Math.PI * f2 * tau) +
           0.20 * Math.sin(2 * Math.PI * (2 * f2) * tau) +
           0.10 * Math.sin(2 * Math.PI * (3 * f2) * tau);
    }

    // Composite acoustic signal
    const rawVal = 0.55 * env1 * s1 + 0.65 * env2 * s2;
    const clampedVal = Math.max(-1.0, Math.min(1.0, rawVal));
    const int16Sample = Math.max(-32768, Math.min(32767, Math.round(clampedVal * peakAmp)));

    buffer.writeInt16LE(int16Sample, headerByteLength + i * bytesPerSample);
  }

  return buffer;
}

/**
 * Alias for backward compatibility with alternate naming conventions.
 */
export const generateSyntheticPcmChimeWav = generatePcmChimeWav;
