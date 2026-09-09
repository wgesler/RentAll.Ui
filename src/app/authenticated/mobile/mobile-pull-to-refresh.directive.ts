import { Directive, HostListener, Input, booleanAttribute } from '@angular/core';

@Directive({
  selector: '[appMobilePullToRefresh]',
  standalone: true
})
export class MobilePullToRefreshDirective {
  @Input({ transform: booleanAttribute }) appMobilePullToRefresh = true;

  private startY = 0;
  private tracking = false;
  private readonly pullThresholdPx = 72;

  @HostListener('touchstart', ['$event'])
  onTouchStart(event: TouchEvent): void {
    if (!this.appMobilePullToRefresh || event.touches.length !== 1) {
      return;
    }

    this.startY = event.touches[0].clientY;
    this.tracking = true;
  }

  @HostListener('touchend', ['$event'])
  onTouchEnd(event: TouchEvent): void {
    if (!this.tracking) {
      return;
    }

    const endY = event.changedTouches[0]?.clientY ?? this.startY;
    const pullDistance = endY - this.startY;
    this.tracking = false;

    if (pullDistance >= this.pullThresholdPx) {
      this.reloadPage();
    }
  }

  @HostListener('touchcancel')
  onTouchCancel(): void {
    this.tracking = false;
  }

  private reloadPage(): void {
    window.location.reload();
  }
}
