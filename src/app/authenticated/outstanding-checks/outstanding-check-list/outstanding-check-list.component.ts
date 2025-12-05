import { Component, OnInit } from '@angular/core';
import { OutstandingCheckEmailRequest, OutstandingCheckEmailResponse, OutstandingCheckLetterPair, OutstandingCheckListDisplay, OutstandingCheckListResponse, OutstandingCheckSummary } from '../models/outstanding-check.model';
import { OutstandingCheckService } from '../services/outstanding-check.service';
import { ToastrService } from 'ngx-toastr';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MappingService } from '../../../services/mapping.service';
import { finalize, take } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { CommonMessage, emptyGuid } from '../../../enums/common-message.enum';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../material.module';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { MatDatepickerInputEvent } from '@angular/material/datepicker';
import { StorageService } from '../../../services/storage.service';
import { DefaultSearchItems } from '../../../shared/models/default-dates';
import { AgencyService } from '../../agency/services/agency.service';
import { AgencyResponse } from '../../agency/models/agency.model';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { SelectionModel } from '@angular/cdk/collections';
import { RouterUrl } from '../../../app.routes';
import { AuthService } from '../../../services/auth.service';
import { StorageKey } from '../../../enums/storage-keys.enum';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { GenericModalComponent } from '../../shared/modals/generic/generic-modal.component';
import { FormatterService } from '../../../services/formatter-service';
import { GenericModalData } from '../../shared/modals/generic/models/generic-modal-data';

@Component({
  selector: 'app-outstanding-check-list',
  standalone: true,
  templateUrl: './outstanding-check-list.component.html',
  styleUrl: './outstanding-check-list.component.scss',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule, DataTableComponent, MatFormFieldModule, MatIconModule],
})

export class OutstandingCheckListComponent implements OnInit {
  readonly syncData = { data: { title: 'Ramquest Data Sync', message: 'This request may take a few minutes. Would you like to continue?', no: 'Cancel', yes: 'Proceed' } };

  agencyAll: AgencyResponse = { agencyId: emptyGuid, name: 'All', branch: '', regId: 0, state: 'XX', databaseName: '', parentCompany: '', isActive: false }
  checkSummaryDisplayedColumns: ColumnSet = {
    'gfNo': { displayAs: 'GFNo.' },
    'checkNum': { displayAs: 'Check' },
    'amount': { displayAs: 'Amount' },
    'checkDate': { displayAs: 'Check Date' },
    'lastContact': { displayAs: 'Last Contact' },
    'reminderSent': { displayAs: 'Reminder', isCheckbox: true },
    'escheatSent': { displayAs: 'Escheat', isCheckbox: true }
  };
  checkSummaryDisplay: OutstandingCheckListDisplay[] = [];

  itemsToLoad: string[] = [];
  isServiceError: boolean = true;
  isSubmitting: boolean = false;
  userName: string = '';
  searchForm: FormGroup;
  today: Date = new Date();
  minDate = new Date('2000-01-01');
  maxDate: Date = this.today;
  startDate: Date = this.minDate;
  endDate: Date = this.maxDate;
  showReminders: boolean = true;
  showEscheated: boolean = true;
  agencies: AgencyResponse[] = [];
  agency: AgencyResponse;

  outstandingCheckSummaries: OutstandingCheckSummary[] = [];
  selection = new SelectionModel<OutstandingCheckListDisplay>(true, []);
  isAllSelected: boolean = false;
  isEscheat: boolean = false;

  isSending: boolean = false;
  dialogRef: MatDialogRef<GenericModalComponent>;
  syncInProgress: boolean = false;
  lastSyncDate: string = '';

  constructor(
    private authService: AuthService,
    private agencyService: AgencyService,
    private toastr: ToastrService,
    private router: Router,
    private mappingService: MappingService,
    private fb: FormBuilder,
    private storage: StorageService,
    private outstandingChecksService: OutstandingCheckService,
    private dialog: MatDialog,
    private formatterService: FormatterService
  ) {
    this.userName = this.authService.getUser().firstName + ' ' + this.authService.getUser().lastName;
    this.itemsToLoad.push('outstandingChecks');
    this.itemsToLoad.push('agencies');

    this.searchForm = this.fb.group({
      agencyId: ['', Validators.required],
      startDate: ['', Validators.required],
      endDate: ['', Validators.required],
      showReminders: [null, Validators.required],
      showEscheated: [null, Validators.required]
    });
  }

  ngOnInit(): void {
    this.setDefaultSearchItems();
    this.getOutstandingChecks();
    this.getAgencies();
  }

  onEscheatToggle(): void {
    this.isEscheat = !this.isEscheat;
  }

  initiateSync(): void {
    this.dialogRef = this.dialog.open(GenericModalComponent, this.syncData);
    this.dialogRef.afterClosed().subscribe({
      next: result => {
        if (result) {
          this.syncWithRamquest();
        }
      }
    });
  }

