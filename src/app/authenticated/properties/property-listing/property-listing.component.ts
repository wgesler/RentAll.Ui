import { CommonModule } from '@angular/common';
import { AfterViewChecked, Component, ElementRef, Input, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
import { CdkDragDrop, CdkDragMove, DragDropModule } from '@angular/cdk/drag-drop';
import { getCheckInTime, getCheckOutTime, getPropertyStatus, getPropertyStyle, getPropertyType } from '../models/property-enums';
import { PropertyPhotoRequest, PropertyPhotoResponse } from '../models/property-photo.model';
import { PropertyResponse } from '../models/property.model';
import { PropertyListingShareService } from '../services/property-listing-share.service';
import { PropertyPhotoService } from '../services/property-photo.service';
import { MaterialModule } from '../../../material.module';
import { FormatterService } from '../../../services/formatter-service';
import { FileDetails } from '../../../shared/models/fileDetails';
import { Clipboard } from '@angular/cdk/clipboard';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage } from '../../../enums/common-message.enum';
import { UtilityService } from '../../../services/utility.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MatDialog } from '@angular/material/dialog';
import { ImageViewDialogComponent } from '../../shared/modals/image-view-dialog/image-view-dialog.component';

interface ListingPhotoItem {
  id: string;
  order: number;
  fileDetails: FileDetails | null;
  photoPath?: string;
}

interface ListingHighlightItem {
  icon: string;
  label: string;
  value: string;
}

interface ListingAmenityIconItem {
  icon: string;
  label: string;
}

@Component({
  standalone: true,
  selector: 'app-property-listing',
  imports: [CommonModule, MaterialModule, DragDropModule],
  templateUrl: './property-listing.component.html',
  styleUrl: './property-listing.component.scss'
})
export class PropertyListingComponent implements OnChanges, AfterViewChecked {
  @Input() propertyId: string | null = null;
  @Input() officeId: number | null = null;
  @Input() propertyCode: string | null = null;
  @Input() property: PropertyResponse | null = null;
  @Input() isReadOnly = false;
  @Input() disablePhotoApiLoad = false;
  @Input() initialPhotos: PropertyPhotoResponse[] | null = null;
  @Input() hideRateCard = false;

  listingPhotos: ListingPhotoItem[] = [];
  isUploadingPhotos = false;
  isReorderingPhotos = false;
  isDraggingPhoto = false;
  draggingPhotoId: string | null = null;
  dropIndicatorPhotoId: string | null = null;
  dropIndicatorSide: 'left' | 'right' | null = null;
  listingDescriptionExpanded = false;
  descriptionHasOverflow = false;
  listingDescriptionHtmlValue = '';
  listingContentSafeHtml: SafeHtml = '';
  listingAmenitiesHtmlValue = '';
  pendingDescriptionOverflowCheck = false;
  @ViewChild('photoUploadInput') photoUploadInput?: ElementRef<HTMLInputElement>;
  @ViewChild('descriptionContent') descriptionContent?: ElementRef<HTMLElement>;

  constructor(
    private formatter: FormatterService,
    private propertyPhotoService: PropertyPhotoService,
    private propertyListingShareService: PropertyListingShareService,
    private clipboard: Clipboard,
    private toastr: ToastrService,
    private utilityService: UtilityService,
    private sanitizer: DomSanitizer,
    private dialog: MatDialog
  ) {}

