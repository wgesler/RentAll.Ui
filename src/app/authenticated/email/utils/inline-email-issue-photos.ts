function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string) || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function isHeicLike(blob: Blob, hintUrl: string): boolean {
  const type = (blob.type || '').toLowerCase();
  const hint = hintUrl.toLowerCase();
  return (
    type.includes('heic') ||
    type.includes('heif') ||
    hint.endsWith('.heic') ||
    hint.endsWith('.heif')
  );
}

async function convertHeicBlobToJpegFile(blob: Blob, hintUrl: string): Promise<File> {
  const heic2anyModule = await import('heic2any');
  const heic2any = heic2anyModule.default;
  const fileName = hintUrl.split('/').pop() || 'photo.heic';
  const file = new File([blob], fileName, { type: blob.type || 'image/heic' });
  const converted = (await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: 0.9
  })) as Blob | Blob[];
  const convertedBlob = Array.isArray(converted) ? converted[0] : converted;
  if (!convertedBlob) {
    throw new Error('HEIC conversion returned no image data.');
  }
  const jpegName = fileName.replace(/\.[^/.]+$/i, '') + '.jpg';
  return new File([convertedBlob], jpegName, { type: 'image/jpeg' });
}

async function blobToEmailDataUrl(blob: Blob, hintUrl: string): Promise<string> {
  if (isHeicLike(blob, hintUrl)) {
    const jpegFile = await convertHeicBlobToJpegFile(blob, hintUrl);
    return readBlobAsDataUrl(jpegFile);
  }
  return readBlobAsDataUrl(blob);
}

/**
 * Resolves checklist issue photo URLs to data URLs suitable for HTML email and server PDF generation.
 * Blob URLs only work in the current tab; remote URLs may be auth-protected for recipients.
 */
export async function inlineIssuePhotoSrcForEmail(src: string): Promise<string> {
  const trimmed = (src || '').trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.startsWith('data:')) {
    return trimmed;
  }

  let blob: Blob;
  if (trimmed.startsWith('blob:')) {
    const res = await fetch(trimmed);
    if (!res.ok) {
      throw new Error('Could not read photo from browser.');
    }
    blob = await res.blob();
  } else if (/^https?:\/\//i.test(trimmed)) {
    const res = await fetch(trimmed, { credentials: 'include', mode: 'cors' });
    if (!res.ok) {
      throw new Error('Could not download photo for email.');
    }
    blob = await res.blob();
  } else {
    return trimmed;
  }

  return blobToEmailDataUrl(blob, trimmed);
}

export async function inlineIssuePhotoSources<T extends { photoSrc?: string | null }>(
  entries: T[]
): Promise<T[]> {
  const results = await Promise.all(
    entries.map(async entry => {
      const src = entry.photoSrc;
      if (!src?.trim()) {
        return { ...entry };
      }
      try {
        const dataUrl = await inlineIssuePhotoSrcForEmail(src);
        return { ...entry, photoSrc: dataUrl || src };
      } catch {
        return { ...entry };
      }
    })
  );
  return results;
}
