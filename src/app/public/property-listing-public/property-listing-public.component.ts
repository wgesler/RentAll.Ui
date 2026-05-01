import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
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

  constructor(
    private route: ActivatedRoute,
    private propertyListingShareService: PropertyListingShareService
  ) {}

  ngOnInit(): void {
    const token = this.route.snapshot.paramMap.get('token') || '';
    if (!token) {
      this.isLoading = false;
      return;
    }

    this.propertyListingShareService.getPublicPropertyListingByToken(token).pipe(take(1)).subscribe({
      next: (response) => {
        this.property = response.property;
        this.photos = response.photos || [];
        this.isLoading = false;
      },
      error: () => {
        this.property = null;
        this.photos = [];
        this.isLoading = false;
      }
    });
  }
}
