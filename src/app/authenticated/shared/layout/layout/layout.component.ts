
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { RouterModule } from '@angular/router';
import { DEFAULT_INTERRUPTSOURCES, Idle } from '@ng-idle/core';
import { Keepalive, NgIdleKeepaliveModule } from '@ng-idle/keepalive';
import { Subject, take, takeUntil } from 'rxjs';
import { AuthService } from '../../../../services/auth.service';
import { GenericModalComponent } from '../../modals/generic/generic-modal.component';
import { HeaderComponent } from '../header/header.component';
import { SidebarComponent } from '../sidebar/sidebar.component';

@Component({
    selector: 'app-layout',
    imports: [RouterModule, HeaderComponent, SidebarComponent, MatButtonModule, MatIconModule, NgIdleKeepaliveModule],
    templateUrl: './layout.component.html',
    styleUrl: './layout.component.scss'
})

export class LayoutComponent implements OnInit, OnDestroy {
  readonly timeoutData = { data: { title: 'Session Timed-Out', message: 'Would you like to continue?', no: 'Leave', yes: 'Stay' } };
  static isIdleModalOn = false;

  isLoading = true;
  isInitialLoad: boolean = true;
  lastPing?: Date = null;
  idleMonitor: boolean = false;
  destroy$ = new Subject<void>();
  dialogRef: MatDialogRef<GenericModalComponent>;

  constructor(
    private idle: Idle,
    private keepalive: Keepalive,
    private cd: ChangeDetectorRef,
    private authService: AuthService,
    private dialog: MatDialog) { 

    // How long the user can be inactive before considered idle, in seconds
    idle.setIdle(600); // (600) 10 minutes
    // How long the user can be idle before considered timed out, in seconds
    idle.setTimeout(120); // (120) 2 minutes
    // Sets the default interrupts, in this case, things like clicks, scrolls, touches to the document
    idle.setInterrupts(DEFAULT_INTERRUPTSOURCES);

    idle.onIdleEnd.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.userIsActive();
      this.cd.detectChanges();
    })

    idle.onTimeout.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.userIsTimedOut();
    })

    idle.onIdleStart.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.userIsIdle();
    })
  }

  ngOnInit(): void {
    this.idleMonitor = true;
    this.idle.watch();

    this.authService.jwtChanged$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      if (this.authService.getIsLoggedIn()) return;
      this.userIsTimedOut();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Step one: Idle detected, launch logout dialog
  userIsIdle(): void {
    if (LayoutComponent.isIdleModalOn)
      return;

    LayoutComponent.isIdleModalOn = true;
    this.dialogRef = this.dialog.open(GenericModalComponent, this.timeoutData);
    this.dialogRef.afterClosed().pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: result => {
        if (result)
          LayoutComponent.isIdleModalOn = false;
        else
          this.endIdle();
      }
    });
  }

  // Step two: Only gets called between isIdle and isTimedOut as fail-safe
  userIsActive(): void {
    if (LayoutComponent.isIdleModalOn)
      return;

    this.dialogRef?.close();
    this.endIdle();
  }

  // Step three: No more chances, logout
  userIsTimedOut(): void {
    this?.dialogRef && this.dialogRef?.close();
    this.endIdle();
  }

  endIdle(): void {
    if (!this.idleMonitor) return;

    this.destroy$.next();
    this.idle.stop();
    this.keepalive.stop();
    this.dialog.closeAll();
    this.idleMonitor = false;
    LayoutComponent.isIdleModalOn = false;

    // Auth service takes care of returning the user to the login page
    this.authService.logout();
  }
}
