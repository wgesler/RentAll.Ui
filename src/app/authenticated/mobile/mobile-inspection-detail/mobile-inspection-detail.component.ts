import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  inject
} from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, finalize, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { ChecklistIssuesDialogData } from '../../maintenance/inspection/dialog-checklist-issues.component';
import { InspectionComponent } from '../../maintenance/inspection/inspection.component';
import { PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { MobileInspectionIssuesDraftService } from '../mobile-inspection-issues-draft.service';

type MobileAnswerSnapshotRow = {
  sectionKey: string;
  repeatIndex: number;
  itemIndex: number;
  checked: boolean;
  photoPath: string | null;
  documentId: string | null;
  count: number | null;
  issue: string | null;
  hasIssue: boolean;
};

@Component({
  standalone: true,
  selector: 'app-mobile-inspection-detail',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule],
  templateUrl: './mobile-inspection-detail.component.html',
  styleUrl: './mobile-inspection-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileInspectionDetailComponent extends InspectionComponent implements OnInit, OnChanges, OnDestroy {
  @Input() propertyId = '';
  @Output() propertyCodeChange = new EventEmitter<string>();
  @Output() dirtyChange = new EventEmitter<boolean>();
  private propertyService = inject(PropertyService);
  private mobileInspectionIssuesDraftService = inject(MobileInspectionIssuesDraftService);
  private mobileRouter = inject(Router);
  private mobileCdr = inject(ChangeDetectorRef);
  private mobileDestroy$ = new Subject<void>();
  isMobilePageReady = false;

  //#region Mobile-Inspection-Detail
  override ngOnInit(): void {
    this.mode = 'answer';
    this.checklistType = 'inspection';
    this.shellTabActive = true;
    super.ngOnInit();
  }

  override ngOnChanges(changes: SimpleChanges): void {
    if (changes['propertyId']) {
      this.loadMobileProperty();
      return;
    }
    super.ngOnChanges(changes);
  }

  override emitShellStateOutputs(): void {
    super.emitShellStateOutputs();
    this.dirtyChange.emit(this.hasUnsavedChanges());
  }

  override openIssuesDialog(): void {
    this.navigateToMobileIssues();
  }

  saveInspection(): void {
    this.saveChecklistData(false);
  }

  override toggleTemplateModeLock(): void {
    super.toggleTemplateModeLock();
    this.mobileCdr.markForCheck();
  }

  override toggleTemplateMode(): void {
    if (this.isReadonlyMode || !this.isAdmin) {
      return;
    }
    if (this.isTemplateMode || this.isTemplateModeLocked) {
      super.toggleTemplateMode();
      this.mobileCdr.markForCheck();
      this.emitShellStateOutputs();
      return;
    }
    this.loadLatestTemplateThenEnterTemplateMode();
  }

  loadLatestTemplateThenEnterTemplateMode(): void {
    const propertyId = this.property?.propertyId?.trim() ?? '';
    if (!propertyId) {
      super.toggleTemplateMode();
      this.mobileCdr.markForCheck();
      return;
    }
    const answerSnapshot = this.captureMobileAnswerSnapshot();
    this.maintenanceService.getByPropertyId(propertyId).pipe(take(1), takeUntil(this.mobileDestroy$)).subscribe({
      next: (maintenance) => {
        if (this.isTemplateMode) {
          return;
        }
        if (maintenance) {
          this.maintenanceRecord = maintenance;
          const templateJson = maintenance.inspectionCheckList?.trim() ?? '';
          if (templateJson.length > 0) {
            this.applySavedChecklistJson(templateJson);
            this.restoreMobileAnswerSnapshot(answerSnapshot);
          }
        }
        this.activeMode = 'template';
        this.applyModeState();
        this.captureSavedStateSignature();
        this.mobileCdr.markForCheck();
        this.emitShellStateOutputs();
      },
      error: () => {
        super.toggleTemplateMode();
        this.mobileCdr.markForCheck();
      }
    });
  }

  captureMobileAnswerSnapshot(): MobileAnswerSnapshotRow[] {
    const rows: MobileAnswerSnapshotRow[] = [];
    this.sections.forEach(section => {
      this.getRepeatIndexes(section.key).forEach(repeatIndex => {
        this.getSetItems(section.key, repeatIndex).forEach((item, itemIndex) => {
          rows.push({
            sectionKey: section.key,
            repeatIndex,
            itemIndex,
            checked: !!this.form?.get(this.itemControlNameById(section.key, repeatIndex, item.id))?.value,
            photoPath: item.photoPath ?? null,
            documentId: item.documentId ?? null,
            count: item.count ?? null,
            issue: item.issue ?? null,
            hasIssue: item.hasIssue === true
          });
        });
      });
    });
    return rows;
  }

  restoreMobileAnswerSnapshot(rows: MobileAnswerSnapshotRow[]): void {
    rows.forEach(row => {
      const item = this.getSetItems(row.sectionKey, row.repeatIndex)[row.itemIndex];
      if (!item) {
        return;
      }
      item.photoPath = row.photoPath;
      item.documentId = row.documentId;
      item.count = row.count;
      item.issue = row.issue;
      item.hasIssue = row.hasIssue;
      this.form?.get(this.itemControlNameById(row.sectionKey, row.repeatIndex, item.id))?.setValue(row.checked, { emitEvent: false });
      this.form?.get(this.countControlNameById(row.sectionKey, row.repeatIndex, item.id))?.setValue(row.count, { emitEvent: false });
      this.form?.get(this.issueControlNameById(row.sectionKey, row.repeatIndex, item.id))?.setValue(row.issue ?? '', { emitEvent: false });
    });
  }

  override ngOnDestroy(): void {
    this.mobileDestroy$.next();
    this.mobileDestroy$.complete();
    super.ngOnDestroy();
  }
  //#endregion

  //#region Data Loading Methods
  private loadMobileProperty(): void {
    const propertyId = this.propertyId.trim();
    this.isMobilePageReady = false;
    this.property = null;
    this.mobileCdr.markForCheck();
    if (!propertyId) {
      this.isMobilePageReady = true;
      this.mobileCdr.markForCheck();
      return;
    }
    this.propertyService.getPropertyByGuid(propertyId).pipe(
      take(1),
      takeUntil(this.mobileDestroy$),
      finalize(() => {
        this.isMobilePageReady = true;
        this.mobileCdr.markForCheck();
      })
    ).subscribe({
      next: property => {
        this.property = property;
        this.propertyCodeChange.emit(property?.propertyCode || '');
        if (this.hasInitialized) {
          this.initializeChecklistState();
          this.syncPropertyDrivenSections();
          this.loadChecklistContext();
        }
        this.emitShellStateOutputs();
        this.mobileCdr.markForCheck();
      },
      error: () => {
        this.property = null;
        this.propertyCodeChange.emit('');
        this.mobileCdr.markForCheck();
      }
    });
  }

  private navigateToMobileIssues(): void {
    const propertyId = (this.property?.propertyId ?? '').trim();
    if (!propertyId) {
      return;
    }
    this.mobileInspectionIssuesDraftService.setDraft({
      data: this.buildMobileIssuesDialogData(),
      returnUrl: this.mobileRouter.url
    });
    void this.mobileRouter.navigate(['/mobile', 'maintenance', 'inspection', propertyId, 'issues']);
  }

  private buildMobileIssuesDialogData(): ChecklistIssuesDialogData {
    const fromName = `${this.user?.firstName || ''} ${this.user?.lastName || ''}`.trim() || 'RentAll User';
    const fromEmail = this.user?.email || '';
    const reservationFromShell = (this.titleBarReservationId || '').trim();
    const reservationFromInspection = (this.activeInspection?.reservationId || '').trim();
    const reservationId = reservationFromShell || reservationFromInspection || null;
    return {
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
    };
  }
  //#endregion
}
