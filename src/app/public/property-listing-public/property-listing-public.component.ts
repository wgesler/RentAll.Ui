import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { finalize, timeout } from 'rxjs';
import { take } from 'rxjs/operators';
import { PropertyPhotoResponse } from '../../authenticated/properties/models/property-photo.model';
import { PropertyResponse } from '../../authenticated/properties/models/property.model';
import { PropertyListingComponent } from '../../authenticated/properties/property-listing/property-listing.component';
import { PropertyListingShareService } from '../../authenticated/properties/services/property-listing-share.service';
import { MaterialModule } from '../../material.module';

@Component({
  standalone: true,
  selector: 'app-property-listing-public',
  imports: [CommonModule, MaterialModule, PropertyListingComponent],
  templateUrl: './property-listing-public.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PropertyListingPublicComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private propertyListingShareService = inject(PropertyListingShareService);
  private cdr = inject(ChangeDetectorRef);

  isLoading = true;
  property: PropertyResponse | null = null;
  photos: PropertyPhotoResponse[] = [];
  errorMessage = '';
  private loadingWatchdog?: ReturnType<typeof setTimeout>;

  private markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  ngOnInit(): void {
    this.loadingWatchdog = setTimeout(() => {
      if (this.isLoading) {
        this.property = null;
        this.photos = [];
        this.errorMessage = 'Listing request timed out. Please try again.';
        this.isLoading = false;
        this.markViewForCheck();
      }
    }, 20000);

    const token = (this.route.snapshot.paramMap.get('token') || '').trim();
    if (!token) {
      if (this.loadingWatchdog) {
        clearTimeout(this.loadingWatchdog);
      }
      this.isLoading = false;
      return;
    }

    this.propertyListingShareService.getPublicPropertyListingByToken(token).pipe(
      take(1),
      timeout(15000),
      finalize(() => {
        if (this.loadingWatchdog) {
          clearTimeout(this.loadingWatchdog);
        }
        this.isLoading = false;
        this.markViewForCheck();
      })
    ).subscribe({
      next: (response) => {
        this.property = response.property;
        this.photos = response.photos || [];
        this.errorMessage = '';
        this.markViewForCheck();
      },
      error: () => {
        this.property = null;
        this.photos = [];
        this.errorMessage = 'Listing not found, expired, or temporarily unavailable.';
        this.markViewForCheck();
      }
    });
  }
}
