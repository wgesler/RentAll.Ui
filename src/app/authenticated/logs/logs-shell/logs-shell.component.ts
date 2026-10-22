import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { finalize, forkJoin, take } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
import { SearchableSelectOption } from '../../shared/searchable-select/searchable-select.component';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { AccountingErrorLogComponent } from '../accounting-error-log/accounting-error-log.component';
import { AccountingErrorLogListComponent } from '../accounting-error-log-list/accounting-error-log-list.component';
import { AccountingLogComponent } from '../accounting-log/accounting-log.component';
import { AccountingLogListComponent } from '../accounting-log-list/accounting-log-list.component';
import { ApplicationLogComponent } from '../application-log/application-log.component';
import { ApplicationLogListComponent } from '../application-log-list/application-log-list.component';
import { DatabaseErrorLogComponent } from '../database-error-log/database-error-log.component';
import { DatabaseErrorLogListComponent } from '../database-error-log-list/database-error-log-list.component';
import { GeneralErrorLogComponent } from '../general-error-log/general-error-log.component';
import { GeneralErrorLogListComponent } from '../general-error-log-list/general-error-log-list.component';
import { PropertyUploadLogComponent } from '../property-upload-log/property-upload-log.component';
import { PropertyUploadLogListComponent } from '../property-upload-log-list/property-upload-log-list.component';
import { DocumentHealthComponent } from '../document-health/document-health.component';
import { AccountingErrorLogResponse, AccountingLogResponse, ApplicationLogResponse, DatabaseErrorLogResponse, GeneralErrorLogResponse, PropertyUploadLogResponse } from '../models/log.model';
import { LogService } from '../services/log.service';

@Component({
  standalone: true,
  selector: 'app-logs-shell',
  templateUrl: './logs-shell.component.html',
  styleUrl: './logs-shell.component.scss',
  imports: [
    CommonModule,
    MaterialModule,
    AccountingErrorLogListComponent,
    AccountingErrorLogComponent,
    AccountingLogListComponent,
    AccountingLogComponent,
    ApplicationLogListComponent,
    ApplicationLogComponent,
    DatabaseErrorLogListComponent,
    DatabaseErrorLogComponent,
    GeneralErrorLogListComponent,
    GeneralErrorLogComponent,
    PropertyUploadLogListComponent,
    PropertyUploadLogComponent,
    DocumentHealthComponent,
    TitleBarSelectComponent
  ]
})
export class LogsShellComponent implements OnInit {
  private logService = inject(LogService);
  private authService = inject(AuthService);
  private officeService = inject(OfficeService);

  healthOffices: OfficeResponse[] = [];
  selectedHealthOfficeId: number | null = null;

  selectedTabIndex = 0;
  reloadToken = 0;
  isDeletingAll = false;
  errorMessage: string | null = null;

  selectedAccountingError: AccountingErrorLogResponse | null = null;
  selectedAccountingLog: AccountingLogResponse | null = null;
  selectedApplicationLog: ApplicationLogResponse | null = null;
  selectedDatabaseError: DatabaseErrorLogResponse | null = null;
  selectedGeneralError: GeneralErrorLogResponse | null = null;
  selectedPropertyUploadLog: PropertyUploadLogResponse | null = null;

  get isHealthTab(): boolean {
    return this.selectedTabIndex === 6;
  }

  get healthOfficeOptions(): SearchableSelectOption[] {
    return this.healthOffices.map(office => ({
      value: office.officeId,
      label: office.name
    }));
  }

