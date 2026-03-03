import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { finalize, map, switchMap, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
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
import { MaintenanceRequest, MaintenanceResponse } from '../models/maintenance.model';
import { InventoryService } from '../services/inventory.service';
import { InspectionService } from '../services/inspection.service';
import { MaintenanceService } from '../services/maintenance.service';

export type ChecklistMode = 'template' | 'answer' | 'readonly';
export type ChecklistType = 'inspection' | 'inventory';

@Component({
  selector: 'app-inspection-checklist',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule],
  templateUrl: './inspection-checklist.component.html',
  styleUrl: './inspection-checklist.component.scss'
})
export class InspectionChecklistComponent implements OnChanges {
  @Input() property: PropertyResponse | null = null;
  @Input() templateJson: string | null = null;
  @Input() answersJson: string | null = null;
  @Input() checklistJson: string | null = null;
  @Input() mode: ChecklistMode = 'template';
  @Input() checklistType: ChecklistType = 'inspection';
  @Input() templateEnabled: boolean = true;
  @Input() isSaving: boolean = false;
  @Input() maintenanceRecord: MaintenanceResponse | null = null;
  @Input() pairedTemplateJson: string | null = null;
  @Output() saveChecklist = new EventEmitter<string>();
  @Output() saveAnswers = new EventEmitter<string>();
  @Output() templateSaved = new EventEmitter<string>();
  @Output() answersSaved = new EventEmitter<string>();

  readonly templateRequiredMessage = 'You need to save an Inspection Checklist Template for this property before you can use it.';
  readonly photoRequiredMessage = 'A photo is required for this item.';

  fb: FormBuilder;
  form: FormGroup;
  authService: AuthService;
  documentService: DocumentService;
  dialog: MatDialog;
  router: Router;
  maintenanceService: MaintenanceService;
  inspectionService: InspectionService;
  inventoryService: InventoryService;
  mappingService: MappingService;

  inspectorName: string = '';
  todayDate: string = '';
  sectionTemplates: ChecklistSection[] = INSPECTION_SECTIONS;
  sections: ChecklistSection[] = [];
  sectionSetCounts: Record<string, number> = {};
  sectionSetItems: Record<string, ChecklistItem[][]> = {};
  nextItemId = 0;
  hasLoadedSavedChecklist = false;
  activeMode: ChecklistMode = 'template';
  activeInspection: InspectionResponse | null = null;
  activeInventory: InventoryResponse | null = null;
  lastPropertyIdLoaded: string | null = null;
  isSavingTemplateInternal: boolean = false;
  isSavingAnswersInternal: boolean = false;
  isServiceError: boolean = false;

  constructor(
    fb: FormBuilder,
    authService: AuthService,
    documentService: DocumentService,
    dialog: MatDialog,
    router: Router,
    maintenanceService: MaintenanceService,
    inspectionService: InspectionService,
    inventoryService: InventoryService,
    mappingService: MappingService
  ) {
    this.fb = fb;
    this.authService = authService;
    this.documentService = documentService;
    this.dialog = dialog;
    this.router = router;
    this.maintenanceService = maintenanceService;
    this.inspectionService = inspectionService;
    this.inventoryService = inventoryService;
    this.mappingService = mappingService;
    const user = this.authService.getUser();
    this.inspectorName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Unknown User';
    this.todayDate = new Date().toLocaleDateString();
    this.initializeChecklistState();
  }

