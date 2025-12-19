import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-reservation-lease',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  templateUrl: './reservation-lease.component.html',
  styleUrl: './reservation-lease.component.scss'
})

export class ReservationLeaseComponent implements OnInit {
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

