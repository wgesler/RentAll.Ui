import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { HttpClientModule } from '@angular/common/http';
import { AuthService } from './services/auth.service';
import { CommonService } from './services/common.service';
import { Observable } from 'rxjs';
import { MatIconModule } from '@angular/material/icon'; 
import { MatButtonModule } from '@angular/material/button';
import { LayoutComponent } from './authenticated/shared/layout/layout/layout.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, HttpClientModule, LayoutComponent, MatButtonModule, MatIconModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})

export class AppComponent implements OnInit {
  title = 'RentAll.Ui';
  isLoggedIn: Observable<boolean> = this.authService.getIsLoggedIn$();

  constructor(
    private authService: AuthService,
    private commonService: CommonService
  ) { }

  ngOnInit(): void {
    // Load anonymous data on app startup
    this.commonService.loadDailyQuote();
    this.commonService.loadStates();
  }
}
