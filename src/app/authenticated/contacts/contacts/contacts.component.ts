import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MaterialModule } from '../../../material.module';
import { ContactListComponent } from '../contact-list/contact-list.component';
import { Router, ActivatedRoute } from '@angular/router';
import { EntityType } from '../models/contact-enum';
import { OfficeService } from '../../organizations/services/office.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { Subscription, filter, take } from 'rxjs';

@Component({
  selector: 'app-contacts',
  standalone: true,
  imports: [
    CommonModule, 
    MaterialModule, 
    FormsModule, 
    ContactListComponent
  ],
  templateUrl: './contacts.component.html',
  styleUrls: ['./contacts.component.scss']
})
export class ContactsComponent implements OnInit, OnDestroy {
  EntityType = EntityType;
  selectedTabIndex: number = 0;
  selectedOfficeId: number | null = null;
  offices: OfficeResponse[] = [];
  officesSubscription?: Subscription;
  selectedOffice: OfficeResponse | null = null;
  showOfficeDropdown: boolean = true;
  
  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private officeService: OfficeService
  ) { }

  //#region Contacts
  ngOnInit(): void {
    const initialParams = this.route.snapshot.queryParams;
    if (initialParams['tab']) {
      const tabIndex = parseInt(initialParams['tab'], 10);
      if (!isNaN(tabIndex) && tabIndex >= 0 && tabIndex <= 3) {
        this.selectedTabIndex = tabIndex;
      }
    }
    
    // Subscribe to query params for tab selection
    this.route.queryParams.subscribe(params => {
      if (params['tab']) {
        const tabIndex = parseInt(params['tab'], 10);
        if (!isNaN(tabIndex) && tabIndex >= 0 && tabIndex <= 3 && this.selectedTabIndex !== tabIndex) {
          this.selectedTabIndex = tabIndex;
        }
      }
    });
    
    // Load offices for shared office selection
    this.loadOffices();
  }
  //#endregion

  //#region Form Response Methods
  onOfficeIdChange(officeId: number | null): void {
    this.selectedOfficeId = officeId;
    
    if (officeId !== null) {
      this.selectedOffice = this.offices.find(o => o.officeId === officeId) || null;
    } else {
      this.selectedOffice = null;
    }
    
    const queryParams: any = { tab: this.selectedTabIndex.toString() };
    if (officeId !== null) {
      queryParams.officeId = officeId.toString();
    } else {
      queryParams.officeId = null;
    }
    
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: queryParams,
      queryParamsHandling: 'merge'
    });
  }

  onTabChange(event: any): void {
    this.selectedTabIndex = event.index;
    // Update URL query params when tab changes manually (user clicks tab)
    this.router.navigate([], { 
      relativeTo: this.route,
      queryParams: { tab: event.index.toString() },
      queryParamsHandling: 'merge'
    });
  }
  //#endregion

  //#region Data Loading Methods
  loadOffices(): void {
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription = this.officeService.getAllOffices().subscribe(allOffices => {
        this.offices = allOffices || [];
        
        const officeIdFromParams = this.route.snapshot.queryParams['officeId'];
        if (officeIdFromParams) {
          const officeId = parseInt(officeIdFromParams, 10);
          if (!isNaN(officeId)) {
            const office = this.offices.find(o => o.officeId === officeId);
            if (office) {
              this.selectedOffice = office;
              this.selectedOfficeId = office.officeId;
              this.showOfficeDropdown = true;
              return;
            }
          }
        }
        
        if (this.offices.length === 1) {
          this.selectedOffice = this.offices[0];
          this.selectedOfficeId = this.offices[0].officeId;
          this.showOfficeDropdown = false;
        } else {
          this.showOfficeDropdown = true;
        }
      });
      
      this.route.queryParams.subscribe(params => {
        const officeIdParam = params['officeId'];
        
        if (officeIdParam) {
          const parsedOfficeId = parseInt(officeIdParam, 10);
          if (parsedOfficeId) {
            this.selectedOffice = this.offices.find(o => o.officeId === parsedOfficeId) || null;
            if (this.selectedOffice) {
              this.selectedOfficeId = this.selectedOffice.officeId;
            }
          }
        } else {
          this.selectedOffice = null;
          this.selectedOfficeId = null;
        }
      });
    });
  }
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
  }
  //#endregion
}