  //#region Checklist
  ngOnChanges(changes: SimpleChanges): void {
    // Always sync sectionTemplates to current checklistType first (Inspection vs Inventory use different sections).
    // This ensures the correct template is used even when both tabs share one component instance or binding order varies.
    this.sectionTemplates = this.checklistType === 'inventory' ? INVENTORY_SECTIONS : INSPECTION_SECTIONS;

    if (changes['checklistJson'] || changes['templateJson'] || changes['answersJson'] || changes['checklistType']) {
      const incomingTemplateJson = (this.templateJson ?? this.checklistJson) || null;
      const incomingAnswersJson = this.answersJson || null;

      this.hasLoadedSavedChecklist = false;
      this.initializeChecklistState();
      this.syncPropertyDrivenSections();

      if (incomingTemplateJson && incomingTemplateJson.trim().length > 0) {
        this.hasLoadedSavedChecklist = this.applySavedChecklistJson(incomingTemplateJson);
        if (!this.hasLoadedSavedChecklist) {
          this.initializeChecklistState();
          this.syncPropertyDrivenSections();
        }
      }

      if (incomingAnswersJson && incomingAnswersJson.trim().length > 0) {
        this.applySavedAnswersJson(incomingAnswersJson);
      }
    }

    if (changes['property'] && this.property && !this.hasLoadedSavedChecklist) {
      this.syncPropertyDrivenSections();
    }

    if (changes['property'] || changes['checklistType']) {
      const propertyId = this.property?.propertyId || null;
      if (!propertyId) {
        this.lastPropertyIdLoaded = null;
        this.activeInspection = null;
        this.activeInventory = null;
      } else if (this.lastPropertyIdLoaded !== propertyId || changes['checklistType']) {
        this.lastPropertyIdLoaded = propertyId;
        this.loadActiveRecord(propertyId);
      }
    }

    if (changes['mode'] || changes['templateEnabled']) {
      this.activeMode = this.resolveInitialMode();
      this.applyModeState();
    }
  }

