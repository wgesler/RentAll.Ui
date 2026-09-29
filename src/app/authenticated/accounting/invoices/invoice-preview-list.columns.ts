import { ColumnSet } from '../../shared/data-table/models/column-data';

/** Shared columns for Reservation Preview All and Missing Invoice report preview rows. */
export const invoicePreviewListBaseColumns: ColumnSet = {
  expand: { displayAs: ' ', maxWidth: '5ch', sort: false, includeInFilter: false },
  propertyCode: { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural', wrap: false },
  reservationCode: { displayAs: 'Reservation', maxWidth: '15ch', sortType: 'natural' },
  invoiceStartDate: { displayAs: 'Invoice Start Date', maxWidth: '14ch', alignment: 'center', wrap: false },
  invoiceEndDate: { displayAs: 'End Date', maxWidth: '14ch', alignment: 'center', wrap: false },
  monthStart: { displayAs: 'Month', maxWidth: '14ch', alignment: 'center' },
  periodStart: { displayAs: 'Period Start', maxWidth: '14ch', alignment: 'center', wrap: false },
  periodEnd: { displayAs: 'Period End', maxWidth: '14ch', alignment: 'center', wrap: false },
  daysStayed: { displayAs: 'Days Stayed', maxWidth: '12ch', alignment: 'center', headerAlignment: 'center' },
  daysBilled: { displayAs: 'Days Billed', maxWidth: '12ch', alignment: 'center', headerAlignment: 'center' },
  totalAmount: { displayAs: 'Total', maxWidth: '15ch', alignment: 'right', headerAlignment: 'right' }
};
