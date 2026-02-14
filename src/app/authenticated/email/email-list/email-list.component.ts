import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { MappingService } from '../../../services/mapping.service';
import { Subscription, filter, take } from 'rxjs';
import { EmailListDisplay } from '../models/email.model';
import { EmailService } from '../services/email.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';

@Component({
  selector: 'app-email-list',
  imports: [CommonModule, FormsModule, MaterialModule, DataTableComponent],
  templateUrl: './email-list.component.html',
  styleUrl: './email-list.component.scss'
})
export class EmailListComponent implements OnInit, OnDestroy {
  emails: EmailListDisplay[] = [];
  allEmails: EmailListDisplay[] = [];
  isLoading = false;
  isServiceError = false;
  selectedOfficeId: number | null = null;
  offices: OfficeResponse[] = [];
  showOfficeDropdown = true;
  officesSubscription?: Subscription;

  emailsDisplayedColumns: ColumnSet = {
    officeName: { displayAs: 'Office', maxWidth: '18ch' },
    subject: { displayAs: 'Subject', maxWidth: '35ch' },
    toEmail: { displayAs: 'To Email', maxWidth: '26ch' },
    fromEmail: { displayAs: 'From Email', maxWidth: '26ch' },
    attachmentPath: { displayAs: 'Document', maxWidth: '15ch', sort: false, alignment: 'center' },
    createdOn: { displayAs: 'Sent', maxWidth: '24ch' }
  };

  constructor(
    private emailService: EmailService,
    private router: Router,
    private mappingService: MappingService,
    private officeService: OfficeService
  ) {}

  //#region Email-List
  ngOnInit(): void {
    this.loadOffices();
    this.loadEmails();
  }
  //#endregion

  //#region Data Loading Methods
  loadOffices(): void {
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription?.unsubscribe();
      this.officesSubscription = this.officeService.getAllOffices().subscribe({
        next: (allOffices: OfficeResponse[]) => {
          this.offices = allOffices || [];
          this.allEmails = this.mappingService.mapEmailOfficeNames(this.allEmails, this.offices);

          if (this.offices.length === 1) {
            this.selectedOfficeId = this.offices[0].officeId;
            this.showOfficeDropdown = false;
          } else {
            this.showOfficeDropdown = true;
          }

          this.applyFilters();
        },
        error: () => {
          this.offices = [];
          this.showOfficeDropdown = true;
        }
      });
    });
  }

  loadEmails(): void {
    this.isLoading = true;
    this.emailService.getEmails().subscribe({
      next: (emails) => {
        this.allEmails = this.mappingService.mapEmailListDisplays(emails || []);
        this.allEmails = this.mappingService.mapEmailOfficeNames(this.allEmails, this.offices);
        this.applyFilters();
        this.isServiceError = false;
        this.isLoading = false;
      },
      error: () => {
        this.allEmails = [];
        this.emails = [];
        this.isServiceError = true;
        this.isLoading = false;
      }
    });
  }
  //#endregion

  //#region Form Response Methods
  onOfficeChange(): void {
    this.applyFilters();
  }

  applyFilters(): void {
    let filtered = [...this.allEmails];

    if (this.selectedOfficeId !== null && this.selectedOfficeId !== undefined) {
      filtered = filtered.filter(email => email.officeId === String(this.selectedOfficeId));
    }

    this.emails = filtered;
  }

  viewDocument(email: EmailListDisplay): void {
    const documentId = email?.documentId;
    if (!documentId) {
      return;
    }

    this.router.navigate(
      [RouterUrl.replaceTokens(RouterUrl.DocumentView, [documentId])],
      {
        queryParams: {
          returnTo: 'email'
        }
      }
    );
  }

  viewEmail(email: EmailListDisplay): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Email, [email.emailId]));
  }
  //#endregion

    //#region Utility Methods
  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
  }
  //#endregion
}
