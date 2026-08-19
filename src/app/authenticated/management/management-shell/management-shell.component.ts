import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MaterialModule } from '../../../material.module';
import { RouterUrl } from '../../../app.routes';
import { AuthService } from '../../../services/auth.service';
import { MaintenanceShellComponent } from '../../maintenance/maintenance-shell/maintenance-shell.component';
import { TicketShellComponent } from '../../tickets/ticket-shell/ticket-shell.component';

@Component({
  standalone: true,
  selector: 'app-management-shell',
  imports: [CommonModule, MaterialModule, TicketShellComponent, MaintenanceShellComponent],
  templateUrl: './management-shell.component.html',
  styleUrl: './management-shell.component.scss'
})
export class ManagementShellComponent implements OnInit {
  private authService = inject(AuthService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  selectedTabIndex = 0;

  ngOnInit(): void {
    if (!this.authService.hasAccessToManagement()) {
      void this.router.navigateByUrl(RouterUrl.ReservationBoard);
    }
  }

  onTabIndexChange(index: number): void {
    this.selectedTabIndex = index;
    this.cdr.markForCheck();
  }
}
