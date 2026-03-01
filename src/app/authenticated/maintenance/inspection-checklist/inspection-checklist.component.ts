import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { PropertyResponse } from '../../properties/models/property.model';
import { CHECKLIST_SECTIONS, ChecklistItem, ChecklistSection } from '../models/checklist-sections';
import { PropertyService } from '../../properties/services/property.service';
import { UtilityService } from '../../../services/utility.service';

export type ChecklistMode = 'template' | 'answer' | 'readonly';

type SavedChecklistItem = {
  text: string;
  checked: boolean;
  isEditable: boolean;
};

type SavedChecklistSection = {
  key: string;
  title?: string;
  notes?: string;
  sets: SavedChecklistItem[][];
};

type SavedAnswerSection = {
  key: string;
  notes?: string;
  sets: boolean[][];
};

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
  @Input() templateEnabled: boolean = true;
  @Input() isSaving: boolean = false;
  @Output() saveChecklist = new EventEmitter<string>();
  @Output() saveAnswers = new EventEmitter<string>();

  fb: FormBuilder;
  form: FormGroup;
  authService: AuthService;

  inspectorName: string = '';
  todayDate: string = '';
  sectionTemplates: ChecklistSection[] = CHECKLIST_SECTIONS;
  sections: ChecklistSection[] = [];
  sectionSetCounts: Record<string, number> = {};
  sectionSetItems: Record<string, ChecklistItem[][]> = {};
  nextItemId = 0;
  hasLoadedSavedChecklist = false;
  activeMode: ChecklistMode = 'template';

  constructor(
    fb: FormBuilder,
    authService: AuthService
  ) {
    this.fb = fb;
    this.authService = authService;
    const user = this.authService.getUser();
    this.inspectorName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Unknown User';
    this.todayDate = new Date().toLocaleDateString();
    this.initializeChecklistState();
  }

  //#region Checklist
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['checklistJson'] || changes['templateJson'] || changes['answersJson']) {
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

    if (changes['mode']) {
      this.activeMode = this.resolveInitialMode();
      this.applyModeState();
    }

    if (changes['templateEnabled'] && !this.isReadonlyMode) {
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
          this.getSetItems(section.key, repeatIndex).map(item => item.text)
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
      const templateItemSet = new Set(baseItems);

      const sets = (savedSection.sets && savedSection.sets.length > 0)
        ? savedSection.sets
        : [baseItems.map(itemText => ({ text: itemText, checked: false, isEditable: false }))];

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
          return templateItemsForSet.map((itemText, index) => this.createChecklistItem(
            itemText,
            false,
            setItems[index]?.checked || false
          ));
        }

        return setItems.map(item => this.createChecklistItem(
          item.text,
          item.isEditable || !templateItemSet.has(item.text),
          item.checked
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
    let parsedRoot: unknown = this.tryParseJsonValue(rawChecklistJson);
    if (!parsedRoot || typeof parsedRoot !== 'object') {
      return false;
    }

    if (!parsedRoot || typeof parsedRoot !== 'object') {
      return false;
    }

    const rawSections = Array.isArray((parsedRoot as Record<string, unknown>)['sections'])
      ? ((parsedRoot as Record<string, unknown>)['sections'] as unknown[])
      : [];
    if (rawSections.length === 0) {
      return false;
    }

    let hasAppliedAnswers = false;
    rawSections.forEach(rawSection => {
      if (!rawSection || typeof rawSection !== 'object') {
        return;
      }

      const sectionObject = rawSection as Record<string, unknown>;
      const sectionKey = typeof sectionObject['key'] === 'string' ? sectionObject['key'].trim() : '';
      if (!sectionKey) {
        return;
      }

      const section = this.sections.find(currentSection => currentSection.key === sectionKey);
      if (!section) {
        return;
      }

      const sectionSets = Array.isArray(sectionObject['sets']) ? sectionObject['sets'] as unknown[] : [];
      if (sectionSets.length === 0) {
        return;
      }

      const targetSetCount = Math.max(1, sectionSets.length);
      this.syncSectionSetCount(section.key, targetSetCount);

      for (let repeatIndex = 0; repeatIndex < targetSetCount; repeatIndex += 1) {
        const rawSet = sectionSets[repeatIndex];
        const answerSet = Array.isArray(rawSet) ? rawSet : [];
        const setItems = this.getSetItems(section.key, repeatIndex);
        setItems.forEach((item, itemIndex) => {
          const control = this.form.get(this.itemControlNameById(section.key, repeatIndex, item.id));
          if (control) {
            const answerValue = answerSet[itemIndex];
            const isChecked = answerValue === true || answerValue === 'true' || answerValue === 1 || answerValue === '1';
            control.setValue(isChecked, { emitEvent: false });
          }
        });
      }

      const notesControl = this.form.get(this.notesControlName(section.key));
      if (notesControl && typeof sectionObject['notes'] === 'string') {
        notesControl.setValue(sectionObject['notes'], { emitEvent: false });
      }

      hasAppliedAnswers = true;
    });

    return hasAppliedAnswers;
  }

  parseSavedAnswerSections(rawChecklistJson: string): SavedAnswerSection[] | null {
    try {
      let checklistRoot: unknown = rawChecklistJson;
      checklistRoot = this.tryParseJsonValue(checklistRoot);

      let rawSections: unknown[] = [];
      if (Array.isArray(checklistRoot)) {
        rawSections = checklistRoot;
      } else if (
        checklistRoot &&
        typeof checklistRoot === 'object' &&
        Array.isArray((checklistRoot as Record<string, unknown>)['sections'])
      ) {
        rawSections = (checklistRoot as Record<string, unknown>)['sections'] as unknown[];
      }

      const normalizedSections = rawSections
        .map(section => this.normalizeSavedAnswerSection(section))
        .filter((section): section is SavedAnswerSection => !!section);

      return normalizedSections.length > 0 ? normalizedSections : null;
    } catch {
      return null;
    }
  }

  normalizeSavedAnswerSection(section: unknown): SavedAnswerSection | null {
    if (!section || typeof section !== 'object') {
      return null;
    }

    const sectionObject = section as Record<string, unknown>;
    const key = typeof sectionObject['key'] === 'string' ? sectionObject['key'] : '';
    if (!key) {
      return null;
    }

    const notes = typeof sectionObject['notes'] === 'string' ? sectionObject['notes'] : undefined;
    const rawSets = Array.isArray(sectionObject['sets']) ? sectionObject['sets'] as unknown[] : [];
    if (rawSets.length === 0) {
      return null;
    }

    const sets = rawSets.map(set =>
      Array.isArray(set) ? set.map(item => this.normalizeAnswerValue(item)) : []
    );

    return { key, notes, sets };
  }

  normalizeAnswerValue(value: unknown): boolean {
    if (value === true || value === 1 || value === '1' || value === 'true') {
      return true;
    }

    if (value && typeof value === 'object') {
      const valueObject = value as Record<string, unknown>;
      return valueObject['checked'] === true || valueObject['isChecked'] === true;
    }

    return false;
  }

  parseSavedSections(rawChecklistJson: string): SavedChecklistSection[] | null {
    try {
      let checklistRoot: unknown = rawChecklistJson;
      checklistRoot = this.tryParseJsonValue(checklistRoot);

      if (checklistRoot && typeof checklistRoot === 'object') {
        const parsedObject = checklistRoot as Record<string, unknown>;
        if (typeof parsedObject['inspectionCheckList'] === 'string') {
          checklistRoot = this.tryParseJsonValue(parsedObject['inspectionCheckList']);
        } else if (parsedObject['inspectionCheckList']) {
          checklistRoot = parsedObject['inspectionCheckList'];
        }
      }

      let rawSections: unknown[] = [];
      if (Array.isArray(checklistRoot)) {
        rawSections = checklistRoot;
      } else if (
        checklistRoot &&
        typeof checklistRoot === 'object' &&
        Array.isArray((checklistRoot as Record<string, unknown>)['sections'])
      ) {
        rawSections = (checklistRoot as Record<string, unknown>)['sections'] as unknown[];
      }

      const normalizedSections = rawSections
        .map(section => this.normalizeSavedSection(section))
        .filter((section): section is SavedChecklistSection => !!section);

      return normalizedSections.length > 0 ? normalizedSections : null;
    } catch {
      return null;
    }
  }

  tryParseJsonValue(value: unknown): unknown {
    let parsedValue = value;
    let parseAttempts = 0;

    while (typeof parsedValue === 'string' && parseAttempts < 3) {
      const trimmed = parsedValue.trim();
      if (!trimmed) {
        return trimmed;
      }

      try {
        parsedValue = JSON.parse(trimmed);
        parseAttempts += 1;
      } catch {
        return parsedValue;
      }
    }

    return parsedValue;
  }

  normalizeSavedSection(section: unknown): SavedChecklistSection | null {
    if (!section || typeof section !== 'object') {
      return null;
    }

    const sectionObject = section as Record<string, unknown>;
    const key = typeof sectionObject['key'] === 'string' ? sectionObject['key'] : '';
    if (!key) {
      return null;
    }

    const title = typeof sectionObject['title'] === 'string' ? sectionObject['title'] : undefined;
    const notes = typeof sectionObject['notes'] === 'string' ? sectionObject['notes'] : undefined;

    let sets: SavedChecklistItem[][] = [];
    if (Array.isArray(sectionObject['sets'])) {
      sets = (sectionObject['sets'] as unknown[])
        .map(set => Array.isArray(set)
          ? set
            .map(item => this.normalizeSavedItem(item))
            .filter((item): item is SavedChecklistItem => !!item)
          : []
        )
        .filter(set => set.length > 0);
    } else if (Array.isArray(sectionObject['items'])) {
      const flatItems = (sectionObject['items'] as unknown[])
        .map(item => this.normalizeSavedItem(item))
        .filter((item): item is SavedChecklistItem => !!item);
      if (flatItems.length > 0) {
        sets = [flatItems];
      }
    }

    if (sets.length === 0) {
      sets = [[]];
    }

    return { key, title, notes, sets };
  }

  normalizeSavedItem(item: unknown): SavedChecklistItem | null {
    if (typeof item === 'boolean') {
      return { text: '', checked: item, isEditable: false };
    }

    if (typeof item === 'number') {
      return { text: '', checked: item === 1, isEditable: false };
    }

    if (typeof item === 'string') {
      const normalizedValue = item.trim().toLowerCase();
      if (normalizedValue === 'true' || normalizedValue === 'false' || normalizedValue === '1' || normalizedValue === '0') {
        return { text: '', checked: normalizedValue === 'true' || normalizedValue === '1', isEditable: false };
      }
      return { text: item, checked: false, isEditable: false };
    }

    if (!item || typeof item !== 'object') {
      return null;
    }

    const itemObject = item as Record<string, unknown>;
    const text = typeof itemObject['text'] === 'string'
      ? itemObject['text']
      : typeof itemObject['label'] === 'string'
        ? itemObject['label']
        : '';
    if (!text) {
      return null;
    }

    const checkedValue = itemObject['checked'] ?? itemObject['isChecked'];
    const editableValue = itemObject['isEditable'];
    const checked = checkedValue === true || checkedValue === 'true' || checkedValue === 1 || checkedValue === '1';
    const isEditable = editableValue === true || editableValue === 'true' || editableValue === 1 || editableValue === '1';

    return {
      text,
      checked,
      isEditable
    };
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

  buildChecklistAnswersJson(): string {
    const payload = {
      sections: this.sections.map(section => ({
        key: section.key,
        title: section.title,
        notes: this.form.get(this.notesControlName(section.key))?.value || '',
        sets: this.getRepeatIndexes(section.key).map(repeatIndex =>
          this.getSetItems(section.key, repeatIndex).map(item =>
            !!this.form.get(this.itemControlNameById(section.key, repeatIndex, item.id))?.value
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
  
  createChecklistItem(text: string, isEditable: boolean = false, checked: boolean = false): ChecklistItem {
    const id = `item_${this.nextItemId++}`;
    return { id, text, isEditable, checked };
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

  toggleTemplateMode(): void {
    if (this.isReadonlyMode) {
      return;
    }

    this.activeMode = this.isTemplateMode ? 'answer' : 'template';
    this.applyModeState();
  }

  resolveInitialMode(): ChecklistMode {
    if (this.mode === 'readonly') {
      return 'readonly';
    }

    return this.templateEnabled ? 'template' : 'answer';
  }
  //#endregion
}
