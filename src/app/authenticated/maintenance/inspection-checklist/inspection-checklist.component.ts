import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { take } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { PropertyResponse } from '../../properties/models/property.model';
import { DocumentType } from '../../documents/models/document.enum';
import { DocumentRequest, DocumentResponse } from '../../documents/models/document.model';
import { DocumentService } from '../../documents/services/document.service';
import { GenericModalComponent } from '../../shared/modals/generic/generic-modal.component';
import { GenericModalData } from '../../shared/modals/generic/models/generic-modal-data';
import { ChecklistItem, ChecklistSection, ChecklistTemplateItem, INSPECTION_SECTIONS, INVENTORY_SECTIONS, SavedChecklistSection } from '../models/checklist-sections';

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
  @Output() saveChecklist = new EventEmitter<string>();
  @Output() saveAnswers = new EventEmitter<string>();

  readonly templateRequiredMessage = 'You need to save an Inspection Checklist Template for this property before you can use it.';
  readonly photoRequiredMessage = 'A photo is required for this item.';

  fb: FormBuilder;
  form: FormGroup;
  authService: AuthService;
  documentService: DocumentService;
  dialog: MatDialog;

  inspectorName: string = '';
  todayDate: string = '';
  sectionTemplates: ChecklistSection[] = INSPECTION_SECTIONS;
  sections: ChecklistSection[] = [];
  sectionSetCounts: Record<string, number> = {};
  sectionSetItems: Record<string, ChecklistItem[][]> = {};
  nextItemId = 0;
  hasLoadedSavedChecklist = false;
  activeMode: ChecklistMode = 'template';

  constructor(
    fb: FormBuilder,
    authService: AuthService,
    documentService: DocumentService,
    dialog: MatDialog
  ) {
    this.fb = fb;
    this.authService = authService;
    this.documentService = documentService;
    this.dialog = dialog;
    const user = this.authService.getUser();
    this.inspectorName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Unknown User';
    this.todayDate = new Date().toLocaleDateString();
    this.initializeChecklistState();
  }

  //#region Checklist
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['checklistType']) {
      this.sectionTemplates = this.checklistType === 'inventory' ? INVENTORY_SECTIONS : INSPECTION_SECTIONS;
    }

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
      this.saveChecklist.emit(this.buildInspectionChecklistJson());
      return;
    }

    this.saveAnswers.emit(this.buildChecklistAnswersJson());
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

  isTemplateRequired(): boolean {
    return !this.templateJson || this.templateJson.trim().length === 0;
  }

  getDefaultItemEditable(): boolean {
    return this.checklistType === 'inventory';
  }
  //#endregion
}
