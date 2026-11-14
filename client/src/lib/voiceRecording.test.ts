// @vitest-environment node
import { expect, it } from "vitest";
import { encodeVoiceWav } from "./voiceRecording";

it.each([8000, 16000])("encodes mono PCM WAV at %i Hz", async (sampleRate) => {
  const recording = encodeVoiceWav(new Float32Array([-2, -0.5, 0, 0.5, 2]), sampleRate);
  const bytes = await recording.arrayBuffer();
  const header = new DataView(bytes);
  expect(recording.type).toBe("audio/wav");
  expect(Buffer.from(bytes).toString("ascii", 0, 4)).toBe("RIFF");
  expect(Buffer.from(bytes).toString("ascii", 8, 16)).toBe("WAVEfmt ");
  expect(header.getUint32(4, true)).toBe(bytes.byteLength - 8);
  expect(header.getUint16(20, true)).toBe(1);
  expect(header.getUint16(22, true)).toBe(1);
  expect(header.getUint32(24, true)).toBe(sampleRate);
  expect(header.getUint16(34, true)).toBe(16);
  expect(header.getUint32(40, true)).toBe(10);
  expect([44, 46, 48, 50, 52].map(offset => header.getInt16(offset, true)))
    .toEqual([-32768, -16384, 0, 16383, 32767]);
});
