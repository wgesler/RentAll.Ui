import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MaterialModule } from '../../../material.module';
import { ContactListComponent } from '../contact-list/contact-list.component';
import { Router, ActivatedRoute } from '@angular/router';
import { EntityType } from '../models/contact-enum';

@Component({
  selector: 'app-clients',
  standalone: true,
  imports: [
    CommonModule, 
    MaterialModule, 
    FormsModule, 
    ContactListComponent
  ],
  templateUrl: './clients.component.html',
  styleUrls: ['./clients.component.scss']
})
export class ClientsComponent implements OnInit, OnDestroy {
  EntityType = EntityType; // Expose EntityType enum to template
  selectedTabIndex: number = 0; // Default to Tenants tab
  
  constructor(
    private router: Router,
    private route: ActivatedRoute
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
  }
}
