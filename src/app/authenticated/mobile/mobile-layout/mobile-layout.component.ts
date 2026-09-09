import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { DebugLayoutBandsService } from '../../../services/debug-layout-bands.service';
import { HeaderComponent } from '../../shared/layout/header/header.component';
import { MobileChromeOverlayService } from '../mobile-chrome-overlay.service';
import { MobileSidebarComponent } from '../mobile-sidebar/mobile-sidebar.component';
import { MobileViewportService } from '../mobile-viewport.service';

@Component({
  standalone: true,
  selector: 'app-mobile-layout',
  imports: [AsyncPipe, HeaderComponent, MobileSidebarComponent],
  templateUrl: './mobile-layout.component.html',
  styleUrl: './mobile-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileLayoutComponent implements OnInit, OnDestroy {
  private static readonly mobileLayoutHtmlClass = 'rentall-mobile-layout';
  private debugLayoutBandsService = inject(DebugLayoutBandsService);
  private mobileChromeOverlayService = inject(MobileChromeOverlayService);
  private mobileViewportService = inject(MobileViewportService);
  readonly hidePrimaryChrome$ = this.mobileChromeOverlayService.primaryChromeHidden$;
  private layoutDebugStateBeforeMobile = false;

  //#region Mobile-Layout
  ngOnInit(): void {
    document.documentElement.classList.add(MobileLayoutComponent.mobileLayoutHtmlClass);
    this.mobileViewportService.start();
    this.layoutDebugStateBeforeMobile = this.debugLayoutBandsService.isEnabled();
    this.debugLayoutBandsService.setEnabled(false);
  }

  ngOnDestroy(): void {
    this.mobileViewportService.stop();
    document.documentElement.classList.remove(MobileLayoutComponent.mobileLayoutHtmlClass);
    this.debugLayoutBandsService.setEnabled(this.layoutDebugStateBeforeMobile);
  }
  //#endregion
}
