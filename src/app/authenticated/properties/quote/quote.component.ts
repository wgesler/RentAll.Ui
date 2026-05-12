import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MaterialModule } from '../../../material.module';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { QuoteListingColumnFlags, QuoteListingRow } from '../models/quote.model';

@Component({
  standalone: true,
  selector: 'app-quote',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule, TitleBarSelectComponent],
  templateUrl: './quote.component.html',
  styleUrl: './quote.component.scss'
})
export class QuoteComponent {
  @Input() form!: FormGroup;
  @Input() officeTitleBarOptions: { value: number, label: string }[] = [];
  @Input() selectedOfficeId: number | null = null;
  @Input() isViewDisabled = false;
  @Input() officeLogoUrl: string | null = null;
  @Input() companyNameDisplay = '';
  @Input() companyAddressLine1 = '';
  @Input() companyAddressLine2 = '';
  @Input() currentUserEmail = '';
  @Input() propertyListingLinks: QuoteListingRow[] = [];
  @Input({ required: true }) listingColumnFlags!: QuoteListingColumnFlags;
  @Input() isLoadingLinks = false;

  @Output() officeIdChange = new EventEmitter<number | null>();
  @Output() listingRowsChange = new EventEmitter<void>();
  @Output() viewClick = new EventEmitter<void>();
  @Output() backClick = new EventEmitter<void>();

  onOfficeSelection(value: string | number | null): void {
    if (value === null || value === '') {
      this.officeIdChange.emit(null);
      return;
    }
    this.officeIdChange.emit(Number(value));
  }

  onRateChange(listing: QuoteListingRow, event: Event): void {
    const target = event.target as HTMLInputElement | null;
    if (!target) {
      return;
    }
    listing.price = target.value || '';
    this.listingRowsChange.emit();
  }

  onPetFeeChange(listing: QuoteListingRow, event: Event): void {
    const target = event.target as HTMLInputElement | null;
    if (!target) {
      return;
    }
    listing.petFee = target.value || '';
    this.listingRowsChange.emit();
  }

  onDepartureFeeChange(listing: QuoteListingRow, event: Event): void {
    const target = event.target as HTMLInputElement | null;
    if (!target) {
      return;
    }
    listing.departureFee = target.value || '';
    this.listingRowsChange.emit();
  }

  onMaidServiceFeeChange(listing: QuoteListingRow, event: Event): void {
    const target = event.target as HTMLInputElement | null;
    if (!target) {
      return;
    }
    listing.maidServiceFee = target.value || '';
    this.listingRowsChange.emit();
  }

  openListing(url: string, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    const normalizedUrl = String(url || '').trim();
    if (!normalizedUrl) {
      return;
    }
    window.open(normalizedUrl, '_blank', 'noopener,noreferrer');
  }
}
