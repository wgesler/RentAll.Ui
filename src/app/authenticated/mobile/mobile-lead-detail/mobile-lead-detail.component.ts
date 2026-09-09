import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { MaterialModule } from '../../../material.module';
import { CommonMessage } from '../../../enums/common-message.enum';
import { GeneralLeadFormClosed } from '../../leads/general/general.component';
import { OwnerLeadFormClosed } from '../../leads/owner/owner.component';
import { PartnerLeadFormClosed } from '../../leads/partner/partner.component';
import { RentalLeadFormClosed } from '../../leads/rental/rental.component';
import { MobileLeadGeneralComponent } from '../mobile-lead-general/mobile-lead-general.component';
import { MobileLeadOwnerComponent } from '../mobile-lead-owner/mobile-lead-owner.component';
import { MobileLeadPartnerComponent } from '../mobile-lead-partner/mobile-lead-partner.component';
import { MobileLeadRentalComponent } from '../mobile-lead-rental/mobile-lead-rental.component';

@Component({
  standalone: true,
  selector: 'app-mobile-lead-detail',
  imports: [
    MaterialModule,
    MobileLeadRentalComponent,
    MobileLeadOwnerComponent,
    MobileLeadGeneralComponent,
    MobileLeadPartnerComponent
  ],
  templateUrl: './mobile-lead-detail.component.html',
  styleUrl: './mobile-lead-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileLeadDetailComponent implements OnChanges {
  @Input() tabPath = 'rentals';
  @Input() leadId = '';
  @Input() officeId: number | null = null;
  @Output() closed = new EventEmitter<void>();

  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);

  shellLeadId: string | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['leadId']) {
      this.shellLeadId = this.leadId.trim() || null;
      this.markViewForCheck();
    }
  }

  onRentalClosed(event: RentalLeadFormClosed): void {
    if (event.saved) {
      this.closed.emit();
    }
  }

  onOwnerClosed(event: OwnerLeadFormClosed): void {
    if (event.saved) {
      this.closed.emit();
    }
  }

  onGeneralClosed(event: GeneralLeadFormClosed): void {
    if (event.saved) {
      this.closed.emit();
    }
  }

  onPartnerClosed(event: PartnerLeadFormClosed): void {
    if (event.saved) {
      this.closed.emit();
    }
  }

  onOfficeSelectionRequired(): void {
    this.toastr.error('Select a specific office before saving.', CommonMessage.Error);
  }

  markViewForCheck(): void {
    this.cdr.markForCheck();
  }
}
