import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-reservation-welcome-letter',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  templateUrl: './reservation-welcome-letter.component.html',
  styleUrl: './reservation-welcome-letter.component.scss'
})

export class ReservationWelcomeLetterComponent implements OnInit {
  @Input() reservationId: string | null = null;

  constructor(private route: ActivatedRoute) {}

  ngOnInit(): void {
    // Get reservationId from route if not provided as input
    if (!this.reservationId) {
      this.route.parent?.paramMap.subscribe(params => {
        this.reservationId = params.get('id');
      });
    }
  }
}

