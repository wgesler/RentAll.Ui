import { Component, Input, NgZone, OnInit } from '@angular/core';
import { OutstandingCheckResponse } from '../models/outstanding-check.model';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../material.module';
import { EmailDisplay, EmailResponse } from '../models/email.model';
import { OutstandingCheckService } from '../services/outstanding-check.service';
import { CommonMessage } from '../../../enums/common-message.enum';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { finalize, take } from 'rxjs';
import { MappingService } from '../../../services/mapping.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { FormatterService } from '../../../services/formatter-service';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { GenericModalComponent } from '../../shared/modals/generic/generic-modal.component';

@Component({
  selector: 'app-check-tab-history',
  standalone: true,
  imports: [CommonModule, MaterialModule, DataTableComponent],
  templateUrl: './check-tab-history.component.html',
  styleUrl: './check-tab-history.component.scss'
})

export class CheckTabHistoryComponent implements OnInit {
  @Input() outstandingCheck: OutstandingCheckResponse;

  historyDetails = { data: { title: 'Check History Details', message: '', no: 'Close', yes: '', useHTML: true, icon: 'history' } };
  dialogRef: MatDialogRef<GenericModalComponent>;

  isServiceError: boolean = false;
  itemsToLoad: string[] = [];
  emailsColumns: ColumnSet = {
    'companyName': { displayAs: 'From', sort: false },
    'payeeName': { displayAs: 'Payee', sort: false },
    'payeeEmail': { displayAs: 'Email', sort: false },
    'isEscheat': { displayAs: 'Letter Type', sort: false },
    'success': { displayAs: 'Success', sort: false },
    'createdBy': { displayAs: 'Created By', sort: false },
    'createdOn': { displayAs: 'Created On', sort: false, wrap: false }
  };
  emails: EmailDisplay[] = [];

  constructor(
    public outstandingCheckService: OutstandingCheckService,
    public toastr: ToastrService,
    public mappingService: MappingService,
    public formatterService: FormatterService,
    private zone: NgZone,
    private dialog: MatDialog) {
    this.itemsToLoad.push('emails');
  }

  ngOnInit(): void {
    this.getEmails();
  }

  getEmails(): void {
    this.outstandingCheckService.getEmailsByOutstandingCheckId(this.outstandingCheck.outstandingCheckId).pipe(take(1), finalize(() => { this.removeLoadItem('emails') })).subscribe({
      next: (response: EmailResponse[]) => {
        this.emails = this.mappingService.mapEmails(response);
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load Emails', CommonMessage.ServiceError);
        }
      }
    });
  }

  openDetails(email: EmailDisplay): void {
    this.historyDetails.data.message = `<div class="dialog-details">
        <div class="mb-1">
          <div class="label">From: </div>
          <div class="value">${email.companyName}</div>
        </div>
        <div class="mb-1">
          <div class="label">Payee: </div>
          <div class="value">${email.payeeName}</div>
        </div>
        <div class="mb-1">
          <div class="label">Email: </div>
          <div class="value">${email.payeeEmail}</div>
        </div>
        <div class="mb-1">
          <div class="label">Letter Type: </div>
          <div class="value">${email.isEscheat ? 'Escheat' : 'Reminder'}</div>
        </div>
        <div class="mb-1">
          <div class="label">Success: </div>
          <div class="value">${email.success ? 'Yes' : 'No'}</div>
        </div>
        <div class="mb-1">
          <div class="label">Created By: </div>
          <div class="value">${email.createdBy}</div>
        </div>
        <div class="mb-1">
          <div class="label">Created On: </div>
          <div class="value">${email.createdOn}</div>
        </div>
      </div>`;
    this.zone.run(() => {
      this.dialogRef = this.dialog.open(GenericModalComponent, this.historyDetails);
    });
  }

  removeLoadItem(itemToRemove: string): void {
    this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
  }
}
