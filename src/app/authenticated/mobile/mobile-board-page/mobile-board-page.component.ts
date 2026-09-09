import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subject, filter, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { MobileReservationBoardComponent } from '../mobile-reservation-board/mobile-reservation-board.component';
import { resolveMobileBoardReturnUrl } from '../mobile-nav';

@Component({
  standalone: true,
  selector: 'app-mobile-board-page',
  imports: [MaterialModule, MobileReservationBoardComponent],
  templateUrl: './mobile-board-page.component.html',
  styleUrl: './mobile-board-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileBoardPageComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private destroy$ = new Subject<void>();

  boardReturnUrl: string | null = null;

  ngOnInit(): void {
    this.syncFromUrl();
    this.router.events.pipe(filter(event => event instanceof NavigationEnd), takeUntil(this.destroy$)).subscribe(() => {
      this.syncFromUrl();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  backToReturnUrl(): void {
    if (!this.boardReturnUrl) {
      return;
    }
    void this.router.navigateByUrl(this.boardReturnUrl);
  }

  private syncFromUrl(): void {
    this.boardReturnUrl = resolveMobileBoardReturnUrl(this.router.url);
    this.cdr.markForCheck();
  }
}
