import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { MaterialModule } from '../../../material.module';

@Component({
  selector: 'app-reservation-lease',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  templateUrl: './reservation-lease.component.html',
  styleUrl: './reservation-lease.component.scss'
})
export class ReservationLeaseComponent {
  @Input() reservationId: string | null = null;

  constructor() { }
}


