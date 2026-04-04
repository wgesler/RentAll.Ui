import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { GenericModalComponent } from '../generic/generic-modal.component';
import { GenericModalData } from '../generic/models/generic-modal-data';

@Injectable({
  providedIn: 'root'
})
export class UnsavedChangesDialogService {
  constructor(private dialog: MatDialog) {}

  async confirmLeaveOrSave(message: string = 'You have unsaved changes. What would you like to do?'): Promise<'discard' | 'save'> {
    const dialogData: GenericModalData = {
      title: 'Unsaved Changes',
      message,
      icon: 'warning' as any,
      iconColor: 'accent',
      no: 'Discard',
      yes: 'Save',
      yesIcon: 'save',
      callback: (dialogRef, result) => dialogRef.close(result),
      useHTML: false,
      hideClose: true
    };

    const dialogRef = this.dialog.open(GenericModalComponent, {
      data: dialogData,
      width: '35rem'
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    return result === true ? 'save' : 'discard';
  }
}
