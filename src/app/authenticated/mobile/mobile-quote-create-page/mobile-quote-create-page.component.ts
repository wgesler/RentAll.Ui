import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { Params, Router } from '@angular/router';
import { MaterialModule } from '../../../material.module';
import { EmailConfig } from '../../shared/base-document.component';
import { QuoteCreateComponent } from '../../properties/quote-create/quote-create.component';
import { QuoteComponent } from '../../properties/quote/quote.component';
import { resolveMobileBoardReturnUrl } from '../mobile-nav';

@Component({
  standalone: true,
  selector: 'app-mobile-quote-create-page',
  imports: [MaterialModule, ReactiveFormsModule, QuoteComponent],
  templateUrl: './mobile-quote-create-page.component.html',
  styleUrl: './mobile-quote-create-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileQuoteCreatePageComponent extends QuoteCreateComponent {
  private mobileRouter = inject(Router);
  private mobileCdr = inject(ChangeDetectorRef);

  override markViewForCheck(): void {
    super.markViewForCheck();
    this.mobileCdr.markForCheck();
  }

  backToMobile(): void {
    const returnUrl = resolveMobileBoardReturnUrl(this.mobileRouter.url);
    if (returnUrl) {
      void this.mobileRouter.navigateByUrl(returnUrl);
      return;
    }
    void this.mobileRouter.navigate(['/mobile', 'leads', 'rentals']);
  }

  override back(): void {
    this.backToMobile();
  }

  override removePropertyListing(propertyId: string): void {
    super.removePropertyListing(propertyId);
    void this.syncMobileQuoteUrl();
  }

  override async onEmail(emailConfig?: EmailConfig): Promise<void> {
    await this.syncMobileQuoteUrl();
    await super.onEmail(emailConfig);
  }

  protected override navigateToEmailCreatePage(): void {
    void this.mobileRouter.navigate(['/mobile', 'email', 'create']);
  }

  /** Keep URL propertyIds in sync so email returnUrl and back navigation do not restore removed listings. */
  private syncMobileQuoteUrl(): Promise<boolean> {
    const tree = this.mobileRouter.parseUrl(this.mobileRouter.url);
    const queryParams: Params = { ...tree.queryParams };
    const propertyIds = Array.from(new Set(
      (this.propertyIds || [])
        .map(id => String(id || '').trim())
        .filter(id => id.length > 0)
    ));

    if (propertyIds.length > 0) {
      queryParams['propertyIds'] = propertyIds.join(',');
    } else {
      queryParams['propertyIds'] = null;
    }

    return this.mobileRouter.navigate(['/mobile', 'quote-create'], {
      queryParams,
      replaceUrl: true
    });
  }
}