  //#region Property Listing
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['property']) {
      this.listingDescriptionExpanded = false;
      this.descriptionHasOverflow = false;
      this.pendingDescriptionOverflowCheck = true;
      this.refreshListingDescriptionHtml();
      this.refreshListingAmenitiesHtml();
      this.queueDescriptionOverflowCheck();
    }

    if (changes['initialPhotos']) {
      this.applyInitialPhotos();
    }

    if ((changes['property'] || changes['propertyId']) && !this.disablePhotoApiLoad) {
      this.loadPropertyPhotos();
    }
  }

  ngAfterViewChecked(): void {
    if (this.pendingDescriptionOverflowCheck && !this.listingDescriptionExpanded) {
      this.updateDescriptionOverflow();
    }
  }
  //#endregion

  //#region Get Methods
  get listingHeaderTitle(): string {
    return this.propertyCode || this.property?.propertyCode || 'Property Listing';
  }

  get listingAddressLine(): string {
    if (!this.property) return '';
    const line1 = [this.property.address1, this.property.address2].map(v => (v || '').trim()).filter(Boolean).join(', ');
    const line2 = [this.property.city, this.property.state, this.property.zip].map(v => (v || '').trim()).filter(Boolean).join(', ');
    return [line1, line2].filter(Boolean).join(' | ');
  }

  get listingDescriptionText(): string {
    if (this.property?.description?.trim()) {
      return this.property.description.trim();
    }

    const type = this.listingPropertyType || 'home';
    const neighborhood = this.property?.neighborhood?.trim();
    const city = this.property?.city?.trim();
    const addressRef = this.property?.address1?.trim();
    const parts = [
      `This ${type.toLowerCase()} offers a comfortable stay`,
      neighborhood ? `in ${neighborhood}` : '',
      city ? `in ${city}` : '',
      addressRef ? `near ${addressRef}` : ''
    ].filter(Boolean);
    return `${parts.join(' ')}.`;
  }

  get hasRichDescription(): boolean {
    const value = this.property?.description?.trim() || '';
    return /<[^>]+>/.test(value);
  }

  get listingDescriptionHtml(): string {
    return this.listingDescriptionHtmlValue;
  }

  get listingDescriptionHtmlPreview(): string {
    return this.listingDescriptionHtml;
  }

  get listingContentHtmlDisplay(): SafeHtml {
    return this.listingContentSafeHtml;
  }

  get listingDescriptionShort(): string {
    const full = this.listingDescriptionText;
    if (full.length <= 280) {
      return full;
    }
    return `${full.slice(0, 280).trim()}...`;
  }

  get shouldShowDescriptionToggle(): boolean {
    return this.descriptionHasOverflow;
  }

  get listingPropertyType(): string {
    return getPropertyType(this.property?.propertyTypeId);
  }

  get listingPropertyStyle(): string {
    return getPropertyStyle(this.property?.propertyStyleId);
  }

  get listingPropertyStatus(): string {
    return getPropertyStatus(this.property?.propertyStatusId);
  }

  get listingCheckInTime(): string {
    return getCheckInTime(this.property?.checkInTimeId);
  }

  get listingCheckOutTime(): string {
    return getCheckOutTime(this.property?.checkOutTimeId);
  }

  get listingFeatureBadges(): string[] {
    if (!this.property) return [];
    const features: string[] = [];
    if (this.property.fastInternet) features.push('Fast Internet');
    if (this.property.parking) features.push('Parking');
    if (this.property.washerDryerInUnit) features.push('Washer/Dryer In Unit');
    if (this.property.washerDryerInBldg) features.push('Washer/Dryer In Building');
    if (this.property.commonPool) features.push('Common Pool');
    if (this.property.privatePool) features.push('Private Pool');
    if (this.property.gym) features.push('Gym');
    if (this.property.security) features.push('Security');
    if (this.property.gated) features.push('Gated');
    return features;
  }

  get highlightColumnOne(): ListingHighlightItem[] {
    if (!this.property) return [];

    return [
      { icon: 'hotel', label: 'Bedrooms', value: String(this.property.bedrooms ?? '-') },
      { icon: 'bathtub', label: 'Bathrooms', value: String(this.property.bathrooms ?? '-') },
      { icon: 'straighten', label: 'Square Feet', value: String(this.property.squareFeet ?? '-') },
      { icon: 'apartment', label: 'Property Type', value: this.listingPropertyType || '-' }
    ];
  }

  get highlightColumnTwo(): ListingHighlightItem[] {
    if (!this.property) return [];

    return [
      { icon: 'night_shelter', label: 'Minimum Stay', value: `${this.property.minStay || 0} Day(s)` },
      { icon: 'stairs', label: 'Entry Floor', value: String(this.property.unitLevel ?? '-') },
      { icon: 'pets', label: 'Pets', value: this.property.petsAllowed ? 'Yes' : 'No' },
      { icon: 'smoke_free', label: 'Smoking', value: this.property.smoking ? 'Yes' : 'No' },
      { icon: 'local_parking', label: 'Parking', value: this.property.parking ? 'Yes' : 'No' }
    ];
  }

  get hasAmenitiesText(): boolean {
    return !!this.listingAmenitiesHtmlValue.trim();
  }

  get listingAmenityIconItems(): ListingAmenityIconItem[] {
    if (!this.property) {
      return [];
    }

    const washerDryerLabel = this.property.washerDryerInUnit
      ? 'Washer/Dryer In Unit'
      : (this.property.washerDryerInBldg ? 'Washer/Dryer In Building' : '');

    return [
      { icon: 'local_laundry_service', label: washerDryerLabel, enabled: !!washerDryerLabel },
      { icon: 'fitness_center', label: 'Gym', enabled: this.property.gym },
      { icon: 'spa', label: 'Sauna', enabled: this.property.sauna },
      { icon: 'hot_tub', label: 'Jacuzzi', enabled: this.property.jacuzzi },
      { icon: 'pool', label: 'Private Pool', enabled: this.property.privatePool },
      { icon: 'pool', label: 'Common Pool', enabled: this.property.commonPool },
      { icon: 'deck', label: 'Deck', enabled: this.property.deck },
      { icon: 'table_restaurant', label: 'Patio', enabled: this.property.patio },
      { icon: 'grass', label: 'Yard', enabled: this.property.yard },
      { icon: 'local_florist', label: 'Garden', enabled: this.property.garden }
    ].filter(item => item.enabled).map(item => ({ icon: item.icon, label: item.label }));
  }

  get hasAmenitiesContent(): boolean {
    return this.listingAmenityIconItems.length > 0;
  }

  get listingViews(): string[] {
    if (!this.property) return [];
    return this.splitList(this.property.view);
  }

  get listingPrimaryRate(): string {
    const primaryAmount = this.isMonthlyRateZero
      ? Number(this.property?.dailyRate || 0)
      : Number(this.property?.monthlyRate || 0);
    return `$${this.formatter.currency(primaryAmount)}`;
  }

  get listingDailyRate(): string {
    return `$${this.formatter.currency(Number(this.property?.dailyRate || 0))}`;
  }

  get listingPrimaryRateLabel(): string {
    return this.isMonthlyRateZero ? 'Daily Rate:' : 'Monthly';
  }

  get showSecondaryDailyRate(): boolean {
    return !this.isMonthlyRateZero;
  }

  get isMonthlyRateZero(): boolean {
    return Number(this.property?.monthlyRate || 0) === 0;
  }

  get listingSizeLine(): string {
    if (!this.property) return '';
    return `${this.property.bedrooms}/${this.property.bathrooms} | Sleeps ${this.property.accomodates} | ${this.property.squareFeet} sq ft`;
  }
   
  getAmenityIcon(amenity: string): string {
    const value = (amenity || '').toLowerCase();
    if (value.includes('washer') || value.includes('dryer') || value.includes('laundry')) return 'local_laundry_service';
    if (value.includes('gym') || value.includes('fitness')) return 'fitness_center';
    if (value.includes('sauna')) return 'spa';
    if (value.includes('jacuzzi') || value.includes('hot tub')) return 'hot_tub';
    if (value.includes('pool')) return 'pool';
    if (value.includes('deck')) return 'deck';
    if (value.includes('patio')) return 'table_restaurant';
    if (value.includes('yard')) return 'grass';
    if (value.includes('garden')) return 'local_florist';
    if (value.includes('parking') || value.includes('garage')) return 'local_parking';
    if (value.includes('elevator')) return 'elevator';
    if (value.includes('air conditioning') || value === 'ac') return 'ac_unit';
    if (value.includes('wifi') || value.includes('internet')) return 'wifi';
    if (value.includes('kitchen')) return 'kitchen';
    if (value.includes('security') || value.includes('gated')) return 'security';
    return 'check_circle';
  }
  //#endregion

  //#region Expandable Description
  toggleDescriptionExpanded(): void {
    this.listingDescriptionExpanded = !this.listingDescriptionExpanded;
    this.queueDescriptionOverflowCheck();
  }

  queueDescriptionOverflowCheck(): void {
    this.pendingDescriptionOverflowCheck = true;
    setTimeout(() => {
      this.updateDescriptionOverflow();
    });
  }

  updateDescriptionOverflow(): void {
    const content = this.descriptionContent?.nativeElement;
    if (!content) {
      this.pendingDescriptionOverflowCheck = true;
      return;
    }

    if (this.listingDescriptionExpanded) {
      this.pendingDescriptionOverflowCheck = false;
      return;
    }

    if (content.offsetParent === null || content.clientHeight === 0) {
      this.pendingDescriptionOverflowCheck = true;
      return;
    }

    this.descriptionHasOverflow = (content.scrollHeight - content.clientHeight) > 1;
    this.pendingDescriptionOverflowCheck = false;
  }

  splitList(raw: string | null | undefined): string[] {
    if (!raw) {
      return [];
    }
    return raw
      .split(/\r?\n|,|;/)
      .map(v => v.trim())
      .filter(Boolean);
  }

  refreshListingDescriptionHtml(): void {
    this.listingDescriptionHtmlValue = this.property?.description?.trim() || '';
    this.rebuildListingContentHtml();
  }

  refreshListingAmenitiesHtml(): void {
    this.listingAmenitiesHtmlValue = this.property?.amenities?.trim() || '';
    this.rebuildListingContentHtml();
  }

  rebuildListingContentHtml(): void {
    const hasDescriptionHtml = /<[^>]+>/.test(this.listingDescriptionHtmlValue);
    const descriptionHtml = hasDescriptionHtml
      ? this.listingDescriptionHtmlValue
      : this.escapeHtml(this.listingDescriptionText).replace(/\r?\n/g, '<br>');
    const amenitiesSection = this.hasAmenitiesText
      ? `<div class="listing-amenities-heading"><strong>Amenities</strong></div>${this.listingAmenitiesHtmlValue}`
      : '';
    const combined = [descriptionHtml, amenitiesSection].filter(Boolean).join('<div class="listing-content-separator"></div>');
    this.listingContentSafeHtml = this.sanitizer.bypassSecurityTrustHtml(combined);
  }

  escapeHtml(value: string): string {
    return (value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  //#endregion

  //#region Photo Support
  openPhotoPicker(): void {
    if (this.isReadOnly) {
      return;
    }

    this.photoUploadInput?.nativeElement.click();
  }

  async onPhotosSelected(event: Event): Promise<void> {
    if (this.isReadOnly) {
      return;
    }

    const input = event.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    if (files.length === 0) {
      return;
    }

    this.isUploadingPhotos = true;
    try {
      const activePropertyId = this.property?.propertyId || this.propertyId;
      if (!activePropertyId) {
        return;
      }

      for (const file of files) {
        const fileDetails = await this.createOptimizedPhotoDetails(file);
        const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        this.listingPhotos.push({
          id: tempId,
          order: this.listingPhotos.length,
          fileDetails
        });

        const request: PropertyPhotoRequest = {
          order: this.listingPhotos.length - 1,
          fileDetails
        };

        let response: PropertyPhotoResponse | null = null;
        try {
          response = await firstValueFrom(this.propertyPhotoService.addPropertyPhoto(activePropertyId, request));
        } catch {
          response = null;
        }

        if (!response?.photoId) {
          continue;
        }

        this.listingPhotos = this.listingPhotos.map(photo =>
          photo.id === tempId
            ? { ...photo, id: String(response.photoId), order: response.order ?? photo.order }
            : photo
        );
        this.normalizeInMemoryPhotoOrder();
      }
    } finally {
      this.isUploadingPhotos = false;
      input.value = '';
    }
  }

  removePhoto(photoId: string): void {
    if (this.isReadOnly) {
      return;
    }

    const parsedPhotoId = this.parsePersistedPhotoId(photoId);
    if (parsedPhotoId === null) {
      this.listingPhotos = this.listingPhotos.filter(p => p.id !== photoId);
      this.normalizeInMemoryPhotoOrder();
      return;
    }

    this.propertyPhotoService.deletePropertyPhotoById(parsedPhotoId).pipe(take(1)).subscribe({
      next: () => {
        this.listingPhotos = this.listingPhotos.filter(p => p.id !== photoId);
        this.normalizeInMemoryPhotoOrder();
      },
      error: () => {
        this.toastr.error('Unable to delete photo.', CommonMessage.Error);
      }
    });
  }

  async onPhotoDrop(event: CdkDragDrop<ListingPhotoItem[]>): Promise<void> {
    const indicatorPhotoId = this.dropIndicatorPhotoId;
    const indicatorSide = this.dropIndicatorSide;
    this.clearDropIndicator();
    if (this.isReadOnly || this.isReorderingPhotos) {
      return;
    }
    const draggedPhotoId = event.item?.data?.id ? String(event.item.data.id) : null;
    if (!draggedPhotoId) {
      return;
    }

    const sourceIndex = this.listingPhotos.findIndex(photo => photo.id === draggedPhotoId);
    if (sourceIndex < 0) {
      return;
    }

    const previousOrder = this.listingPhotos.map(photo => ({ ...photo }));
    const nextPhotos = this.listingPhotos.map(photo => ({ ...photo }));
    const [movedPhotoItem] = nextPhotos.splice(sourceIndex, 1);

    if (!indicatorPhotoId || !indicatorSide) {
      return;
    }
    const hoveredIndexInReduced = nextPhotos.findIndex(photo => photo.id === indicatorPhotoId);
    if (hoveredIndexInReduced < 0) {
      return;
    }
    let insertionIndex = hoveredIndexInReduced + (indicatorSide === 'right' ? 1 : 0);

    insertionIndex = Math.max(0, Math.min(insertionIndex, nextPhotos.length));
    nextPhotos.splice(insertionIndex, 0, movedPhotoItem);

    if (nextPhotos.length !== this.listingPhotos.length) {
      this.toastr.error('Unable to reorder photos.', CommonMessage.Error);
      return;
    }

    if (sourceIndex === insertionIndex) {
      return;
    }

    this.listingPhotos = nextPhotos;
    this.normalizeInMemoryPhotoOrder();

    const movedPhoto = this.listingPhotos.find(photo => photo.id === draggedPhotoId);
    const movedPhotoId = this.parsePersistedPhotoId(movedPhoto?.id);
    if (movedPhotoId === null) {
      return;
    }

    const startIndex = Math.min(sourceIndex, insertionIndex);
    const endIndex = Math.max(sourceIndex, insertionIndex);

    this.isReorderingPhotos = true;
    try {
      const tempOrder = 1000000 + movedPhoto.order;
      await firstValueFrom(this.propertyPhotoService.updatePropertyPhotoOrder({
        photoId: movedPhotoId,
        order: tempOrder
      }));

      if (sourceIndex < insertionIndex) {
        for (let index = startIndex; index <= endIndex; index++) {
          const photo = this.listingPhotos[index];
          if (!photo || photo.id === movedPhoto.id) {
            continue;
          }
          const photoId = this.parsePersistedPhotoId(photo.id);
          if (photoId === null) {
            continue;
          }
          await firstValueFrom(this.propertyPhotoService.updatePropertyPhotoOrder({
            photoId,
            order: photo.order
          }));
        }
      } else {
        for (let index = endIndex; index >= startIndex; index--) {
          const photo = this.listingPhotos[index];
          if (!photo || photo.id === movedPhoto.id) {
            continue;
          }
          const photoId = this.parsePersistedPhotoId(photo.id);
          if (photoId === null) {
            continue;
          }
          await firstValueFrom(this.propertyPhotoService.updatePropertyPhotoOrder({
            photoId,
            order: photo.order
          }));
        }
      }

      await firstValueFrom(this.propertyPhotoService.updatePropertyPhotoOrder({
        photoId: movedPhotoId,
        order: movedPhoto.order
      }));
    } catch {
      this.listingPhotos = previousOrder;
      this.normalizeInMemoryPhotoOrder();
      this.toastr.error('Unable to reorder photos.', CommonMessage.Error);
    } finally {
      this.isReorderingPhotos = false;
    }
  }

  onPhotoDragMoved(event: CdkDragMove<ListingPhotoItem>): void {
    if (this.isReadOnly || this.isReorderingPhotos) {
      this.clearDropIndicator();
      return;
    }

    const pointer = event.pointerPosition;
    const target = document.elementFromPoint(pointer.x, pointer.y) as HTMLElement | null;
    const targetCard = target?.closest('.listing-photo-card') as HTMLElement | null;
    const targetPhotoId = targetCard?.getAttribute('data-photo-id');
    if (!targetCard || !targetPhotoId) {
      this.clearDropIndicator();
      return;
    }

    const draggingPhotoId = event.source.data?.id ? String(event.source.data.id) : null;
    if (draggingPhotoId && targetPhotoId === draggingPhotoId) {
      this.clearDropIndicator();
      return;
    }

    const rect = targetCard.getBoundingClientRect();
    const midpoint = rect.left + (rect.width / 2);
    const side: 'left' | 'right' = pointer.x >= midpoint ? 'right' : 'left';
    this.dropIndicatorPhotoId = targetPhotoId;
    this.dropIndicatorSide = side;
  }

  clearDropIndicator(): void {
    this.dropIndicatorPhotoId = null;
    this.dropIndicatorSide = null;
  }

  onPhotoDragStarted(photoId: string): void {
    this.isDraggingPhoto = true;
    this.draggingPhotoId = photoId;
  }

  onPhotoDragEnded(): void {
    this.isDraggingPhoto = false;
    this.draggingPhotoId = null;
  }

  isPhotoBeingDragged(photoId: string): boolean {
    return this.isDraggingPhoto && this.draggingPhotoId === photoId;
  }

  hasDropIndicator(photoId: string, side: 'left' | 'right'): boolean {
    return this.dropIndicatorPhotoId === photoId && this.dropIndicatorSide === side;
  }

  async copyListingLink(): Promise<void> {
    const activePropertyId = this.property?.propertyId || this.propertyId;
    if (!activePropertyId) {
      return;
    }

    try {
      const response = await firstValueFrom(this.propertyListingShareService.createPropertyShareLink(activePropertyId));
      const shareUrl = `${window.location.origin}/listing/${response.token}`;
      const copied = this.clipboard.copy(shareUrl);
      if (copied) {
        this.toastr.success('Listing link copied to clipboard.', CommonMessage.Success);
      } else {
        this.toastr.error('Unable to copy listing link.', CommonMessage.Error);
      }
    } catch {
      this.toastr.error('Unable to generate listing share link.', CommonMessage.Error);
    }
  }

  getPhotoDisplayUrl(photo: ListingPhotoItem): string {
    if (photo.fileDetails?.dataUrl) {
      return photo.fileDetails.dataUrl;
    }

    if (photo.fileDetails?.file && photo.fileDetails.contentType) {
      return `data:${photo.fileDetails.contentType};base64,${photo.fileDetails.file}`;
    }

    return photo.photoPath || '';
  }

  openPhotoDialog(selectedPhotoId: string): void {
    const activePhotos = this.listingPhotos
      .map(photo => ({ id: photo.id, source: this.getPhotoDisplayUrl(photo) }))
      .filter(photo => !!photo.source);
    if (activePhotos.length === 0) {
      return;
    }

    const selectedPhotoIndex = activePhotos.findIndex(photo => photo.id === selectedPhotoId);
    const initialIndex = selectedPhotoIndex >= 0 ? selectedPhotoIndex : 0;
    const imageSources = activePhotos.map(photo => photo.source);

    this.dialog.open(ImageViewDialogComponent, {
      width: '92vw',
      maxWidth: '1200px',
      maxHeight: '92vh',
      autoFocus: true,
      restoreFocus: true,
      data: {
        imageSrc: imageSources[initialIndex] || imageSources[0],
        imageSources,
        initialIndex,
        title: this.listingHeaderTitle
      }
    });
  }

  loadPropertyPhotos(): void {
    const activePropertyId = this.property?.propertyId || this.propertyId;
    if (!activePropertyId) {
      this.listingPhotos = [];
      return;
    }

    this.propertyPhotoService.getPropertyPhotosByPropertyId(activePropertyId).pipe(take(1)).subscribe({
      next: (photos) => {
        this.listingPhotos = (photos || [])
          .slice()
          .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
          .map(photo => ({
          id: String(photo.photoId),
          order: Number(photo.order ?? 0),
          fileDetails: photo.fileDetails ?? null,
          photoPath: photo.photoPath
        }));
        this.normalizeInMemoryPhotoOrder();
      },
      error: () => {
        this.listingPhotos = [];
      }
    });
  }

  applyInitialPhotos(): void {
    this.listingPhotos = (this.initialPhotos || [])
      .slice()
      .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
      .map(photo => ({
      id: String(photo.photoId),
      order: Number(photo.order ?? 0),
      fileDetails: photo.fileDetails ?? null,
      photoPath: photo.photoPath
    }));
    this.normalizeInMemoryPhotoOrder();
  }

  normalizeInMemoryPhotoOrder(): void {
    this.listingPhotos = this.listingPhotos.map((photo, index) => ({
      ...photo,
      order: index
    }));
  }

  parsePersistedPhotoId(photoId: string | number | null | undefined): number | null {
    const parsed = Number(photoId);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  async createOptimizedPhotoDetails(file: File): Promise<FileDetails> {
    const payload = await this.utilityService.buildOptimizedUploadPayload(file);
    return payload.fileDetails;
  }
  //#endregion
}
