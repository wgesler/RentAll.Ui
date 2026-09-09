import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { MobileDashboardComponent } from '../mobile-dashboard/mobile-dashboard.component';
import { MobilePullToRefreshDirective } from '../mobile-pull-to-refresh.directive';

@Component({
  standalone: true,
  selector: 'app-mobile-dashboard-page',
  imports: [MaterialModule, MobileDashboardComponent, MobilePullToRefreshDirective],
  templateUrl: './mobile-dashboard-page.component.html',
  styleUrl: './mobile-dashboard-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileDashboardPageComponent {}
