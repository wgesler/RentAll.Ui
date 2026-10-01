/** Removes Material/CDK dialog overlay artifacts left on body after idle timeout or logout. */
export function teardownCdkOverlayState(): void {
  if (typeof document === 'undefined') {
    return;
  }

  const html = document.documentElement;
  const body = document.body;

  // BlockScrollStrategy locks documentElement (not body): fixed + negative top/left.
  html.classList.remove('cdk-global-scrollblock');
  body.classList.remove('cdk-global-scrollblock');

  for (const el of [html, body]) {
    el.style.removeProperty('overflow');
    el.style.removeProperty('overflow-y');
    el.style.removeProperty('overflow-x');
    el.style.removeProperty('padding-right');
    el.style.removeProperty('position');
    el.style.removeProperty('width');
    el.style.removeProperty('height');
    el.style.removeProperty('top');
    el.style.removeProperty('left');
    el.style.removeProperty('right');
    el.style.removeProperty('bottom');
    el.style.removeProperty('scroll-behavior');
  }

  document.querySelectorAll('.cdk-overlay-backdrop, .cdk-overlay-pane, .cdk-global-overlay-wrapper').forEach(node => {
    node.remove();
  });

  document.querySelectorAll('.cdk-overlay-container').forEach(container => {
    container.replaceChildren();
  });

  resetViewportScroll();
}

/** Scroll window to top so login header/backdrop logos are not left above the viewport. */
export function resetViewportScroll(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.scrollTo(0, 0);
  if (typeof document !== 'undefined') {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }
}

/** Runs overlay teardown after the current frame so dialog exit animations can finish. */
export function teardownCdkOverlayStateAfterPaint(callback?: () => void): void {
  if (typeof requestAnimationFrame === 'undefined') {
    teardownCdkOverlayState();
    callback?.();
    return;
  }

  requestAnimationFrame(() => {
    teardownCdkOverlayState();
    requestAnimationFrame(() => {
      teardownCdkOverlayState();
      callback?.();
    });
  });
}
