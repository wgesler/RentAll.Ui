import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import {BehaviorSubject, finalize, take, Subject, takeUntil} from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { OfficeResponse } from '../models/office.model';
import { TrackerContextType, getTrackerContextTypes, toTrackerContextType } from '../models/tracker-enum';
import {
  TrackerConfigurationResponse,
  TrackerDefinitionListDisplay,
  TrackerOfficeSection
} from '../models/tracker.model';
import { TrackerService } from '../services/tracker.service';
import { TrackerComponent } from '../tracker/tracker.component';

@Component({
    standalone: true,
    selector: 'app-tracker-list',
    templateUrl: './tracker-list.component.html',
    styleUrls: ['./tracker-list.component.scss'],
    imports: [CommonModule, MaterialModule, FormsModule, TrackerComponent],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TrackerListComponent implements OnInit, OnDestroy, OnChanges {
  @Input() selectedOfficeId: number | null = null; // kept for backwards compatibility
  @Input() offices: OfficeResponse[] = [];

  isServiceError: boolean = false;
  allTrackers: TrackerDefinitionListDisplay[] = [];
  officeSections: TrackerOfficeSection[] = [];
  expandedOfficeIds = new Set<number>();
  editingTrackerDefinitionId: string | null = null;
  editingTrackerContextId: TrackerContextType | null = null;
  editingTrackerOfficeId: number | null = null;
  editingTracker: TrackerDefinitionListDisplay | null = null;
  editingSuggestedSortOrder: number | null = null;
  processingOfficeIds = new Set<number>();

  isPageReady = false;
  destroy$ = new Subject<void>();
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['trackers']));

  constructor(
    public trackerService: TrackerService,
    public toastr: ToastrService,
    public mappingService: MappingService,
    private utilityService: UtilityService,
    private cdr: ChangeDetectorRef) {
  }

  //#region Tracker-List
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });

    this.getTrackers();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['selectedOfficeId'] && !changes['selectedOfficeId'].firstChange) ||
      (changes['offices'] && !changes['offices'].firstChange)) {
      this.applyFilters();
    }
  }

  getTrackers(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'trackers');
    this.trackerService.getTrackerConfiguration(true).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'trackers'); })).subscribe({
      next: (response: TrackerConfigurationResponse) => {
        const definitions = (response?.contexts || []).flatMap(context => context.definitions || []);
        this.allTrackers = this.mappingService.mapTrackerDefinitions(definitions);
        this.isServiceError = false;
        this.applyFilters();
        this.markViewForCheck();
      },
      error: (_err: HttpErrorResponse) => {
        this.allTrackers = [];
        this.isServiceError = false;
        this.applyFilters();
        this.markViewForCheck();
      }
    });
  }

  addTrackerForOfficeContext(officeId: number, trackerContextId: TrackerContextType): void {
    const nextSortOrder = this.getNextSortOrder(officeId, trackerContextId);
    this.editingTrackerDefinitionId = 'new';
    this.editingTrackerContextId = trackerContextId;
    this.editingTrackerOfficeId = officeId;
    this.editingTracker = null;
    this.editingSuggestedSortOrder = nextSortOrder;
    this.expandedOfficeIds.add(officeId);
  }

  editTracker(tracker: TrackerDefinitionListDisplay): void {
    this.editingTrackerDefinitionId = tracker.trackerDefinitionId;
    this.editingTrackerContextId = tracker.trackerContextId;
    this.editingTrackerOfficeId = tracker.officeId;
    this.editingTracker = tracker;
    this.editingSuggestedSortOrder = null;
    this.expandedOfficeIds.add(tracker.officeId);
  }

  deleteTracker(tracker: TrackerDefinitionListDisplay): void {
    this.trackerService.deleteTrackerDefinition(tracker.trackerDefinitionId).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Tracker deleted successfully', CommonMessage.Success);
        this.getTrackers();
      },
      error: (_err: HttpErrorResponse) => {}
    });
  }

  copyAllContextsFromOffice(sourceOfficeId: number, targetOfficeId: number): void {
    if (sourceOfficeId <= 0 || targetOfficeId <= 0 || sourceOfficeId === targetOfficeId) {
      return;
    }

    this.processingOfficeIds.add(targetOfficeId);
    this.clearInlineEditor();
    this.trackerService.copyTrackerDefinitionsByOffice(sourceOfficeId, targetOfficeId).pipe(
      take(1),
      finalize(() => {
        this.processingOfficeIds.delete(targetOfficeId);
        this.expandedOfficeIds.add(targetOfficeId);
        this.getTrackers();
        this.markViewForCheck();
      })
    ).subscribe({
      next: () => {
        this.toastr.success('Trackers copied successfully', CommonMessage.Success);
        this.markViewForCheck();
      },
      error: (err: HttpErrorResponse) => {
        const message = typeof err.error === 'string'
          ? err.error
          : err.error?.message || err.message || 'Unable to copy trackers.';
        this.toastr.error(message, CommonMessage.Error);
        this.markViewForCheck();
      }
    });
  }

  clearAllContextsForOffice(officeId: number): void {
    if (officeId <= 0) {
      return;
    }

    this.processingOfficeIds.add(officeId);
    this.clearInlineEditor();

    this.trackerService.deleteTrackerDefinitionsByOffice(officeId).pipe(
      take(1),
      finalize(() => {
        this.processingOfficeIds.delete(officeId);
        this.expandedOfficeIds.add(officeId);
        this.getTrackers();
        this.markViewForCheck();
      })
    ).subscribe({
      next: () => {
        this.toastr.success('Trackers reset successfully', CommonMessage.Success);
        this.markViewForCheck();
      },
      error: (err: HttpErrorResponse) => {
        const message = typeof err.error === 'string'
          ? err.error
          : err.error?.message || err.message || 'Unable to reset trackers.';
        this.toastr.error(message, CommonMessage.Error);
        this.markViewForCheck();
      }
    });
  }
  //#endregion

  //#region Filter Methods
  applyFilters(): void {
    const contextOptions = getTrackerContextTypes()
      .map(context => ({
        value: toTrackerContextType(context.value),
        label: context.label
      }))
      .filter(context => context.value !== TrackerContextType.Unknown);

    let filtered = this.allTrackers.filter(tracker => tracker.isActive);

    const configuredOffices = (this.offices || [])
      .filter(office => !!office && office.isActive)
      .map(office => ({
        officeId: office.officeId,
        officeName: office.name || `Office ${office.officeId}`
      }));

    const discoveredOffices = Array.from(new Map(filtered.map(tracker => [
      tracker.officeId,
      {
        officeId: tracker.officeId,
        officeName: tracker.officeName || `Office ${tracker.officeId}`
      }
    ])).values());

    const officeMap = new Map<number, { officeId: number; officeName: string }>();
    [...configuredOffices, ...discoveredOffices].forEach(office => officeMap.set(office.officeId, office));

    this.officeSections = Array.from(officeMap.values())
      .sort((a, b) => a.officeName.localeCompare(b.officeName))
      .map(office => ({
        officeId: office.officeId,
        officeName: office.officeName,
        contexts: contextOptions.map(context => ({
          value: context.value,
          label: context.label,
          trackers: filtered
            .filter(tracker => tracker.officeId === office.officeId && tracker.trackerContextId === context.value)
            .sort((a, b) => {
              if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
              return a.displayName.localeCompare(b.displayName);
            })
        }))
      }));
  }
  //#endregion

  //#region Form Response Methods
  get hasAnyOffice(): boolean {
    return this.officeSections.length > 0;
  }

  getOfficeTrackerCount(office: TrackerOfficeSection): number {
    return office.contexts.reduce((total, context) => total + context.trackers.length, 0);
  }

  getCopySourceOffices(targetOfficeId: number): TrackerOfficeSection[] {
    return this.officeSections.filter(office => office.officeId !== targetOfficeId && this.getOfficeTrackerCount(office) > 0);
  }

  isProcessingOffice(officeId: number): boolean {
    return this.processingOfficeIds.has(officeId);
  }

  isOfficeExpanded(officeId: number): boolean {
    return this.expandedOfficeIds.has(officeId);
  }

  onOfficeOpened(officeId: number): void {
    this.expandedOfficeIds.add(officeId);
  }

  onOfficeClosed(officeId: number): void {
    this.expandedOfficeIds.delete(officeId);
  }

  onInlineTrackerBack(): void {
    this.clearInlineEditor();
  }

  onInlineTrackerSaved(): void {
    const officeIdToKeepOpen = this.editingTrackerOfficeId;
    this.clearInlineEditor();
    if (officeIdToKeepOpen != null) {
      this.expandedOfficeIds.add(officeIdToKeepOpen);
    }
    this.getTrackers();
  }

  clearInlineEditor(): void {
    this.editingTrackerDefinitionId = null;
    this.editingTrackerContextId = null;
    this.editingTrackerOfficeId = null;
    this.editingTracker = null;
    this.editingSuggestedSortOrder = null;
  }

  getNextSortOrder(officeId: number, trackerContextId: TrackerContextType): number {
    const current = this.allTrackers
      .filter(tracker =>
        tracker.officeId === officeId &&
        tracker.trackerContextId === trackerContextId &&
        tracker.isActive)
      .map(tracker => Number(tracker.sortOrder) || 0);

    if (current.length === 0) {
      return 0;
    }

    return Math.max(...current) + 1;
  }
  //#endregion

   //#region Utility Methods
  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.itemsToLoad$.complete();
  }
  //#endregion
}
