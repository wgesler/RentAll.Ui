import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MaterialModule } from '../../../../material.module';
import { SafeHTMLPipe } from '../../pipes/safe-html';
import { GenericModalData, defaultGenericModalData } from './models/generic-modal-data';

@Component({
  selector: 'app-generic-modal',
  standalone: true,
  imports: [CommonModule, MaterialModule, SafeHTMLPipe],
  templateUrl: './generic-modal.component.html',
  styleUrl: './generic-modal.component.scss'
})
export class GenericModalComponent implements OnInit {

  constructor(public dialogRef: MatDialogRef<GenericModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: GenericModalData) { }

  ngOnInit(): void {
    this.data = {
      // Handle default data overrides. Lookup 'JS spread syntax' if this still doesn't make sense.
      ...defaultGenericModalData, // see ./models/generic-modal-data.ts for purpose of callback fn
      ...this.data
    };
  }

}
