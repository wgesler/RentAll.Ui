import { CommonModule } from '@angular/common';
import { AfterViewChecked, AfterViewInit, ChangeDetectorRef, Component, ElementRef, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, ViewChild, inject } from '@angular/core';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { getPropertyType } from '../models/property-enums';
import {
  ListingAmenityIconItem,
  ListingHighlightItem,
  ListingPhotoItem
} from '../models/property-listing.model';
import { PropertyPhotoRequest, PropertyPhotoResponse } from '../models/property-photo.model';
import { PropertyResponse } from '../models/property.model';
import { PropertyListingShareService } from '../services/property-listing-share.service';
import { PropertyPhotoService } from '../services/property-photo.service';
import { MaterialModule } from '../../../material.module';
import { FormatterService } from '../../../services/formatter-service';
import { FileDetails } from '../../../shared/models/fileDetails';
import { Clipboard } from '@angular/cdk/clipboard';
import { BehaviorSubject, Observable, Subject, firstValueFrom } from 'rxjs';
import { finalize, map, take, takeUntil } from 'rxjs/operators';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage } from '../../../enums/common-message.enum';
import { UtilityService } from '../../../services/utility.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MatDialog } from '@angular/material/dialog';
import { ImageViewDialogComponent } from '../../shared/modals/image-view-dialog/image-view-dialog.component';

@Component({
  standalone: true,
  selector: 'app-property-listing',
  imports: [CommonModule, MaterialModule, DragDropModule],
  templateUrl: './property-listing.component.html',
  styleUrl: './property-listing.component.scss'
})
export class PropertyListingComponent implements OnInit, OnChanges, OnDestroy, AfterViewChecked, AfterViewInit {

  @Input() propertyId: string | null = null;
  @Input() officeId: number | null = null;
  @Input() propertyCode: string | null = null;
  @Input() property: PropertyResponse | null = null;
  @Input() isReadOnly = false;
  @Input() disablePhotoApiLoad = false;
  @Input() initialPhotos: PropertyPhotoResponse[] | null = null;
  @Input() hideRateCard = false;
  formatter = inject(FormatterService);
  propertyPhotoService = inject(PropertyPhotoService);
  propertyListingShareService = inject(PropertyListingShareService);
  clipboard = inject(Clipboard);
  toastr = inject(ToastrService);
  utilityService = inject(UtilityService);
  sanitizer = inject(DomSanitizer);
  dialog = inject(MatDialog);
  cdr = inject(ChangeDetectorRef);

