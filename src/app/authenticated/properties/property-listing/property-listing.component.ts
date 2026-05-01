import { CommonModule } from '@angular/common';
import { Component, ElementRef, Input, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
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

interface ListingPhotoItem {
  id: string;
  fileDetails: FileDetails | null;
  photoPath?: string;
}

interface ListingHighlightItem {
  icon: string;
  label: string;
  value: string;
}

@Component({
  standalone: true,
  selector: 'app-property-listing',
  imports: [CommonModule, MaterialModule],
  templateUrl: './property-listing.component.html',
  styleUrl: './property-listing.component.scss'
})
export class PropertyListingComponent implements OnChanges {
  @Input() propertyId: string | null = null;
  @Input() officeId: number | null = null;
  @Input() propertyCode: string | null = null;
  @Input() property: PropertyResponse | null = null;
  @Input() isReadOnly = false;
  @Input() disablePhotoApiLoad = false;
  @Input() initialPhotos: PropertyPhotoResponse[] | null = null;

  listingPhotos: ListingPhotoItem[] = [];
  photoCount = 0;
  isUploadingPhotos = false;
  listingDescriptionExpanded = false;
  descriptionHasOverflow = false;
  listingImageTargetMinBytes = 150 * 1024;
  listingImageTargetMaxBytes = 500 * 1024;
  @ViewChild('photoUploadInput') photoUploadInput?: ElementRef<HTMLInputElement>;
  @ViewChild('descriptionContent') descriptionContent?: ElementRef<HTMLElement>;

  constructor(
    private formatter: FormatterService,
    private propertyPhotoService: PropertyPhotoService,
    private propertyListingShareService: PropertyListingShareService,
    private clipboard: Clipboard,
    private toastr: ToastrService
  ) {}

  //#region Property Listing
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['property']) {
      this.listingDescriptionExpanded = false;
      this.descriptionHasOverflow = false;
      this.queueDescriptionOverflowCheck();
    }

    if (changes['initialPhotos']) {
      this.applyInitialPhotos();
    }

    if ((changes['property'] || changes['propertyId']) && !this.disablePhotoApiLoad) {
      this.loadPropertyPhotos();
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
    return this.property?.description?.trim() || '';
  }

  get listingDescriptionHtmlPreview(): string {
    return this.listingDescriptionHtml;
  }

  get listingDescriptionHtmlDisplay(): string {
    return this.listingDescriptionExpanded ? this.listingDescriptionHtml : this.listingDescriptionHtmlPreview;
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

  get listingDescriptionDisplay(): string {
    return this.listingDescriptionText;
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
      { icon: 'night_shelter', label: 'Minimum Stay', value: `${this.property.minStay || 0} Night(s)` },
      { icon: 'stairs', label: 'Entry Floor', value: String(this.property.unitLevel ?? '-') },
      { icon: 'pets', label: 'Pets', value: this.property.petsAllowed ? 'Yes' : 'No' },
      { icon: 'smoke_free', label: 'Smoking', value: this.property.smoking ? 'Yes' : 'No' },
      { icon: 'local_parking', label: 'Parking', value: this.property.parking ? 'Yes' : 'No' }
    ];
  }

  get listingAmenities(): string[] {
    if (!this.property) return [];

    const washerDryerAmenity = this.property.washerDryerInUnit
      ? 'Washer/Dryer In Unit'
      : (this.property.washerDryerInBldg ? 'Washer/Dryer In Building' : '');
    const poolAmenity = this.property.privatePool
      ? 'Private Pool'
      : (this.property.commonPool ? 'Common Pool' : '');

    const items = [
      ...this.splitList(this.property.amenities),
      washerDryerAmenity,
      this.property.gym ? 'Gym' : '',
      this.property.sauna ? 'Sauna' : '',
      this.property.jacuzzi ? 'Jacuzzi' : '',
      poolAmenity,
      this.property.deck ? 'Deck' : '',
      this.property.patio ? 'Patio' : '',
      this.property.yard ? 'Yard' : '',
      this.property.garden ? 'Garden' : ''
    ].filter(Boolean);
    return Array.from(new Set(items));
  }

  get listingViews(): string[] {
    if (!this.property) return [];
    return this.splitList(this.property.view);
  }

  get listingPrimaryRate(): string {
    return `$${this.formatter.currency(Number(this.property?.monthlyRate || 0))}`;
  }

  get listingDailyRate(): string {
    return `$${this.formatter.currency(Number(this.property?.dailyRate || 0))}`;
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
    setTimeout(() => {
      this.updateDescriptionOverflow();
    });
  }

  updateDescriptionOverflow(): void {
    const content = this.descriptionContent?.nativeElement;
    if (!content) {
      return;
    }

    if (this.listingDescriptionExpanded) {
      return;
    }

    this.descriptionHasOverflow = (content.scrollHeight - content.clientHeight) > 1;
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
          fileDetails
        });

        const request: PropertyPhotoRequest = {
          order: this.photoCount,
          fileDetails
        };

        let response: { photoId: number } | null = null;
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
            ? { ...photo, id: String(response.photoId) }
            : photo
        );
        this.photoCount++;
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

    this.listingPhotos = this.listingPhotos.filter(p => p.id !== photoId);
    this.photoCount = this.listingPhotos.length;
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

  loadPropertyPhotos(): void {
    const activePropertyId = this.property?.propertyId || this.propertyId;
    if (!activePropertyId) {
      this.listingPhotos = [];
      this.photoCount = 0;
      return;
    }

    this.propertyPhotoService.getPropertyPhotosByPropertyId(activePropertyId).pipe(take(1)).subscribe({
      next: (photos) => {
        this.listingPhotos = (photos || []).map(photo => ({
          id: String(photo.photoId),
          fileDetails: photo.fileDetails ?? null,
          photoPath: photo.photoPath
        }));
        this.photoCount = this.listingPhotos.length;
      },
      error: () => {
        this.listingPhotos = [];
        this.photoCount = 0;
      }
    });
  }

  applyInitialPhotos(): void {
    this.listingPhotos = (this.initialPhotos || []).map(photo => ({
      id: String(photo.photoId),
      fileDetails: photo.fileDetails ?? null,
      photoPath: photo.photoPath
    }));
    this.photoCount = this.listingPhotos.length;
  }

  async createOptimizedPhotoDetails(file: File): Promise<FileDetails> {
    try {
      const optimizedBlob = await this.optimizeUploadedListingImage(file);
      const optimizedDataUrl = await this.blobToDataUrl(optimizedBlob);
      const base64String = optimizedDataUrl.includes(',') ? optimizedDataUrl.split(',')[1] : optimizedDataUrl;
      const optimizedName = optimizedBlob.type === 'image/jpeg'
        ? file.name.replace(/\.[^/.]+$/, '.jpg')
        : file.name;

      return {
        fileName: optimizedName,
        contentType: optimizedBlob.type || 'image/jpeg',
        file: base64String,
        dataUrl: optimizedDataUrl
      };
    } catch {
      const originalDataUrl = await this.fileToDataUrl(file);
      const base64String = originalDataUrl.includes(',') ? originalDataUrl.split(',')[1] : originalDataUrl;
      return {
        fileName: file.name,
        contentType: file.type || 'image/jpeg',
        file: base64String,
        dataUrl: originalDataUrl
      };
    }
  }

  async optimizeUploadedListingImage(file: File): Promise<Blob> {
    if (!file.type.startsWith('image/') && !this.isHeicLikeFile(file)) {
      return file;
    }

    const normalizedFile = await this.convertHeicToJpegIfNeeded(file);
    if (normalizedFile.size <= this.listingImageTargetMaxBytes) {
      return normalizedFile;
    }

    const image = await this.loadImageFromFile(normalizedFile);
    const largestSide = Math.max(image.width, image.height);
    const initialScale = largestSide > 1800 ? 1800 / largestSide : 1;

    let scale = initialScale;
    let quality = 0.82;
    let bestBlob: Blob | null = null;

    for (let attempt = 0; attempt < 8; attempt++) {
      const nextBlob = await this.renderCompressedJpegBlob(image, scale, quality);
      if (!nextBlob) {
        break;
      }
      bestBlob = nextBlob;

      if (nextBlob.size <= this.listingImageTargetMaxBytes && nextBlob.size >= this.listingImageTargetMinBytes) {
        break;
      }

      if (nextBlob.size > this.listingImageTargetMaxBytes) {
        if (quality > 0.5) {
          quality = Math.max(0.5, quality - 0.1);
        } else {
          scale *= 0.85;
          quality = 0.78;
        }
        continue;
      }

      break;
    }

    if (!bestBlob || bestBlob.size >= normalizedFile.size) {
      return normalizedFile;
    }

    return bestBlob;
  }

  isHeicLikeFile(file: File): boolean {
    const fileType = (file.type || '').toLowerCase();
    const fileName = (file.name || '').toLowerCase();
    return fileType.includes('heic') || fileType.includes('heif') || fileName.endsWith('.heic') || fileName.endsWith('.heif');
  }

  async convertHeicToJpegIfNeeded(file: File): Promise<File> {
    if (!this.isHeicLikeFile(file)) {
      return file;
    }

    const heic2anyModule = await import('heic2any');
    const heic2any = heic2anyModule.default;
    const converted = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.9
    });

    const convertedBlob = Array.isArray(converted) ? converted[0] : converted;
    if (!(convertedBlob instanceof Blob)) {
      throw new Error('Unsupported HEIC conversion result.');
    }

    const convertedName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
    return new File([convertedBlob], convertedName, { type: 'image/jpeg' });
  }

  loadImageFromFile(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Unable to decode image'));
      };
      image.src = objectUrl;
    });
  }

  renderCompressedJpegBlob(image: HTMLImageElement, scale: number, quality: number): Promise<Blob | null> {
    return new Promise(resolve => {
      const targetWidth = Math.max(1, Math.floor(image.width * scale));
      const targetHeight = Math.max(1, Math.floor(image.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const context = canvas.getContext('2d');
      if (!context) {
        resolve(null);
        return;
      }

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, targetWidth, targetHeight);
      context.drawImage(image, 0, 0, targetWidth, targetHeight);
      canvas.toBlob(blob => resolve(blob), 'image/jpeg', quality);
    });
  }

  blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => reject(new Error('Unable to read blob as data URL'));
      reader.readAsDataURL(blob);
    });
  }

  fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => reject(new Error('Unable to read file'));
      reader.readAsDataURL(file);
    });
  }
  //#endregion
}
