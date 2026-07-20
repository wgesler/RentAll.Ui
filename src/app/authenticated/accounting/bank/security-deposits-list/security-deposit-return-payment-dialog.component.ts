import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../../material.module';
import { FormatterService } from '../../../../services/formatter-service';
import { MappingService } from '../../../../services/mapping.service';
import { UtilityService } from '../../../../services/utility.service';
import { AccountingOfficeResponse } from '../../../organizations/models/accounting-office.model';
import { BankCardResponse } from '../../../organizations/models/bank.model';
import { AccountingOfficeService } from '../../../organizations/services/accounting-office.service';
import { ChartOfAccountResponse } from '../../models/chart-of-accounts.model';
import { AccountType, PaymentType, PaymentTypeLabels } from '../../models/accounting-enum';
import { ChartOfAccountsService } from '../../services/chart-of-accounts.service';
import { SecurityDepositReturnPaymentSubmit } from './security-deposit-return-payment-dialog.model';

@Component({
  selector: 'app-security-deposit-return-payment-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MaterialModule],
  templateUrl: './security-deposit-return-payment-dialog.component.html',
  styleUrl: './security-deposit-return-payment-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SecurityDepositReturnPaymentDialogComponent implements OnInit, OnChanges, OnDestroy {

  @Input() visible = false;
  @Input() dialogMode: 'return' | 'transfer' = 'return';
  @Input() officeId: number | null = null;
  @Input() reservationId: string | null = null;
  @Input() initialAmount = 0;
  @Input() initialDescription = '';
  @Input() isSubmitting = false;

  @Output() cancelEvent = new EventEmitter<void>();
  @Output() submitEvent = new EventEmitter<SecurityDepositReturnPaymentSubmit>();

  private accountingOfficeService = inject(AccountingOfficeService);
  private chartOfAccountsService = inject(ChartOfAccountsService);
  private mappingService = inject(MappingService);
  private formatter = inject(FormatterService);
  private utilityService = inject(UtilityService);
  private cdr = inject(ChangeDetectorRef);

  readonly paymentTypeOptions = PaymentTypeLabels;

  selectedPaymentTypeId = PaymentType.Check;
  selectedPaymentChartOfAccountId: number | null = null;
  selectedPaymentCreditCardId: number | null = null;
  paymentDate: Date | null = new Date();
  paymentAmount = 0;
  paymentAmountDisplay = '$0.00';
  paymentDescription = '';
  paymentChartOfAccounts: Array<{ value: number; label: string }> = [];
  paymentCreditCardOptions: Array<{ value: number; label: string; chartOfAccountId: number }> = [];
  accountingOffices: AccountingOfficeResponse[] = [];
  allChartOfAccounts: ChartOfAccountResponse[] = [];

  private destroy$ = new Subject<void>();

  //#region Security Deposit Return Payment Dialog
  ngOnInit(): void {
    this.loadAccountingOffices();
    this.loadChartOfAccounts();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']?.currentValue === true || changes['initialAmount'] || changes['initialDescription'] || changes['officeId'] || changes['reservationId'] || changes['dialogMode']) {
      if (this.visible) {
        this.initializeFormFromInputs();
      }
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  //#endregion

  //#region Data Load Methods
  loadAccountingOffices(): void {
    this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.accountingOfficeService.getAllAccountingOffices().pipe(takeUntil(this.destroy$)).subscribe(accountingOffices => {
          this.accountingOffices = accountingOffices || [];
          this.refreshPaymentCreditCardOptionsForOffice();
          this.markViewForCheck();
        });
      },
      error: () => {
        this.accountingOffices = [];
        this.markViewForCheck();
      }
    });
  }

  loadChartOfAccounts(): void {
    this.chartOfAccountsService.ensureChartOfAccountsLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.chartOfAccountsService.getAllChartOfAccounts().pipe(takeUntil(this.destroy$)).subscribe(accounts => {
          this.allChartOfAccounts = accounts || [];
          this.refreshPaymentChartOfAccountsForOffice();
          this.markViewForCheck();
        });
      },
      error: () => {
        this.allChartOfAccounts = [];
        this.markViewForCheck();
      }
    });
  }

  initializeFormFromInputs(): void {
    this.paymentDate = this.paymentDate ?? new Date();
    this.selectedPaymentTypeId = PaymentType.Check;
    this.paymentDescription = String(this.initialDescription || '').trim();
    this.paymentAmount = this.roundCurrencyValue(Number(this.initialAmount ?? 0));
    this.paymentAmountDisplay = this.formatPaymentAmountDisplay(this.paymentAmount);
    this.refreshPaymentChartOfAccountsForOffice();
    this.refreshPaymentCreditCardOptionsForOffice();
    this.applyDefaultBusinessBankSelection();
    this.markViewForCheck();
  }
  //#endregion

  //#region Form Response Methods
  cancel(): void {
    this.resetForm();
    this.cancelEvent.emit();
  }

  submit(): void {
    const reservationId = String(this.reservationId || '').trim();
    if (!reservationId) {
      return;
    }

    const chartOfAccountId = this.resolveSelectedPaymentChartOfAccountId();
    if (!chartOfAccountId) {
      return;
    }

    const paymentDate = this.utilityService.toDateOnlyJsonString(this.paymentDate);
    if (!paymentDate || this.paymentAmount === 0) {
      return;
    }

    this.submitEvent.emit({
      reservationId,
      paymentDate,
      chartOfAccountId,
      paymentTypeId: this.selectedPaymentTypeId,
      description: (this.paymentDescription || '').trim(),
      amount: this.paymentAmount
    });
  }
  //#endregion

  //#region Payment Methods
  get isCreditCardPaymentTypeSelected(): boolean {
    return Number(this.selectedPaymentTypeId) === PaymentType.CreditCard;
  }

  get isPaymentFormValid(): boolean {
    const hasPaymentDate = this.utilityService.toDateOnlyJsonString(this.paymentDate) !== null;
    const hasPaymentAccount = this.resolveSelectedPaymentChartOfAccountId() != null;
    const hasReservation = String(this.reservationId || '').trim().length > 0;
    return hasReservation && hasPaymentDate && hasPaymentAccount && this.paymentAmount !== 0;
  }

  get isTransferMode(): boolean {
    return this.dialogMode === 'transfer';
  }

  get bankAccountLabel(): string {
    return this.isTransferMode ? 'Business Bank' : 'Bank';
  }

  applyDefaultBusinessBankSelection(): void {
    if (!this.isTransferMode || !this.officeId) {
      return;
    }

    const office = (this.accountingOffices || []).find(item => Number(item.officeId) === Number(this.officeId)) || null;
    const defaultBankAccountId = Number(office?.defaultBankAccountId ?? 0);
    if (!Number.isFinite(defaultBankAccountId) || defaultBankAccountId <= 0) {
      return;
    }

    if (this.paymentChartOfAccounts.some(account => account.value === defaultBankAccountId)) {
      this.selectedPaymentChartOfAccountId = defaultBankAccountId;
    }
  }

  refreshPaymentChartOfAccountsForOffice(): void {
    const officeId = this.officeId;
    if (!officeId) {
      this.paymentChartOfAccounts = [];
      this.selectedPaymentChartOfAccountId = null;
      return;
    }

    this.paymentChartOfAccounts = this.allChartOfAccounts
      .filter(account => account.officeId === officeId)
      .filter(account => Number(account.accountTypeId) === AccountType.Bank)
      .sort((left, right) =>
        this.utilityService.getChartOfAccountDropdownLabel(left).localeCompare(
          this.utilityService.getChartOfAccountDropdownLabel(right),
          undefined,
          { sensitivity: 'base' }
        )
      )
      .map(account => ({
        value: Number(account.accountId),
        label: this.utilityService.getChartOfAccountDropdownLabel(account)
      }));

    if (this.paymentChartOfAccounts.length > 0) {
      const hasValidSelection =
        this.selectedPaymentChartOfAccountId != null &&
        this.paymentChartOfAccounts.some(account => account.value === this.selectedPaymentChartOfAccountId);

      if (!hasValidSelection) {
        this.selectedPaymentChartOfAccountId = this.paymentChartOfAccounts[0].value;
      }
    } else {
      this.selectedPaymentChartOfAccountId = null;
    }

    this.applyDefaultBusinessBankSelection();
  }

  refreshPaymentCreditCardOptionsForOffice(): void {
    const officeId = this.officeId;
    const options = new Map<number, { value: number; label: string; chartOfAccountId: number }>();

    if (officeId && Number.isFinite(Number(officeId)) && Number(officeId) > 0) {
      const office = (this.accountingOffices || []).find(item => Number(item.officeId) === Number(officeId)) || null;
      const mappedCards = this.mappingService.mapBankCardsFromResponse(office?.bankCards as BankCardResponse[]);
      mappedCards.forEach(card => {
        const bankCardId = Number(card.bankCardId ?? 0);
        const chartOfAccountId = Number(card.chartOfAccountId ?? 0);
        if (!Number.isFinite(bankCardId) || bankCardId <= 0 || !Number.isFinite(chartOfAccountId) || chartOfAccountId <= 0) {
          return;
        }
        if (!options.has(bankCardId)) {
          options.set(bankCardId, {
            value: bankCardId,
            label: this.toBankCardOptionLabel(card),
            chartOfAccountId
          });
        }
      });
    }

    this.paymentCreditCardOptions = Array.from(options.values());
    const hasValidSelection =
      this.selectedPaymentCreditCardId != null &&
      this.paymentCreditCardOptions.some(option => option.value === this.selectedPaymentCreditCardId);

    if (!hasValidSelection) {
      this.selectedPaymentCreditCardId = this.paymentCreditCardOptions[0]?.value ?? null;
    }
  }

  onPaymentTypeChange(paymentTypeId: number): void {
    this.selectedPaymentTypeId = Number(paymentTypeId);
    if (this.isCreditCardPaymentTypeSelected) {
      this.refreshPaymentCreditCardOptionsForOffice();
    }
  }

  onPaymentChartOfAccountChange(accountId: number | null): void {
    this.selectedPaymentChartOfAccountId = accountId;
  }

  resolveSelectedPaymentChartOfAccountId(): number | null {
    if (this.isCreditCardPaymentTypeSelected) {
      const selectedCard = this.paymentCreditCardOptions.find(option => option.value === this.selectedPaymentCreditCardId) || null;
      return selectedCard?.chartOfAccountId ?? null;
    }
    return this.selectedPaymentChartOfAccountId ?? null;
  }

  onPaymentAmountInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/[^0-9.-]/g, '');
    const hasLeadingMinus = value.startsWith('-');
    const unsignedValue = value.replace(/-/g, '');
    const normalizedValue = hasLeadingMinus ? `-${unsignedValue}` : unsignedValue;
    const parts = normalizedValue.split('.');
    input.value = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : normalizedValue;
    this.paymentAmountDisplay = input.value;

    const parsed = parseFloat(input.value.replace(/[^0-9.-]/g, '').trim());
    this.paymentAmount = isNaN(parsed) ? 0 : parsed;
  }

  onPaymentAmountBlur(event: Event): void {
    const input = event.target as HTMLInputElement;
    const rawValue = input.value.replace(/[^0-9.-]/g, '').trim();
    const parsed = rawValue ? parseFloat(rawValue) : NaN;
    this.paymentAmount = isNaN(parsed) ? 0 : parsed;
    this.paymentAmountDisplay = this.formatPaymentAmountDisplay(this.paymentAmount);
    input.value = this.paymentAmountDisplay;
  }

  onPaymentAmountFocus(event: Event): void {
    const input = event.target as HTMLInputElement;
    input.value = this.paymentAmount.toString();
    input.select();
  }

  onPaymentAmountEnter(event: Event): void {
    const input = event.target as HTMLInputElement;
    input.blur();
  }

  resetForm(): void {
    this.paymentDate = new Date();
    this.paymentAmount = 0;
    this.paymentAmountDisplay = '$' + this.formatter.currency(0);
    this.paymentDescription = '';
    this.selectedPaymentTypeId = PaymentType.Check;
    this.selectedPaymentChartOfAccountId = null;
    this.selectedPaymentCreditCardId = null;
  }

  formatPaymentAmountDisplay(amount: number): string {
    return amount < 0
      ? '-$' + this.formatter.currency(-amount)
      : '$' + this.formatter.currency(amount);
  }

  roundCurrencyValue(amount: number): number {
    if (!isFinite(amount)) {
      return 0;
    }
    return Math.round(amount * 100) / 100;
  }

  toBankCardOptionLabel(card: { bankName?: string | null; cardNumber?: string | null; cardName?: string | null }): string {
    const bankName = String(card.bankName || '').trim();
    const cardName = String(card.cardName || '').trim();
    const cardNumber = String(card.cardNumber || '').trim();
    const lastFour = cardNumber.length >= 4 ? cardNumber.slice(-4) : cardNumber;
    if (bankName && lastFour) {
      return `${bankName} •••• ${lastFour}`;
    }
    if (cardName) {
      return cardName;
    }
    return bankName || lastFour || 'Credit Card';
  }
  //#endregion

  //#region Utility Methods
  markViewForCheck(): void {
    this.cdr.markForCheck();
  }
  //#endregion
}
