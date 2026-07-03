import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { AccountingLogResponse } from '../models/log.model';

@Component({
  standalone: true,
  selector: 'app-accounting-log',
  templateUrl: './accounting-log.component.html',
  styleUrl: './accounting-log.component.scss',
  imports: [CommonModule, MaterialModule]
})
export class AccountingLogComponent implements OnInit, OnDestroy {
  @Input() row: AccountingLogResponse | null = null;
  @Output() closed = new EventEmitter<void>();
  constructor() {}

  //#region Accounting-Log
  ngOnInit(): void {}
  //#endregion

  //#region Utility Methods
  back(): void {
    this.closed.emit();
  }

  ngOnDestroy(): void {}
  //#endregion
}
