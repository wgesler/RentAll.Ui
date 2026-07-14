
import { Component, OnInit, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MaterialModule } from '../../../../material.module';
import { SafeHTMLPipe } from '../../pipes/safe-html';
import { GenericModalData, defaultGenericModalData } from './models/generic-modal-data';

@Component({
    standalone: true,
    selector: 'app-generic-modal',
    imports: [MaterialModule, SafeHTMLPipe],
    templateUrl: './generic-modal.component.html',
    styleUrl: './generic-modal.component.scss'
})
export class GenericModalComponent implements OnInit {
  dialogRef = inject<MatDialogRef<GenericModalComponent>>(MatDialogRef);
  data = inject<GenericModalData>(MAT_DIALOG_DATA);


  ngOnInit(): void {
    this.data = {
      // Handle default data overrides. Lookup 'JS spread syntax' if this still doesn't make sense.
      ...defaultGenericModalData, // see ./models/generic-modal-data.ts for purpose of callback fn
      ...this.data
    };
  }

}
