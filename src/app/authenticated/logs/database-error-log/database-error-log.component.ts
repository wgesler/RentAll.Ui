import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { DatabaseErrorLogResponse } from '../models/log.model';

@Component({
  standalone: true,
  selector: 'app-database-error-log',
  templateUrl: './database-error-log.component.html',
  styleUrl: './database-error-log.component.scss',
  imports: [CommonModule, MaterialModule]
})
export class DatabaseErrorLogComponent implements OnInit, OnDestroy {
  @Input() row: DatabaseErrorLogResponse | null = null;
  @Output() closed = new EventEmitter<void>();
  constructor() {}

  //#region Database-Error-Log
  ngOnInit(): void {}
  //#endregion

  //#region Utility Methods
  back(): void {
    this.closed.emit();
  }

  ngOnDestroy(): void {}
  //#endregion
}
