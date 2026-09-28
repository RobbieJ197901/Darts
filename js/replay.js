// Camera replay: keeps the last few seconds of camera footage on the device
// so the last visit and the crowd's reaction can be played back.
// Nothing is uploaded; old footage is thrown away as new footage arrives.

const SEGMENT_MS = 12000; // each recorded segment; replay shows the last one or two

let stream = null;
let recorder = null;
let previous = null; // Blob of the last finished segment
let chunks = [];
let segmentTimer = null;
let mimeType = '';

export const cameraSupported = () =>
  !!(navigator.mediaDevices?.getUserMedia && typeof window.MediaRecorder !== 'undefined');

export const cameraOn = () => !!stream;

function pickMimeType() {
  const options = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return options.find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
}

function startSegment() {
  chunks = [];
  recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const mine = chunks;
  recorder.ondataavailable = (e) => { if (e.data?.size) mine.push(e.data); };
  recorder.start(1000);
  clearTimeout(segmentTimer);
  segmentTimer = setTimeout(rollSegment, SEGMENT_MS);
}

function stopRecorder() {
  return new Promise((resolve) => {
    if (!recorder || recorder.state === 'inactive') return resolve(null);
    const mine = chunks;
    recorder.onstop = () => resolve(mine.length ? new Blob(mine, { type: recorder.mimeType || mimeType || 'video/mp4' }) : null);
    recorder.stop();
  });
}

async function rollSegment() {
  const blob = await stopRecorder();
  if (blob) previous = blob;
  if (stream) startSegment();
}

/** Turns the camera on. facing: 'user' (front, sees the players) or 'environment' (back). */
export async function startCamera(facing = 'user', previewEl = null) {
  if (stream) return;
  mimeType = pickMimeType();
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: true,
  });
  if (previewEl) {
    previewEl.srcObject = stream;
    previewEl.muted = true;
    previewEl.play().catch(() => {});
  }
  previous = null;
  startSegment();
}

export function stopCamera(previewEl = null) {
  clearTimeout(segmentTimer);
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  recorder = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  previous = null;
  chunks = [];
  if (previewEl) previewEl.srcObject = null;
}

/**
 * Returns the recent footage as a list of Blobs to play in order
 * (up to two segments, so roughly the last 12 to 24 seconds), and keeps recording.
 */
export async function grabReplay() {
  if (!stream) return [];
  clearTimeout(segmentTimer);
  const current = await stopRecorder();
  const clips = [previous, current].filter(Boolean);
  previous = current || previous;
  if (stream) startSegment();
  return clips;
}
