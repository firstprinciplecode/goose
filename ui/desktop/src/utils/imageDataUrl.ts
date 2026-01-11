export type ImageDataUrlOptions = {
  /**
   * Max width/height in pixels. Image will be downscaled to fit within this box.
   * Defaults to 1920.
   */
  maxDimension?: number;
  /**
   * Output mime type. Defaults to "image/jpeg" for smaller size.
   */
  mimeType?: 'image/jpeg' | 'image/png' | 'image/webp';
  /**
   * Quality for lossy formats (jpeg/webp). Defaults to 0.82.
   */
  quality?: number;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

/**
 * Convert a File into a resized (and optionally compressed) data URL.
 * Uses an object URL + canvas draw to avoid huge base64 strings before resizing.
 */
export async function fileToResizedDataUrl(
  file: File,
  options: ImageDataUrlOptions = {}
): Promise<string> {
  const maxDimension = options.maxDimension ?? 1920;
  const mimeType = options.mimeType ?? 'image/jpeg';
  const quality = options.quality ?? 0.82;

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);

    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    if (!srcW || !srcH) {
      throw new Error('Invalid image dimensions');
    }

    const scale = Math.min(1, maxDimension / Math.max(srcW, srcH));
    const dstW = Math.max(1, Math.round(srcW * scale));
    const dstH = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = dstW;
    canvas.height = dstH;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas not supported');
    }

    // Better downscale quality where supported.
    (ctx as any).imageSmoothingEnabled = true;
    (ctx as any).imageSmoothingQuality = 'high';

    ctx.drawImage(img, 0, 0, dstW, dstH);

    // toDataURL ignores quality for PNG.
    return mimeType === 'image/png' ? canvas.toDataURL(mimeType) : canvas.toDataURL(mimeType, quality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

