import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { RouterUrl } from '../../../app.routes';
import { FormatterService } from '../../../services/formatter-service';
import { MaterialModule } from '../../../material.module';
import { EmailResponse } from '../models/email.model';
import { EmailService } from '../services/email.service';

@Component({
  selector: 'app-email',
  imports: [CommonModule, MaterialModule],
  templateUrl: './email.component.html',
  styleUrl: './email.component.scss'
})
export class EmailComponent implements OnInit {
  emailId = '';
  email: EmailResponse | null = null;
  isLoading = false;
  isServiceError = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private emailService: EmailService,
    private formatter: FormatterService
  ) {}


  //#region Email
  ngOnInit(): void {
    this.route.paramMap.subscribe((paramMap: ParamMap) => {
      const id = paramMap.get('id');
      if (!id) {
        this.isServiceError = true;
        return;
      }

      this.emailId = id;
      this.loadEmail();
    });
  }

  loadEmail(): void {
    this.isLoading = true;
    this.isServiceError = false;

    this.emailService.getEmailByGuid(this.emailId).subscribe({
      next: (email) => {
        this.email = email;
        this.isLoading = false;
      },
      error: () => {
        this.email = null;
        this.isServiceError = true;
        this.isLoading = false;
      }
    });
  }
  //#endregion

  //#region Utility Methods
  get formattedCreatedOn(): string {
    return this.formatter.formatDateTimeString(this.email?.createdOn) || (this.email?.createdOn || '');
  }
  back(): void {
    this.router.navigateByUrl(RouterUrl.EmailList);
  }
  //#endregion
  
}
