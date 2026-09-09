import { CommonModule } from '@angular/common';
import { Component, NgZone, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MaterialModule } from '../../../material.module';
import { RentalComponent } from '../../leads/rental/rental.component';
import { buildMobileLeadReturnUrl } from '../mobile-nav';

@Component({
  standalone: true,
  selector: 'app-mobile-lead-rental',
  templateUrl: './mobile-lead-rental.component.html',
  styleUrls: ['../mobile-lead-form.scss'],
  imports: [CommonModule, MaterialModule, ReactiveFormsModule]
})
export class MobileLeadRentalComponent extends RentalComponent {
  private mobileRouter = inject(Router);
  private mobileNgZone = inject(NgZone);

  override navigateToQuoteCreate(quotePath: string): void {
    const queryStart = quotePath.indexOf('?');
    const queryString = queryStart >= 0 ? quotePath.slice(queryStart + 1) : '';
    const params = new URLSearchParams(queryString);
    const queryParams: Record<string, string> = {
      returnUrl: buildMobileLeadReturnUrl('rentals', this.lead?.rentalId ?? this.shellLeadId)
    };
    const propertyIds = params.get('propertyIds');
    if (propertyIds) {
      queryParams['propertyIds'] = propertyIds;
    }
    for (const key of ['qpfn', 'qem', 'qag', 'qvf', 'lrid']) {
      const value = params.get(key);
      if (value) {
        queryParams[key] = value;
      }
    }

    this.mobileNgZone.run(() => {
      void this.mobileRouter.navigate(['/mobile', 'quote-create'], { queryParams });
    });
  }
}
