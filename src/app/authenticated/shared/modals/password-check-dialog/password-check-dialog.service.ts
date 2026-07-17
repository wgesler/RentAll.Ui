import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable, map } from 'rxjs';
import { PasswordCheckDialogComponent, PasswordCheckDialogData, PasswordCheckDialogResult } from './password-check-dialog.component';

@Injectable({
  providedIn: 'root'
})
export class PasswordCheckDialogService {
  private dialog = inject(MatDialog);

  confirm(data?: PasswordCheckDialogData): Observable<string | null> {
    const dialogRef = this.dialog.open(PasswordCheckDialogComponent, {
      width: '34rem',
      data: data ?? {}
    });

    return dialogRef.afterClosed().pipe(
      map((result?: PasswordCheckDialogResult) => String(result?.password || '').trim() || null)
    );
  }
}
