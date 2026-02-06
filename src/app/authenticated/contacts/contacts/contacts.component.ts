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
  EntityType = EntityType; // Expose EntityType enum to template
  selectedTabIndex: number = 0; // Default to Tenants tab
  selectedOffice: OfficeResponse | null = null; // Shared office selection across all tabs
  offices: OfficeResponse[] = [];
  officesSubscription?: Subscription;
  showOfficeDropdown: boolean = true;
  
  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private officeService: OfficeService
  ) { }

  ngOnInit(): void {
    // Read initial query params for tab selection
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
  
  loadOffices(): void {
    // Offices are already loaded on login, so directly subscribe to changes
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription = this.officeService.getAllOffices().subscribe(allOffices => {
        this.offices = allOffices || [];
        
        // Try to restore office selection from query params
        const officeIdFromParams = this.route.snapshot.queryParams['officeId'];
        if (officeIdFromParams) {
          const officeId = parseInt(officeIdFromParams, 10);
          if (!isNaN(officeId)) {
            const office = this.offices.find(o => o.officeId === officeId);
            if (office) {
              this.selectedOffice = office;
              this.showOfficeDropdown = true;
              return;
            }
          }
        }
        
        // Auto-select if only one office available
        if (this.offices.length === 1) {
          this.selectedOffice = this.offices[0];
          this.showOfficeDropdown = false;
        } else {
          this.showOfficeDropdown = true;
        }
      });
    });
  }
  
  onOfficeChange(office: OfficeResponse | null): void {
    // Update shared office selection - all tabs will receive this update
    this.selectedOffice = office;
    
    // Store office selection in query params to preserve it
    const queryParams: any = { tab: this.selectedTabIndex.toString() };
    if (office) {
      queryParams.officeId = office.officeId.toString();
    } else {
      // Remove officeId from params if "All Offices" is selected
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

  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
  }
}
