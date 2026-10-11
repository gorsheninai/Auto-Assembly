export const msToFrames = (ms: number, fps: number) => Math.round((ms * fps) / 1000);
export const framesToMs = (f: number, fps: number) => Math.round((f * 1000) / fps);
