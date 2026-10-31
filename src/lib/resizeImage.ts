export function fitSize(w: number, h: number, max = 1024): { width: number; height: number } {
  const longest = Math.max(w, h);
  if (longest <= max) return { width: w, height: h };
  const scale = max / longest;
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

// Fallback for browsers without createImageBitmap(blob, options) (older iOS Safari).
// Modern browsers apply the photo's EXIF rotation to <img> by default.
function loadImageElement(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('NOT_IMAGE'));
    };
    img.src = url;
  });
}

async function loadImage(blob: Blob): Promise<{ drawable: CanvasImageSource; w: number; h: number }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return { drawable: bitmap, w: bitmap.width, h: bitmap.height };
    } catch {
      // fall through to <img>
    }
  }
  const img = await loadImageElement(blob);
  if (!img.naturalWidth || !img.naturalHeight) throw new Error('NOT_IMAGE');
  return { drawable: img, w: img.naturalWidth, h: img.naturalHeight };
}

export async function resizeImage(source: Blob | HTMLVideoElement): Promise<string> {
  let drawable: CanvasImageSource;
  let w: number;
  let h: number;
  let mirrorBack = false;

  if (source instanceof Blob) {
    // Some Android pickers (cloud/gallery apps) give files no type: let the decoder decide.
    if (source.type && !source.type.startsWith('image/')) throw new Error('NOT_IMAGE');
    ({ drawable, w, h } = await loadImage(source));
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
