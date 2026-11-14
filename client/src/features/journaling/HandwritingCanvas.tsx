import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

// Normalized coordinate point representing a single sample in a pen stroke.
// Stores dimensionless unit coordinates scaled between zero and one.
// Records millisecond timestamps enabling stroke playback and velocity analysis.
export type StrokePoint = { x: number; y: number; t: number };
// Ordered sequence of normalized sample points defining a continuous drawing stroke.
// Encapsulates pen movement from pointer down until release or cancellation.
// Forms the fundamental discrete drawing element recorded on the handwriting canvas.
export type Stroke = StrokePoint[];

// Imperative ref handle exposed by the handwriting canvas component.
// Provides operations for clearing lines, undoing the last stroke, and extracting raw vectors.
// Exposes an asynchronous exporter producing an image PNG blob for uploads.
export type HandwritingCanvasHandle = {
  clear: () => void;
  undo: () => void;
  exportBlob: () => Promise<Blob>;
  getStrokes: () => Stroke[];
};

// Mathematical helper constraining numerical inputs to the unit range between 0 and 1.
// Prevents out-of-bounds coordinate calculations during pointer drag outside canvas bounds.
// Guarantees consistent relative positioning across diverse display resolutions.
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// Translates native browser pointer events into normalized canvas stroke coordinates.
// Computes fractional offsets relative to the bounding client rectangle dimensions.
// Returns a timestamped point object bounded strictly within unit intervals.
const getCanvasPoint = (canvas: HTMLCanvasElement, event: PointerEvent): StrokePoint => {
  const rect = canvas.getBoundingClientRect();
  const x = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
  const y = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0;
  return { x: clamp01(x), y: clamp01(y), t: Date.now() };
};

// Asynchronously extracts the current canvas raster graphics into a PNG binary blob.
// Wraps HTMLCanvasElement.toBlob in a promise for seamless async/await workflows.
// Rejects cleanly if the browser fails to allocate or serialize the bitmap image.
const exportPng = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to export canvas"));
        return;
      }
      resolve(blob);
    }, "image/png");
  });

// Interactive stylus and touch drawing canvas component for financial journaling.
// Renders responsive vector strokes with device-pixel-ratio scaling and theme awareness.
// Exposes imperative methods via ref for canvas clearing, undo, and PNG serialization.
export const HandwritingCanvas = forwardRef<
  HandwritingCanvasHandle,
  { className?: string; height?: number }
>(function HandwritingCanvas(props, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const drawing = useRef<{ active: boolean; current: Stroke }>({ active: false, current: [] });

  const getCtx = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth || 1;
    const cssHeight = canvas.clientHeight || 1;
    const nextWidth = Math.max(1, Math.floor(cssWidth * dpr));
    const nextHeight = Math.max(1, Math.floor(cssHeight * dpr));
    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth;
      canvas.height = nextHeight;
    }

    const computed = getComputedStyle(canvas);
    const strokeColor = computed.color || "#111827";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = Math.max(2, 3 * dpr);

    return ctx;
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth || 1;
    const cssHeight = canvas.clientHeight || 1;
    const nextWidth = Math.max(1, Math.floor(cssWidth * dpr));
    const nextHeight = Math.max(1, Math.floor(cssHeight * dpr));
    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth;
      canvas.height = nextHeight;
    }

    const computed = getComputedStyle(canvas);
    const strokeColor = computed.color || "#111827";
    const bgColor = computed.backgroundColor || "#ffffff";

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = Math.max(2, 3 * dpr);

    const drawStroke = (stroke: Stroke) => {
      if (stroke.length < 2) return;
      ctx.beginPath();
      const start = stroke[0];
      ctx.moveTo(start.x * canvas.width, start.y * canvas.height);
      for (const pt of stroke.slice(1)) {
        ctx.lineTo(pt.x * canvas.width, pt.y * canvas.height);
      }
      ctx.stroke();
    };

    for (const stroke of strokes) {
      drawStroke(stroke);
    }
  }, [strokes]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => redraw());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [redraw]);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(event.pointerId);
    drawing.current.active = true;
    const start = getCanvasPoint(canvas, event.nativeEvent);
    drawing.current.current = [start];

    const ctx = getCtx();
    if (ctx) {
      ctx.beginPath();
      ctx.arc(start.x * canvas.width, start.y * canvas.height, Math.max(1, ctx.lineWidth / 2), 0, Math.PI * 2);
      ctx.fillStyle = String(ctx.strokeStyle);
      ctx.fill();
    }
  }, [getCtx]);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current.active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pt = getCanvasPoint(canvas, event.nativeEvent);
    const current = drawing.current.current;
    const prev = current[current.length - 1];
    current.push(pt);

    const ctx = getCtx();
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(prev.x * canvas.width, prev.y * canvas.height);
    ctx.lineTo(pt.x * canvas.width, pt.y * canvas.height);
    ctx.stroke();
  }, [getCtx]);

  const commitStroke = useCallback(() => {
    const current = drawing.current.current;
    drawing.current.active = false;
    drawing.current.current = [];
    if (!current || current.length < 2) return;
    setStrokes((prev) => [...prev, current]);
  }, []);

  const onPointerUp = useCallback((_event: React.PointerEvent<HTMLCanvasElement>) => {
    commitStroke();
  }, [commitStroke]);

  const onPointerCancel = useCallback((_event: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current.active = false;
    drawing.current.current = [];
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      clear: () => setStrokes([]),
      undo: () => setStrokes((prev) => prev.slice(0, -1)),
      exportBlob: async () => {
        const canvas = canvasRef.current;
        if (!canvas) throw new Error("Canvas not ready");
        redraw();
        return exportPng(canvas);
      },
      getStrokes: () => strokes,
    }),
    [redraw, strokes]
  );

  const heightStyle = useMemo(() => ({ height: props.height ?? 320 }), [props.height]);

  return (
    <canvas
      ref={canvasRef}
      className={props.className}
      style={heightStyle as any}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    />
  );
});
