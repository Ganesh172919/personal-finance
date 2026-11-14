/**
 * @fileoverview Custom React hook for microphone voice recording with live volume
 * visualizer and telephonic audio simulation.
 *
 * @module hooks/useVoiceRecorder
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { prepareVoiceRecording } from "@/lib/voiceRecording";

export interface UseVoiceRecorderOptions {
  onStop?: (blob: Blob) => void;
  telephonicMode?: boolean;
}

export function useVoiceRecorder(options: UseVoiceRecorderOptions = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const releaseRecordingResources = useCallback(() => {
    if (timerRef.current !== null) clearInterval(timerRef.current);
    if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      void audioContextRef.current.close().catch(() => {});
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    timerRef.current = null;
    animFrameRef.current = null;
    audioContextRef.current = null;
    analyserRef.current = null;
    streamRef.current = null;
  }, []);

  useEffect(() => releaseRecordingResources, [releaseRecordingResources]);

  const updateVolume = useCallback(function updateVolume() {
    if (!analyserRef.current) return;
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const average = sum / dataArray.length;
    // Normalize to 0 - 100
    setVolume(Math.min(100, Math.round((average / 128) * 100)));

    animFrameRef.current = requestAnimationFrame(updateVolume);
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    audioChunksRef.current = [];
    setDuration(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;
      setHasPermission(true);

      // Setup audio analysis for waveform animation
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioContextClass();
        audioContextRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;

        if (options.telephonicMode) {
          // Bandpass filter (300Hz - 3400Hz) to simulate classic telephonic network audio
          const biquad = audioCtx.createBiquadFilter();
          biquad.type = "bandpass";
          biquad.frequency.value = 1850;
          biquad.Q.value = 0.8;
          source.connect(biquad);
          biquad.connect(analyser);
        } else {
          source.connect(analyser);
        }

        analyserRef.current = analyser;
        updateVolume();
      } catch {
        // Non-fatal if audio analysis fails
      }

      // Pick supported mime type
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(250); // Slice into 250ms chunks
      setIsRecording(true);

      // Duration timer
      timerRef.current = window.setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      if (!streamRef.current) setHasPermission(false);
      releaseRecordingResources();
      setError(err instanceof Error ? err.message : "Failed to start microphone recording.");
      setIsRecording(false);
    }
  }, [options.telephonicMode, releaseRecordingResources, updateVolume]);

  const stopRecording = useCallback((): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      setVolume(0);

      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        releaseRecordingResources();
        setIsRecording(false);
        reject(new Error("No microphone recording is active."));
        return;
      }

      recorder.onstop = () => {
        const recording = new Blob(audioChunksRef.current, { type: recorder.mimeType });
        audioChunksRef.current = [];
        setIsRecording(false);
        releaseRecordingResources();

        prepareVoiceRecording(recording, Boolean(options.telephonicMode)).then((wav) => {
          options.onStop?.(wav);
          resolve(wav);
        }).catch(reject);
      };

      recorder.stop();
    });
  }, [options, releaseRecordingResources]);

  const cancelRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.ondataavailable = null;
      recorder.stop();
    }

    releaseRecordingResources();
    audioChunksRef.current = [];
    setIsRecording(false);
    setDuration(0);
    setVolume(0);
  }, [releaseRecordingResources]);

  return {
    isRecording,
    duration,
    volume,
    hasPermission,
    error,
    analyserNode: analyserRef.current,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
