import { Component, Input, OnInit } from '@angular/core';
import { OutstandingCheckEmailRequest, OutstandingCheckEmailResponse, OutstandingCheckLetterPair, OutstandingCheckPreviewRequest, OutstandingCheckResponse } from '../models/outstanding-check.model';
import { AgencyResponse } from '../../agency/models/agency.model';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../material.module';
import { ReactiveFormsModule } from '@angular/forms';
import { LetterService } from '../../letters/services/letter.service';
import { ToastrService } from 'ngx-toastr';
import { HttpErrorResponse } from '@angular/common/http';
import { CommonMessage, emptyGuid } from '../../../enums/common-message.enum';
import { finalize, take } from 'rxjs';
import { ExternalStorageService } from '../../../services/external-storage.service';
import { OutstandingCheckService } from '../services/outstanding-check.service';
import { AuthService } from '../../../services/auth.service';
import { OutstandingCheckPreviewResponse } from '../models/preview.model';


@Component({
  selector: 'app-check-tab-preview',
  standalone: true,
  imports: [CommonModule, MaterialModule, ReactiveFormsModule],
  templateUrl: './check-tab-preview.component.html',
  styleUrl: './check-tab-preview.component.scss'
})

export class CheckTabPreviewComponent implements OnInit {
  @Input() outstandingCheck: OutstandingCheckResponse;
  @Input() agency: AgencyResponse;

  isServiceError: boolean = false;
  itemsToLoad: string[] = [];
  userName: string;
  states: string[];
  subject: string;
  state: string;
  letter: string;
  logoImgUrl: string;
  isEscheat: boolean = false;
  isEscheatTextInvalid: boolean = false;


  constructor(
    private authService: AuthService,
    private letterService: LetterService,
    private toastr: ToastrService,
    private outstandingCheckService: OutstandingCheckService,
    private externalStorageService: ExternalStorageService,
    )
  {
    this.itemsToLoad.push('letter');
    this.itemsToLoad.push('states');
  }

  ngOnInit(): void {
    this.userName = this.authService.getUser().firstName + ' ' + this.authService.getUser().lastName;
    this.state = this.agency.state;
    this.getStoragePublicUrl(this.agency.logoStorageId);
    this.getValidStates();
    this.getPopulatedLetter();
  }

  removeLoadItem(itemToRemove: string): void {
    this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
  }

  onEscheatToggle(): void {
    this.isEscheat = !this.isEscheat;
    this.itemsToLoad.push('letter');
    this.getPopulatedLetter();
  }

  onStateSelected(state: string): void {
    this.state = state;
    this.itemsToLoad.push('letter');
    this.getPopulatedLetter();
  }

  getPopulatedLetter(): void {
    this.isEscheatTextInvalid = false;
    const previewRequest: OutstandingCheckPreviewRequest = { subject: this.subject, state: this.state, isEscheat: this.isEscheat };
    this.outstandingCheckService.getEmailPreview(this.outstandingCheck.outstandingCheckId, previewRequest)
      .pipe(take(1), finalize(() => { this.removeLoadItem('letter') })).subscribe({
        next: (response: OutstandingCheckPreviewResponse) => {
          this.subject = response.subject;
          this.letter = response.content;
          if (this.letter.includes('No Escheat Text Available'))
            this.isEscheatTextInvalid = true;
        },
        error: (err: HttpErrorResponse) => {
          this.isServiceError = true;
          if (err.status !== 400) {
            this.toastr.error('Error populating email.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          }
        }
      });
  }

  sendEmail(): void {
    const pairs: OutstandingCheckLetterPair[] = [{ outstandingCheckId: this.outstandingCheck.outstandingCheckId, state: this.state }];
    const emailRequest: OutstandingCheckEmailRequest = { checkLetterPairs: pairs, subject: this.subject, isEscheat: this.isEscheat, requestedBy: this.userName };
    this.outstandingCheckService.sendEmails(emailRequest).pipe(take(1)).subscribe({
      next: (results: OutstandingCheckEmailResponse) => {
        if (results.numberOfSuccessfulEmails) {
          this.toastr.success(`${results.numberOfSuccessfulEmails} Email(s) successfully sent.` + CommonMessage.Success, CommonMessage.Success);
        }
        if (results.numberOfFailedEmails) {
          this.toastr.error(`${results.numberOfFailedEmails} Email(s) failed to be sent.` + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Error sending email(s).' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }

  getValidStates(): void {
    this.letterService.getValidStates().pipe(take(1), finalize(() => { this.removeLoadItem('states') })).subscribe({
      next: (response: string[]) => {
        this.states = response;
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load valid state list at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }

  getStoragePublicUrl(fileStorageGuid: string): void {
    if (['', emptyGuid].includes(fileStorageGuid || '')) {
      this.removeLoadItem('logo');
      return;
    }

    this.externalStorageService.getPublicFileUrl(fileStorageGuid).pipe(take(1),finalize(() => this.removeLoadItem('logo')),).subscribe({
      next: (response: string) => {
        this.logoImgUrl = response;
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not get stored logo.', CommonMessage.ServiceError);
        }
      }
    });
  }
}
