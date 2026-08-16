/** Removes Material/CDK dialog overlay artifacts left on body after idle timeout or logout. */
export function teardownCdkOverlayState(): void {
  if (typeof document === 'undefined') {
    return;
  }

  document.body.classList.remove('cdk-global-scrollblock');
  // CDK BlockScrollStrategy sets these inline; missing any leaves the login page shifted/blank.
  document.body.style.removeProperty('overflow');
  document.body.style.removeProperty('padding-right');
  document.body.style.removeProperty('position');
  document.body.style.removeProperty('width');
  document.body.style.removeProperty('height');
  document.body.style.removeProperty('top');
  document.body.style.removeProperty('left');
  document.body.style.removeProperty('right');
  document.body.style.removeProperty('bottom');
  document.documentElement.style.removeProperty('overflow');
  document.documentElement.style.removeProperty('top');

  document.querySelectorAll('.cdk-overlay-backdrop, .cdk-overlay-pane, .cdk-global-overlay-wrapper').forEach(node => {
    node.remove();
  });

  document.querySelectorAll('.cdk-overlay-container').forEach(container => {
    container.replaceChildren();
  });
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
    resetViewportScroll();
    callback?.();
    return;
  }

  requestAnimationFrame(() => {
    teardownCdkOverlayState();
    requestAnimationFrame(() => {
      teardownCdkOverlayState();
      resetViewportScroll();
      callback?.();
    });
  });
}
