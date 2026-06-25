/** Removes Material/CDK dialog overlay artifacts left on body after idle timeout or logout. */
export function teardownCdkOverlayState(): void {
  if (typeof document === 'undefined') {
    return;
  }

  document.body.classList.remove('cdk-global-scrollblock');
  document.body.style.removeProperty('overflow');
  document.body.style.removeProperty('padding-right');
  document.body.style.removeProperty('position');
  document.body.style.removeProperty('width');
  document.documentElement.style.removeProperty('overflow');

  document.querySelectorAll('.cdk-overlay-backdrop, .cdk-overlay-pane, .cdk-global-overlay-wrapper').forEach(node => {
    node.remove();
  });

  document.querySelectorAll('.cdk-overlay-container').forEach(container => {
    container.replaceChildren();
  });
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