  listingPhotos: ListingPhotoItem[] = [];
  isReorderingPhotos = false;
  isDraggingPhoto = false;
  draggingPhotoId: string | null = null;
  suppressNextPhotoClick = false;
  listingDescriptionExpanded = false;
  descriptionHasOverflow = false;
  listingDescriptionHtmlValue = '';
  listingContentSafeHtml: SafeHtml = '';
  listingAmenitiesHtmlValue = '';
  pendingDescriptionOverflowCheck = false;
  descriptionOverflowCheckScheduled = false;
  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['property']));
  destroy$ = new Subject<void>();
  photosLoadedForPropertyId: string | null = null;
  readonly photoUploadConcurrency = 3;
  @ViewChild('photoUploadInput') photoUploadInput?: ElementRef<HTMLInputElement>;
  @ViewChild('descriptionContent') descriptionContent?: ElementRef<HTMLElement>;

  //#region Property Listing
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      const wasPageReady = this.isPageReady;
      this.isPageReady = items.size === 0;
      if (!wasPageReady && this.isPageReady && this.property) {
        this.queueDescriptionOverflowCheck();
      }
      this.markViewForCheck();
    });
    
    this.syncListingFromInputs();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['property'] && !changes['property'].firstChange) {
      this.syncListingFromInputs();
    }

    if (changes['propertyId'] && !changes['propertyId'].firstChange) {
      this.photosLoadedForPropertyId = null;
      this.syncListingFromInputs();
    }

    if (changes['initialPhotos'] && !changes['initialPhotos'].firstChange) {
      this.loadListingPhotos();
    }
  }

  getActivePropertyId(): string | null {
    const id = this.property?.propertyId || this.propertyId;
    return id ? String(id).trim() : null;
  }

  syncListingFromInputs(): void {
    this.resolvePropertyLoad();
    const activePropertyId = this.getActivePropertyId();
    if (!activePropertyId) {
      this.loadListingPhotos();
      return;
    }

    if (this.hasPendingPhotoUploads()) {
      return;
    }

    if (this.photosLoadedForPropertyId !== activePropertyId || this.listingPhotos.length === 0) {
      this.loadListingPhotos();
    }
  }

  hasPendingPhotoUploads(): boolean {
    return this.listingPhotos.some(photo => photo.isPending || photo.id.startsWith('temp-'));
  }

  resolvePropertyLoad(): void {
    const activePropertyId = this.getActivePropertyId();
    if (!activePropertyId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      return;
    }

    if (!this.property) {
      this.utilityService.addLoadItem(this.itemsToLoad$, 'property');
      return;
    }

    this.listingDescriptionExpanded = false;
    this.descriptionHasOverflow = false;
    this.pendingDescriptionOverflowCheck = true;
    this.refreshListingDescriptionHtml();
    this.refreshListingAmenitiesHtml();
    this.queueDescriptionOverflowCheck();
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
  }

  loadListingPhotos(): void {
    const activePropertyId = this.getActivePropertyId();
    if (!activePropertyId) {
      this.listingPhotos = [];
      this.photosLoadedForPropertyId = null;
      return;
    }

    if (this.disablePhotoApiLoad) {
      this.applyInitialPhotos();
      this.photosLoadedForPropertyId = activePropertyId;
      return;
    }

    this.propertyPhotoService.getPropertyPhotosByPropertyId(activePropertyId).pipe(take(1),finalize(() => this.cdr.markForCheck())).subscribe({
      next: (photos) => {
        this.photosLoadedForPropertyId = activePropertyId;
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
        this.cdr.markForCheck();
      },
      error: () => {
        this.listingPhotos = [];
        this.photosLoadedForPropertyId = activePropertyId;
        this.cdr.markForCheck();
      }
    });
  }

  ngAfterViewInit(): void {
    this.queueDescriptionOverflowCheck();
  }

  ngAfterViewChecked(): void {
    if (!this.pendingDescriptionOverflowCheck || this.listingDescriptionExpanded || this.descriptionOverflowCheckScheduled) {
      return;
    }

    this.descriptionOverflowCheckScheduled = true;
    setTimeout(() => {
      this.descriptionOverflowCheckScheduled = false;
      this.updateDescriptionOverflow();
    });
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
  //#endregion

  //#region Expandable Description
  toggleDescriptionExpanded(): void {
    this.listingDescriptionExpanded = !this.listingDescriptionExpanded;
    this.queueDescriptionOverflowCheck();
  }

  queueDescriptionOverflowCheck(): void {
    this.pendingDescriptionOverflowCheck = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.updateDescriptionOverflow();
      });
    });
  }

  updateDescriptionOverflow(): void {
    const content = this.descriptionContent?.nativeElement;
    if (!content || !this.isPageReady || !this.property) {
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

    const clampedHeight = content.clientHeight;
    const wasCollapsed = content.classList.contains('listing-description__content--collapsed');
    if (wasCollapsed) {
      content.classList.remove('listing-description__content--collapsed');
    }
    const fullHeight = content.scrollHeight;
    if (wasCollapsed) {
      content.classList.add('listing-description__content--collapsed');
    }

    const nextHasOverflow = fullHeight - clampedHeight > 1;
    if (this.descriptionHasOverflow !== nextHasOverflow) {
      this.descriptionHasOverflow = nextHasOverflow;
      this.markViewForCheck();
    }
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

    const activePropertyId = this.property?.propertyId || this.propertyId;
    if (!activePropertyId) {
      input.value = '';
      return;
    }

    try {
      await this.uploadPhotosInParallel(files, activePropertyId);
    } finally {
      input.value = '';
      this.cdr.markForCheck();
    }
  }

  async uploadPhotosInParallel(files: File[], propertyId: string): Promise<void> {
    const queue = [...files];
    const workerCount = Math.min(this.photoUploadConcurrency, queue.length);

    const runWorker = async (): Promise<void> => {
      const file = queue.shift();
      if (!file) {
        return;
      }

      await this.uploadSinglePhoto(file, propertyId);
      await runWorker();
    };

    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
    this.normalizeInMemoryPhotoOrder();
    this.photosLoadedForPropertyId = propertyId;
  }

  async uploadSinglePhoto(file: File, propertyId: string): Promise<void> {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const previewUrl = URL.createObjectURL(file);

    this.listingPhotos = [
      ...this.listingPhotos,
      {
        id: tempId,
        order: this.listingPhotos.length,
        fileDetails: {
          contentType: file.type || 'image/jpeg',
          fileName: file.name,
          file: '',
          dataUrl: previewUrl
        },
        isPending: true
      }
    ];
    this.cdr.markForCheck();

    try {
      const fileDetails = await this.createOptimizedPhotoDetails(file);
      this.listingPhotos = this.listingPhotos.map(photo =>
        photo.id === tempId ? { ...photo, fileDetails, isPending: true } : photo
      );
      this.cdr.markForCheck();

      const request: PropertyPhotoRequest = {
        order: this.listingPhotos.findIndex(photo => photo.id === tempId),
        fileDetails
      };

      let response: PropertyPhotoResponse | null = null;
      try {
        response = await firstValueFrom(this.propertyPhotoService.addPropertyPhoto(propertyId, request));
      } catch {
        response = null;
      }

      if (!response?.photoId) {
        this.listingPhotos = this.listingPhotos.filter(photo => photo.id !== tempId);
        this.toastr.error(`Unable to upload ${file.name}.`, CommonMessage.Error);
        return;
      }

      this.listingPhotos = this.listingPhotos.map(photo =>
        photo.id === tempId
          ? {
            ...photo,
            id: String(response.photoId),
            order: response.order ?? photo.order,
            fileDetails: response.fileDetails ?? fileDetails,
            photoPath: response.photoPath,
            isPending: false
          }
          : photo
      );
    } catch {
      this.listingPhotos = this.listingPhotos.filter(photo => photo.id !== tempId);
      this.toastr.error(`Unable to upload ${file.name}.`, CommonMessage.Error);
    } finally {
      URL.revokeObjectURL(previewUrl);
      this.cdr.markForCheck();
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
    if (this.isReadOnly || this.isReorderingPhotos) {
      return;
    }

    if (event.previousIndex === event.currentIndex) {
      return;
    }

    const previousOrder = this.listingPhotos.map(photo => ({ ...photo }));
    moveItemInArray(this.listingPhotos, event.previousIndex, event.currentIndex);
    this.normalizeInMemoryPhotoOrder();
    this.markViewForCheck();

    const startIndex = Math.min(event.previousIndex, event.currentIndex);
    const endIndex = Math.max(event.previousIndex, event.currentIndex);
    const movedPhoto = this.listingPhotos[event.currentIndex];
    const movedPhotoId = this.parsePersistedPhotoId(movedPhoto?.id);
    if (movedPhotoId === null || !movedPhoto) {
      return;
    }

    this.isReorderingPhotos = true;
    try {
      const tempOrder = 1000000 + movedPhoto.order;
      await firstValueFrom(this.propertyPhotoService.updatePropertyPhotoOrder({
        photoId: movedPhotoId,
        order: tempOrder
      }));

      if (event.previousIndex < event.currentIndex) {
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
      this.markViewForCheck();
    }
  }

  onPhotoDragStarted(photoId: string): void {
    this.isDraggingPhoto = true;
    this.draggingPhotoId = photoId;
    this.suppressNextPhotoClick = false;
  }

  onPhotoDragEnded(): void {
    this.suppressNextPhotoClick = true;
    this.isDraggingPhoto = false;
    this.draggingPhotoId = null;
    // Click fires after pointerup; keep suppress long enough to swallow the post-drag click.
    setTimeout(() => {
      this.suppressNextPhotoClick = false;
    }, 200);
  }

  isPhotoBeingDragged(photoId: string): boolean {
    return this.isDraggingPhoto && this.draggingPhotoId === photoId;
  }

  async copyListingLink(): Promise<void> {
    const activePropertyId = this.property?.propertyId || this.propertyId;
    if (!activePropertyId) {
      return;
    }

    try {
      const response = await firstValueFrom(this.propertyListingShareService.createPropertyShareLink(activePropertyId));
      const shareUrl = this.propertyListingShareService.getPublicListingUrl(response.token);
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
    if (this.suppressNextPhotoClick || this.isDraggingPhoto) {
      return;
    }

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

  //#region Utility Methods
  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
