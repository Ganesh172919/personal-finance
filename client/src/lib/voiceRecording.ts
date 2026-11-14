const MAX_RECORDING_SECONDS = 30;

export function encodeVoiceWav(samples: Float32Array, sampleRate: number): Blob {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const header = new DataView(bytes);
  const writeLabel = (offset: number, label: string) => {
    for (let index = 0; index < label.length; index++) {
      header.setUint8(offset + index, label.charCodeAt(index));
    }
  };

  writeLabel(0, "RIFF");
  header.setUint32(4, bytes.byteLength - 8, true);
  writeLabel(8, "WAVEfmt ");
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true);
  header.setUint16(22, 1, true);
  header.setUint32(24, sampleRate, true);
  header.setUint32(28, sampleRate * 2, true);
  header.setUint16(32, 2, true);
  header.setUint16(34, 16, true);
  writeLabel(36, "data");
  header.setUint32(40, samples.length * 2, true);

  for (let index = 0; index < samples.length; index++) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    header.setInt16(44 + index * 2, sample * (sample < 0 ? 32768 : 32767), true);
  }

  return new Blob([bytes], { type: "audio/wav" });
}

export async function prepareVoiceRecording(recording: Blob, telephonic: boolean): Promise<Blob> {
  if (recording.size === 0) throw new Error("No audio was recorded. Try speaking before stopping.");

  const sampleRate = telephonic ? 8000 : 16000;
  const decoder = new OfflineAudioContext(1, 1, sampleRate);
  const decoded = await decoder.decodeAudioData(await recording.arrayBuffer());
  if (decoded.duration > MAX_RECORDING_SECONDS) {
    throw new Error(`Voice recordings must be ${MAX_RECORDING_SECONDS} seconds or shorter.`);
  }

  const context = new OfflineAudioContext(1, decoded.length, sampleRate);
  const source = context.createBufferSource();
  source.buffer = decoded;

  if (telephonic) {
    const highPass = context.createBiquadFilter();
    highPass.type = "highpass";
    highPass.frequency.value = 300;
    const lowPass = context.createBiquadFilter();
    lowPass.type = "lowpass";
    lowPass.frequency.value = 3400;
    source.connect(highPass).connect(lowPass).connect(context.destination);
  } else {
    source.connect(context.destination);
  }

  source.start();
  const mono = await context.startRendering();
  return encodeVoiceWav(mono.getChannelData(0), sampleRate);
}
