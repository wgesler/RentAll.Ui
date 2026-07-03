import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { ApplicationLogResponse } from '../models/log.model';

@Component({
  standalone: true,
  selector: 'app-application-log',
  templateUrl: './application-log.component.html',
  styleUrl: './application-log.component.scss',
  imports: [CommonModule, MaterialModule]
})
export class ApplicationLogComponent implements OnInit, OnDestroy {
  @Input() row: ApplicationLogResponse | null = null;
  @Output() closed = new EventEmitter<void>();
  constructor() {}

  //#region Application-Log
  ngOnInit(): void {}
  //#endregion

  //#region Utility Methods
  back(): void {
    this.closed.emit();
  }

  ngOnDestroy(): void {}
  //#endregion
}
