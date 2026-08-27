import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { PropertyUploadLogResponse } from '../models/log.model';

@Component({
  standalone: true,
  selector: 'app-property-upload-log',
  templateUrl: './property-upload-log.component.html',
  styleUrl: './property-upload-log.component.scss',
  imports: [CommonModule, MaterialModule]
})
export class PropertyUploadLogComponent implements OnInit, OnDestroy {
  @Input() row: PropertyUploadLogResponse | null = null;

  //#region Property-Upload-Log
  ngOnInit(): void {}
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {}
  //#endregion
}
