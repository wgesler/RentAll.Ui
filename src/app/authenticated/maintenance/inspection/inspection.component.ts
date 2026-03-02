import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, finalize, map, Observable, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { UtilityService } from '../../../services/utility.service';
import { PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { InspectionChecklistComponent } from '../inspection-checklist/inspection-checklist.component';
import { MaintenanceResponse } from '../models/maintenance.model';
import { InspectionResponse } from '../models/inspection.model';
import { InspectionService } from '../services/inspection.service';
import { MaintenanceService } from '../services/maintenance.service';

@Component({
  selector: 'app-inspection',
  imports: [CommonModule, MaterialModule, InspectionChecklistComponent],
  templateUrl: './inspection.component.html',
  styleUrl: './inspection.component.scss'
})
export class InspectionComponent implements OnInit, OnChanges {
  @Input() property: PropertyResponse | null = null;
  @Input() checklistJson: string | null = null;
  @Input() inspectionIdInput: number | null = null;
  @Input() historyMaintenanceIdInput: string | null = null;
  @Input() showBackButton: boolean = false;
  @Output() backEvent = new EventEmitter<void>();

  organizationId: string = '';
  inspectionId: number | null = null;
  inspection: InspectionResponse | null = null;
  inspectionChecklistJson: string | null = null;
  propertyId: string | null = null;
  hasRequestedInspectionLoad: boolean = false;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['inspection', 'property']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  isServiceError: boolean = false;

  constructor(
    route: ActivatedRoute,
    router: Router,
    inspectionService: InspectionService,
    authService: AuthService,
    propertyService: PropertyService,
    maintenanceService: MaintenanceService,
    utilityService: UtilityService
  ) {
    this.route = route;
    this.router = router;
    this.inspectionService = inspectionService;
    this.authService = authService;
    this.propertyService = propertyService;
    this.maintenanceService = maintenanceService;
    this.utilityService = utilityService;
  }

  route: ActivatedRoute;
  router: Router;
  inspectionService: InspectionService;
  authService: AuthService;
  propertyService: PropertyService;
  maintenanceService: MaintenanceService;
  utilityService: UtilityService;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['inspectionIdInput']) {
      const nextInspectionId = this.inspectionIdInput ?? null;
      if (nextInspectionId && this.inspectionId !== nextInspectionId) {
        this.inspectionId = nextInspectionId;
        this.itemsToLoad$.next(new Set(['inspection', 'property']));
        this.hasRequestedInspectionLoad = false;
        if (this.organizationId) {
          this.loadInspectionById();
        }
      }
    }

    if (changes['property']) {
      const nextPropertyId = this.property?.propertyId || null;
      if (nextPropertyId && !this.inspectionIdInput) {
        this.propertyId = nextPropertyId;
        this.itemsToLoad$.next(new Set(['inspection']));
        this.hasRequestedInspectionLoad = false;
        this.loadInspectionByPropertyId(nextPropertyId);
      }
    }

    if (changes['checklistJson'] && !this.inspection?.inspectionCheckList) {
      this.inspectionChecklistJson = this.checklistJson;
    }
  }

  ngOnInit(): void {
    this.organizationId = this.authService.getUser()?.organizationId || '';
    if (!this.organizationId) {
      this.isServiceError = true;
      this.itemsToLoad$.next(new Set());
      return;
    }

    if (this.inspectionIdInput) {
      this.inspectionId = this.inspectionIdInput;
      this.itemsToLoad$.next(new Set(['inspection', 'property']));
      this.loadInspectionById();
      return;
    }

    if (this.property?.propertyId) {
      this.propertyId = this.property.propertyId;
      if (!this.hasRequestedInspectionLoad) {
        this.itemsToLoad$.next(new Set(['inspection']));
        this.loadInspectionByPropertyId(this.property.propertyId);
      }
      return;
    }

    const routeId = this.route.snapshot.paramMap.get('id');
    const parsedId = routeId ? Number(routeId) : NaN;
    if (Number.isNaN(parsedId) || parsedId <= 0) {
      this.isServiceError = true;
      this.itemsToLoad$.next(new Set());
      return;
    }

    this.inspectionId = parsedId;
    this.loadInspectionById();
  }

  loadInspectionById(): void {
    this.hasRequestedInspectionLoad = true;
    if (!this.inspectionId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'inspection');
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      return;
    }

    this.inspectionService.getInspection(this.organizationId, this.inspectionId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'inspection'); })).subscribe({
      next: (inspection: InspectionResponse) => {
        this.inspection = inspection;
        this.inspectionChecklistJson = inspection.inspectionCheckList || this.checklistJson;
        this.propertyId = inspection.propertyId;
        this.loadMaintenanceTemplate(this.resolveTemplateMaintenanceId(inspection.maintenanceId), this.propertyId);
        this.loadPropertyById();
      },
      error: (_err: HttpErrorResponse) => {
        this.isServiceError = true;
        this.inspection = null;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      }
    });
  }

  loadInspectionByPropertyId(propertyId: string): void {
    this.hasRequestedInspectionLoad = true;
    this.inspectionService.getInspectionsByPropertyId(propertyId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'inspection'); })).subscribe({
      next: (inspections: InspectionResponse[]) => {
        const records = inspections || [];
        this.inspection = records.find(record => record.isActive) || records[0] || null;
        this.inspectionId = this.inspection?.inspectionId || null;
        this.inspectionChecklistJson = this.inspection?.inspectionCheckList || this.checklistJson;
        this.propertyId = this.inspection?.propertyId || propertyId;
        this.loadMaintenanceTemplate(this.resolveTemplateMaintenanceId(this.inspection?.maintenanceId || null), this.propertyId);
      },
      error: (_err: HttpErrorResponse) => {
        this.isServiceError = true;
        this.inspection = null;
      }
    });

    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
  }

  loadPropertyById(): void {
    if (!this.propertyId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      return;
    }

    this.propertyService.getPropertyByGuid(this.propertyId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property'); })).subscribe({
      next: (property: PropertyResponse) => {
        this.property = property;
      },
      error: (_err: HttpErrorResponse) => {
        this.isServiceError = true;
      }
    });
  }

  loadMaintenanceTemplate(maintenanceId: string | null, propertyId: string | null): void {
    const strictByMaintenanceId = this.showBackButton;
    if (!maintenanceId) {
      if (strictByMaintenanceId) {
        this.checklistJson = null;
        return;
      }
      this.loadMaintenanceTemplateByProperty(propertyId);
      return;
    }

    this.maintenanceService.getMaintenanceByGuid(maintenanceId).pipe(take(1)).subscribe({
      next: (maintenance: MaintenanceResponse) => {
        this.checklistJson = maintenance?.inspectionCheckList || null;
      },
      error: (_err: HttpErrorResponse) => {
        if (strictByMaintenanceId) {
          this.checklistJson = null;
          return;
        }
        this.loadMaintenanceTemplateByProperty(propertyId);
      }
    });
  }

  loadMaintenanceTemplateByProperty(propertyId: string | null): void {
    if (!propertyId) {
      this.checklistJson = null;
      return;
    }

    this.maintenanceService.getByPropertyId(propertyId).pipe(take(1)).subscribe({
      next: (maintenance: MaintenanceResponse | null) => {
        this.checklistJson = maintenance?.inspectionCheckList || null;
      },
      error: (_err: HttpErrorResponse) => {
        this.checklistJson = null;
      }
    });
  }

  resolveTemplateMaintenanceId(recordMaintenanceId: string | null): string | null {
    if (this.showBackButton && this.historyMaintenanceIdInput) {
      return this.historyMaintenanceIdInput;
    }

    return recordMaintenanceId;
  }

  get hasParentPropertyInput(): boolean {
    return !!this.property?.propertyId;
  }

  get shouldShowBackButton(): boolean {
    return this.showBackButton || !this.hasParentPropertyInput;
  }

  back(): void {
    if (this.showBackButton) {
      this.backEvent.emit();
      return;
    }
    if (this.hasParentPropertyInput) {
      return;
    }
    this.router.navigateByUrl(RouterUrl.MaintenanceList);
  }
}