  buildInspectionChecklistJson(): string {
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
            url: item.url || null
          }))
        )
      }))
    };

    return JSON.stringify(payload);
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
          url: null,
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
            setItems[index]?.url || null
          ));
        }

        return setItems.map(item => this.createChecklistItem(
          { text: item.text, requiresPhoto: item.requiresPhoto },
          item.isEditable === true,
          item.checked,
          item.url || null
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
      const parsedRoot = JSON.parse(rawChecklistJson) as {
        sections?: Array<{
          key: string;
          notes?: string;
          sets?: Array<Array<{ checked?: boolean; url?: string | null }>>;
        }>;
      };
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
            const isChecked = answerValue?.checked === true;
            item.url = typeof answerValue?.url === 'string' ? answerValue.url : null;
            control.setValue(isChecked, { emitEvent: false });
          });
        }

        const notesControl = this.form.get(this.notesControlName(section.key));
        if (notesControl && typeof sectionObject.notes === 'string') {
          notesControl.setValue(sectionObject.notes, { emitEvent: false });
        }

        hasAppliedAnswers = true;
      });

      return hasAppliedAnswers;
    } catch {
      return false;
    }
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
      const validSections = rawSections.filter(section =>
        typeof section?.key === 'string'
        && Array.isArray(section.sets)
      );

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

  get saveButtonText(): string {
    if (!this.isTemplateMode && this.totalItems > 0 && this.completedCount === this.totalItems) {
      return 'Submit';
    }

    return 'Save';
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
              url: item.url || null
            })
          )
        )
      }))
    };

    return JSON.stringify(payload);
  }

  resetFormMode(): void {
    if (this.isTemplateMode) {
      this.resetChecklist();
      return;
    }

    if (this.isAnswerMode) {
      this.clearAll();
    }
  }

  get isSavingInProgress(): boolean {
    return this.isSaving || this.isSavingTemplateInternal || this.isSavingAnswersInternal;
  }

  /** Saves the template to maintenance: inspection tab → inspectionCheckList only; inventory tab → inventoryCheckList only. Other tab's template is never changed. */
  saveTemplate(): void {
    const checklistJson = this.buildInspectionChecklistJson();
    this.saveChecklist.emit(checklistJson);

    if (!this.property) {
      return;
    }

    const user = this.authService.getUser();
    this.isSavingTemplateInternal = true;
    this.isServiceError = false;

    this.maintenanceService.getByPropertyId(this.property.propertyId).pipe(
      take(1),
      switchMap((latest) => {
        const existing = latest ?? null;
        const payload: MaintenanceRequest = {
          maintenanceId: existing?.maintenanceId ?? this.maintenanceRecord?.maintenanceId,
          organizationId: existing?.organizationId || this.maintenanceRecord?.organizationId || user?.organizationId || this.property.organizationId,
          officeId: existing?.officeId ?? this.maintenanceRecord?.officeId ?? this.property.officeId,
          officeName: existing?.officeName || this.maintenanceRecord?.officeName || this.property.officeName || '',
          propertyId: this.property.propertyId,
          inspectionCheckList: this.checklistType === 'inspection'
            ? checklistJson
            : (existing?.inspectionCheckList ?? this.maintenanceRecord?.inspectionCheckList ?? this.pairedTemplateJson ?? ''),
          inventoryCheckList: this.checklistType === 'inventory'
            ? checklistJson
            : (existing?.inventoryCheckList ?? this.maintenanceRecord?.inventoryCheckList ?? this.pairedTemplateJson ?? ''),
          notes: existing?.notes ?? this.maintenanceRecord?.notes ?? null,
          isActive: existing?.isActive ?? this.maintenanceRecord?.isActive ?? true
        };
        const save$ = payload.maintenanceId
          ? this.maintenanceService.updateMaintenance(payload)
          : this.maintenanceService.createMaintenance({ ...payload, maintenanceId: undefined });
        return save$;
      }),
      take(1),
      finalize(() => (this.isSavingTemplateInternal = false))
    ).subscribe({
      next: (saved: MaintenanceResponse) => {
        this.maintenanceRecord = saved;
        this.templateSaved.emit(checklistJson);
      },
      error: (_err: HttpErrorResponse) => {
        this.isServiceError = true;
      }
    });
  }

  /** Full save: inspection tab → inspection record (InspectionService), inventory tab → inventory record (InventoryService). */
  saveAnswersData(): void {
    const answersJson = this.buildChecklistAnswersJson();
    this.saveAnswers.emit(answersJson);

    if (!this.property) {
      return;
    }

    if (this.checklistType === 'inventory') {
      this.saveInventoryAnswers(answersJson);
      return;
    }

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
            this.answersSaved.emit(savedInspection.inspectionCheckList ?? inspectionChecklistJson);
            if (shouldSubmitInspection) {
              this.router.navigateByUrl(RouterUrl.MaintenanceList);
            }
          },
          error: (_err: HttpErrorResponse) => {
            this.isServiceError = true;
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
          this.answersSaved.emit(savedInspection.inspectionCheckList ?? inspectionChecklistJson);
          if (shouldSubmitInspection) {
            this.router.navigateByUrl(RouterUrl.MaintenanceList);
          }
        },
        error: (_err: HttpErrorResponse) => {
          this.isServiceError = true;
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
      `inspection-checklist-${this.property.propertyCode || this.property.propertyId}-${new Date().toISOString().slice(0, 10)}.pdf`,
      'Inspection Checklist',
      DocumentType.InspectionPhoto
    );
    if (!inspectionDto) {
      this.isSavingAnswersInternal = false;
      this.isServiceError = true;
      return;
    }

    this.documentService.generate(inspectionDto).pipe(take(1)).subscribe({
      next: (documentResponse: DocumentResponse) => {
        persistInspection(documentResponse.documentPath || null);
      },
      error: (_err: HttpErrorResponse) => {
        this.isSavingAnswersInternal = false;
        this.isServiceError = true;
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
          isActive: shouldSubmitInventory ? false : this.activeInventory.isActive
        };
        this.inventoryService.updateInventory(updatePayload).pipe(take(1), finalize(() => (this.isSavingAnswersInternal = false))).subscribe({
          next: (savedInventory: InventoryResponse) => {
            this.activeInventory = savedInventory;
            this.answersSaved.emit(savedInventory.inventoryCheckList ?? inventoryChecklistJson);
          },
          error: (_err: HttpErrorResponse) => {
            this.isServiceError = true;
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
          this.answersSaved.emit(savedInventory.inventoryCheckList ?? inventoryChecklistJson);
        },
        error: (_err: HttpErrorResponse) => {
          this.isServiceError = true;
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
      `inventory-checklist-${this.property.propertyCode || this.property.propertyId}-${new Date().toISOString().slice(0, 10)}.pdf`,
      'Inventory Checklist',
      DocumentType.InventoryPhoto
    );
    if (!inventoryDto) {
      this.isSavingAnswersInternal = false;
      this.isServiceError = true;
      return;
    }

    this.documentService.generate(inventoryDto).pipe(take(1)).subscribe({
      next: (documentResponse: DocumentResponse) => {
        persistInventory(documentResponse.documentPath || null);
      },
      error: (_err: HttpErrorResponse) => {
        this.isSavingAnswersInternal = false;
        this.isServiceError = true;
      }
    });
  }

  loadActiveRecord(propertyId: string): void {
    this.maintenanceService.getByPropertyId(propertyId).pipe(
      take(1),
      switchMap((maintenance) => {
        this.maintenanceRecord = maintenance ?? null;
        this.applyMaintenanceTemplate();
        if (this.checklistType === 'inventory') {
          return this.inventoryService.getInventoryByProperty(propertyId);
        }
        return this.inspectionService.getInspectionByPropertyId(propertyId).pipe(
          take(1),
          map((inspections) => this.mappingService.mapInspections(inspections || []))
        );
      }),
      take(1)
    ).subscribe({
      next: (result: InspectionResponse[] | InventoryResponse[]) => {
        if (this.checklistType === 'inventory') {
          this.activeInventory = this.getLatestInventoryRecord((result as InventoryResponse[]) || []);
          this.activeInspection = null;
        } else {
          this.activeInspection = this.getLatestInspectionRecord((result as InspectionResponse[]) || []);
          this.activeInventory = null;
        }
      },
      error: () => {
        this.maintenanceRecord = null;
        this.activeInspection = null;
        this.activeInventory = null;
      }
    });
  }

  /** Apply template from maintenance record: inspectionCheckList for inspection tab, inventoryCheckList for inventory tab. */
  private applyMaintenanceTemplate(): void {
    const templateJson = this.maintenanceRecord
      ? (this.checklistType === 'inspection'
          ? (this.maintenanceRecord.inspectionCheckList ?? '')
          : (this.maintenanceRecord.inventoryCheckList ?? ''))
      : '';
    this.initializeChecklistState();
    this.syncPropertyDrivenSections();
    if (templateJson && templateJson.trim().length > 0) {
      this.hasLoadedSavedChecklist = this.applySavedChecklistJson(templateJson);
      if (!this.hasLoadedSavedChecklist) {
        this.initializeChecklistState();
        this.syncPropertyDrivenSections();
      }
    }
  }

  getLatestInspectionRecord(inspections: InspectionResponse[]): InspectionResponse | null {
    const activeInspections = inspections.filter(inspection => inspection.isActive === true);
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
    const activeInventories = inventories.filter(inventory => inventory.isActive === true);
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
      fileName
    };
  }

  buildChecklistPdfHtml(checklistJson: string, checklistTitle: string): string | null {
    try {
      const root = JSON.parse(checklistJson) as { sections?: Array<{ title?: string; key?: string; notes?: string; sets?: Array<Array<{ text?: string; checked?: boolean; url?: string | null }>> }> };
      const sections = Array.isArray(root.sections) ? root.sections : [];
      if (sections.length === 0) {
        return null;
      }

      const sectionHtml = sections.map(section => {
        const sectionTitle = this.escapeHtml(section.title || section.key || 'Section');
        const sets = Array.isArray(section.sets) ? section.sets : [];
        const setHtml = sets.map((set, setIndex) => {
          const rows = Array.isArray(set) ? set : [];
          const rowHtml = rows.map(item => {
            const label = this.escapeHtml(item?.text || '');
            const checked = item?.checked === true ? '☑' : '☐';
            const imageHtml = item?.url
              ? `<div class="photo-wrap"><img src="${item.url}" alt="Line item photo" /></div>`
              : '';
            return `<li><span class="check">${checked}</span> <span>${label}</span>${imageHtml}</li>`;
          }).join('');

          return `<div class="set-wrap"><h4>Set ${setIndex + 1}</h4><ul>${rowHtml}</ul></div>`;
        }).join('');

        const notesHtml = section.notes ? `<p><strong>Comments:</strong> ${this.escapeHtml(section.notes)}</p>` : '';
        return `<section><h3>${sectionTitle}</h3>${setHtml}${notesHtml}</section>`;
      }).join('');

      const propertyName = this.escapeHtml(this.property?.propertyCode || this.property?.propertyId || 'Property');
      const documentTitle = this.escapeHtml(checklistTitle);
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
  itemControlName(sectionKey: string, index: number, repeatIndex: number): string {
    return `${sectionKey}_${repeatIndex}_${index}`;
  }

  itemControlNameById(sectionKey: string, repeatIndex: number, itemId: string): string {
    return `${sectionKey}_${repeatIndex}_${itemId}`;
  }

  notesControlName(sectionKey: string): string {
    return `${sectionKey}_notes`;
  }
  
  createChecklistItem(item: string | ChecklistTemplateItem, isEditable?: boolean, checked: boolean = false, url: string | null = null): ChecklistItem {
    const id = `item_${this.nextItemId++}`;
    const templateItem = typeof item === 'string'
      ? { text: item, requiresPhoto: false }
      : item;
    return {
      id,
      text: templateItem.text,
      requiresPhoto: templateItem.requiresPhoto,
      url,
      isEditable: isEditable ?? this.getDefaultItemEditable(),
      checked
    };
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

  addRow(sectionKey: string, repeatIndex: number, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    const setItems = this.getSetItems(sectionKey, repeatIndex);
    if (!setItems) return;

    const newItem = this.createChecklistItem('', true);
    setItems.push(newItem);
    this.form.addControl(this.itemControlNameById(sectionKey, repeatIndex, newItem.id), new FormControl(newItem.checked || false));
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

    if (event.checked && item.requiresPhoto && !item.url) {
      const control = this.form.get(this.itemControlNameById(sectionKey, repeatIndex, item.id));
      control?.setValue(false, { emitEvent: false });
      if (event.source) {
        event.source.checked = false;
      }

      const dialogData: GenericModalData = {
        title: 'Photo Required',
        message: this.photoRequiredMessage,
        icon: 'warning' as any,
        iconColor: 'warn',
        no: '',
        yes: 'OK',
        callback: (dialogRef) => dialogRef.close(true),
        useHTML: false,
        hideClose: true
      };

      this.dialog.open(GenericModalComponent, {
        data: dialogData,
        width: '35rem'
      });
    }
  }

  toggleRequiresPhoto(item: ChecklistItem, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    item.requiresPhoto = !item.requiresPhoto;
    if (!item.requiresPhoto) {
      item.url = null;
    }
  }

  photoInputId(sectionKey: string, repeatIndex: number, itemId: string): string {
    return `photo_input_${sectionKey}_${repeatIndex}_${itemId}`;
  }

  openPhotoUpload(sectionKey: string, repeatIndex: number, itemId: string, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

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
      const base64String = btoa(reader.result as string);
      const fileName = file.name || `${sectionKey}-${repeatIndex + 1}-${item.id}.jpg`;
      const fileExtension = fileName.includes('.') ? (fileName.split('.').pop() || 'jpg') : 'jpg';
      const contentType = file.type || 'image/jpeg';
      const currentUser = this.authService.getUser();
      const documentRequest: DocumentRequest = {
        organizationId: this.property?.organizationId || currentUser?.organizationId || '',
        officeId: this.property?.officeId || 0,
        propertyId: this.property?.propertyId || null,
        reservationId: null,
        documentTypeId: DocumentType.InspectionPhoto,
        fileName: fileName.replace('.' + fileExtension, ''),
        fileExtension,
        contentType,
        documentPath: '',
        fileDetails: {
          fileName,
          contentType,
          file: base64String,
          dataUrl: `data:${contentType};base64,${base64String}`
        },
        isDeleted: false
      };

      this.documentService.createDocument(documentRequest).pipe(take(1)).subscribe({
        next: (documentResponse: DocumentResponse) => {
          const returnedDataUrl = documentResponse.fileDetails?.dataUrl
            || (
              documentResponse.fileDetails?.file && documentResponse.fileDetails?.contentType
                ? `data:${documentResponse.fileDetails.contentType};base64,${documentResponse.fileDetails.file}`
                : null
            );

          item.url = returnedDataUrl || null;
          if (item.requiresPhoto) {
            const control = this.form.get(this.itemControlNameById(sectionKey, repeatIndex, item.id));
            control?.setValue(!!item.url);
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
    reader.readAsBinaryString(file);
  }

  deletePhoto(sectionKey: string, repeatIndex: number, itemId: string, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    const item = this.getSetItems(sectionKey, repeatIndex).find(currentItem => currentItem.id === itemId);
    if (!item) {
      return;
    }

    item.url = null;
    if (item.requiresPhoto) {
      const control = this.form.get(this.itemControlNameById(sectionKey, repeatIndex, item.id));
      control?.setValue(false);
    }
  }

  openPhotoPreview(item: ChecklistItem, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (!item.url) {
      return;
    }

    const dialogData: GenericModalData = {
      title: 'Photo Preview',
      message: `<div style="text-align:center;"><img src="${item.url}" alt="Line item photo" style="max-width:100%; max-height:70vh; object-fit:contain;" /></div>`,
      icon: '' as any,
      iconColor: 'primary',
      no: '',
      yes: 'OK',
      callback: (dialogRef) => dialogRef.close(true),
      useHTML: true
    };

    this.dialog.open(GenericModalComponent, {
      data: dialogData,
      width: '48rem'
    });
  }

  getSetInstruction(sectionKey: string, repeatIndex: number): string {
    if (sectionKey === 'bedrooms') {
      return `Bedroom ${repeatIndex + 1}`;
    }
    if (sectionKey === 'bathrooms') {
      return `Bathroom ${repeatIndex + 1}`;
    }
    return '';
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

  applyModeState(): void {
    if (!this.form) {
      return;
    }

    if (this.isReadonlyMode) {
      this.form.disable({ emitEvent: false });
      return;
    }

    this.form.enable({ emitEvent: false });
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

  get modeLabel(): string {
    if (this.isTemplateMode) {
      return 'Template Mode';
    }
    if (this.isAnswerMode) {
      return 'Answer Mode';
    }
    return 'Read Only';
  }

  get templateToggleLabel(): string {
    return this.isTemplateMode ? 'Template: On' : 'Template: Off';
  }

  toggleTemplateMode(event?: { source?: { checked: boolean } }): void {
    if (this.isReadonlyMode) {
      return;
    }

    if (this.isTemplateMode && this.isTemplateRequired()) {
      if (event?.source) {
        event.source.checked = true;
      }
      this.activeMode = 'template';
      this.applyModeState();
      const dialogData: GenericModalData = {
        title: 'Inspection Template Required',
        message: this.templateRequiredMessage,
        icon: 'warning' as any,
        iconColor: 'warn',
        no: '',
        yes: 'OK',
        callback: (dialogRef) => {
          this.activeMode = 'template';
          this.applyModeState();
          dialogRef.close(true);
        },
        useHTML: false,
        hideClose: true
      };

      this.dialog.open(GenericModalComponent, {
        data: dialogData,
        width: '35rem'
      });
      return;
    }

    this.activeMode = this.isTemplateMode ? 'answer' : 'template';
    this.applyModeState();
  }

  resolveInitialMode(): ChecklistMode {
    if (this.mode === 'readonly') {
      return 'readonly';
    }

    if (this.isTemplateRequired()) {
      return 'template';
    }

    return this.templateEnabled ? 'template' : 'answer';
  }

  /** True if no template is available from any source (input, maintenance record, or already-loaded state). */
  isTemplateRequired(): boolean {
    if (this.templateJson && this.templateJson.trim().length > 0) {
      return false;
    }
    if (this.hasLoadedSavedChecklist) {
      return false;
    }
    const fromMaintenance = this.checklistType === 'inspection'
      ? (this.maintenanceRecord?.inspectionCheckList ?? '')
      : (this.maintenanceRecord?.inventoryCheckList ?? '');
    return fromMaintenance.trim().length === 0;
  }

  getDefaultItemEditable(): boolean {
    return this.checklistType === 'inventory';
  }
  //#endregion
}
