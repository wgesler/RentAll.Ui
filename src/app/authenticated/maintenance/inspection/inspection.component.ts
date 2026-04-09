import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, EventEmitter, HostListener, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Subscription, finalize, firstValueFrom, forkJoin, map, of, switchMap, take } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { ConfigService } from '../../../services/config.service';
import { PropertyResponse } from '../../properties/models/property.model';
import { DocumentType } from '../../documents/models/document.enum';
import { DocumentRequest, DocumentResponse, GenerateDocumentFromHtmlDto } from '../../documents/models/document.model';
import { DocumentService } from '../../documents/services/document.service';
import { GenericModalComponent } from '../../shared/modals/generic/generic-modal.component';
import { GenericModalData } from '../../shared/modals/generic/models/generic-modal-data';
import { ImageViewDialogComponent } from '../../shared/modals/image-view-dialog/image-view-dialog.component';
import { ImageViewDialogData } from '../../shared/modals/image-view-dialog/image-view-dialog-data';
import { ChecklistItem, ChecklistSection, ChecklistTemplateItem, INSPECTION_SECTIONS, SavedChecklistSection } from '../models/checklist-sections';
import { getInspectionType, getInspectionTypes, InspectionType } from '../models/maintenance-enums';
import { InspectionRequest, InspectionResponse } from '../models/inspection.model';
import { MaintenanceRequest, MaintenanceResponse } from '../models/maintenance.model';
import { InspectionService } from '../services/inspection.service';
import { MaintenanceService } from '../services/maintenance.service';
import { PhotoRequest, PhotoResponse } from '../../documents/models/photo.model';
import { PhotoService } from '../../documents/services/photo.service';
import { UtilityService } from '../../../services/utility.service';
import { JwtUser } from '../../../public/login/models/jwt';
import { DialogMissingCountComponent } from './dialog-missing-count.component';
import { DialogIssueItemComponent } from './dialog-issue-item.component';
import { ChecklistIssueEntry, DialogChecklistIssuesComponent } from './dialog-checklist-issues.component';
import { UserGroups } from '../../users/models/user-enums';
import { UnsavedChangesDialogService } from '../../shared/modals/unsaved-changes/unsaved-changes-dialog.service';

export type ChecklistMode = 'template' | 'answer' | 'readonly';
export type ChecklistType = 'inspection';

@Component({
  standalone: true,
  selector: 'app-inspection',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule],
  templateUrl: './inspection.component.html',
  styleUrl: './inspection.component.scss'
})
export class InspectionComponent implements OnChanges, OnDestroy, OnInit {
  @Input() property: PropertyResponse | null = null;
  @Input() templateJson: string | null = null;
  @Input() answersJson: string | null = null;
  /** When `mode` is readonly (e.g. dialog), optional type from the parent when API context is not loaded. */
  @Input() readonlyInspectionTypeId: number | null = null;
  @Input() mode: ChecklistMode = 'answer';
  @Input() checklistType: ChecklistType = 'inspection';
  /** Set by maintenance-shell title bar when embedding; required with Move-In / Move-Out inspection types. */
  @Input() titleBarReservationId: string | null = null;
  @Input() titleBarReservationDisplayText: string | null = null;
  @Output() inspectionSubmitted = new EventEmitter<void>();
  /** Emits persisted `activeInspection.reservationId` after load/save/patch so the maintenance shell title bar stays in sync. */
  @Output() titleBarReservationSync = new EventEmitter<string | null>();

  readonly inspectionTypeOptions = getInspectionTypes();
  inspectionTypeIdControl = new FormControl<number>(InspectionType.Online, { nonNullable: true });
  shellReservationFieldTouched = false;
  private inspectionTypeSubscription?: Subscription;

  /** Cache of documentId -> blob URL for photos loaded via download API (private blob storage). */
  readonly maxSourceImageBytes = 20 * 1024 * 1024; // 20 MB
  readonly maxUploadedImageBytes = 1.5 * 1024 * 1024; // 1.5 MB target
  readonly maxImageDimension = 1920;
  photoBlobUrlCache = new Map<string, string>();

  form: FormGroup;
  isServiceError: boolean = false;
  hasInitialized = false;
  activeMode: ChecklistMode = 'template';
  activeInspection: InspectionResponse | null = null;
  isSavingTemplateInternal: boolean = false;
  isSavingAnswersInternal: boolean = false;

  lastPropertyIdLoaded: string | null = null;
  maintenanceRecord: MaintenanceResponse | null = null;

  inspectorName: string = '';
  todayDate: string = '';
  user: JwtUser | null = null;
  isAdmin = false;
  sectionTemplates: ChecklistSection[] = INSPECTION_SECTIONS;
  sections: ChecklistSection[] = [];
  sectionSetCounts: Record<string, number> = {};
  sectionSetItems: Record<string, ChecklistItem[][]> = {};
  nextItemId = 0;
  selectionModeOptions: Array<{ value: 'allRequired' | 'exactlyOne' | 'atLeastOne'; label: string }> = [
    { value: 'allRequired', label: 'All Required' },
    { value: 'exactlyOne', label: 'Exactly One' },
    { value: 'atLeastOne', label: 'At Least One' }
  ];

  constructor(
    public fb: FormBuilder,
    public authService: AuthService,
    public documentService: DocumentService,
    public utilityService: UtilityService,
    public photoService: PhotoService,
    public toastr: ToastrService,
    public dialog: MatDialog,
    public maintenanceService: MaintenanceService,
    public inspectionService: InspectionService,
    public mappingService: MappingService,
    private configService: ConfigService,
    private cdr: ChangeDetectorRef,
    private unsavedChangesDialogService: UnsavedChangesDialogService
  ) {
  }

  //#region Checklist
  ngOnInit(): void {
    this.user = this.authService.getUser();
    this.isAdmin =
      this.utilityService.hasRole(this.user?.userGroups, UserGroups.SuperAdmin) ||
      this.utilityService.hasRole(this.user?.userGroups, UserGroups.Admin) ||
      this.utilityService.hasRole(this.user?.userGroups, UserGroups.PropertyManagerAdmin);
    this.todayDate = new Date().toLocaleDateString();
    this.inspectorName = `${this.user?.firstName || ''} ${this.user?.lastName || ''}`.trim() || 'Unknown User';
    this.sectionTemplates = INSPECTION_SECTIONS;
    this.activeMode = this.mode;

    this.initializeChecklistState();
    this.syncPropertyDrivenSections();
    this.loadChecklistContext();
    this.hasInitialized = true;

    this.inspectionTypeSubscription = this.inspectionTypeIdControl.valueChanges.subscribe(type => {
      if (this.isReadonlyMode || this.isTemplateMode) {
        return;
      }
      if (type === InspectionType.MoveIn || type === InspectionType.MoveOut) {
        if (!this.hasShellReservationSelected) {
          this.shellReservationFieldTouched = true;
        }
      } else {
        this.shellReservationFieldTouched = false;
        this.titleBarReservationSync.emit(null);
      }
      this.cdr.markForCheck();
    });
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

    if (changes['property']) {
      const propertyId = this.property?.propertyId ?? null;
      if (propertyId && propertyId !== this.lastPropertyIdLoaded) {
        this.initializeChecklistState();
        this.syncPropertyDrivenSections();
        this.loadChecklistContext();
      }
    }

    if (changes['mode']) {
      this.activeMode = this.mode;
      this.applyModeState();
    }

    if (this.hasInitialized && changes['readonlyInspectionTypeId'] && this.isReadonlyMode) {
      this.patchInspectionTypeFromContext();
    }

    if (this.hasInitialized && changes['titleBarReservationId'] && this.hasShellReservationSelected) {
      this.shellReservationFieldTouched = false;
      this.cdr.markForCheck();
    }
  }

  initializeChecklistState(): void {
    this.sections = this.sectionTemplates.map(section => ({
      ...section,
      selectionMode: section.selectionMode ?? 'allRequired',
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
          requiresCount: item.requiresCount ?? false,
          count: item.count ?? null,
          photoPath: null,
          checked: false,
          isEditable: this.getDefaultItemEditable(),
          issue: null,
          hasIssue: false
        }))];

