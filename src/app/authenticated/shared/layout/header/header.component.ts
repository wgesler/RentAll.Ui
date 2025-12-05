import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { MaterialModule } from '../../../../material.module';
import { AuthService } from '../../../../services/auth.service';
import { Observable, map, shareReplay } from 'rxjs';
import { JwtUser } from '../../../../public/login/models/jwt';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { CommonService } from '../../../../services/common.service';
import { DailyQuote } from '../../../../shared/models/daily-quote';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})

export class HeaderComponent {
  isLoggedIn: Observable<boolean> = this.authService.getIsLoggedIn$();
  user: JwtUser = this.authService.getUser();
  dailyQuote: Observable<DailyQuote> = this.commonService.getDailyQuote();
  isHandset$: Observable<boolean> = this.breakpointObserver.observe(Breakpoints.XSmall).pipe( map(result => result.matches), shareReplay() );
  isMobile: boolean = false;

  constructor(
    private authService: AuthService,
    private commonService: CommonService,
    private breakpointObserver: BreakpointObserver
  ) { }
  
  logout(): void {
    this.authService.logout();
  }
}
