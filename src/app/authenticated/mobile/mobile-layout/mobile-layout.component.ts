import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { DebugLayoutBandsService } from '../../../services/debug-layout-bands.service';
import { HeaderComponent } from '../../shared/layout/header/header.component';
import { ReceiptReadingOverlayComponent } from '../../shared/receipt-reading-overlay/receipt-reading-overlay.component';
import { UserReceiptDraftNoticeService } from '../../maintenance/services/user-receipt-draft-notice.service';
import { MobileChromeOverlayService } from '../mobile-chrome-overlay.service';
import { PendingReceiptDraftsPromptComponent } from '../../shared/pending-receipt-drafts-prompt/pending-receipt-drafts-prompt.component';
import { MobileReceiptCaptureService } from '../mobile-receipt-capture.service';
import { MobileSidebarComponent } from '../mobile-sidebar/mobile-sidebar.component';
import { MobileViewportService } from '../mobile-viewport.service';

@Component({
  standalone: true,
  selector: 'app-mobile-layout',
  imports: [AsyncPipe, MaterialModule, HeaderComponent, MobileSidebarComponent, ReceiptReadingOverlayComponent, PendingReceiptDraftsPromptComponent],
  templateUrl: './mobile-layout.component.html',
  styleUrl: './mobile-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileLayoutComponent implements OnInit, OnDestroy {
  private static readonly mobileLayoutHtmlClass = 'rentall-mobile-layout';
  private debugLayoutBandsService = inject(DebugLayoutBandsService);
  private mobileChromeOverlayService = inject(MobileChromeOverlayService);
  private mobileReceiptCaptureService = inject(MobileReceiptCaptureService);
  private mobileViewportService = inject(MobileViewportService);
  private userReceiptDraftNoticeService = inject(UserReceiptDraftNoticeService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  readonly hidePrimaryChrome$ = this.mobileChromeOverlayService.primaryChromeHidden$;
  readonly receiptCaptureInProgress$ = this.mobileReceiptCaptureService.captureInProgress$;
  private layoutDebugStateBeforeMobile = false;
  private destroy$ = new Subject<void>();
  showPendingReceiptDraftsPrompt = false;

  //#region Mobile-Layout
  ngOnInit(): void {
    document.documentElement.classList.add(MobileLayoutComponent.mobileLayoutHtmlClass);
    this.mobileViewportService.start();
    this.layoutDebugStateBeforeMobile = this.debugLayoutBandsService.isEnabled();
    this.debugLayoutBandsService.setEnabled(false);

    this.userReceiptDraftNoticeService.resetLoginPrompt();
    this.userReceiptDraftNoticeService.scheduleRefreshAfterLogin();
    this.userReceiptDraftNoticeService.hasPendingUserReceiptDrafts$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.syncPendingReceiptDraftsPrompt());

    this.syncPendingReceiptDraftsPrompt();
  }

  onPendingReceiptDraftsPromptYes(): void {
    this.userReceiptDraftNoticeService.markLoginPromptHandled();
    this.showPendingReceiptDraftsPrompt = false;
    this.cdr.markForCheck();
    void this.router.navigateByUrl('/mobile/maintenance/receipts?draft=true');
  }

  onPendingReceiptDraftsPromptNo(): void {
    this.userReceiptDraftNoticeService.markLoginPromptHandled();
    this.showPendingReceiptDraftsPrompt = false;
    this.cdr.markForCheck();
  }

  private syncPendingReceiptDraftsPrompt(): void {
    this.showPendingReceiptDraftsPrompt = this.userReceiptDraftNoticeService.shouldShowLoginPrompt();
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.mobileViewportService.stop();
    document.documentElement.classList.remove(MobileLayoutComponent.mobileLayoutHtmlClass);
    this.debugLayoutBandsService.setEnabled(this.layoutDebugStateBeforeMobile);
  }
  //#endregion
}
