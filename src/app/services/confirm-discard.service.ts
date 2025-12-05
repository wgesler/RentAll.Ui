import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { GenericModalComponent } from '../authenticated/shared/modals/generic/generic-modal.component';
import { Observable, map, tap } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ConfirmDiscardService {

  static prevent = false;
  static isListening = false;

  static readonly unsavedMessage: string = 'You have unsaved changes. Are you sure you want to leave?';

  constructor(private dialog: MatDialog) {
    this.listen();
  }

  confirm(callback: (result: boolean) => void): Observable<boolean> {
    const dialogRef = this.dialog.open(GenericModalComponent, {
      data: { title: 'Unsaved changes', message: ConfirmDiscardService.unsavedMessage, yes: 'Discard Changes', no: 'Cancel', }
    });
    return dialogRef.afterClosed().pipe(map(x => !!x), tap(callback));
  }

  listen(): void {
    if (ConfirmDiscardService.isListening) return;
    ConfirmDiscardService.isListening = true;
    
    window.addEventListener("beforeunload", e => {
        if (!ConfirmDiscardService.prevent) return false;
        (e || window.event).returnValue = ConfirmDiscardService.unsavedMessage;
        return ConfirmDiscardService.unsavedMessage;
    });
  }

  disable(): void {
    this.set(false);
  }

  enable(): void {
    this.set(true);
  }

  set(value: boolean) {
    this.listen();
    ConfirmDiscardService.prevent = value;
  }

}