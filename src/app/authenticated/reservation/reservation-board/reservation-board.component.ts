import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../material.module';

@Component({
  selector: 'app-reservation-board',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  templateUrl: './reservation-board.component.html',
  styleUrl: './reservation-board.component.scss'
})
export class ReservationBoardComponent {
  constructor() { }
}


