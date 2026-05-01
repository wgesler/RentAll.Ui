import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
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
  templateUrl: './property-listing-public.component.html'
})
export class PropertyListingPublicComponent implements OnInit {
  isLoading = true;
  property: PropertyResponse | null = null;
  photos: PropertyPhotoResponse[] = [];
  errorMessage = '';
  private loadingWatchdog?: ReturnType<typeof setTimeout>;

  constructor(
    private route: ActivatedRoute,
    private propertyListingShareService: PropertyListingShareService
  ) {}

  ngOnInit(): void {
    this.loadingWatchdog = setTimeout(() => {
      if (this.isLoading) {
        this.property = null;
        this.photos = [];
        this.errorMessage = 'Listing request timed out. Please try again.';
        this.isLoading = false;
      }
    }, 20000);

    const token = this.route.snapshot.paramMap.get('token') || '';
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
      })
    ).subscribe({
      next: (response) => {
        this.property = response.property;
        this.photos = response.photos || [];
        this.errorMessage = '';
      },
      error: () => {
        this.property = null;
        this.photos = [];
        this.errorMessage = 'Listing not found, expired, or temporarily unavailable.';
      }
    });
  }
}
