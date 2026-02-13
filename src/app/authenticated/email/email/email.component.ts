import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { MaterialModule } from '../../../material.module';

@Component({
  selector: 'app-email',
  imports: [CommonModule, MaterialModule],
  templateUrl: './email.component.html',
  styleUrl: './email.component.scss'
})
export class EmailComponent {}
