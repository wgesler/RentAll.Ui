import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { take } from 'rxjs';
import { BankAccountType, getBankAccountTypes } from '../../authenticated/organizations/models/bank-account-type-enum';
import { MaterialModule } from '../../material.module';
import { UtilityService } from '../../services/utility.service';
import { PayMethodChoice, PayRequestAchRequest, PayRequestAchResponse, PayRequestResponse, PayResponseMessage, PayResponseMessageType, PayResponseResponse } from '../models/pay-request.model';
import { PayRequestService } from '../services/pay-request.service';

/**
 * The page the payment email links to (payments/pay-request?token=..). Public: the payer has no login.
 * The payer picks card, ACH Debit or both. Card: Number's own form in an iFrame (card numbers never touch RentAll);
 * when it's submitted, Number sends the iFrame to our pay-response page, which saves the result and posts it back here.
 * ACH Debit: our own form; the API passes the bank numbers straight to Number (ACH/Combo, no debit) and keeps only
 * the consent ID and last four digits.
 */
@Component({
  standalone: true,
  selector: 'app-pay-request',
  imports: [CommonModule, FormsModule, MaterialModule],
  templateUrl: './pay-request.component.html',
  styleUrl: './pay-request.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PayRequestComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private payRequestService = inject(PayRequestService);
  private sanitizer = inject(DomSanitizer);
  private cdr = inject(ChangeDetectorRef);
  private utilityService = inject(UtilityService);

  token = '';
  isLoading = true;
  errorMessage = '';
  request: PayRequestResponse | null = null;

  method: PayMethodChoice = 'card';
  cardFormUrl: SafeResourceUrl | null = null;
  isLoadingCardForm = false;
  cardFormError = '';
  cardResult: PayResponseResponse | null = null;
  cardAuthorized = false;
  @ViewChild('numberFrame') numberFrame?: ElementRef<HTMLIFrameElement>;

  // ACH Debit form. The numbers are sent once to the API (then Number) and never stored on this page.
  ach: PayRequestAchRequest = { routingNumber: '', accountNumber: '', confirmAccountNumber: '', accountType: BankAccountType.PersonalChecking, nameOnAccount: '', bankName: '', authorized: false };
  readonly achAccountTypes = getBankAccountTypes();
  isSavingAch = false;
  achResult: PayRequestAchResponse | null = null;
  achError = '';
  achSubmitted = false;
  accountNumberVisible = false;
  confirmAccountNumberVisible = false;

  private readonly onMessage = (event: MessageEvent): void => this.handleMessage(event);

  ngOnInit(): void {
    // Reserve the scrollbar's space so the page doesn't shift sideways when its height changes.
    document.documentElement.style.scrollbarGutter = 'stable';
    this.token = (this.route.snapshot.queryParamMap.get('token') || '').trim();
    if (!this.token) {
      this.isLoading = false;
      this.errorMessage = 'This payment link is missing its code. Please use the link from your email.';
      return;
    }

    window.addEventListener('message', this.onMessage);
    this.payRequestService.getPayRequest(this.token).pipe(take(1)).subscribe({
      next: (request) => {
        this.request = request;
        this.ach.nameOnAccount = request.tenantName || '';
        this.isLoading = false;
        this.loadCardFormIfNeeded();
        this.cdr.markForCheck();
      },
      error: (err: HttpErrorResponse) => {
        this.isLoading = false;
        this.errorMessage = this.errorText(err, 'This payment request could not be loaded.');
        this.cdr.markForCheck();
      }
    });
  }

  ngOnDestroy(): void {
    document.documentElement.style.scrollbarGutter = '';
    window.removeEventListener('message', this.onMessage);
  }

  get showCardStep(): boolean {
    return this.method === 'card' || this.method === 'both';
  }

  get cardSaved(): boolean {
    return !!this.cardResult?.saved;
  }

  get achSaved(): boolean {
    return !!this.achResult?.saved;
  }

  /** Everything the payer chose is saved: show the thank-you view in place of the forms. */
  get allSaved(): boolean {
    return (!this.showCardStep || this.cardSaved) && (!this.showBankStep || this.achSaved) && (this.cardSaved || this.achSaved);
  }

  //#region ACH Debit
  private digits(value: string): string {
    return (value || '').replace(/\D/g, '');
  }

  get routingValid(): boolean {
    return this.utilityService.isValidRoutingNumber(this.ach.routingNumber);
  }

  get routingError(): string {
    const d = this.digits(this.ach.routingNumber);
    if (!d) {
      return 'Enter the 9-digit routing number.';
    }
    return d.length !== 9 ? 'A routing number has 9 digits.' : this.routingValid ? '' : 'This routing number is not valid. Please check it.';
  }

  get accountError(): string {
    const raw = (this.ach.accountNumber || '').trim();
    const d = this.digits(raw);
    if (!d) {
      return 'Enter the account number.';
    }
    return d.length !== raw.length || d.length < 4 || d.length > 17 ? 'An account number is 4 to 17 digits.' : '';
  }

  get confirmError(): string {
    return this.digits(this.ach.confirmAccountNumber) !== this.digits(this.ach.accountNumber) ? 'The account numbers don\'t match.' : '';
  }

  get nameError(): string {
    return (this.ach.nameOnAccount || '').trim().length < 2 ? 'Enter the name on the account.' : '';
  }

  get bankNameError(): string {
    return (this.ach.bankName || '').trim().length < 2 ? 'Enter the bank name.' : '';
  }

  get achValid(): boolean {
    return !this.routingError && !this.accountError && !this.confirmError && !this.nameError && !this.bankNameError && this.ach.authorized;
  }

  onDigitsOnlyInput(event: Event, field: 'routingNumber' | 'accountNumber' | 'confirmAccountNumber'): void {
    const input = event.target as HTMLInputElement;
    const v = input.value.replace(/\D/g, '');
    if (input.value !== v) {
      input.value = v;
    }
    this.ach[field] = v;
  }

  toggleAccountNumberVisibility(): void {
    this.accountNumberVisible = !this.accountNumberVisible;
  }

  toggleConfirmAccountNumberVisibility(): void {
    this.confirmAccountNumberVisible = !this.confirmAccountNumberVisible;
  }

  saveAch(): void {
    this.achSubmitted = true;
    this.achError = '';
    if (!this.achValid || this.isSavingAch) {
      if (!this.ach.authorized && !this.routingError && !this.accountError && !this.confirmError && !this.nameError && !this.bankNameError) {
        this.achError = 'Please accept the ACH authorization.';
      }
      this.cdr.markForCheck();
      return;
    }
    this.isSavingAch = true;
    this.payRequestService.saveAch(this.token, { ...this.ach }).pipe(take(1)).subscribe({
      next: (result) => {
        this.isSavingAch = false;
        this.achResult = result;
        if (result.saved) {
          // Don't keep the numbers on the page once they're saved.
          this.ach = { ...this.ach, routingNumber: '', accountNumber: '', confirmAccountNumber: '' };
        } else {
          this.achError = result.message;
        }
        this.cdr.markForCheck();
      },
      error: (err: HttpErrorResponse) => {
        this.isSavingAch = false;
        this.achError = this.errorText(err, 'Your bank account could not be saved. Please try again.');
        this.cdr.markForCheck();
      }
    });
  }
  //#endregion

  get showBankStep(): boolean {
    return this.method === 'bank' || this.method === 'both';
  }

  onMethodChange(): void {
    this.loadCardFormIfNeeded();
  }

  /** Asks the API for a fresh Number card form; each open gets a new one, so old emails keep working. */
  loadCardFormIfNeeded(): void {
    if (!this.showCardStep || this.cardFormUrl || this.isLoadingCardForm || this.cardResult?.saved) {
      return;
    }
    this.isLoadingCardForm = true;
    this.cardFormError = '';
    this.payRequestService.createCardForm(this.token).pipe(take(1)).subscribe({
      next: (form) => {
        this.cardFormUrl = this.sanitizer.bypassSecurityTrustResourceUrl(form.formUrl);
        this.isLoadingCardForm = false;
        this.cdr.markForCheck();
      },
      error: (err: HttpErrorResponse) => {
        this.payRequestService.clearCardForm(this.token);
        this.isLoadingCardForm = false;
        this.cardFormError = this.errorText(err, 'The card form could not be loaded. Please try again.');
        this.cdr.markForCheck();
      }
    });
  }

  retryCardForm(): void {
    this.payRequestService.clearCardForm(this.token);
    this.cardFormUrl = null;
    this.cardResult = null;
    this.loadCardFormIfNeeded();
  }

  /** The pay-response page in the Number frame reports the saved result here. Only messages from that frame count. */
  handleMessage(event: MessageEvent): void {
    const fromOurFrame = !!this.numberFrame && event.source === this.numberFrame.nativeElement.contentWindow;
    if (!fromOurFrame && event.origin !== window.location.origin) {
      return;
    }
    const message = event.data as PayResponseMessage;
    if (message?.type !== PayResponseMessageType || !message.result) {
      return;
    }
    this.cardResult = message.result;
    if (message.result.saved) {
      this.cardFormUrl = null;
    }
    this.cdr.markForCheck();
  }

  errorText(err: HttpErrorResponse, fallback: string): string {
    return typeof err?.error === 'string' && err.error.trim() ? err.error : fallback;
  }
}