      this.sections.push({
        key: savedSection.key,
        title,
        hint,
        selectionMode: templateSection?.selectionMode ?? savedSection.selectionMode ?? 'allRequired',
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
            setItems[index]?.documentId || null,
            setItems[index]?.count ?? item.count ?? null,
            setItems[index]?.issue ?? null,
            setItems[index]?.hasIssue === true
          ));
        }

        return setItems.map(item => this.createChecklistItem(
          {
            text: item.text,
            requiresPhoto: item.requiresPhoto,
            requiresCount: (baseItems.find(templateItem => templateItem.text === item.text)?.requiresCount) ?? item.requiresCount ?? false
          },
          item.isEditable === true,
          item.checked,
          item.photoPath ?? null,
          item.documentId || null,
          item.count ?? null,
          item.issue ?? null,
          item.hasIssue === true
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
          selectionMode?: 'allRequired' | 'exactlyOne' | 'atLeastOne';
          notes?: string;
          sets?: Array<Array<{ checked?: boolean; photoPath?: string | null; documentId?: string | null; count?: number | null; requiresCount?: boolean; issue?: string | null; hasIssue?: boolean } | boolean>>;
        }>;
        inspectionCheckList?: string;
      };

      const nestedChecklistJson = typeof parsedRoot.inspectionCheckList === 'string'
        ? parsedRoot.inspectionCheckList
        : null;
      if (nestedChecklistJson) {
        parsedRoot = JSON.parse(nestedChecklistJson) as {
          sections?: Array<{
            key: string;
            selectionMode?: 'allRequired' | 'exactlyOne' | 'atLeastOne';
            notes?: string;
            sets?: Array<Array<{ checked?: boolean; photoPath?: string | null; documentId?: string | null; count?: number | null; requiresCount?: boolean; issue?: string | null; hasIssue?: boolean } | boolean>>;
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
        if (sectionObject.selectionMode === 'allRequired' || sectionObject.selectionMode === 'exactlyOne' || sectionObject.selectionMode === 'atLeastOne') {
          section.selectionMode = sectionObject.selectionMode;
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
            item.count = typeof answerValue === 'object' && answerValue !== null && typeof answerValue.count === 'number'
              ? answerValue.count
              : null;
            const rawIssue = typeof answerValue === 'object' && answerValue !== null && typeof answerValue.issue === 'string'
              ? answerValue.issue
              : null;
            item.issue = rawIssue;
            item.hasIssue = typeof answerValue === 'object' && answerValue !== null && typeof answerValue.hasIssue === 'boolean'
              ? answerValue.hasIssue
              : !!(rawIssue && rawIssue.trim().length > 0);
            const countControl = this.form.get(this.countControlNameById(section.key, repeatIndex, item.id));
            if (countControl) {
              countControl.setValue(item.count, { emitEvent: false });
            }
            const issueControl = this.form.get(this.issueControlNameById(section.key, repeatIndex, item.id));
            if (issueControl) {
              issueControl.setValue(item.issue ?? '', { emitEvent: false });
            }
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
  loadPhotoBlobUrls(): void {
    const documentIdsToLoad = new Set<string>();
    Object.values(this.sectionSetItems).forEach(sets => {
      sets.forEach(items => {
        items.forEach(item => {
          if (item.documentId && this.isLikelyGuid(item.documentId) && !item.displayDataUrl && !this.photoBlobUrlCache.has(item.documentId)) {
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
          } else if (response.photoPath) {
            viewUrl = this.normalizePhotoPath(response.photoPath);
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
    this.inspectionTypeSubscription?.unsubscribe();
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

  //#region CheckList Top Buttons
  get totalItems(): number {
    return this.sections.reduce((total, section) => {
      if (this.isSectionCountedAsSingleUnit(section)) {
        return total + 1;
      }
      return total + this.getRepeatIndexes(section.key).reduce((setTotal, repeatIndex) => {
        return setTotal + this.getSetItems(section.key, repeatIndex).length;
      }, 0);
    }, 0);
  }

  get completedCount(): number {
    let completed = 0;
    this.sections.forEach(section => {
      if (this.isSectionCountedAsSingleUnit(section)) {
        if (this.isSelectionModeSectionComplete(section)) {
          completed += 1;
        }
        return;
      }

      for (let repeatIndex = 0; repeatIndex < this.getSetCount(section.key); repeatIndex += 1) {
        this.getSetItems(section.key, repeatIndex).forEach(item => {
          if (this.form.get(this.itemControlNameById(section.key, repeatIndex, item.id))?.value && item.hasIssue !== true) {
            completed += 1;
          }
        });
      }
    });
    return completed;
  }

  get errorsCount(): number {
    let errors = 0;
    this.sections.forEach(section => {
      for (let repeatIndex = 0; repeatIndex < this.getSetCount(section.key); repeatIndex += 1) {
        this.getSetItems(section.key, repeatIndex).forEach(item => {
          const isChecked = !!this.form.get(this.itemControlNameById(section.key, repeatIndex, item.id))?.value;
          if (isChecked && item.hasIssue === true) {
            errors += 1;
          }
        });
      }
    });
    return errors;
  }

  get issueEntries(): ChecklistIssueEntry[] {
    const issues: ChecklistIssueEntry[] = [];
    this.sections.forEach(section => {
      for (let repeatIndex = 0; repeatIndex < this.getSetCount(section.key); repeatIndex += 1) {
        this.getSetItems(section.key, repeatIndex).forEach(item => {
          const isChecked = !!this.form.get(this.itemControlNameById(section.key, repeatIndex, item.id))?.value;
          if (!isChecked || item.hasIssue !== true) {
            return;
          }
          issues.push({
            sectionTitle: section.title,
            setLabel: this.getSetInstruction(section.key, repeatIndex) || undefined,
            issueText: (item.issue || '').trim() || 'No issue text provided',
            photoSrc: this.getItemPhotoSrc(item)
          });
        });
      }
    });
    return issues;
  }

  isSectionCountedAsSingleUnit(section: ChecklistSection): boolean {
    return section.selectionMode === 'exactlyOne' || section.selectionMode === 'atLeastOne';
  }

  isSelectionModeSectionComplete(section: ChecklistSection): boolean {
    for (let repeatIndex = 0; repeatIndex < this.getSetCount(section.key); repeatIndex += 1) {
      const setItems = this.getSetItems(section.key, repeatIndex);
      if (!setItems.length) {
        return false;
      }

      const checkedItems = setItems.filter(item =>
        !!this.form.get(this.itemControlNameById(section.key, repeatIndex, item.id))?.value
      );
      if (checkedItems.some(item => item.hasIssue === true)) {
        return false;
      }

      if (section.selectionMode === 'exactlyOne') {
        if (checkedItems.length !== 1) {
          return false;
        }
      } else if (section.selectionMode === 'atLeastOne') {
        if (checkedItems.length < 1) {
          return false;
        }
      }

      const allCheckedItemsHaveValidCount = checkedItems.every(item => {
        if (!item.requiresCount) {
          return true;
        }
        const countValue = this.getCountValue(section.key, repeatIndex, item.id);
        return typeof countValue === 'number' && !Number.isNaN(countValue);
      });
      if (!allCheckedItemsHaveValidCount) {
        return false;
      }
    }

    return true;
  }

  clearAll(): void {
    const applyLocalClear = (): void => {
      const patch: Record<string, unknown> = {};
      this.sections.forEach(section => {
        patch[this.notesControlName(section.key)] = '';
        for (let repeatIndex = 0; repeatIndex < this.getSetCount(section.key); repeatIndex += 1) {
          this.getSetItems(section.key, repeatIndex).forEach(item => {
            patch[this.itemControlNameById(section.key, repeatIndex, item.id)] = false;
            patch[this.countControlNameById(section.key, repeatIndex, item.id)] = null;
            patch[this.issueControlNameById(section.key, repeatIndex, item.id)] = '';
            item.count = null;
            item.photoPath = null;
            item.documentId = null;
            item.displayDataUrl = null;
            item.issue = null;
            item.hasIssue = false;
          });
        }
      });
      this.form.patchValue(patch, { emitEvent: false });
      this.photoBlobUrlCache.clear();
    };
    const autoSaveClearedInspection = (): void => {
      if (this.isReadonlyMode || this.isTemplateMode || this.isSavingInProgress) {
        return;
      }
      this.saveAnswersData();
    };

    this.deleteChecklistPhotoDocuments().pipe(take(1)).subscribe({
      next: () => {
        applyLocalClear();
        autoSaveClearedInspection();
      },
      error: () => {
        applyLocalClear();
        this.toastr.error('Some photos could not be deleted from storage.', CommonMessage.Error);
        autoSaveClearedInspection();
      }
    });
  }

  resetChecklist(): void {
    this.initializeChecklistState();
    this.applyModeState();
  }

  get saveButtonText(): string {
    if (!this.isTemplateMode && this.canSubmitInspection) {
      return 'Submit';
    }

    return 'Save';
  } 

  get canSubmitInspection(): boolean {
    if (this.isTemplateMode || this.isReadonlyMode || !this.form || this.sections.length === 0) {
      return false;
    }
    return this.isChecklistFullyComplete(this.buildChecklistAnswersJson());
  }
  //#endregion

  //#region Saving Methods
  get isSavingInProgress(): boolean {
    return this.isSavingTemplateInternal || this.isSavingAnswersInternal;
  }

  get shellReservationRequired(): boolean {
    if (this.isReadonlyMode || this.isTemplateMode) {
      return false;
    }
    const t = this.inspectionTypeIdControl.value;
    return t === InspectionType.MoveIn || t === InspectionType.MoveOut;
  }

  get hasShellReservationSelected(): boolean {
    const id = this.titleBarReservationId;
    return id != null && String(id).trim().length > 0;
  }

  get hasReservationResolved(): boolean {
    if (this.hasShellReservationSelected) {
      return true;
    }
    const sid = this.activeInspection?.reservationId;
    return sid != null && String(sid).trim().length > 0;
  }

  get showTitleBarReservationError(): boolean {
    return this.shellReservationRequired && !this.hasShellReservationSelected && this.shellReservationFieldTouched;
  }

  get titleBarReservationRequired(): boolean {
    return this.shellReservationRequired;
  }

  private reservationIdForInspectionPayload(serverReservation: string | null | undefined): string | null {
    if (this.inspectionTypeIdControl.value === InspectionType.Online) {
      return null;
    }
    const shell = this.titleBarReservationId?.trim();
    if (shell) {
      return shell;
    }
    if (serverReservation != null && String(serverReservation).trim() !== '') {
      return String(serverReservation).trim();
    }
    return null;
  }

  validateShellReservationForSave(): boolean {
    if (!this.shellReservationRequired || this.hasShellReservationSelected) {
      return true;
    }
    this.shellReservationFieldTouched = true;
    this.cdr.markForCheck();
    this.toastr.error('Reservation is required for Move-In and Move-Out inspections.', CommonMessage.Error);
    return false;
  }

  private syncInspectionTypeIdControlDisabledForSave(): void {
    if (this.isSavingTemplateInternal || this.isSavingAnswersInternal) {
      this.inspectionTypeIdControl.disable({ emitEvent: false });
    } else {
      this.inspectionTypeIdControl.enable({ emitEvent: false });
    }
  }

  captureSavedStateSignature(): void {
    this.form?.markAsPristine();
    this.form?.markAsUntouched();
    this.inspectionTypeIdControl.markAsPristine();
  }

  patchInspectionTypeFromContext(): void {
    const id =
      (this.isReadonlyMode ? this.readonlyInspectionTypeId : null) ??
      this.activeInspection?.inspectionTypeId ??
      InspectionType.Online;
    this.inspectionTypeIdControl.setValue(id, { emitEvent: false });
    this.inspectionTypeIdControl.markAsPristine();
    if (this.hasReservationResolved) {
      this.shellReservationFieldTouched = false;
    }
    this.emitTitleBarReservationSync();
  }

  private emitTitleBarReservationSync(): void {
    const rid = (this.activeInspection?.reservationId || '').trim();
    this.titleBarReservationSync.emit(rid.length > 0 ? rid : null);
  }

  /** Call from maintenance shell when switching back to the Inspection tab so the reservation dropdown matches persisted inspection data. */
  pushTitleBarReservationToShell(): void {
    this.emitTitleBarReservationSync();
  }

  get titleBarReservationDirty(): boolean {
    if (this.isReadonlyMode || this.isTemplateMode) {
      return false;
    }
    if (this.inspectionTypeIdControl.value === InspectionType.Online) {
      return false;
    }
    const shell = (this.titleBarReservationId || '').trim();
    const persisted = (this.activeInspection?.reservationId || '').trim();
    return shell !== persisted;
  }

  hasUnsavedChanges(): boolean {
    if (this.isReadonlyMode || this.isSavingInProgress || !this.form) {
      return false;
    }
    if (!this.isTemplateMode && this.inspectionTypeIdControl.dirty) {
      return true;
    }
    if (!this.isTemplateMode && this.titleBarReservationDirty) {
      return true;
    }
    return this.form.dirty;
  }

  async confirmNavigationWithUnsavedChanges(): Promise<boolean> {
    if (!this.hasUnsavedChanges()) {
      return true;
    }
    const action = await this.unsavedChangesDialogService.confirmLeaveOrSave();
    if (action === 'save') {
      return this.saveChecklistDataAndWait();
    }
    this.discardUnsavedChanges();
    return true;
  }

  @HostListener('window:beforeunload', ['$event'])
  handleBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.hasUnsavedChanges()) {
      return;
    }
    event.preventDefault();
    event.returnValue = '';
  }

  discardUnsavedChanges(): void {
    if (this.isTemplateMode) {
      const savedTemplateJson = this.maintenanceRecord?.inspectionCheckList?.trim() ?? '';
      if (savedTemplateJson.length > 0) {
        this.applySavedChecklistJson(savedTemplateJson);
      } else {
        this.resetChecklist();
      }
      this.captureSavedStateSignature();
      return;
    }

    const savedAnswersJson = this.activeInspection?.inspectionCheckList?.trim() ?? '';
    if (savedAnswersJson.length > 0) {
      this.applySavedAnswersJson(savedAnswersJson);
    } else {
      this.applySavedAnswersJson(this.buildEmptyChecklistAnswersJson());
    }
    this.patchInspectionTypeFromContext();
    this.captureSavedStateSignature();
  }

  saveChecklistData(submitRequested: boolean = false, onComplete?: (saved: boolean) => void): void {
    if (this.isReadonlyMode) {
      onComplete?.(false);
      return;
    }

    if (this.isTemplateMode) {
      this.saveTemplate(onComplete);
      return;
    }

    this.saveAnswersData(submitRequested, onComplete);
  }

  saveChecklistDataAndWait(submitRequested: boolean = false): Promise<boolean> {
    return new Promise(resolve => this.saveChecklistData(submitRequested, resolve));
  }

  buildChecklistTemplateJson(): string {
    const payload = {
      sections: this.sections.map(section => ({
        key: section.key,
        title: section.title,
        selectionMode: section.selectionMode ?? 'allRequired',
        notes: this.form.get(this.notesControlName(section.key))?.value || '',
        sets: this.getRepeatIndexes(section.key).map(repeatIndex =>
          this.getSetItems(section.key, repeatIndex).map(item => ({
            text: item.text,
            requiresPhoto: item.requiresPhoto,
            requiresCount: item.requiresCount,
            count: item.requiresCount
              ? this.getCountValue(section.key, repeatIndex, item.id)
              : null,
            isEditable: item.isEditable,
            photoPath: item.photoPath ?? null,
            issue: item.issue ?? null,
            hasIssue: item.hasIssue === true
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
        selectionMode: section.selectionMode ?? 'allRequired',
        notes: this.form.get(this.notesControlName(section.key))?.value || '',
        sets: this.getRepeatIndexes(section.key).map(repeatIndex =>
          this.getSetItems(section.key, repeatIndex).map(item =>
            ({
              text: item.text,
              requiresPhoto: item.requiresPhoto,
              requiresCount: item.requiresCount,
              count: item.requiresCount
                ? this.getCountValue(section.key, repeatIndex, item.id)
                : null,
              checked: !!this.form.get(this.itemControlNameById(section.key, repeatIndex, item.id))?.value,
              photoPath: item.photoPath ?? null,
              documentId: item.documentId ?? null,
              issue: item.issue ?? null,
              hasIssue: item.hasIssue === true
            })
          )
        )
      }))
    };

    return JSON.stringify(payload);
  }

  buildEmptyChecklistAnswersJson(): string {
    const payload = {
      sections: this.sections.map(section => ({
        key: section.key,
        title: section.title,
        selectionMode: section.selectionMode ?? 'allRequired',
        notes: '',
        sets: this.getRepeatIndexes(section.key).map(repeatIndex =>
          this.getSetItems(section.key, repeatIndex).map(item => ({
            text: item.text,
            requiresPhoto: item.requiresPhoto,
            requiresCount: item.requiresCount,
            count: null,
            checked: false,
            photoPath: null,
            documentId: null,
            issue: null,
            hasIssue: false
          }))
        )
      }))
    };

    return JSON.stringify(payload);
  }

  buildDefaultTemplateJson(sections: ChecklistSection[], defaultIsEditable: boolean): string {
    const payload = {
      sections: sections.map(section => ({
        key: section.key,
        title: section.title,
        selectionMode: section.selectionMode ?? 'allRequired',
        notes: '',
        sets: [
          section.items.map(item => ({
            text: item.text,
            requiresPhoto: item.requiresPhoto,
            requiresCount: false,
            count: null,
            isEditable: defaultIsEditable,
            photoPath: null as string | null,
            issue: null as string | null,
            hasIssue: false
          }))
        ]
      }))
    };
    return JSON.stringify(payload);
  }

  saveTemplate(onComplete?: (saved: boolean) => void): void {
    if (!this.property) {
      onComplete?.(false);
      return;
    }

    const checklistJson = this.buildChecklistTemplateJson();
    const emptyAnswersJson = this.buildEmptyChecklistAnswersJson();
    this.isSavingTemplateInternal = true;
    this.isServiceError = false;
    this.syncInspectionTypeIdControlDisabledForSave();

    this.upsertMaintenanceTemplate(checklistJson).pipe(
      take(1),
      switchMap((savedMaintenance) => {
        this.maintenanceRecord = savedMaintenance;
        const createDraftPayload: InspectionRequest = {
          organizationId: savedMaintenance.organizationId || this.user?.organizationId || this.property?.organizationId || '',
          officeId: savedMaintenance.officeId || this.property.officeId,
          propertyId: this.property!.propertyId,
          maintenanceId: savedMaintenance.maintenanceId || '',
          inspectionTypeId: this.inspectionTypeIdControl.value,
          inspectionCheckList: emptyAnswersJson,
          documentPath: null,
          isActive: true,
          reservationId: this.reservationIdForInspectionPayload(undefined)
        };
        return this.inspectionService.createInspection(createDraftPayload).pipe(
          take(1),
          map((savedInspectionResponse) => ({ savedMaintenance, savedInspectionResponse }))
        );
      }),
      finalize(() => {
        this.isSavingTemplateInternal = false;
        this.syncInspectionTypeIdControlDisabledForSave();
      })
    ).subscribe({
      next: ({ savedMaintenance, savedInspectionResponse }: { savedMaintenance: MaintenanceResponse; savedInspectionResponse: InspectionResponse }) => {
        this.maintenanceRecord = savedMaintenance;
        this.activeInspection = this.mappingService.mapInspection(savedInspectionResponse);
        this.patchInspectionTypeFromContext();
        this.activeMode = 'answer';
        this.applyModeState();
        this.applySavedAnswersJson(this.activeInspection.inspectionCheckList || emptyAnswersJson);
        this.captureSavedStateSignature();
        this.toastr.success('Template saved successfully', CommonMessage.Success);
        onComplete?.(true);
      },
      error: () => {
        this.isServiceError = true;
        this.toastr.error('Failed to save template/inspection draft', CommonMessage.Error);
        onComplete?.(false);
      }
    });
  }

  upsertMaintenanceTemplate(checklistJson: string) {
    if (!this.property) {
      return of(null);
    }

    return this.maintenanceService.getByPropertyId(this.property.propertyId).pipe(take(1),
      switchMap((latest) => {
        const existing = latest ?? this.maintenanceRecord ?? null;
        const payload: MaintenanceRequest = {
          maintenanceId: existing?.maintenanceId,
          organizationId: existing?.organizationId ?? this.user?.organizationId ?? this.property!.organizationId,
          officeId: existing?.officeId ?? this.property!.officeId,
          officeName: existing?.officeName ?? this.property!.officeName ?? '',
          propertyId: this.property!.propertyId,
          inspectionCheckList: checklistJson,
          cleanerUserId: existing?.cleanerUserId ?? this.user?.userId ?? '',
          cleaningDate: existing?.cleaningDate ?? undefined,
          inspectorUserId: existing?.inspectorUserId ?? this.user?.userId ?? '',
          inspectingDate: existing?.inspectingDate ?? undefined,
          notes: existing?.notes ?? null,
          isActive: existing?.isActive ?? true
        };

        return payload.maintenanceId
          ? this.maintenanceService.updateMaintenance(payload)
          : this.maintenanceService.createMaintenance({ ...payload, maintenanceId: undefined });
      })
    );
  }

  deleteActiveChecklistRecords() {
    const propertyId = this.property?.propertyId ?? '';
    if (!propertyId) {
      return of(void 0);
    }

    return this.inspectionService.getInspectionsByPropertyId(propertyId).pipe(
      take(1),
      map((inspections) => (inspections || [])
        .filter(inspection => inspection.isActive == true)
        .map(inspection => this.inspectionService.deleteInspection(inspection.inspectionId).pipe(take(1)))),
      switchMap(deleteRequests => {
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

  saveAnswersData(submitRequested: boolean = false, onComplete?: (saved: boolean) => void): void {
    let hasCompleted = false;
    const complete = (saved: boolean): void => {
      if (hasCompleted) {
        return;
      }
      hasCompleted = true;
      onComplete?.(saved);
    };

    const inspectionChecklistJson = this.buildChecklistAnswersJson();
    if (!this.property) {
      complete(false);
      return;
    }
    if (!this.maintenanceRecord?.maintenanceId) {
      this.toastr.error('Unable to save inspection.', CommonMessage.Error);
      complete(false);
      return;
    }

    if (!this.validateShellReservationForSave()) {
      complete(false);
      return;
    }

    const shouldSubmitInspection = submitRequested && this.isChecklistFullyComplete(inspectionChecklistJson);
    this.isSavingAnswersInternal = true;
    this.isServiceError = false;
    this.syncInspectionTypeIdControlDisabledForSave();

    const persistInspection = (documentPath: string | null): void => {
      if (this.activeInspection) {
        this.inspectionService.getInspectionById(this.activeInspection.inspectionId).pipe(take(1)).subscribe({
          next: (latestInspection) => {
            const updatePayload: InspectionRequest = {
              inspectionId: latestInspection.inspectionId,
              organizationId: latestInspection.organizationId,
              officeId: latestInspection.officeId,
              propertyId: latestInspection.propertyId,
              reservationId: this.reservationIdForInspectionPayload(latestInspection.reservationId),
              maintenanceId: latestInspection.maintenanceId,
              inspectionTypeId: this.inspectionTypeIdControl.value,
              inspectionCheckList: inspectionChecklistJson,
              documentPath: documentPath ?? latestInspection.documentPath ?? null,
              isActive: shouldSubmitInspection ? false : latestInspection.isActive
            };

            this.inspectionService.updateInspection(updatePayload).pipe(take(1), finalize(() => {
              this.isSavingAnswersInternal = false;
              this.syncInspectionTypeIdControlDisabledForSave();
            })).subscribe({
              next: (savedInspectionResponse: InspectionResponse) => {
                const savedInspection = this.mappingService.mapInspection(savedInspectionResponse);
                this.activeInspection = savedInspection;
                this.patchInspectionTypeFromContext();
                this.captureSavedStateSignature();
                this.toastr.success(shouldSubmitInspection ? 'Inspection submitted successfully' : 'Inspection saved successfully', CommonMessage.Success);
                if (shouldSubmitInspection) {
                  this.inspectionSubmitted.emit();
                }
                complete(true);
              },
              error: (_err: HttpErrorResponse) => {
                this.isServiceError = true;
                this.toastr.error(shouldSubmitInspection ? 'Failed to submit inspection' : 'Failed to save inspection', CommonMessage.Error);
                complete(false);
              }
            });
          },
          error: () => {
            // Fallback to current in-memory inspection model if latest fetch fails.
            const updatePayload: InspectionRequest = {
              inspectionId: this.activeInspection!.inspectionId,
              organizationId: this.activeInspection!.organizationId,
              officeId: this.activeInspection!.officeId,
              propertyId: this.activeInspection!.propertyId,
              reservationId: this.reservationIdForInspectionPayload(this.activeInspection!.reservationId),
              maintenanceId: this.activeInspection!.maintenanceId,
              inspectionTypeId: this.inspectionTypeIdControl.value,
              inspectionCheckList: inspectionChecklistJson,
              documentPath: documentPath ?? this.activeInspection!.documentPath ?? null,
              isActive: shouldSubmitInspection ? false : this.activeInspection!.isActive
            };
            this.inspectionService.updateInspection(updatePayload).pipe(take(1), finalize(() => {
              this.isSavingAnswersInternal = false;
              this.syncInspectionTypeIdControlDisabledForSave();
            })).subscribe({
              next: (savedInspectionResponse: InspectionResponse) => {
                const savedInspection = this.mappingService.mapInspection(savedInspectionResponse);
                this.activeInspection = savedInspection;
                this.patchInspectionTypeFromContext();
                this.captureSavedStateSignature();
                this.toastr.success(shouldSubmitInspection ? 'Inspection submitted successfully' : 'Inspection saved successfully', CommonMessage.Success);
                if (shouldSubmitInspection) {
                  this.inspectionSubmitted.emit();
                }
                complete(true);
              },
              error: (_err: HttpErrorResponse) => {
                this.isServiceError = true;
                this.toastr.error(shouldSubmitInspection ? 'Failed to submit inspection' : 'Failed to save inspection', CommonMessage.Error);
                complete(false);
              }
            });
          }
        });
        return;
      }

      const createPayload: InspectionRequest = {
        organizationId: this.maintenanceRecord?.organizationId || this.user?.organizationId || this.property?.organizationId || '',
        officeId: this.maintenanceRecord?.officeId || this.property.officeId,
        propertyId: this.property.propertyId,
        maintenanceId: this.maintenanceRecord?.maintenanceId || '',
        inspectionTypeId: this.inspectionTypeIdControl.value,
        inspectionCheckList: inspectionChecklistJson,
        documentPath,
        isActive: shouldSubmitInspection ? false : true,
        reservationId: this.reservationIdForInspectionPayload(this.activeInspection?.reservationId)
      };
      if (!createPayload.organizationId || !createPayload.officeId || !createPayload.maintenanceId) {
        this.isSavingAnswersInternal = false;
        this.syncInspectionTypeIdControlDisabledForSave();
        this.isServiceError = true;
        this.toastr.error('Unable to save inspection due to missing context.', CommonMessage.Error);
        complete(false);
        return;
      }
      this.inspectionService.getInspectionsByPropertyId(createPayload.propertyId).pipe(take(1)).subscribe({
        next: (existingInspections) => {
          const existingActiveInspection = this.getLatestInspectionRecord(existingInspections || []);
          if (existingActiveInspection) {
            const updatePayload: InspectionRequest = {
              inspectionId: existingActiveInspection.inspectionId,
              organizationId: existingActiveInspection.organizationId,
              officeId: existingActiveInspection.officeId,
              propertyId: existingActiveInspection.propertyId,
              reservationId: this.reservationIdForInspectionPayload(existingActiveInspection.reservationId),
              maintenanceId: existingActiveInspection.maintenanceId,
              inspectionTypeId: this.inspectionTypeIdControl.value,
              inspectionCheckList: inspectionChecklistJson,
              documentPath: documentPath ?? existingActiveInspection.documentPath ?? null,
              isActive: shouldSubmitInspection ? false : existingActiveInspection.isActive
            };
            this.inspectionService.updateInspection(updatePayload).pipe(take(1), finalize(() => {
              this.isSavingAnswersInternal = false;
              this.syncInspectionTypeIdControlDisabledForSave();
            })).subscribe({
              next: (savedInspectionResponse: InspectionResponse) => {
                const savedInspection = this.mappingService.mapInspection(savedInspectionResponse);
                this.activeInspection = savedInspection;
                this.patchInspectionTypeFromContext();
                this.captureSavedStateSignature();
                this.toastr.success(shouldSubmitInspection ? 'Inspection submitted successfully' : 'Inspection saved successfully', CommonMessage.Success);
                if (shouldSubmitInspection) {
                  this.inspectionSubmitted.emit();
                }
                complete(true);
              },
              error: (_err: HttpErrorResponse) => {
                this.isServiceError = true;
                this.toastr.error(shouldSubmitInspection ? 'Failed to submit inspection' : 'Failed to save inspection', CommonMessage.Error);
                complete(false);
              }
            });
            return;
          }

          this.inspectionService.createInspection(createPayload).pipe(take(1), finalize(() => {
            this.isSavingAnswersInternal = false;
            this.syncInspectionTypeIdControlDisabledForSave();
          })).subscribe({
            next: (savedInspectionResponse: InspectionResponse) => {
              const savedInspection = this.mappingService.mapInspection(savedInspectionResponse);
              this.activeInspection = savedInspection;
              this.patchInspectionTypeFromContext();
              this.captureSavedStateSignature();
              this.toastr.success(shouldSubmitInspection ? 'Inspection submitted successfully' : 'Inspection saved successfully', CommonMessage.Success);
              if (shouldSubmitInspection) {
                this.inspectionSubmitted.emit();
              }
              complete(true);
            },
            error: (_err: HttpErrorResponse) => {
              this.isServiceError = true;
              this.toastr.error(shouldSubmitInspection ? 'Failed to submit inspection' : 'Failed to save inspection', CommonMessage.Error);
              complete(false);
            }
          });
        },
        error: () => {
          this.inspectionService.createInspection(createPayload).pipe(take(1), finalize(() => {
            this.isSavingAnswersInternal = false;
            this.syncInspectionTypeIdControlDisabledForSave();
          })).subscribe({
            next: (savedInspectionResponse: InspectionResponse) => {
              const savedInspection = this.mappingService.mapInspection(savedInspectionResponse);
              this.activeInspection = savedInspection;
              this.patchInspectionTypeFromContext();
              this.captureSavedStateSignature();
              this.toastr.success(shouldSubmitInspection ? 'Inspection submitted successfully' : 'Inspection saved successfully', CommonMessage.Success);
              if (shouldSubmitInspection) {
                this.inspectionSubmitted.emit();
              }
              complete(true);
            },
            error: (_err: HttpErrorResponse) => {
              this.isServiceError = true;
              this.toastr.error(shouldSubmitInspection ? 'Failed to submit inspection' : 'Failed to save inspection', CommonMessage.Error);
              complete(false);
            }
          });
        }
      });
    };

    if (!shouldSubmitInspection) {
      persistInspection(null);
      return;
    }

    const inspectionDto = this.buildChecklistGenerateDto(
      inspectionChecklistJson,
      this.maintenanceRecord?.organizationId || this.user?.organizationId || this.property.organizationId || '',
      this.maintenanceRecord?.officeId || this.property.officeId,
      this.property.propertyId,
      this.utilityService.generateDocumentFileName(
        'inspection',
        this.property.propertyCode,
        this.reservationDisplayTextForSubmittedPdf() || undefined,
        getInspectionType(this.inspectionTypeIdControl.value) || undefined
      ),
      'Inspection Checklist',
      DocumentType.Inspection
    );
    if (!inspectionDto) {
      this.isSavingAnswersInternal = false;
      this.syncInspectionTypeIdControlDisabledForSave();
      this.isServiceError = true;
      this.toastr.error('Failed to build inspection document', CommonMessage.Error);
      complete(false);
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
        this.syncInspectionTypeIdControlDisabledForSave();
        this.isServiceError = true;
        this.toastr.error('Failed to generate inspection document', CommonMessage.Error);
        complete(false);
      }
    });
  }
  //#endregion

  //#region Data Load Methods
  loadChecklistContext(): void {
    const propertyId = this.property?.propertyId ?? null;
    if (!propertyId) {
      this.lastPropertyIdLoaded = null;
      this.maintenanceRecord = null;
      return;
    }

    this.lastPropertyIdLoaded = propertyId;

    const providedTemplateJson = this.templateJson?.trim() ?? '';
    if (providedTemplateJson.length > 0) {
      this.applySavedChecklistJson(providedTemplateJson);
    }

    this.maintenanceService.getByPropertyId(propertyId).pipe(take(1)).subscribe({
      next: (maintenance) => {
        if (maintenance) {
          this.maintenanceRecord = maintenance;
          if (providedTemplateJson.length === 0) {
            const maintenanceTemplateJson = maintenance.inspectionCheckList?.trim() ?? '';
            if (maintenanceTemplateJson.length > 0) {
              this.applySavedChecklistJson(maintenanceTemplateJson);
            }
          }
          this.loadChecklistAnswers(propertyId);
          return;
        }

        const hasLocalMaintenanceForProperty =
          this.maintenanceRecord?.propertyId === propertyId
          && typeof this.maintenanceRecord?.maintenanceId === 'string'
          && this.maintenanceRecord.maintenanceId.trim().length > 0;
        if (hasLocalMaintenanceForProperty) {
          this.loadChecklistAnswers(propertyId);
          return;
        }

        this.createMaintenanceWithDefaultTemplate(propertyId);
      },
      error: () => {
        this.maintenanceRecord = null;
      }
    });
  }

  createMaintenanceWithDefaultTemplate(propertyId: string): void {
    if (!this.property) {
      return;
    }

    const payload: MaintenanceRequest = {
      organizationId: this.property.organizationId ?? this.user?.organizationId ?? '',
      officeId: this.property.officeId ?? 0,
      officeName: this.property.officeName ?? '',
      propertyId,
      inspectionCheckList: this.buildDefaultTemplateJson(INSPECTION_SECTIONS, false),
      cleanerUserId: this.user?.userId ?? '',
      cleaningDate: undefined,
      inspectorUserId: this.user?.userId ?? '',
      inspectingDate: undefined,
      notes: null,
      isActive: true
    };

    this.maintenanceService.createMaintenance(payload).pipe(take(1)).subscribe({
      next: (saved) => {
        this.maintenanceRecord = saved;
        const savedTemplateJson = saved?.inspectionCheckList?.trim() ?? '';
        if (savedTemplateJson.length > 0) {
          this.applySavedChecklistJson(savedTemplateJson);
        }
        this.activeMode = 'template';
        this.applyModeState();
        this.loadChecklistAnswers(propertyId);
      },
      error: () => {
        this.maintenanceRecord = null;
      }
    });
  }

  loadChecklistAnswers(propertyId: string): void {
    const answersProvided = (this.answersJson?.trim() ?? '').length > 0;
    if (answersProvided) {
      const providedAnswersJson = this.answersJson!.trim();
      this.applySavedAnswersJson(providedAnswersJson);
      this.patchInspectionTypeFromContext();
      this.captureSavedStateSignature();
      return;
    }

    this.inspectionService.getInspectionsByPropertyId(propertyId).pipe(take(1)).subscribe({
      next: (result) => {
        this.activeInspection = this.getLatestInspectionRecord(result || []);
        this.patchInspectionTypeFromContext();
        const answersJson = this.activeInspection?.inspectionCheckList?.trim() ?? '';
        if (answersJson.length > 0) {
          this.applySavedAnswersJson(answersJson);
          this.captureSavedStateSignature();
          return;
        }
        this.captureSavedStateSignature();
      },
      error: () => {
        this.activeInspection = null;
        this.patchInspectionTypeFromContext();
        this.captureSavedStateSignature();
      }
    });
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
      reservationId: this.reservationIdForInspectionPayload(this.activeInspection?.reservationId),
      documentTypeId: documentType,
      fileName,
      generatePdf: true
    };
  }

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
            const hasIssue = item.hasIssue === true;
            const issueRaw = String(this.form.get(this.issueControlNameById(section.key, setIndex, item.id))?.value ?? '').trim();
            const checkChar = isChecked ? '☑' : '☐';
            const checkClass = !isChecked ? 'check-neutral' : hasIssue ? 'check-bad' : 'check-good';
            const issueBlock =
              isChecked && hasIssue
                ? `<div class="issue-desc"><strong>Issue:</strong> ${issueRaw ? this.escapeHtml(issueRaw) : '—'}</div>`
                : '';
            const imageSrc = this.getItemPhotoSrc(item);
            const imageHtml = imageSrc
              ? `<div class="photo-wrap"><img src="${imageSrc}" alt="Line item photo" /></div>`
              : '';
            return `<li class="pdf-checklist-item"><div class="pdf-item-head"><span class="pdf-check-cell"><span class="check ${checkClass}">${checkChar}</span></span><span class="pdf-label-cell">${label}</span></div>${issueBlock}${imageHtml}</li>`;
          }).join('');

          const setLabel =
            this.getSetCount(section.key) <= 1 ? '' : this.getSetInstruction(section.key, setIndex).trim();
          const setHeadingHtml = setLabel
            ? `<h4 class="set-heading">${this.escapeHtml(setLabel)}</h4>`
            : '';
          return `<div class="set-wrap">${setHeadingHtml}<ul>${rowHtml}</ul></div>`;
        }).join('');

        const notes = this.form.get(this.notesControlName(section.key))?.value || '';
        const notesHtml = notes ? `<p><strong>Comments:</strong> ${this.escapeHtml(notes)}</p>` : '';
        return `<section class="checklist-section"><h3>${sectionTitle}</h3>${setHtml}${notesHtml}</section>`;
      }).join('');

      const documentTitle = this.escapeHtml(checklistTitle);
      const propertyName = this.escapeHtml(this.property?.propertyCode || this.property?.propertyId || 'Property');
      const p = this.property;
      let headerLines = '';
      if (p) {
        const officeName = this.escapeHtml(String(p.officeName ?? '').trim());
        const code = this.escapeHtml(String(p.propertyCode ?? p.propertyId ?? '').trim());
        const officePropLine: string[] = [];
        if (officeName) {
          officePropLine.push(`<strong>Office:</strong> ${officeName}`);
        }
        if (code) {
          officePropLine.push(`<strong>Property Code:</strong> ${code}`);
        }
        if (officePropLine.length) {
          headerLines += `<p class="header-office-property">${officePropLine.join('&nbsp;&nbsp;')}</p>`;
        }
        const addrParts: string[] = [];
        if (p.address1) addrParts.push(this.escapeHtml(String(p.address1)));
        if (p.address2) addrParts.push(this.escapeHtml(String(p.address2)));
        if (p.suite) addrParts.push(this.escapeHtml(String(p.suite)));
        const csz = [p.city, p.state, p.zip].filter(Boolean).map(v => String(v)).join(', ');
        if (csz) addrParts.push(this.escapeHtml(csz));
        if (addrParts.length) {
          headerLines += `<p><strong>Address:</strong> ${addrParts.join(', ')}</p>`;
        }
        const reservationText = this.reservationDisplayTextForSubmittedPdf();
        if (reservationText) {
          headerLines += `<p><strong>Reservation:</strong> ${this.escapeHtml(reservationText)}</p>`;
        }
        const inspectorDisplay = (this.inspectorName || '').trim() || 'Unknown User';
        const dateDisplay = new Date().toLocaleDateString();
        headerLines += `<p class="header-inspector-date"><strong>Inspector:</strong> ${this.escapeHtml(inspectorDisplay)}&nbsp;&nbsp;<strong>Date:</strong> ${this.escapeHtml(dateDisplay)}</p>`;
      }
      return `
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; font-size: 12px; color: #222; }
              h1.pdf-doc-title { font-size: 20px; text-align: left; margin: 0 0 12px 0; }
              .checklist-section { margin-top: 2.55em; }
              .checklist-section:first-of-type { margin-top: 2.35em; }
              .checklist-section > h3 { font-size: 15px; margin: 0 0 8px 0; text-decoration: underline; }
              h4.set-heading { font-size: 13px; margin: 10px 0 6px 0; }
              ul { padding-left: 16px; margin: 0; list-style: none; }
              .pdf-checklist-item { margin-bottom: 10px; }
              .pdf-item-head { display: flex; flex-direction: row; align-items: flex-start; gap: 6px; }
              .pdf-check-cell { flex: 0 0 1.15em; min-width: 1.15em; text-align: left; }
              .pdf-label-cell { flex: 1; min-width: 0; font-size: inherit; font-family: inherit; font-weight: normal; }
              .check { font-weight: 700; }
              .check-good { color: #2e7d32; }
              .check-bad { color: #c62828; }
              .check-neutral { color: #555; }
              .issue-desc { margin: 4px 0 0 0; padding: 0; font-size: inherit; font-family: inherit; font-weight: normal; color: #c62828; line-height: inherit; }
              .issue-desc strong { font-size: inherit; font-family: inherit; font-weight: normal; color: #c62828; }
              .header-office-property { margin: 0 0 6px 0; }
              .header-inspector-date { margin: 6px 0 0 0; }
              .photo-wrap { margin-top: 6px; }
              img { max-width: 320px; max-height: 240px; object-fit: contain; border: 1px solid #ddd; }
              .set-wrap { margin-bottom: 10px; }
            </style>
          </head>
          <body>
            <h1 class="pdf-doc-title">${documentTitle} - ${propertyName}</h1>
            ${headerLines}
            ${sectionHtml}
          </body>
        </html>
      `;
    } catch {
      return null;
    }
  }

  private reservationDisplayTextForSubmittedPdf(): string {
    const fromTitleBar = (this.titleBarReservationDisplayText || '').trim();
    if (fromTitleBar.length > 0) {
      return fromTitleBar;
    }
    return (this.activeInspection?.reservationCode || '').trim();
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
      const issuesBlockSubmit = this.inspectionTypeIdControl.value !== InspectionType.MoveOut;

      const root = JSON.parse(checklistJson) as {
        sections?: Array<{
          key?: string;
          selectionMode?: 'allRequired' | 'exactlyOne' | 'atLeastOne';
          sets?: Array<Array<{ checked?: boolean; requiresCount?: boolean; count?: number | null; hasIssue?: boolean; issue?: string | null; photoPath?: string | null; documentId?: string | null } | boolean>>;
        }>;
      };
      const sections = Array.isArray(root.sections) ? root.sections : [];
      if (sections.length === 0) {
        return false;
      }

      return sections.every(section => {
        if (!Array.isArray(section.sets)) {
          return false;
        }

        const selectionMode = this.sections.find(s => s.key === section.key)?.selectionMode ?? section.selectionMode ?? 'allRequired';
        if (selectionMode === 'exactlyOne') {
          return section.sets.every(set => {
            if (!Array.isArray(set) || set.length === 0) {
              return false;
            }

            const checkedItems = set.filter(item => typeof item === 'boolean' ? item === true : item?.checked === true);
            if (checkedItems.length !== 1) {
              return false;
            }

            const selectedItem = checkedItems[0];
            if (typeof selectedItem === 'boolean') {
              return true;
            }

            if (issuesBlockSubmit && selectedItem?.hasIssue === true) {
              return false;
            }
            if (selectedItem?.requiresCount === true) {
              return typeof selectedItem.count === 'number' && !Number.isNaN(selectedItem.count);
            }

            return true;
          });
        }

        if (selectionMode === 'atLeastOne') {
          return section.sets.every(set => {
            if (!Array.isArray(set) || set.length === 0) {
              return false;
            }

            const checkedItems = set.filter(item => typeof item === 'boolean' ? item === true : item?.checked === true);
            if (checkedItems.length < 1) {
              return false;
            }

            return checkedItems.every(checkedItem => {
              if (typeof checkedItem === 'boolean') {
                return true;
              }
              if (issuesBlockSubmit && checkedItem?.hasIssue === true) {
                return false;
              }
              if (checkedItem?.requiresCount === true) {
                return typeof checkedItem.count === 'number' && !Number.isNaN(checkedItem.count);
              }
              return true;
            });
          });
        }

        return section.sets.every(set =>
          Array.isArray(set)
          && set.every(item => {
            if (typeof item === 'boolean') {
              return item === true;
            }

            if (item?.checked !== true) {
              return false;
            }

            if (issuesBlockSubmit && item?.hasIssue === true) {
              return false;
            }
            if (item?.requiresCount === true) {
              return typeof item?.count === 'number' && !Number.isNaN(item.count);
            }

            return true;
          })
        );
      });
    } catch {
      return false;
    }
  }

  itemControlNameById(sectionKey: string, repeatIndex: number, itemId: string): string {
    return `${sectionKey}_${repeatIndex}_${itemId}`;
  }

  countControlNameById(sectionKey: string, repeatIndex: number, itemId: string): string {
    return `${sectionKey}_${repeatIndex}_${itemId}_count`;
  }

  issueControlNameById(sectionKey: string, repeatIndex: number, itemId: string): string {
    return `${sectionKey}_${repeatIndex}_${itemId}_issue`;
  }

  notesControlName(sectionKey: string): string {
    return `${sectionKey}_notes`;
  }
  //#endregion

  //#region Section Controls
  setSectionSelectionMode(sectionKey: string, mode: 'allRequired' | 'exactlyOne' | 'atLeastOne'): void {
    const section = this.sections.find(currentSection => currentSection.key === sectionKey);
    if (!section) {
      return;
    }

    section.selectionMode = mode;
    if (mode !== 'exactlyOne') {
      return;
    }

    // Ensure existing data immediately conforms when switching to exactly-one mode.
    this.getRepeatIndexes(sectionKey).forEach(repeatIndex => {
      const checkedItems = this.getSetItems(sectionKey, repeatIndex).filter(item =>
        !!this.form.get(this.itemControlNameById(sectionKey, repeatIndex, item.id))?.value
      );
      if (checkedItems.length <= 1) {
        return;
      }

      checkedItems.slice(1).forEach(item => {
        this.form.get(this.itemControlNameById(sectionKey, repeatIndex, item.id))?.setValue(false, { emitEvent: false });
      });
    });
  }

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

  createChecklistItem(
    item: string | ChecklistTemplateItem,
    isEditable?: boolean,
    checked: boolean = false,
    photoPath: string | null = null,
    documentId: string | null = null,
    count: number | null = null,
    issue: string | null = null,
    hasIssue: boolean = false
  ): ChecklistItem {
    const id = `item_${this.nextItemId++}`;
    const templateItem = typeof item === 'string'
      ? { text: item, requiresPhoto: false, requiresCount: false, count: null }
      : item;
    return {
      id,
      text: templateItem.text,
      requiresPhoto: templateItem.requiresPhoto,
      requiresCount: templateItem.requiresCount ?? false,
      count: count ?? templateItem.count ?? null,
      photoPath,
      documentId,
      isEditable: isEditable ?? this.getDefaultItemEditable(),
      checked,
      issue,
      hasIssue
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
      this.form.addControl(this.countControlNameById(sectionKey, repeatIndex, item.id), new FormControl(item.count ?? null));
      this.form.addControl(this.issueControlNameById(sectionKey, repeatIndex, item.id), new FormControl(item.issue ?? ''));
    });
    if (!this.form.contains(this.notesControlName(sectionKey))) {
      this.form.addControl(this.notesControlName(sectionKey), new FormControl(''));
    }
  }

  removeControlsForSet(sectionKey: string, repeatIndex: number): void {
    this.getSetItems(sectionKey, repeatIndex).forEach(item => {
      this.form.removeControl(this.itemControlNameById(sectionKey, repeatIndex, item.id));
      this.form.removeControl(this.countControlNameById(sectionKey, repeatIndex, item.id));
      this.form.removeControl(this.issueControlNameById(sectionKey, repeatIndex, item.id));
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
    this.form.addControl(this.countControlNameById(sectionKey, repeatIndex, newItem.id), new FormControl(newItem.count ?? null));
    this.form.addControl(this.issueControlNameById(sectionKey, repeatIndex, newItem.id), new FormControl(newItem.issue ?? ''));
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
    this.form.removeControl(this.countControlNameById(sectionKey, repeatIndex, itemId));
    this.form.removeControl(this.issueControlNameById(sectionKey, repeatIndex, itemId));
  }

  updateEditableRowText(item: ChecklistItem, value: string): void {
    item.text = value;
  }

  onItemCheckChange(sectionKey: string, repeatIndex: number, item: ChecklistItem, event: { checked: boolean; source?: { checked: boolean } }): void {
    if (this.isTemplateMode || this.isReadonlyMode) {
      return;
    }
    const control = this.form.get(this.itemControlNameById(sectionKey, repeatIndex, item.id));
    if (!control) {
      return;
    }

    // Three-state cycle in answer mode:
    // unchecked -> checked green -> checked red -> unchecked
    if (event.checked) {
      // unchecked -> green
      this.setItemIssueState(sectionKey, repeatIndex, item, false);
      this.trySetItemCheckedTrue(sectionKey, repeatIndex, item);
      return;
    }

    if (item.hasIssue === true) {
      // red -> unchecked
      this.clearIssueStateAndPhoto(sectionKey, repeatIndex, item);
      control.setValue(false, { emitEvent: false });
      if (event.source) {
        event.source.checked = false;
      }
      return;
    }

    // green -> red (stay checked)
    this.setItemIssueState(sectionKey, repeatIndex, item, true);
    control.setValue(true, { emitEvent: false });
    if (event.source) {
      event.source.checked = true;
    }
  }

  trySetItemCheckedTrue(sectionKey: string, repeatIndex: number, item: ChecklistItem): void {
    const control = this.form.get(this.itemControlNameById(sectionKey, repeatIndex, item.id));
    if (!control) {
      return;
    }

    if (item.requiresCount) {
      const countValue = this.getCountValue(sectionKey, repeatIndex, item.id);
      if (countValue === null) {
        control?.setValue(false, { emitEvent: false });
        this.openMissingCountDialog().afterClosed().pipe(take(1)).subscribe((result: number | null | undefined) => {
          if (typeof result !== 'number' || Number.isNaN(result)) {
            return;
          }

          const countControl = this.form.get(this.countControlNameById(sectionKey, repeatIndex, item.id));
          countControl?.setValue(result, { emitEvent: false });
          item.count = result;
          control?.setValue(true, { emitEvent: false });
          this.applySelectionModeOnCheck(sectionKey, repeatIndex, item.id);
        });
        return;
      }
    }

    if (this.isPhotoRequiredForItem(item) && !this.getItemPhotoSrc(item)) {
      control?.setValue(false, { emitEvent: false });
      this.openPhotoUpload(sectionKey, repeatIndex, item.id);
      return;
    }

    control.setValue(true, { emitEvent: false });
    this.applySelectionModeOnCheck(sectionKey, repeatIndex, item.id);
  }

  applySelectionModeOnCheck(sectionKey: string, repeatIndex: number, selectedItemId: string): void {
    const section = this.sections.find(currentSection => currentSection.key === sectionKey);
    if (section?.selectionMode !== 'exactlyOne') {
      return;
    }
    this.getSetItems(sectionKey, repeatIndex).forEach(setItem => {
      if (setItem.id === selectedItemId) {
        return;
      }
      const otherControl = this.form.get(this.itemControlNameById(sectionKey, repeatIndex, setItem.id));
      otherControl?.setValue(false, { emitEvent: false });
    });
  }

  setItemIssueState(sectionKey: string, repeatIndex: number, item: ChecklistItem, hasIssue: boolean): void {
    item.hasIssue = hasIssue;
    if (!hasIssue) {
      item.issue = null;
    } else if (item.issue == null) {
      item.issue = '';
    }
    const issueControl = this.form.get(this.issueControlNameById(sectionKey, repeatIndex, item.id));
    issueControl?.setValue(item.issue ?? '', { emitEvent: false });
  }

  clearIssueStateAndPhoto(sectionKey: string, repeatIndex: number, item: ChecklistItem): void {
    const photoIdToDelete = item.documentId;
    this.setItemIssueState(sectionKey, repeatIndex, item, false);
    item.photoPath = null;
    item.displayDataUrl = null;
    item.documentId = null;
    if (photoIdToDelete) {
      this.photoBlobUrlCache.delete(photoIdToDelete);
      this.photoService.deletePhoto(photoIdToDelete).pipe(take(1)).subscribe({
        error: () => {
          this.toastr.error('Unable to delete issue photo from storage.', CommonMessage.Error);
        }
      });
    }
  }

  updateItemIssue(sectionKey: string, repeatIndex: number, item: ChecklistItem, value: string): void {
    item.issue = value;
    item.hasIssue = true;
    const issueControl = this.form.get(this.issueControlNameById(sectionKey, repeatIndex, item.id));
    issueControl?.setValue(value, { emitEvent: false });
  }

  hasIssueText(value: string | null | undefined): boolean {
    return typeof value === 'string' && value.trim().length > 0;
  }

  isIssueTextMissing(sectionKey: string, repeatIndex: number, item: ChecklistItem): boolean {
    const isChecked = !!this.form.get(this.itemControlNameById(sectionKey, repeatIndex, item.id))?.value;
    return isChecked && item.hasIssue === true && !this.hasIssueText(item.issue);
  }

  isPhotoRequiredForItem(item: ChecklistItem): boolean {
    return item.requiresPhoto || item.hasIssue === true;
  }

  getCheckboxStateClass(sectionKey: string, repeatIndex: number, item: ChecklistItem): string {
    const isChecked = !!this.form.get(this.itemControlNameById(sectionKey, repeatIndex, item.id))?.value;
    if (!isChecked) {
      return '';
    }
    return item.hasIssue === true ? 'issue-checkbox-red' : 'issue-checkbox-green';
  }
  //#endregion

  //#region Dialog Methods
  openMissingCountDialog() {
    return this.dialog.open(DialogMissingCountComponent, {
      width: '24rem'
    });
  }

  openIssueItemDialog() {
    return this.dialog.open(DialogIssueItemComponent, {
      width: '40rem',
      maxWidth: '95vw'
    });
  }

  openIssuesDialog(): void {
    const fromName = `${this.user?.firstName || ''} ${this.user?.lastName || ''}`.trim() || 'RentAll User';
    const fromEmail = this.user?.email || '';
    const reservationFromShell = (this.titleBarReservationId || '').trim();
    const reservationFromInspection = (this.activeInspection?.reservationId || '').trim();
    const reservationId = reservationFromShell || reservationFromInspection || null;
    this.dialog.open(DialogChecklistIssuesComponent, {
      width: '55rem',
      maxWidth: '95vw',
      data: {
        issues: this.issueEntries,
        propertyCode: this.property?.propertyCode ?? this.property?.propertyId ?? null,
        dateText: this.todayDate,
        organizationId: this.property?.organizationId ?? this.user?.organizationId ?? null,
        officeId: this.property?.officeId ?? null,
        officeName: this.property?.officeName ?? null,
        propertyId: this.property?.propertyId ?? null,
        reservationId,
        fromEmail,
        fromName,
        toEmail: fromEmail,
        toName: fromName
      }
    });
  }

  openUploadFailedDialog(): void {
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

  openPhotoPreview(item: ChecklistItem, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    const imageSrc = this.getItemPhotoSrc(item);
    if (!imageSrc) {
      return;
    }

    const dialogData: ImageViewDialogData = {
      imageSrc,
      title: 'Photo Preview'
    };

    this.dialog.open(ImageViewDialogComponent, {
      data: dialogData,
      width: '90vmin',
      height: '90vmin',
      minWidth: '320px',
      minHeight: '320px',
      maxWidth: '95vw',
      maxHeight: '95vh',
      panelClass: 'image-view-dialog-panel'
    });
  }
  //#endregion

  //#region Photo controls
  async uploadIssuePhoto(sectionKey: string, repeatIndex: number, item: ChecklistItem, file: File): Promise<void> {
    const optimizedImage = await this.optimizePhotoForUpload(file, sectionKey, repeatIndex, item.id);
    const photoRequest: PhotoRequest = {
      organizationId: this.property?.organizationId || this.user?.organizationId || '',
      officeId: this.property?.officeId || 0,
      maintenanceId: this.maintenanceRecord?.maintenanceId || null,
      fileDetails: {
        fileName: optimizedImage.fileName,
        contentType: optimizedImage.contentType,
        file: optimizedImage.base64,
        dataUrl: optimizedImage.dataUrl
      }
    };

    const photoResponse = await firstValueFrom(this.photoService.uploadPhoto(photoRequest).pipe(take(1)));
    item.photoPath = photoResponse.photoPath || null;
    item.documentId = photoResponse.photoId || null;
    item.displayDataUrl = optimizedImage.previewDataUrl;
  }

  toggleRequiresPhoto(item: ChecklistItem, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    item.requiresPhoto = !item.requiresPhoto;
    if (!item.requiresPhoto) {
      item.photoPath = null;
    }
  }

  toggleRequiresCount(item: ChecklistItem, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    item.requiresCount = !item.requiresCount;
    if (!item.requiresCount) {
      item.count = null;
    }
  }

  getCountValue(sectionKey: string, repeatIndex: number, itemId: string): number | null {
    const rawValue = this.form.get(this.countControlNameById(sectionKey, repeatIndex, itemId))?.value;
    if (rawValue === null || rawValue === undefined) {
      return null;
    }

    const stringValue = String(rawValue).trim();
    if (stringValue === '') {
      return null;
    }

    const parsed = Number(stringValue);
    return Number.isFinite(parsed) ? parsed : null;
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

  async onPhotoSelected(sectionKey: string, repeatIndex: number, itemId: string, event: Event): Promise<void> {
    const target = event.target as HTMLInputElement;
    const file = target.files && target.files.length > 0 ? target.files[0] : null;
    if (!file) {
      return;
    }

    const item = this.getSetItems(sectionKey, repeatIndex).find(currentItem => currentItem.id === itemId);
    if (!item) {
      return;
    }

    try {
      const optimizedImage = await this.optimizePhotoForUpload(file, sectionKey, repeatIndex, item.id);
      const photoRequest: PhotoRequest = {
        organizationId: this.property?.organizationId || this.user?.organizationId || '',
        officeId: this.property?.officeId || 0,
        maintenanceId: this.maintenanceRecord?.maintenanceId || null,
        fileDetails: {
          fileName: optimizedImage.fileName,
          contentType: optimizedImage.contentType,
          file: optimizedImage.base64,
          dataUrl: optimizedImage.dataUrl
        }
      };

      this.photoService.uploadPhoto(photoRequest).pipe(take(1)).subscribe({
        next: (photoResponse: PhotoResponse) => {
          item.photoPath = photoResponse.photoPath || null;
          item.documentId = photoResponse.photoId || null;
          item.displayDataUrl = optimizedImage.previewDataUrl;
          if (this.isPhotoRequiredForItem(item)) {
            const control = this.form.get(this.itemControlNameById(sectionKey, repeatIndex, item.id));
            control?.setValue(!!(item.photoPath || item.displayDataUrl));
          }
        },
        error: () => {
          this.openUploadFailedDialog();
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to process the selected image.';
      this.toastr.error(message, CommonMessage.Error);
    } finally {
      target.value = '';
    }
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
    if (this.isPhotoRequiredForItem(item)) {
      const control = this.form.get(this.itemControlNameById(sectionKey, repeatIndex, item.id));
      control?.setValue(false);
    }
  }

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
    if (item.photoPath && item.photoPath.trim().length > 0) {
      return this.normalizePhotoPath(item.photoPath);
    }
    return null;
  }

  normalizePhotoPath(photoPath: string | null | undefined): string | null {
    const rawPath = String(photoPath || '').trim();
    if (!rawPath) {
      return null;
    }

    if (rawPath.startsWith('data:') || rawPath.startsWith('blob:')) {
      return rawPath;
    }

    if (/^https?:\/\//i.test(rawPath)) {
      return this.isAllowedDirectPhotoUrl(rawPath) ? rawPath : null;
    }

    const apiUrl = this.configService.config().apiUrl || '';
    if (!apiUrl) {
      return rawPath;
    }

    const normalizedApiUrl = apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;
    if (rawPath.startsWith('/')) {
      return `${normalizedApiUrl.replace(/\/$/, '')}${rawPath}`;
    }

    return `${normalizedApiUrl}${rawPath}`;
  }

  isAllowedDirectPhotoUrl(url: string): boolean {
    const value = String(url || '').trim();
    if (!value) {
      return false;
    }

    // Prevent unauthenticated direct fetches to private Azure Blob URLs.
    const isAzureBlobHost = /:\/\/[^/]*blob\.core\.windows\.net\//i.test(value);
    if (!isAzureBlobHost) {
      return true;
    }

    // Allow only signed blob URLs (SAS) when direct URL is used.
    return /[?&]sig=/i.test(value);
  }

  isLikelyGuid(value: string | null | undefined): boolean {
    const text = String(value || '').trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text);
  }
  //#endregion

  //#region Photo Optimization
  async optimizePhotoForUpload(file: File, sectionKey: string, repeatIndex: number, itemId: string): Promise<{ dataUrl: string; base64: string; fileName: string; contentType: string; previewDataUrl: string }> {
    if (!file.type.startsWith('image/') && !this.isHeicLikeFile(file)) {
      throw new Error('Only image uploads are supported for checklist photos.');
    }
    if (file.size > this.maxSourceImageBytes) {
      throw new Error('Image is too large. Maximum file size is 20 MB.');
    }

    const normalizedFile = await this.convertHeicToJpegIfNeeded(file);
    const sourceDataUrl = await this.readFileAsDataUrl(normalizedFile);
    const image = await this.loadImageElement(sourceDataUrl);
    const scaled = this.getScaledDimensions(image.naturalWidth || image.width, image.naturalHeight || image.height, this.maxImageDimension);

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Unable to process image. Please try a different file.');
    }

    let width = scaled.width;
    let height = scaled.height;
    let bestBlob: Blob | null = null;
    const qualitySteps = [0.82, 0.74, 0.66, 0.58, 0.5];

    for (let pass = 0; pass < 4; pass += 1) {
      canvas.width = width;
      canvas.height = height;
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);

      for (const quality of qualitySteps) {
        const blob = await this.canvasToBlob(canvas, 'image/jpeg', quality);
        if (!blob) {
          continue;
        }
        if (!bestBlob || blob.size < bestBlob.size) {
          bestBlob = blob;
        }
        if (blob.size <= this.maxUploadedImageBytes) {
          const dataUrl = await this.readBlobAsDataUrl(blob);
          const base64 = dataUrl.split(',')[1] || '';
          const fileName = this.buildCompressedPhotoName(file.name, sectionKey, repeatIndex, itemId);
          return {
            dataUrl,
            base64,
            fileName,
            contentType: 'image/jpeg',
            previewDataUrl: sourceDataUrl
          };
        }
      }

      width = Math.max(640, Math.round(width * 0.8));
      height = Math.max(480, Math.round(height * 0.8));
    }

    if (bestBlob) {
      const dataUrl = await this.readBlobAsDataUrl(bestBlob);
      const base64 = dataUrl.split(',')[1] || '';
      const fileName = this.buildCompressedPhotoName(file.name, sectionKey, repeatIndex, itemId);
      return {
        dataUrl,
        base64,
        fileName,
        contentType: 'image/jpeg',
        previewDataUrl: sourceDataUrl
      };
    }

    throw new Error('Unable to process the selected image.');
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

    try {
      const heic2anyModule = await import('heic2any');
      const heic2any = heic2anyModule.default;
      const converted = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: 0.9
      }) as Blob | Blob[];
      const convertedBlob = Array.isArray(converted) ? converted[0] : converted;
      if (!convertedBlob) {
        throw new Error('HEIC conversion returned no image data.');
      }
      const convertedName = (file.name || 'photo').replace(/\.[^/.]+$/i, '') + '.jpg';
      return new File([convertedBlob], convertedName, { type: 'image/jpeg' });
    } catch {
      throw new Error('This HEIC/HEIF file could not be converted in your browser. Please convert it to JPG/PNG and try again.');
    }
  }

  buildCompressedPhotoName(originalName: string, sectionKey: string, repeatIndex: number, itemId: string): string {
    const baseName = (originalName || '').replace(/\.[^/.]+$/, '').trim();
    if (baseName.length > 0) {
      return `${baseName}.jpg`;
    }
    return `${sectionKey}-${repeatIndex + 1}-${itemId}.jpg`;
  }

  getScaledDimensions(width: number, height: number, maxDimension: number): { width: number; height: number } {
    if (width <= 0 || height <= 0) {
      return { width: maxDimension, height: maxDimension };
    }
    if (width <= maxDimension && height <= maxDimension) {
      return { width, height };
    }
    if (width > height) {
      const scale = maxDimension / width;
      return { width: maxDimension, height: Math.max(1, Math.round(height * scale)) };
    }
    const scale = maxDimension / height;
    return { width: Math.max(1, Math.round(width * scale)), height: maxDimension };
  }

  readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Unable to read image file.'));
      reader.readAsDataURL(file);
    });
  }

  readBlobAsDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Unable to read optimized image.'));
      reader.readAsDataURL(blob);
    });
  }

  loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Selected file is not a valid image.'));
      image.src = dataUrl;
    });
  }

  canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob | null> {
    return new Promise(resolve => {
      canvas.toBlob(blob => resolve(blob), mimeType, quality);
    });
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
    return this.property?.alarmCode || 'N/A';
  }

  get keypadAccessCodesDisplay(): string {
    const codes = [
      this.property?.unitMstrCode,
      this.property?.bldgMstrCode,
      this.property?.bldgTenantCode,
      this.property?.mailRoomCode,
      this.property?.garageCode,
      this.property?.gateCode,
      this.property?.trashCode,
      this.property?.storageCode
    ].filter(Boolean);
    return codes.length > 0 ? codes.join(' / ') : 'N/A';
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
            const countCtrl = this.form.get(this.countControlNameById(section.key, repeatIndex, item.id));
            if (countCtrl) countCtrl.disable({ emitEvent: false });
          });
        });
      });
    }
  }

  get inspectionTypeReadonlyLabel(): string {
    if (!this.isReadonlyMode) {
      return '';
    }
    const id = this.readonlyInspectionTypeId ?? this.activeInspection?.inspectionTypeId;
    if (id === null || id === undefined) {
      return '';
    }
    return getInspectionType(id);
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
    if (this.isReadonlyMode || !this.isAdmin) return;
    this.activeMode = this.isTemplateMode ? 'answer' : 'template';
    this.applyModeState();
  }

  getDefaultItemEditable(): boolean {
    return false;
  }
  //#endregion
}
