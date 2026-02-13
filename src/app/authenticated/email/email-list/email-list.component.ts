import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { EmailResponse } from '../models/email.model';
import { EmailService } from '../services/email.service';

@Component({
  selector: 'app-email-list',
  imports: [CommonModule, MaterialModule],
  templateUrl: './email-list.component.html',
  styleUrl: './email-list.component.scss'
})
export class EmailListComponent implements OnInit {
  emails: EmailResponse[] = [];
  isLoading = false;

  constructor(private emailService: EmailService) {}

  ngOnInit(): void {
    this.loadEmails();
  }

  private loadEmails(): void {
    this.isLoading = true;
    this.emailService.getEmails().subscribe({
      next: (emails) => {
        this.emails = emails || [];
        this.isLoading = false;
      },
      error: () => {
        this.emails = [];
        this.isLoading = false;
      }
    });
  }
}
