import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { finalize, forkJoin, map, of, switchMap, take } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { PropertyResponse } from '../../properties/models/property.model';
import { DocumentType } from '../../documents/models/document.enum';
import { DocumentRequest, DocumentResponse, GenerateDocumentFromHtmlDto } from '../../documents/models/document.model';
import { DocumentService } from '../../documents/services/document.service';
import { GenericModalComponent } from '../../shared/modals/generic/generic-modal.component';
import { GenericModalData } from '../../shared/modals/generic/models/generic-modal-data';
import { ChecklistItem, ChecklistSection, ChecklistTemplateItem, INSPECTION_SECTIONS, INVENTORY_SECTIONS, SavedChecklistSection } from '../models/checklist-sections';
import { InventoryRequest, InventoryResponse } from '../models/inventory.model';
import { InspectionRequest, InspectionResponse } from '../models/inspection.model';
import { MaintenanceResponse } from '../models/maintenance.model';
import { InventoryService } from '../services/inventory.service';
import { InspectionService } from '../services/inspection.service';
import { MaintenanceService } from '../services/maintenance.service';
import { PhotoRequest, PhotoResponse } from '../../documents/models/photo.model';
import { PhotoService } from '../../documents/services/photo.service';
import { UtilityService } from '../../../services/utility.service';

export type ChecklistMode = 'template' | 'answer' | 'readonly';
export type ChecklistType = 'inspection' | 'inventory';

@Component({
  standalone: true,
  selector: 'app-checklist',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule],
  templateUrl: './checklist.component.html',
  styleUrl: './checklist.component.scss'
})
export class ChecklistComponent implements OnChanges, OnDestroy, OnInit {
  @Input() property: PropertyResponse | null = null;
  @Input() maintenanceRecord: MaintenanceResponse | null = null;
  @Input() templateJson: string | null = null;
  @Input() answersJson: string | null = null;
  @Input() mode: ChecklistMode = 'answer';
  @Input() checklistType: ChecklistType = 'inspection';
  @Input() isSaving: boolean = false;
  @Output() templateSaved = new EventEmitter<string>();



  form: FormGroup;
  inspectorName: string = '';
  todayDate: string = '';
  sectionTemplates: ChecklistSection[] = INSPECTION_SECTIONS;
  sections: ChecklistSection[] = [];
  sectionSetCounts: Record<string, number> = {};
  sectionSetItems: Record<string, ChecklistItem[][]> = {};
  nextItemId = 0;
  activeMode: ChecklistMode = 'template';
  activeInspection: InspectionResponse | null = null;
  activeInventory: InventoryResponse | null = null;
  lastPropertyIdLoaded: string | null = null;
  isSavingTemplateInternal: boolean = false;
  isSavingAnswersInternal: boolean = false;
  isServiceError: boolean = false;
  hasInitialized = false;
  /** Cache of documentId -> blob URL for photos loaded via download API (private blob storage). */
  private photoBlobUrlCache = new Map<string, string>();

  constructor(
    public fb: FormBuilder,
    public authService: AuthService,
    public documentService: DocumentService,
    public utilityService: UtilityService,
    public photoService: PhotoService,
    public toastr: ToastrService,
    public dialog: MatDialog,
    public router: Router,
    public maintenanceService: MaintenanceService,
    public inspectionService: InspectionService,
    public inventoryService: InventoryService,
    public mappingService: MappingService,
    private cdr: ChangeDetectorRef
  ) {

    const user = this.authService.getUser();
    this.inspectorName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Unknown User';
    this.todayDate = new Date().toLocaleDateString();
  }

  //#region Checklist
  ngOnInit(): void {
    this.sectionTemplates = this.checklistType === 'inventory' ? INVENTORY_SECTIONS : INSPECTION_SECTIONS;
    this.activeMode = this.mode;

    this.initializeChecklistState();
    this.syncPropertyDrivenSections();

    const templateJson = this.templateJson?.trim() ?? '';
    if (templateJson.length > 0) {
      this.applySavedChecklistJson(templateJson);
    }

    const propertyId = this.property?.propertyId ?? null;
    if (propertyId) {
      this.lastPropertyIdLoaded = propertyId;
      this.loadChecklistAnswers(propertyId);
    }

    this.hasInitialized = true;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.hasInitialized) {
      return;
    }

    if (changes['answersJson']) {
      const answersJson = this.answersJson?.trim() ?? '';
      if (answersJson.length > 0) {
        this.applySavedAnswersJson(answersJson);
      }
    }

