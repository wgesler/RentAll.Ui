export const USER_GUIDE_IMAGE_PATH_ATTR = 'data-rentall-guide-path';

export function normalizeUserGuideHtmlForSave(html: string): string {
  if (!html?.trim()) {
    return html || '';
  }

  const doc = parseHtmlFragment(stripEditorImageChrome(html));
  doc.querySelectorAll(`img[${USER_GUIDE_IMAGE_PATH_ATTR}]`).forEach(img => {
    const storagePath = img.getAttribute(USER_GUIDE_IMAGE_PATH_ATTR);
    if (storagePath) {
      img.setAttribute('src', storagePath);
      img.removeAttribute(USER_GUIDE_IMAGE_PATH_ATTR);
    }
  });

  return serializeHtmlFragment(doc);
}

export function collectUserGuideImagePaths(html: string): string[] {
  if (!html?.trim()) {
    return [];
  }

  const doc = parseHtmlFragment(html);
  const paths = new Set<string>();
  doc.querySelectorAll('img').forEach(img => {
    const explicitPath = img.getAttribute(USER_GUIDE_IMAGE_PATH_ATTR);
    if (explicitPath) {
      paths.add(explicitPath);
      return;
    }

    const src = img.getAttribute('src') || '';
    const storagePath = extractUserGuideImageStoragePath(src);
    if (storagePath) {
      paths.add(storagePath);
    }
  });

  return [...paths];
}

export function applyUserGuideImageSources(html: string, pathToSource: Map<string, string>): string {
  if (!html?.trim() || pathToSource.size === 0) {
    return html || '';
  }

  const doc = parseHtmlFragment(html);
  doc.querySelectorAll('img').forEach(img => {
    const explicitPath = img.getAttribute(USER_GUIDE_IMAGE_PATH_ATTR);
    const src = img.getAttribute('src') || '';
    const storagePath = explicitPath || extractUserGuideImageStoragePath(src);
    if (!storagePath) {
      return;
    }

    const resolvedSource = pathToSource.get(storagePath);
    if (!resolvedSource) {
      return;
    }

    img.setAttribute('src', resolvedSource);
    img.setAttribute(USER_GUIDE_IMAGE_PATH_ATTR, storagePath);
  });

  return serializeHtmlFragment(doc);
}

export function extractUserGuideImageStoragePath(src: string): string | null {
  const trimmed = (src || '').trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return null;
  }

  if (trimmed.includes('/userguide/')) {
    return trimmed;
  }

  return null;
}

export function stripEditorImageChrome(html: string): string {
  if (!html?.trim()) {
    return html || '';
  }

  const doc = parseHtmlFragment(html);
  doc.querySelectorAll('.help-guide-image-wrap').forEach(wrap => {
    wrap.querySelectorAll('.help-guide-image-remove, .help-guide-image-resize').forEach(control => control.remove());
    const img = wrap.querySelector('img');
    if (img) {
      wrap.replaceWith(img);
    } else {
      wrap.remove();
    }
  });

  return serializeHtmlFragment(doc);
}

export function getImageStoragePathFromElement(element: Element): string | null {
  const explicitPath = element.getAttribute(USER_GUIDE_IMAGE_PATH_ATTR);
  if (explicitPath) {
    return explicitPath;
  }

  const img = element.tagName === 'IMG'
    ? element as HTMLImageElement
    : element.querySelector('img');

  if (!img) {
    return null;
  }

  const imgPath = img.getAttribute(USER_GUIDE_IMAGE_PATH_ATTR);
  if (imgPath) {
    return imgPath;
  }

  return extractUserGuideImageStoragePath(img.getAttribute('src') || '');
}

function parseHtmlFragment(html: string): Document {
  const doc = new DOMParser().parseFromString(`<div id="user-guide-root">${html}</div>`, 'text/html');
  return doc;
}

function serializeHtmlFragment(doc: Document): string {
  return doc.getElementById('user-guide-root')?.innerHTML || '';
}
