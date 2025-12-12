import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../material.module';
import { PropertyService } from '../../property/services/property.service';
import { PropertyResponse } from '../../property/models/property.model';
import { PropertyStatus } from '../../property/models/property-enums';
import { take } from 'rxjs';
import { BoardProperty, CalendarDay } from '../models/reservation-board-model';



@Component({
  selector: 'app-reservation-board',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  templateUrl: './reservation-board.component.html',
  styleUrl: './reservation-board.component.scss'
})
export class ReservationBoardComponent implements OnInit {
  properties: BoardProperty[] = [];
  calendarDays: CalendarDay[] = [];
  numberOfDays: number = 90; // Show 90 days by default

  constructor(private propertyService: PropertyService) { }

  ngOnInit(): void {
    this.generateCalendarDays();
    this.loadProperties();
  }

  loadProperties(): void {
    this.propertyService.getProperties().pipe(take(1)).subscribe({
      next: (properties: PropertyResponse[]) => {
        this.properties = properties.map(p => ({
          propertyId: p.propertyId,
          propertyCode: p.propertyCode,
          address: `${p.address1}${p.suite ? ' ' + p.suite : ''}`.trim(),
          monthlyRate: p.monthlyRate || 0,
          bedsBaths: `${p.bedrooms}/${p.bathrooms}`,
          statusLetter: this.getStatusLetter(p.propertyStatusId)
        }));
      },
      error: (err) => {
        console.error('Error loading properties:', err);
        this.properties = [];
      }
    });
  }

  getStatusLetter(statusId: number): string {
    const statusMap: { [key: number]: string } = {
      [PropertyStatus.NotProcessed]: 'N',
      [PropertyStatus.Cleaned]: 'C',
      [PropertyStatus.Inspected]: 'I',
      [PropertyStatus.Ready]: 'R',
      [PropertyStatus.Occupied]: 'O',
      [PropertyStatus.Maintenance]: 'M',
      [PropertyStatus.Offline]: 'F'
    };
    return statusMap[statusId] || '?';
  }

  generateCalendarDays(): void {
    const today = new Date();
    const days: CalendarDay[] = [];
    const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

    let currentDate = new Date(today);
    let lastMonth = -1;

    for (let i = 0; i < this.numberOfDays; i++) {
      const date = new Date(currentDate);
      const dayOfWeek = dayNames[date.getDay()];
      const dayNumber = date.getDate();
      const monthIndex = date.getMonth();
      const monthName = monthNames[monthIndex];
      const isFirstOfMonth = monthIndex !== lastMonth;

      days.push({
        date: date,
        dayOfWeek: dayOfWeek,
        dayNumber: dayNumber,
        monthName: monthName,
        isFirstOfMonth: isFirstOfMonth
      });

      lastMonth = monthIndex;
      currentDate.setDate(currentDate.getDate() + 1);
    }

    this.calendarDays = days;
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  }

  getMonthGroups(): { monthName: string; days: number }[] {
    const groups: { monthName: string; days: number }[] = [];
    let currentMonth = '';
    let dayCount = 0;

    for (const day of this.calendarDays) {
      if (day.monthName !== currentMonth) {
        if (currentMonth) {
          groups.push({ monthName: currentMonth, days: dayCount });
        }
        currentMonth = day.monthName;
        dayCount = 1;
      } else {
        dayCount++;
      }
    }

    if (currentMonth) {
      groups.push({ monthName: currentMonth, days: dayCount });
    }

    return groups;
  }
}
