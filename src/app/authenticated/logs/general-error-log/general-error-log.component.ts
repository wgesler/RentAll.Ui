import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { GeneralErrorLogResponse } from '../models/log.model';

@Component({
  standalone: true,
  selector: 'app-general-error-log',
  templateUrl: './general-error-log.component.html',
  styleUrl: './general-error-log.component.scss',
  imports: [CommonModule, MaterialModule]
})
export class GeneralErrorLogComponent implements OnInit, OnDestroy {
  @Input() row: GeneralErrorLogResponse | null = null;
  @Output() closed = new EventEmitter<void>();
  constructor() {}

  //#region General-Error-Log
  ngOnInit(): void {}
  //#endregion

  //#region Utility Methods
  back(): void {
    this.closed.emit();
  }

  ngOnDestroy(): void {}
  //#endregion
}