  ngOnInit(): void {
    const organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    if (!organizationId) {
      return;
    }

    this.officeService.ensureOfficesLoaded(organizationId).pipe(take(1)).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(take(1)).subscribe(offices => {
          this.healthOffices = (offices || []).filter(office => office.isActive !== false);
          if (this.selectedHealthOfficeId != null && !this.healthOffices.some(office => office.officeId === this.selectedHealthOfficeId)) {
            this.selectedHealthOfficeId = null;
          }
        });
      }
    });
  }

  onTabIndexChange(tabIndex: number): void {
    this.selectedTabIndex = tabIndex;
  }

  onHealthOfficeChange(value: string | number | null): void {
    this.selectedHealthOfficeId = value == null || value === '' ? null : Number(value);
  }

  deleteAllLogs(): void {
    this.isDeletingAll = true;
    this.errorMessage = null;
    forkJoin([
      this.logService.deleteAllAccountingError(),
      this.logService.deleteAllDatabaseError(),
      this.logService.deleteAllGeneralError(),
      this.logService.deleteAllAccountingLog(),
      this.logService.deleteAllApplicationLog(),
      this.logService.deleteAllPropertyUploadLog()
    ]).pipe(take(1), finalize(() => this.isDeletingAll = false)).subscribe({
      next: () => {
        this.closeAccountingErrorLog();
        this.closeDatabaseErrorLog();
        this.closeGeneralErrorLog();
        this.closeAccountingLog();
        this.closeApplicationLog();
        this.closePropertyUploadLog();
        this.reloadToken++;
      },
      error: () => {
        this.errorMessage = CommonMessage.ServiceError;
      }
    });
  }
  //#endregion

  //#region Get Methods
  hasActiveTabDetail(): boolean {
    switch (this.selectedTabIndex) {
      case 0:
        return !!this.selectedApplicationLog;
      case 1:
        return !!this.selectedAccountingLog;
      case 2:
        return !!this.selectedAccountingError;
      case 3:
        return !!this.selectedDatabaseError;
      case 4:
        return !!this.selectedGeneralError;
      case 5:
        return !!this.selectedPropertyUploadLog;
      default:
        return false;
    }
  }
  //#endregion

  //#region Form Response Methods
  onListActionCompleted(): void {
    this.closeAccountingErrorLog();
    this.closeDatabaseErrorLog();
    this.closeGeneralErrorLog();
    this.closeAccountingLog();
    this.closeApplicationLog();
    this.closePropertyUploadLog();
    this.reloadToken++;
  }

  openAccountingErrorLog(row: AccountingErrorLogResponse): void {
    this.selectedAccountingError = row;
  }

  closeAccountingErrorLog(): void {
    this.selectedAccountingError = null;
  }

  openAccountingLog(row: AccountingLogResponse): void {
    this.selectedAccountingLog = row;
  }

  closeAccountingLog(): void {
    this.selectedAccountingLog = null;
  }

  openApplicationLog(row: ApplicationLogResponse): void {
    this.selectedApplicationLog = row;
  }

  closeApplicationLog(): void {
    this.selectedApplicationLog = null;
  }

  openDatabaseErrorLog(row: DatabaseErrorLogResponse): void {
    this.selectedDatabaseError = row;
  }

  closeDatabaseErrorLog(): void {
    this.selectedDatabaseError = null;
  }

  openGeneralErrorLog(row: GeneralErrorLogResponse): void {
    this.selectedGeneralError = row;
  }

  closeGeneralErrorLog(): void {
    this.selectedGeneralError = null;
  }

  openPropertyUploadLog(row: PropertyUploadLogResponse): void {
    this.selectedPropertyUploadLog = row;
  }

  closePropertyUploadLog(): void {
    this.selectedPropertyUploadLog = null;
  }
  //#endregion

  //#region Utility Methods
  backActiveTabDetail(): void {
    switch (this.selectedTabIndex) {
      case 0:
        this.closeApplicationLog();
        return;
      case 1:
        this.closeAccountingLog();
        return;
      case 2:
        this.closeAccountingErrorLog();
        return;
      case 3:
        this.closeDatabaseErrorLog();
        return;
      case 4:
        this.closeGeneralErrorLog();
        return;
      case 5:
        this.closePropertyUploadLog();
        return;
      default:
        return;
    }
  }
  //#endregion
}
