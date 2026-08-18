import { Injectable, inject } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { take } from 'rxjs';
import { USER_GUIDE_WELCOME_URL } from '../../../organizations/models/user-guide.model';
import type { HelpGuideDialogComponent } from './help-guide-dialog.component';

@Injectable({ providedIn: 'root' })
export class HelpGuideService {
  private dialog = inject(MatDialog);
  private router = inject(Router);
  private dialogRef: MatDialogRef<HelpGuideDialogComponent> | null = null;

  open(topicUrl?: string): void {
    const resolvedTopicUrl = topicUrl || this.getCurrentTopicUrl();
    if (this.dialogRef) {
      this.dialogRef.componentInstance.selectTopic(resolvedTopicUrl);
      return;
    }

    void import('./help-guide-dialog.component').then(({ HelpGuideDialogComponent }) => {
      this.dialogRef = this.dialog.open(HelpGuideDialogComponent, {
        id: 'help-guide-dialog',
        width: '90%',
        maxWidth: '960px',
        maxHeight: '90vh',
        autoFocus: false,
        data: { topicUrl: resolvedTopicUrl }
      });

      this.dialogRef.afterClosed().pipe(take(1)).subscribe(() => {
        this.dialogRef = null;
      });
    });
  }

  getCurrentTopicUrl(): string {
    const parts = this.router.url.split('?')[0].split('/').filter(Boolean);
    const authIndex = parts.indexOf('auth');
    const topicUrl = (authIndex >= 0 ? parts[authIndex + 1] : parts[0]) || USER_GUIDE_WELCOME_URL;
    if (topicUrl === 'dashboard-staff' || topicUrl === 'dashboard-owner') {
      return 'dashboard';
    }
    return topicUrl;
  }
}