    if (changes['mode']) {
      this.activeMode = this.mode;
      this.applyModeState();
    }
  }

  initializeChecklistState(): void {
    this.sections = this.sectionTemplates.map(section => ({
      ...section,
      items: [...section.items]
    }));
    this.sectionSetCounts = {};
    this.sectionSetItems = {};
    this.form = this.fb.group({});

    this.sections.forEach(section => {
      this.sectionSetCounts[section.key] = 1;
      this.sectionSetItems[section.key] = [
        section.items.map(itemText => this.createChecklistItem(itemText))
      ];
      this.addControlsForSet(section.key, 0);
    });

    this.applyModeState();
  }

  applySavedChecklistJson(rawChecklistJson: string): boolean {
    const parsedSections = this.parseSavedSections(rawChecklistJson);
    if (!parsedSections || parsedSections.length === 0) {
      return false;
    }

    const templateByKey = new Map(this.sectionTemplates.map(section => [section.key, section]));

    this.sections = [];
    this.sectionSetCounts = {};
    this.sectionSetItems = {};
    this.form = this.fb.group({});

    parsedSections.forEach(savedSection => {
      const templateSection = templateByKey.get(savedSection.key);
      const title = savedSection.title || templateSection?.title || savedSection.key;
      const hint = templateSection?.hint;
      const baseItems = templateSection?.items || [];
      const templateItemSet = new Set(baseItems.map(item => item.text));

      const sets = (savedSection.sets && savedSection.sets.length > 0)
        ? savedSection.sets
        : [baseItems.map(item => ({
          text: item.text,
          requiresPhoto: item.requiresPhoto,
          photoPath: null,
          checked: false,
          isEditable: this.getDefaultItemEditable()
        }))];

      this.sections.push({
        key: savedSection.key,
        title,
        hint,
        items: [...baseItems]
      });

      this.sectionSetCounts[savedSection.key] = sets.length;
      this.sectionSetItems[savedSection.key] = sets.map(setItems => {
        const isAnswerOnlySet = setItems.every(item => !item.text);
        if (isAnswerOnlySet) {
          const templateItemsForSet = baseItems.length > 0 ? baseItems : [];
          return templateItemsForSet.map((item, index) => this.createChecklistItem(
            item,
            this.getDefaultItemEditable(),
            setItems[index]?.checked || false,
            setItems[index]?.photoPath ?? null,
            setItems[index]?.documentId || null
          ));
        }

        return setItems.map(item => this.createChecklistItem(
          { text: item.text, requiresPhoto: item.requiresPhoto },
          item.isEditable === true,
          item.checked,
          item.photoPath ?? null,
          item.documentId || null
        ));
      });

      for (let repeatIndex = 0; repeatIndex < sets.length; repeatIndex += 1) {
        this.addControlsForSet(savedSection.key, repeatIndex);
      }

      const notesControl = this.form.get(this.notesControlName(savedSection.key));
      if (notesControl) {
        notesControl.setValue(savedSection.notes || '');
      }
    });

    this.applyModeState();
    return true;
  }

  applySavedAnswersJson(rawChecklistJson: string): boolean {
    try {
      let parsedRoot = JSON.parse(rawChecklistJson) as {
        sections?: Array<{
          key: string;
          notes?: string;
          sets?: Array<Array<{ checked?: boolean; photoPath?: string | null; documentId?: string | null } | boolean>>;
        }>;
        inspectionCheckList?: string;
        inventoryCheckList?: string;
      };

      const nestedChecklistJson = typeof parsedRoot.inspectionCheckList === 'string'
        ? parsedRoot.inspectionCheckList
        : (typeof parsedRoot.inventoryCheckList === 'string' ? parsedRoot.inventoryCheckList : null);
      if (nestedChecklistJson) {
        parsedRoot = JSON.parse(nestedChecklistJson) as {
          sections?: Array<{
            key: string;
            notes?: string;
            sets?: Array<Array<{ checked?: boolean; photoPath?: string | null; documentId?: string | null } | boolean>>;
          }>;
        };
      }

      const rawSections = Array.isArray(parsedRoot.sections) ? parsedRoot.sections : [];
      if (rawSections.length === 0) {
        return false;
      }

      let hasAppliedAnswers = false;
      rawSections.forEach(sectionObject => {
        const sectionKey = typeof sectionObject.key === 'string' ? sectionObject.key.trim() : '';
        if (!sectionKey) {
          return;
        }

        const section = this.sections.find(currentSection => currentSection.key === sectionKey);
        if (!section) {
          return;
        }

        const sectionSets = Array.isArray(sectionObject.sets) ? sectionObject.sets : [];
        if (sectionSets.length === 0) {
          return;
        }

        const targetSetCount = Math.max(1, sectionSets.length);
        this.syncSectionSetCount(section.key, targetSetCount);

        for (let repeatIndex = 0; repeatIndex < targetSetCount; repeatIndex += 1) {
          const answerSet = Array.isArray(sectionSets[repeatIndex]) ? sectionSets[repeatIndex] : [];
          const setItems = this.getSetItems(section.key, repeatIndex);
          setItems.forEach((item, itemIndex) => {
            const control = this.form.get(this.itemControlNameById(section.key, repeatIndex, item.id));
            if (!control) {
              return;
            }

            const answerValue = answerSet[itemIndex];
            const isChecked = typeof answerValue === 'boolean'
              ? answerValue === true
              : answerValue?.checked === true;
            item.photoPath = typeof answerValue === 'object' && answerValue !== null && typeof answerValue.photoPath === 'string'
              ? answerValue.photoPath
              : null;
            item.documentId = typeof answerValue === 'object' && answerValue !== null && typeof answerValue.documentId === 'string'
              ? answerValue.documentId
              : null;
            control.setValue(isChecked, { emitEvent: false });
          });
        }

        const notesControl = this.form.get(this.notesControlName(section.key));
        if (notesControl && typeof sectionObject.notes === 'string') {
          notesControl.setValue(sectionObject.notes, { emitEvent: false });
        }

        hasAppliedAnswers = true;
      });

      if (hasAppliedAnswers) {
        this.loadPhotoBlobUrls();
      }
      return hasAppliedAnswers;
    } catch {
      return false;
    }
  }

  /** Load viewable image URLs for saved photos via photo API (getPhotoByGuid), not document API. Same pattern as user profile picture. */
  private loadPhotoBlobUrls(): void {
    const documentIdsToLoad = new Set<string>();
    Object.values(this.sectionSetItems).forEach(sets => {
      sets.forEach(items => {
        items.forEach(item => {
          if (item.documentId && !item.displayDataUrl && !this.photoBlobUrlCache.has(item.documentId)) {
            documentIdsToLoad.add(item.documentId);
          }
        });
      });
    });
    documentIdsToLoad.forEach(photoId => {
      this.photoService.getPhotoByGuid(photoId).pipe(take(1)).subscribe({
        next: (response: PhotoResponse) => {
          let viewUrl: string | null = null;
          if (response.fileDetails?.file) {
            const contentType = response.fileDetails.contentType || 'image/jpeg';
            viewUrl = `data:${contentType};base64,${response.fileDetails.file}`;
          } else if (response.fileDetails?.dataUrl) {
            viewUrl = response.fileDetails.dataUrl;
          } else if (response.photoPath && response.photoPath.startsWith('http')) {
            viewUrl = response.photoPath;
          }
          if (viewUrl) {
            this.photoBlobUrlCache.set(photoId, viewUrl);
            this.cdr.markForCheck();
          }
        },
        error: () => {}
      });
    });
  }

  ngOnDestroy(): void {
    this.photoBlobUrlCache.forEach(url => {
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });
    this.photoBlobUrlCache.clear();
  }

  parseSavedSections(rawChecklistJson: string): SavedChecklistSection[] | null {
    try {
      let checklistRoot = JSON.parse(rawChecklistJson) as {
        sections?: SavedChecklistSection[];
        inspectionCheckList?: string;
      };

      if (typeof checklistRoot.inspectionCheckList === 'string') {
        checklistRoot = JSON.parse(checklistRoot.inspectionCheckList) as { sections?: SavedChecklistSection[] };
      }

      const rawSections = Array.isArray(checklistRoot.sections) ? checklistRoot.sections : [];
      const validSections = rawSections.filter(section => typeof section?.key === 'string' && Array.isArray(section.sets));

      return validSections.length > 0 ? validSections : null;
    } catch {
      return null;
    }
  }
  //#endregion

  //#region Top Buttons
  get totalItems(): number {
    return this.sections.reduce((total, section) => {
      return total + this.getRepeatIndexes(section.key).reduce((setTotal, repeatIndex) => {
        return setTotal + this.getSetItems(section.key, repeatIndex).length;
      }, 0);
    }, 0);
  }

  get completedCount(): number {
    let completed = 0;
    this.sections.forEach(section => {
      for (let repeatIndex = 0; repeatIndex < this.getSetCount(section.key); repeatIndex += 1) {
        this.getSetItems(section.key, repeatIndex).forEach(item => {
          if (this.form.get(this.itemControlNameById(section.key, repeatIndex, item.id))?.value) {
            completed += 1;
          }
        });
      }
    });
    return completed;
  }

  clearAll(): void {
    const patch: Record<string, boolean> = {};
    this.sections.forEach(section => {
      for (let repeatIndex = 0; repeatIndex < this.getSetCount(section.key); repeatIndex += 1) {
        this.getSetItems(section.key, repeatIndex).forEach(item => {
          patch[this.itemControlNameById(section.key, repeatIndex, item.id)] = false;
        });
      }
    });
    this.form.patchValue(patch);
  }

  resetChecklist(): void {
    this.initializeChecklistState();
    this.applyModeState();
  }

  get saveButtonText(): string {
    if (!this.isTemplateMode && this.totalItems > 0 && this.completedCount === this.totalItems) {
      return 'Submit';
    }

    return 'Save';
  } 
  //#endregion

  //#region Saving Methods
  get isSavingInProgress(): boolean {
    return this.isSaving || this.isSavingTemplateInternal || this.isSavingAnswersInternal;
  }
  saveChecklistData(): void {
    if (this.isReadonlyMode) {
      return;
    }

    if (this.isTemplateMode) {
      this.saveTemplate();
      return;
    }

    this.saveAnswersData();
  }

  buildChecklistTemplateJson(): string {
    const payload = {
      sections: this.sections.map(section => ({
        key: section.key,
        title: section.title,
        notes: this.form.get(this.notesControlName(section.key))?.value || '',
        sets: this.getRepeatIndexes(section.key).map(repeatIndex =>
          this.getSetItems(section.key, repeatIndex).map(item => ({
            text: item.text,
            requiresPhoto: item.requiresPhoto,
            isEditable: item.isEditable,
            photoPath: item.photoPath ?? null
          }))
        )
      }))
    };

    return JSON.stringify(payload);
  }

  buildChecklistAnswersJson(): string {
    const payload = {
      sections: this.sections.map(section => ({
        key: section.key,
        title: section.title,
        notes: this.form.get(this.notesControlName(section.key))?.value || '',
        sets: this.getRepeatIndexes(section.key).map(repeatIndex =>
          this.getSetItems(section.key, repeatIndex).map(item =>
            ({
              text: item.text,
              requiresPhoto: item.requiresPhoto,
              checked: !!this.form.get(this.itemControlNameById(section.key, repeatIndex, item.id))?.value,
              photoPath: item.photoPath ?? null,
              documentId: item.documentId ?? null
            })
          )
        )
      }))
    };

    return JSON.stringify(payload);
  }

  saveTemplate(): void {
    const checklistJson = this.buildChecklistTemplateJson();
    this.isSavingTemplateInternal = true;
    this.isServiceError = false;

    this.deleteActiveChecklistRecords().pipe(
      take(1),
      finalize(() => (this.isSavingTemplateInternal = false))
    ).subscribe({
      next: () => {
        this.toastr.success('Template saved successfully', CommonMessage.Success);
        this.templateSaved.emit(checklistJson);
      },
      error: () => {
        this.isServiceError = true;
        this.toastr.error('Failed to save template', CommonMessage.Error);
      }
    });
  }

  deleteActiveChecklistRecords() {
    const maintenanceId = this.maintenanceRecord?.maintenanceId ?? '';
    if (!maintenanceId) {
      return of(void 0);
    }

    return forkJoin({
      inspections: this.inspectionService.getInspectionsByMaintenanceId(maintenanceId).pipe(take(1)),
      inventories: this.inventoryService.getInventoriesByMaintenanceId(maintenanceId).pipe(take(1))
    }).pipe(
      switchMap(({ inspections, inventories }) => {
        const inspectionDeletes = (inspections || [])
          .filter(inspection => inspection.isActive == true)
          .map(inspection => this.inspectionService.deleteInspection(inspection.inspectionId).pipe(take(1)));

        const inventoryDeletes = (inventories || [])
          .filter(inventory => inventory.isActive == true)
          .map(inventory => this.inventoryService.deleteInventory(inventory.inventoryId).pipe(take(1)));

        const deleteRequests = [...inspectionDeletes, ...inventoryDeletes];
        if (deleteRequests.length === 0) {
          return of(void 0);
        }

        return forkJoin(deleteRequests).pipe(map(() => void 0));
      })
    );
  }

  /** Delete individual checklist photos via photo API (same as we use getPhotoByGuid to load them). */
  deleteChecklistPhotoDocuments() {
    const photoIds = Array.from(new Set(
      this.sections
        .flatMap(section => this.getRepeatIndexes(section.key)
          .flatMap(repeatIndex => this.getSetItems(section.key, repeatIndex)))
        .map(item => item.documentId ?? null)
        .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    ));

    if (photoIds.length === 0) {
      return of(void 0);
    }

    return forkJoin(
      photoIds.map(photoId => this.photoService.deletePhoto(photoId).pipe(take(1)))
    ).pipe(map(() => void 0));
  }

  /** Navigate to maintenance component (tabs) for this property and refresh to clear settings. tabIndex: 0=Inspection, 1=Inventory */
  private navigateToMaintenanceTabs(tabIndex?: number): void {
    const propertyId = this.property?.propertyId;
    let url = propertyId
      ? RouterUrl.replaceTokens(RouterUrl.Maintenance, [propertyId])
      : RouterUrl.MaintenanceList;
    if (tabIndex !== undefined && tabIndex >= 0) {
      url += (url.includes('?') ? '&' : '?') + `tab=${tabIndex}`;
    }
    this.router.navigateByUrl(url).then(() => window.location.reload());
  }

  saveAnswersData(): void {
    const answersJson = this.buildChecklistAnswersJson();
    if (this.checklistType === 'inventory')
      this.saveInventoryAnswers(answersJson);
    else
      this.saveInspectionAnswers(answersJson);
  }

  saveInspectionAnswers(inspectionChecklistJson: string): void {
    if (!this.property) {
      return;
    }

    const currentUser = this.authService.getUser();
    const shouldSubmitInspection = this.isChecklistFullyComplete(inspectionChecklistJson);
    this.isSavingAnswersInternal = true;
    this.isServiceError = false;

    const persistInspection = (documentPath: string | null): void => {
      if (this.activeInspection) {
        const updatePayload: InspectionRequest = {
          inspectionId: this.activeInspection.inspectionId,
          organizationId: this.activeInspection.organizationId,
          officeId: this.activeInspection.officeId,
          propertyId: this.activeInspection.propertyId,
          maintenanceId: this.activeInspection.maintenanceId,
          inspectionCheckList: inspectionChecklistJson,
          documentPath: documentPath ?? this.activeInspection.documentPath ?? null,
          isActive: shouldSubmitInspection ? false : this.activeInspection.isActive
        };
        this.inspectionService.updateInspection(updatePayload).pipe(take(1), finalize(() => (this.isSavingAnswersInternal = false))).subscribe({
          next: (savedInspectionResponse: InspectionResponse) => {
            const savedInspection = this.mappingService.mapInspection(savedInspectionResponse);
            this.activeInspection = savedInspection;
            this.toastr.success(shouldSubmitInspection ? 'Inspection submitted successfully' : 'Inspection saved successfully', CommonMessage.Success);
            if (shouldSubmitInspection) {
              this.navigateToMaintenanceTabs(0);
            }
          },
          error: (_err: HttpErrorResponse) => {
            this.isServiceError = true;
            this.toastr.error(shouldSubmitInspection ? 'Failed to submit inspection' : 'Failed to save inspection', CommonMessage.Success);
          }
        });
        return;
      }

      const createPayload: InspectionRequest = {
        organizationId: currentUser?.organizationId || this.property?.organizationId || '',
        officeId: this.property.officeId,
        propertyId: this.property.propertyId,
        maintenanceId: this.maintenanceRecord?.maintenanceId || '',
        inspectionCheckList: inspectionChecklistJson,
        documentPath,
        isActive: shouldSubmitInspection ? false : true
      };
      this.inspectionService.createInspection(createPayload).pipe(take(1), finalize(() => (this.isSavingAnswersInternal = false))).subscribe({
        next: (savedInspectionResponse: InspectionResponse) => {
          const savedInspection = this.mappingService.mapInspection(savedInspectionResponse);
          this.activeInspection = savedInspection;
          this.toastr.success(shouldSubmitInspection ? 'Inspection submitted successfully' : 'Inspection saved successfully', CommonMessage.Success);
          if (shouldSubmitInspection) {
            this.navigateToMaintenanceTabs(0);
          }
        },
        error: (_err: HttpErrorResponse) => {
          this.isServiceError = true;
          this.toastr.error(shouldSubmitInspection ? 'Failed to submit inspection' : 'Failed to save inspection', CommonMessage.Success);
        }
      });
    };

    if (!shouldSubmitInspection) {
      persistInspection(null);
      return;
    }

    const inspectionDto = this.buildChecklistGenerateDto(
      inspectionChecklistJson,
      currentUser?.organizationId || this.property.organizationId || '',
      this.property.officeId,
      this.property.propertyId,
      this.utilityService.generateDocumentFileName('inspection', this.property.propertyCode, null),
      'Inspection Checklist',
      DocumentType.Inspection
    );
    if (!inspectionDto) {
      this.isSavingAnswersInternal = false;
      this.isServiceError = true;
      this.toastr.error('Failed to build inspection document', CommonMessage.Error);
      return;
    }

    // Final submit: generate one standalone PDF (htmlContent has embedded images) and save it; documentPath = saved PDF
    this.documentService.generate(inspectionDto).pipe(take(1)).subscribe({
      next: (documentResponse: DocumentResponse) => {
        const documentPath = documentResponse.documentPath || null;
        this.deleteChecklistPhotoDocuments().pipe(take(1)).subscribe({
          next: () => persistInspection(documentPath),
          error: () => persistInspection(documentPath)
        });
      },
      error: (_err: HttpErrorResponse) => {
        this.isSavingAnswersInternal = false;
        this.isServiceError = true;
        this.toastr.error('Failed to generate inspection document', CommonMessage.Error);
      }
    });
  }

  saveInventoryAnswers(inventoryChecklistJson: string): void {
    if (!this.property) {
      return;
    }

    const currentUser = this.authService.getUser();
    const shouldSubmitInventory = this.isChecklistFullyComplete(inventoryChecklistJson);
    this.isSavingAnswersInternal = true;
    this.isServiceError = false;

    const persistInventory = (documentPath: string | null): void => {
      if (this.activeInventory) {
        const updatePayload: InventoryRequest = {
          inventoryId: this.activeInventory.inventoryId,
          organizationId: this.activeInventory.organizationId,
          officeId: this.activeInventory.officeId,
          propertyId: this.activeInventory.propertyId,
          maintenanceId: this.activeInventory.maintenanceId,
          inventoryCheckList: inventoryChecklistJson,
          documentPath: documentPath ?? this.activeInventory.documentPath ?? null,
          isActive: shouldSubmitInventory ? false : true
        };

        this.inventoryService.updateInventory(updatePayload).pipe(take(1), finalize(() => (this.isSavingAnswersInternal = false))).subscribe({
          next: (savedInventory: InventoryResponse) => {
            this.activeInventory = savedInventory;
            this.toastr.success(shouldSubmitInventory ? 'Inventory submitted successfully' : 'Inventory saved successfully', CommonMessage.Success);
            if (shouldSubmitInventory) {
              this.navigateToMaintenanceTabs(1);
            }
          },
          error: (_err: HttpErrorResponse) => {
            this.isServiceError = true;
            this.toastr.error('Failed to save inventory', CommonMessage.Error);
          }
        });
        return;
      }

      const createPayload: InventoryRequest = {
        organizationId: currentUser?.organizationId || this.property?.organizationId || '',
        officeId: this.property.officeId,
        propertyId: this.property.propertyId,
        maintenanceId: this.maintenanceRecord?.maintenanceId || '',
        inventoryCheckList: inventoryChecklistJson,
        documentPath,
        isActive: shouldSubmitInventory ? false : true
      };

      this.inventoryService.createInventory(createPayload).pipe(take(1), finalize(() => (this.isSavingAnswersInternal = false))).subscribe({
        next: (savedInventory: InventoryResponse) => {
          this.activeInventory = savedInventory;
          this.toastr.success(shouldSubmitInventory ? 'Inventory submitted successfully' : 'Inventory saved successfully', CommonMessage.Success);
          if (shouldSubmitInventory) {
            this.navigateToMaintenanceTabs(1);
          }
        },
        error: (_err: HttpErrorResponse) => {
          this.isServiceError = true;
          this.toastr.error('Failed to save inventory', CommonMessage.Error);
        }
      });
    };

    if (!shouldSubmitInventory) {
      persistInventory(null);
      return;
    }

    const inventoryDto = this.buildChecklistGenerateDto(
      inventoryChecklistJson,
      currentUser?.organizationId || this.property.organizationId || '',
      this.property.officeId,
      this.property.propertyId,
      this.utilityService.generateDocumentFileName('inventory', this.property.propertyCode, null),
      'Inventory Checklist',
      DocumentType.Inventory
    );
    if (!inventoryDto) {
      this.isSavingAnswersInternal = false;
      this.isServiceError = true;
      this.toastr.error('Failed to build inventory document', CommonMessage.Error);
      return;
    }

    // Final submit: generate one standalone PDF (htmlContent has embedded images) and save it; documentPath = saved PDF
    this.documentService.generate(inventoryDto).pipe(take(1)).subscribe({
      next: (documentResponse: DocumentResponse) => {
        const documentPath = documentResponse.documentPath || null;
        this.deleteChecklistPhotoDocuments().pipe(take(1)).subscribe({
          next: () => persistInventory(documentPath),
          error: () => persistInventory(documentPath)
        });
      },
      error: (_err: HttpErrorResponse) => {
        this.isSavingAnswersInternal = false;
        this.isServiceError = true;
        this.toastr.error('Failed to generate inventory document', CommonMessage.Error);
      }
    });
  }
  //#endregion

  //#region Data Load Methods
  loadChecklistAnswers(propertyId: string): void {
    const answersProvided = (this.answersJson?.trim() ?? '').length > 0;
    if (answersProvided) {
      const providedAnswersJson = this.answersJson!.trim();
      this.applySavedAnswersJson(providedAnswersJson);
      return;
    }

    if (this.checklistType === 'inventory') {
      this.inventoryService.getInventoriesByMaintenanceId(this.maintenanceRecord?.maintenanceId).pipe(take(1)).subscribe({
        next: (result) => {
          this.activeInventory = this.getLatestInventoryRecord(result || []);
          this.activeInspection = null;
          const answersJson = this.activeInventory?.inventoryCheckList?.trim() ?? '';
          if (answersJson.length > 0) {
            this.applySavedAnswersJson(answersJson);
          }
        },
        error: () => {
          this.activeInventory = null;
          this.activeInspection = null;
        }
      });
    } else {
      this.inspectionService.getInspectionsByMaintenanceId(this.maintenanceRecord?.maintenanceId).pipe(take(1)).subscribe({
        next: (result) => {
          this.activeInspection = this.getLatestInspectionRecord(result || []);
          this.activeInventory = null;
          const answersJson = this.activeInspection?.inspectionCheckList?.trim() ?? '';
          if (answersJson.length > 0) {
            this.applySavedAnswersJson(answersJson);
          }
        },
        error: () => {
          this.activeInspection = null;
          this.activeInventory = null;
        }
      });
    }
  }

  getLatestInspectionRecord(inspections: InspectionResponse[]): InspectionResponse | null {
    const activeInspections = inspections.filter(inspection => inspection.isActive == true);
    if (activeInspections.length === 0) {
      return null;
    }

    return activeInspections.reduce((latest, current) => {
      const latestTimestamp = Date.parse(latest.modifiedOn || '');
      const currentTimestamp = Date.parse(current.modifiedOn || '');

      if (Number.isNaN(currentTimestamp)) {
        return latest;
      }
      if (Number.isNaN(latestTimestamp)) {
        return current;
      }

      return currentTimestamp > latestTimestamp ? current : latest;
    });
  }

  getLatestInventoryRecord(inventories: InventoryResponse[]): InventoryResponse | null {
    const activeInventories = inventories.filter(inventory => inventory.isActive == true);
    if (activeInventories.length === 0) {
      return null;
    }

    return activeInventories.reduce((latest, current) => {
      const latestTimestamp = Date.parse(latest.modifiedOn || '');
      const currentTimestamp = Date.parse(current.modifiedOn || '');

      if (Number.isNaN(currentTimestamp)) {
        return latest;
      }
      if (Number.isNaN(latestTimestamp)) {
        return current;
      }

      return currentTimestamp > latestTimestamp ? current : latest;
    });
  }
  //#endregion

  //#region Document Building
  buildChecklistGenerateDto(
    checklistJson: string,
    organizationId: string,
    officeId: number,
    propertyId: string,
    fileName: string,
    checklistTitle: string,
    documentType: DocumentType
  ): GenerateDocumentFromHtmlDto | null {
    if (!this.property) {
      return null;
    }

    const htmlContent = this.buildChecklistPdfHtml(checklistJson, checklistTitle);
    if (!htmlContent) {
      return null;
    }

    return {
      htmlContent,
      organizationId,
      officeId,
      officeName: this.property.officeName || this.maintenanceRecord?.officeName || '',
      propertyId,
      reservationId: null,
      documentTypeId: documentType,
      fileName,
      generatePdf: true
    };
  }

  /** Build PDF HTML from component state so images are embedded as data URLs (no photo API calls when viewing the document). */
  buildChecklistPdfHtml(checklistJson: string, checklistTitle: string): string | null {
    try {
      if (!this.sections.length) {
        return null;
      }

      const sectionHtml = this.sections.map(section => {
        const sectionTitle = this.escapeHtml(section.title || section.key || 'Section');
        const repeatIndexes = this.getRepeatIndexes(section.key);
        const setHtml = repeatIndexes.map((_, setIndex) => {
          const setItems = this.getSetItems(section.key, setIndex);
          const rowHtml = setItems.map(item => {
            const label = this.escapeHtml(item.text || '');
            const isChecked = !!this.form.get(this.itemControlNameById(section.key, setIndex, item.id))?.value;
            const checked = isChecked ? '☑' : '☐';
            const imageSrc = this.getItemPhotoSrc(item);
            const imageHtml = imageSrc
              ? `<div class="photo-wrap"><img src="${imageSrc}" alt="Line item photo" /></div>`
              : '';
            return `<li><span class="check">${checked}</span> <span>${label}</span>${imageHtml}</li>`;
          }).join('');

          return `<div class="set-wrap"><h4>Set ${setIndex + 1}</h4><ul>${rowHtml}</ul></div>`;
        }).join('');

        const notes = this.form.get(this.notesControlName(section.key))?.value || '';
        const notesHtml = notes ? `<p><strong>Comments:</strong> ${this.escapeHtml(notes)}</p>` : '';
        return `<section><h3>${sectionTitle}</h3>${setHtml}${notesHtml}</section>`;
      }).join('');

      const documentTitle = this.escapeHtml(checklistTitle);
      const propertyName = this.escapeHtml(this.property?.propertyCode || this.property?.propertyId || 'Property');
      const p = this.property;
      let headerLines = '';
      if (p) {
        const code = this.escapeHtml(String(p.propertyCode ?? p.propertyId ?? ''));
        if (code) headerLines += `<p><strong>Property Code:</strong> ${code}</p>`;
        const addrParts: string[] = [];
        if (p.address1) addrParts.push(this.escapeHtml(String(p.address1)));
        if (p.address2) addrParts.push(this.escapeHtml(String(p.address2)));
        if (p.suite) addrParts.push(this.escapeHtml(String(p.suite)));
        const csz = [p.city, p.state, p.zip].filter(Boolean).map(v => String(v)).join(', ');
        if (csz) addrParts.push(this.escapeHtml(csz));
        if (addrParts.length) headerLines += `<p><strong>Address:</strong> ${addrParts.join(', ')}</p>`;
        if (p.officeName) headerLines += `<p><strong>Office:</strong> ${this.escapeHtml(String(p.officeName))}</p>`;
      }
      return `
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; font-size: 12px; color: #222; }
              h1 { font-size: 20px; margin-bottom: 8px; }
              h3 { font-size: 15px; margin: 16px 0 8px 0; }
              h4 { font-size: 13px; margin: 10px 0 6px 0; }
              ul { padding-left: 16px; margin: 0; }
              li { margin-bottom: 8px; }
              .check { font-weight: 700; margin-right: 6px; }
              .photo-wrap { margin-top: 6px; }
              img { max-width: 320px; max-height: 240px; object-fit: contain; border: 1px solid #ddd; }
              .set-wrap { margin-bottom: 10px; }
            </style>
          </head>
          <body>
            <h1>${documentTitle} - ${propertyName}</h1>
            ${headerLines}
            ${sectionHtml}
          </body>
        </html>
      `;
    } catch {
      return null;
    }
  }

  escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
  //#endregion

  //#region Item Controls
  isChecklistFullyComplete(checklistJson: string): boolean {
    try {
      const root = JSON.parse(checklistJson) as { sections?: Array<{ sets?: Array<Array<{ checked?: boolean } | boolean>> }> };
      const sections = Array.isArray(root.sections) ? root.sections : [];
      if (sections.length === 0) {
        return false;
      }

      return sections.every(section =>
        Array.isArray(section.sets)
        && section.sets.every(set =>
          Array.isArray(set)
          && set.every(item => {
            if (typeof item === 'boolean') {
              return item === true;
            }

            return item?.checked === true;
          })
        )
      );
    } catch {
      return false;
    }
  }

  itemControlNameById(sectionKey: string, repeatIndex: number, itemId: string): string {
    return `${sectionKey}_${repeatIndex}_${itemId}`;
  }

  notesControlName(sectionKey: string): string {
    return `${sectionKey}_notes`;
  }
  

  //#endregion

  //#region Section Controls
  addSection(sectionIndex: number, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    const section = this.sections[sectionIndex];
    if (!section) return;

    const newRepeatIndex = this.getSetCount(section.key);
    const newSetItems = section.items.map(itemText => this.createChecklistItem(itemText));
    this.sectionSetItems[section.key].push(newSetItems);
    this.addControlsForSet(section.key, newRepeatIndex);
    this.sectionSetCounts[section.key] = newRepeatIndex + 1;
    this.applyModeState();
  }

  removeSection(sectionIndex: number, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    const section = this.sections[sectionIndex];
    if (!section) return;

    const currentCount = this.getSetCount(section.key);

    if (currentCount <= 1) {
      this.removeAllControlsForSection(section);
      delete this.sectionSetCounts[section.key];
      delete this.sectionSetItems[section.key];
      this.sections.splice(sectionIndex, 1);
      return;
    }

    const removeRepeatIndex = currentCount - 1;
    this.removeControlsForSet(section.key, removeRepeatIndex);
    this.sectionSetItems[section.key].pop();
    this.sectionSetCounts[section.key] = removeRepeatIndex;
  }

  getRepeatIndexes(sectionKey: string): number[] {
    return Array.from({ length: this.getSetCount(sectionKey) }, (_value, index) => index);
  }

  getSetCount(sectionKey: string): number {
    return this.sectionSetCounts[sectionKey] || 1;
  }

  getSetItems(sectionKey: string, repeatIndex: number): ChecklistItem[] {
    return this.sectionSetItems[sectionKey]?.[repeatIndex] || [];
  }

  createChecklistItem(item: string | ChecklistTemplateItem, isEditable?: boolean, checked: boolean = false, photoPath: string | null = null, documentId: string | null = null): ChecklistItem {
    const id = `item_${this.nextItemId++}`;
    const templateItem = typeof item === 'string'
      ? { text: item, requiresPhoto: false }
      : item;
    return {
      id,
      text: templateItem.text,
      requiresPhoto: templateItem.requiresPhoto,
      photoPath,
      documentId,
      isEditable: isEditable ?? this.getDefaultItemEditable(),
      checked
    };
  }
    
  getSetInstruction(sectionKey: string, repeatIndex: number): string {
    if (sectionKey === 'bedrooms') {
      return `Bedroom ${repeatIndex + 1}`;
    }
    if (sectionKey === 'bathrooms') {
      return `Bathroom ${repeatIndex + 1}`;
    }
    // Other sections (Living Room, Office, etc.): only show a set label when there is more than one set
    if (this.getSetCount(sectionKey) <= 1) {
      return '';
    }
    const section = this.sections.find(s => s.key === sectionKey);
    const title = section?.title ?? sectionKey;
    return `${title} ${repeatIndex + 1}`;
  }

  addControlsForSet(sectionKey: string, repeatIndex: number): void {
    this.getSetItems(sectionKey, repeatIndex).forEach(item => {
      this.form.addControl(this.itemControlNameById(sectionKey, repeatIndex, item.id), new FormControl(item.checked || false));
    });
    if (!this.form.contains(this.notesControlName(sectionKey))) {
      this.form.addControl(this.notesControlName(sectionKey), new FormControl(''));
    }
  }

  removeControlsForSet(sectionKey: string, repeatIndex: number): void {
    this.getSetItems(sectionKey, repeatIndex).forEach(item => {
      this.form.removeControl(this.itemControlNameById(sectionKey, repeatIndex, item.id));
    });
  }

  removeAllControlsForSection(section: ChecklistSection): void {
    const currentCount = this.getSetCount(section.key);
    for (let repeatIndex = 0; repeatIndex < currentCount; repeatIndex += 1) {
      this.removeControlsForSet(section.key, repeatIndex);
    }
    this.form.removeControl(this.notesControlName(section.key));
  }
    
  toSectionCount(value: number | null | undefined): number {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return 1;
    }
    return Math.max(1, Math.floor(value));
  }

  syncSectionSetCount(sectionKey: string, targetCount: number): void {
    const section = this.sections.find(s => s.key === sectionKey);
    if (!section) return;

    const currentCount = this.getSetCount(sectionKey);
    if (targetCount === currentCount) return;

    if (targetCount > currentCount) {
      for (let repeatIndex = currentCount; repeatIndex < targetCount; repeatIndex += 1) {
        const newSetItems = section.items.map(itemText => this.createChecklistItem(itemText));
        this.sectionSetItems[section.key].push(newSetItems);
        this.addControlsForSet(section.key, repeatIndex);
      }
    } else {
      for (let repeatIndex = currentCount - 1; repeatIndex >= targetCount; repeatIndex -= 1) {
        this.removeControlsForSet(section.key, repeatIndex);
        this.sectionSetItems[section.key].pop();
      }
    }

    this.sectionSetCounts[sectionKey] = targetCount;
  }
  //#endregion

  //#region Row Controls
  addRow(sectionKey: string, repeatIndex: number, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    const setItems = this.getSetItems(sectionKey, repeatIndex);
    if (!setItems) return;

    const newItem = this.createChecklistItem('', true);
    setItems.push(newItem);
    this.form.addControl(this.itemControlNameById(sectionKey, repeatIndex, newItem.id), new FormControl(newItem.checked || false));
    this.applyModeState();
  }

  removeRow(sectionKey: string, repeatIndex: number, itemId: string, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    const setItems = this.getSetItems(sectionKey, repeatIndex);
    const itemIndex = setItems.findIndex(item => item.id === itemId);
    if (itemIndex < 0) return;

    setItems.splice(itemIndex, 1);
    this.form.removeControl(this.itemControlNameById(sectionKey, repeatIndex, itemId));
  }

  updateEditableRowText(item: ChecklistItem, value: string): void {
    item.text = value;
  }

  onItemCheckChange(sectionKey: string, repeatIndex: number, item: ChecklistItem, event: { checked: boolean; source?: { checked: boolean } }): void {
    if (this.isTemplateMode || this.isReadonlyMode) {
      return;
    }

    if (event.checked && item.requiresPhoto && !this.getItemPhotoSrc(item)) {
      const control = this.form.get(this.itemControlNameById(sectionKey, repeatIndex, item.id));
      control?.setValue(false, { emitEvent: false });
      if (event.source) {
        event.source.checked = false;
      }
      this.openPhotoUpload(sectionKey, repeatIndex, item.id);
    }
  }
  //#endregion

  //#region Photo controls
  toggleRequiresPhoto(item: ChecklistItem, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    item.requiresPhoto = !item.requiresPhoto;
    if (!item.requiresPhoto) {
      item.photoPath = null;
    }
  }

  photoInputId(sectionKey: string, repeatIndex: number, itemId: string): string {
    return `photo_input_${sectionKey}_${repeatIndex}_${itemId}`;
  }

  openPhotoUpload(sectionKey: string, repeatIndex: number, itemId: string, event?: Event | null): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const inputElement = document.getElementById(this.photoInputId(sectionKey, repeatIndex, itemId)) as HTMLInputElement | null;
    inputElement?.click();
  }

  onPhotoSelected(sectionKey: string, repeatIndex: number, itemId: string, event: Event): void {
    const target = event.target as HTMLInputElement;
    const file = target.files && target.files.length > 0 ? target.files[0] : null;
    if (!file) {
      return;
    }

    const item = this.getSetItems(sectionKey, repeatIndex).find(currentItem => currentItem.id === itemId);
    if (!item) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64String = dataUrl.includes(',') ? dataUrl.split(',')[1] : btoa(dataUrl);
      const fileName = file.name || `${sectionKey}-${repeatIndex + 1}-${item.id}.jpg`;
      const contentType = file.type || 'image/jpeg';
      const currentUser = this.authService.getUser();
      const photoRequest: PhotoRequest = {
        organizationId: this.property?.organizationId || currentUser?.organizationId || '',
        officeId: this.property?.officeId || 0,
        maintenanceId: this.maintenanceRecord?.maintenanceId || null,
        fileDetails: {
          fileName,
          contentType,
          file: base64String,
          dataUrl: `data:${contentType};base64,${base64String}`
        }
      };

      this.photoService.uploadPhoto(photoRequest).pipe(take(1)).subscribe({
        next: (photoResponse: PhotoResponse) => {
          item.photoPath = photoResponse.photoPath || null;
          item.documentId = photoResponse.photoId || null;
          item.displayDataUrl = dataUrl;
          if (item.requiresPhoto) {
            const control = this.form.get(this.itemControlNameById(sectionKey, repeatIndex, item.id));
            control?.setValue(!!(item.photoPath || item.displayDataUrl));
          }
        },
        error: () => {
          const dialogData: GenericModalData = {
            title: 'Upload Failed',
            message: 'Unable to upload photo for this line item.',
            icon: 'error' as any,
            iconColor: 'warn',
            no: '',
            yes: 'OK',
            callback: (dialogRef) => dialogRef.close(true),
            useHTML: false
          };
          this.dialog.open(GenericModalComponent, {
            data: dialogData,
            width: '35rem'
          });
        }
      });
    };
    reader.readAsDataURL(file);
  }

  deletePhoto(sectionKey: string, repeatIndex: number, itemId: string, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    const item = this.getSetItems(sectionKey, repeatIndex).find(currentItem => currentItem.id === itemId);
    if (!item) {
      return;
    }

    item.photoPath = null;
    item.displayDataUrl = null;
    item.documentId = null;
    if (item.requiresPhoto) {
      const control = this.form.get(this.itemControlNameById(sectionKey, repeatIndex, item.id));
      control?.setValue(false);
    }
  }

  /** Image src: in-session data URL, or blob URL from download API. Never use photoPath (private blob URL) in browser. */
  getItemPhotoSrc(item: ChecklistItem): string | null {
    if (item.displayDataUrl) {
      return item.displayDataUrl;
    }
    if (item.documentId) {
      const cached = this.photoBlobUrlCache.get(item.documentId);
      if (cached) {
        return cached;
      }
    }
    return null;
  }

  openPhotoPreview(_item: ChecklistItem, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
  }
  //#endregion

  //#region Property Controls
  syncPropertyDrivenSections(): void {
    if (!this.property) {
      return;
    }
    this.syncSectionSetCount('bedrooms', this.toSectionCount(this.property.bedrooms));
    this.syncSectionSetCount('bathrooms', this.toSectionCount(this.property.bathrooms));
  }

  get propertyAddress(): string {
    if (!this.property) return 'N/A';

    const parts = [
      this.property.address1,
      this.property.address2,
      this.property.city,
      this.property.state,
      this.property.zip
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(', ') : 'N/A';
  }

  get alarmCodeDisplay(): string {
    if (!this.property?.alarm) return 'N/A';
    return this.property.alarmCode || 'Not set';
  }

  get keypadAccessCodesDisplay(): string {
    if (!this.property?.keypadAccess) return 'N/A';
    const codes = [this.property.masterKeyCode, this.property.tenantKeyCode].filter(Boolean);
    return codes.length > 0 ? codes.join(' / ') : 'Not set';
  }

  get wirelessNetworkIdDisplay(): string {
    return this.property?.internetNetwork || 'N/A';
  }

  get wirelessPasswordDisplay(): string {
    return this.property?.internetPassword || 'N/A';
  }
  //#endregion

  //#region Form Mode Methods
  applyModeState(): void {
    if (!this.form) return;

    if (this.isReadonlyMode) {
      this.form.disable({ emitEvent: false });
      return;
    }

    this.form.enable({ emitEvent: false });

    // In template mode, disable only the checkbox controls so they can't be checked;
    if (this.isTemplateMode) {
      this.sections.forEach(section => {
        this.getRepeatIndexes(section.key).forEach(repeatIndex => {
          this.getSetItems(section.key, repeatIndex).forEach(item => {
            const ctrl = this.form.get(this.itemControlNameById(section.key, repeatIndex, item.id));
            if (ctrl) ctrl.disable({ emitEvent: false });
          });
        });
      });
    }
  }

  get isTemplateMode(): boolean {
    return this.activeMode === 'template';
  }

  get isAnswerMode(): boolean {
    return this.activeMode === 'answer';
  }

  get isReadonlyMode(): boolean {
    return this.activeMode === 'readonly';
  }

  toggleTemplateMode(): void {
    if (this.isReadonlyMode) return;
    this.activeMode = this.isTemplateMode ? 'answer' : 'template';
    this.applyModeState();
  }

  getDefaultItemEditable(): boolean {
    return this.checklistType === 'inventory';
  }
  //#endregion
}
