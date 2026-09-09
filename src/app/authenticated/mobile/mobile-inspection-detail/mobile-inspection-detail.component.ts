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
    super.toggleTemplateMode();
    this.mobileCdr.markForCheck();
    this.emitShellStateOutputs();
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
