export function fitSize(w: number, h: number, max = 1024): { width: number; height: number } {
  const longest = Math.max(w, h);
  if (longest <= max) return { width: w, height: h };
  const scale = max / longest;
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

async function loadBitmap(blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('NOT_IMAGE');
  }
}

export async function resizeImage(source: Blob | HTMLVideoElement): Promise<string> {
  let drawable: CanvasImageSource;
  let w: number;
  let h: number;
  let mirrorBack = false;

  if (source instanceof Blob) {
    if (!source.type.startsWith('image/')) throw new Error('NOT_IMAGE');
    const bitmap = await loadBitmap(source);
    drawable = bitmap;
    w = bitmap.width;
    h = bitmap.height;
  } else {
    drawable = source;
    w = source.videoWidth;
    h = source.videoHeight;
    mirrorBack = true;
  }

  const { width, height } = fitSize(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('NOT_IMAGE');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  if (mirrorBack) {
    // The preview is shown mirrored; flip so the capture has true orientation.
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(drawable, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.9);
}