  syncWithRamquest(): void {
    this.outstandingChecksService.syncWithRamquest().pipe(take(1)).subscribe({
      next: (response: boolean) => {
        if (response) {
          this.syncInProgress = true;
          this.getOutstandingChecks();

        }
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Unable to sync with Ramquest at this time', CommonMessage.ServiceError);
        }
      }
    });
  }

  goToCheck(event: OutstandingCheckListDisplay): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.OutstandingCheck, [event.outstandingCheckId]));
  }

  getOutstandingChecks(): void {
    const defaultSearchItems: DefaultSearchItems = this.searchForm.getRawValue();
    this.storage.addItem(StorageKey.OutstandingSearchItems, JSON.stringify(defaultSearchItems));

    this.outstandingChecksService.getOutstandingChecks().pipe(take(1), finalize(() => { this.removeLoadItem('outstandingChecks') })).subscribe({
      next: (response: OutstandingCheckListResponse) => {
        this.lastSyncDate = this.formatterService.dateOnly(new Date(response.syncStatus.ramquestLastSync));
        this.syncInProgress = response.syncStatus.syncInProgress;

        this.outstandingCheckSummaries = this.mappingService.mapOutstandingChecks(response?.outstandingChecks);
        this.displayChecks();

        // recheck sync status every 10 seconds until done
        if (this.syncInProgress) {
          setTimeout(() => { this.getOutstandingChecks() }, 10000);
        }
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load Outstanding Checks', CommonMessage.ServiceError);
        }
      }
    });
  }

  getAgencies(): void {
    this.agencyService.getAgencies().pipe(take(1), finalize(() => { this.removeLoadItem('agencies') })).subscribe({
      next: (response: AgencyResponse[]) => {
        this.agencies = response;
        this.agencies.unshift(this.agencyAll);
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load Agencies', CommonMessage.ServiceError);
        }
      }
    });
  }

  displayChecks(): void {
    const searchItems = this.searchForm.getRawValue();
    searchItems['startDate'] = new Date(searchItems['startDate']);
    searchItems['endDate'] = new Date(searchItems['endDate']);
    this.storage.addItem(StorageKey.OutstandingSearchItems, JSON.stringify(searchItems));

    let list = this.outstandingCheckSummaries.filter(c =>
      new Date(c.checkDate) >= searchItems['startDate'] && new Date(c.checkDate) <= searchItems['endDate']
    );

    if (!searchItems['showReminders'])
      list = list.filter(c => !c.reminderSent);

    if (!searchItems['showEscheated'])
      list = list.filter(c => !c.escheatSent);

    this.checkSummaryDisplay = this.mappingService.mapOutstandingCheckDisplay(
      searchItems['agencyId'] === emptyGuid ? list : list.filter(c => c.agencyId === searchItems['agencyId'])
    );
  }

  setDefaultSearchItems(): void {
    const storedSearchItems = this.storage.getItem(StorageKey.OutstandingSearchItems);
    if (storedSearchItems) {
      const searchItems = JSON.parse(storedSearchItems);
      searchItems['startDate'] = new Date(searchItems['startDate']);
      searchItems['endDate'] = new Date(searchItems['endDate']);
      this.searchForm.setValue(searchItems);
      return;
    }
    this.startDate = new Date(this.minDate);
    this.endDate = new Date();
    this.endDate.setDate(this.today.getDate() - 120);
    this.searchForm.setValue({
      startDate: this.startDate,
      endDate: this.endDate,
      agencyId: emptyGuid,
      showReminders: this.showReminders,
      showEscheated: this.showEscheated,
    });
  }

  goToBulkSend(): void {
    this.dialog.open(GenericModalComponent, {
      data: {
        title: 'Send Email:',
        message: `You are sending this email to ${this.selection.selected?.length ?? 0} recipient(s). Would you like to send an escheatment email or a reminder email?`,
        no: "Escheatment",
        yes: 'Reminder',
        callback: (dialogRef, result) => {
          dialogRef.close(result);
          this.isEscheat = !result;
          this.bulkSend();
        }
      } as GenericModalData
    });
  }

  bulkSend(): void {
    this.isSending = true;

    const pairs: OutstandingCheckLetterPair[] = [];
    this.selection.selected.map(item => pairs.push({ outstandingCheckId: item.outstandingCheckId, state: null }));
    const emailRequest: OutstandingCheckEmailRequest = { checkLetterPairs: pairs, subject: "Escrow No: {{File Number}}", isEscheat: this.isEscheat, requestedBy: this.userName };
    this.outstandingChecksService.sendEmails(emailRequest).pipe(take(1)).subscribe({
      next: (results: OutstandingCheckEmailResponse) => {
        if (results.numberOfSuccessfulEmails) {
          this.toastr.success(`${results.numberOfSuccessfulEmails} Email(s) successfully sent.`, CommonMessage.Success);
        }
        if (results.numberOfFailedEmails) {
          this.toastr.error(`${results.numberOfFailedEmails} Email(s) failed to be sent.`, CommonMessage.ServiceError);
        }
        this.getOutstandingChecks();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Error sending email(s).' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
    this.isSending = false;
  }

  removeLoadItem(itemToRemove: string): void {
    this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
  }

  changeStartDate(event: MatDatepickerInputEvent<string>): void {
    if (event.value) {
      this.startDate = new Date(event.value);
      this.displayChecks();
    }
  }

  changeEndDate(event: MatDatepickerInputEvent<string>): void {
    if (event.value) {
      this.endDate = new Date(event.value);
      this.displayChecks();
    }
  }

  updateSelectionSet(event: SelectionModel<OutstandingCheckListDisplay>): void {
    this.selection.setSelection(...event.selected);
  }
}

