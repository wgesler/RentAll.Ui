import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { Observable, Subject, finalize, map, of, switchMap, take, takeUntil } from 'rxjs';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { CommonService } from '../../../services/common.service';
import { MappingService } from '../../../services/mapping.service';
import { ContactResponse } from '../../contacts/models/contact.model';
import { EntityType } from '../../contacts/models/contact-enum';
import { ContactService } from '../../contacts/services/contact.service';
import { PropertyService } from '../../properties/services/property.service';
import { MobileListField, MobileListFieldOption } from '../mobile-list-table/mobile-list.model';

@Component({
  standalone: true,
  selector: 'app-mobile-contact-detail',
  imports: [MaterialModule, FormsModule],
  templateUrl: './mobile-contact-detail.component.html',
  styleUrl: './mobile-contact-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileContactDetailComponent implements OnChanges, OnDestroy {
  @Input() contactId = '';
  @Output() dirtyChange = new EventEmitter<boolean>();
  private contactService = inject(ContactService);
  private mappingService = inject(MappingService);
  private commonService = inject(CommonService);
  private propertyService = inject(PropertyService);
  private authService = inject(AuthService);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);
  fields: MobileListField[] = [];
  states: string[] = [];
  propertyCodes: MobileListFieldOption[] = [];
  isPageReady = false;
  isSaving = false;
  isDirty = false;
  destroy$ = new Subject<void>();

  //#region Mobile-Contact-Detail
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['contactId']) {
      this.getContact();
    }
  }

  getContact(): void {
    this.loadContact();
  }

  updateContact(): void {
    const contactId = this.contactId.trim();
    if (!contactId || this.isSaving) {
      return;
    }
    this.isSaving = true;
    this.markViewForCheck();
    this.contactService.getContactByGuid(contactId).pipe(
      take(1),
      takeUntil(this.destroy$),
      switchMap(contact => {
        const overrides = this.mappingService.mapMobileContactDetailOverrides(contact, this.fields);
        const request = this.mappingService.mapContactResponseToUpdateRequest(contact, overrides);
        return this.contactService.updateContact(request);
      }),
      finalize(() => {
        this.isSaving = false;
        this.markViewForCheck();
      })
    ).subscribe({
      next: contact => {
        this.fields = this.mapFields(contact);
        this.setDirty(false);
        this.toastr.success('Contact updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
        this.markViewForCheck();
      },
      error: () => {
        this.toastr.error('Contact could not be saved.', CommonMessage.Error);
        this.markViewForCheck();
      }
    });
  }

  saveContact(): void {
    this.updateContact();
  }

  onFieldChange(): void {
    this.setDirty(true);
  }

  onSelectChange(field: MobileListField, value: string | string[]): void {
    if (field.multiple) {
      field.value = (Array.isArray(value) ? value : []).join(', ');
    } else {
      field.value = String(value ?? '');
    }
    this.onFieldChange();
  }

  getSelectedValues(field: MobileListField): string[] {
    return field.value ? field.value.split(',').map(value => value.trim()).filter(value => !!value) : [];
  }

  markViewForCheck(): void {
    this.cdr.markForCheck();
  }
  //#endregion

  //#region Data Loading Methods
  loadContact(): void {
    const contactId = this.contactId.trim();
    this.isPageReady = false;
    this.fields = [];
    this.setDirty(false);
    this.markViewForCheck();
    if (!contactId) {
      this.isPageReady = true;
      this.markViewForCheck();
      return;
    }
    this.contactService.getContactByGuid(contactId).pipe(
      take(1),
      takeUntil(this.destroy$),
      switchMap(contact => this.loadLookups(contact)),
      finalize(() => {
        this.isPageReady = true;
        this.markViewForCheck();
      })
    ).subscribe({
      next: contact => {
        this.fields = this.mapFields(contact);
        this.markViewForCheck();
      },
      error: () => {
        this.fields = [];
        this.markViewForCheck();
      }
    });
  }

  loadLookups(contact: ContactResponse): Observable<ContactResponse> {
    const cachedStates = this.commonService.getStatesValue();
    const states$ = cachedStates.length > 0
      ? of(cachedStates)
      : this.commonService.getStates().pipe(take(1));
    return states$.pipe(
      switchMap(states => {
        this.states = states || [];
        if (contact.entityTypeId !== EntityType.Owner) {
          this.propertyCodes = [];
          return of(contact);
        }
        const userId = this.authService.getUser()?.userId?.trim() ?? '';
        if (!userId) {
          this.propertyCodes = [];
          return of(contact);
        }
        return this.propertyService.getPropertiesBySelectionCriteria(userId).pipe(take(1), map(properties => {
          this.propertyCodes = this.mappingService.mapMobileContactPropertyOptions(properties || []);
          return contact;
        }));
      })
    );
  }
  //#endregion

  //#region Utility Methods
  mapFields(contact: ContactResponse): MobileListField[] {
    return this.mappingService.mapMobileContactDetailFields(contact, { states: this.states, propertyCodes: this.propertyCodes });
  }

  setDirty(isDirty: boolean): void {
    if (this.isDirty === isDirty) {
      return;
    }
    this.isDirty = isDirty;
    this.dirtyChange.emit(isDirty);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  //#endregion
}
