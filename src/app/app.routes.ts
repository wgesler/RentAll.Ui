import { Routes } from '@angular/router';
import { RouterToken } from './app.routes.tokens';
import { AccountingShellComponent } from './authenticated/accounting/accounting-shell/accounting-shell.component';
import { BillingShellComponent } from './authenticated/accounting/billing-shell/billing-shell.component';
import { CostCodesListComponent } from './authenticated/accounting/setup/cost-codes-list/cost-codes-list.component';
import { CostCodesComponent } from './authenticated/accounting/setup/cost-codes/cost-codes.component';
import { BillingCreateComponent } from './authenticated/accounting/invoices/billing-create/billing-create.component';
import { InvoiceCreateComponent } from './authenticated/accounting/invoices/invoice-create/invoice-create.component';
import { BillingComponent } from './authenticated/accounting/invoices/billing/billing.component';
import { ContactComponent } from './authenticated/contacts/contact/contact.component';
import { ContactsShellComponent } from './authenticated/contacts/contacts-shell/contacts-shell.component';
import { DashboardShellComponent } from './authenticated/dashboards/dashboard-shell/dashboard-shell.component';
import { DashboardOwnerComponent } from './authenticated/dashboards/dashboard-owner/dashboard-owner.component';
import { DashboardStaffComponent } from './authenticated/dashboards/dashboard-staff/dashboard-staff.component';
import { DocumentsShellComponent } from './authenticated/documents/documents-shell/documents-shell.component';
import { DocumentViewComponent } from './authenticated/documents/document-view/document-view.component';
import { DocumentComponent } from './authenticated/documents/document/document.component';
import { EmailCreateComponent } from './authenticated/email/email-create/email-create.component';
import { EmailComponent } from './authenticated/email/email/email.component';
import { EmailsShellComponent } from './authenticated/email/emails-shell/emails-shell.component';
import { AlertListComponent } from './authenticated/email/alert-list/alert-list.component';
import { AlertComponent } from './authenticated/email/alert/alert.component';
import { LogsShellComponent } from './authenticated/logs/logs-shell/logs-shell.component';
import { AccountingOfficeListComponent } from './authenticated/organizations/accounting-office-list/accounting-office-list.component';
import { AccountingOfficeComponent } from './authenticated/organizations/accounting-office/accounting-office.component';
import { AgentListComponent } from './authenticated/organizations/agent-list/agent-list.component';
import { AgentComponent } from './authenticated/organizations/agent/agent.component';
import { AreaListComponent } from './authenticated/organizations/area-list/area-list.component';
import { AreaComponent } from './authenticated/organizations/area/area.component';
import { BuildingListComponent } from './authenticated/organizations/building-list/building-list.component';
import { BuildingComponent } from './authenticated/organizations/building/building.component';
import { ColorListComponent } from './authenticated/organizations/color-list/color-list.component';
import { ColorComponent } from './authenticated/organizations/color/color.component';
import { ConfigurationComponent } from './authenticated/organizations/configuration/configuration.component';
import { LeadsShellComponent } from './authenticated/leads/leads-shell/leads-shell.component';
import { OfficeListComponent } from './authenticated/organizations/office-list/office-list.component';
import { OfficeComponent } from './authenticated/organizations/office/office.component';
import { OrganizationListComponent } from './authenticated/organizations/organization-list/organization-list.component';
import { OrganizationComponent } from './authenticated/organizations/organization/organization.component';
import { RegionListComponent } from './authenticated/organizations/region-list/region-list.component';
import { RegionComponent } from './authenticated/organizations/region/region.component';
import { MaintenanceShellComponent } from './authenticated/maintenance/maintenance-shell/maintenance-shell.component';
import { ManagementShellComponent } from './authenticated/management/management-shell/management-shell.component';
import { WorkOrderComponent } from './authenticated/maintenance/work-order/work-order.component';
import { WorkOrderCreateComponent } from './authenticated/maintenance/work-order-create/work-order-create.component';
import { TicketShellComponent } from './authenticated/tickets/ticket-shell/ticket-shell.component';
import { PropertyListComponent } from './authenticated/properties/property-list/property-list.component';
import { QuoteCreateComponent } from './authenticated/properties/quote-create/quote-create.component';
import { PropertyShellComponent } from './authenticated/properties/property-shell/property-shell.component';
import { PropertySelectionComponent } from './authenticated/properties/property-selection/property-selection.component';
import { ReservationBoardComponent } from './authenticated/reservations/reservation-board/reservation-board.component';
import { ReservationListComponent } from './authenticated/reservations/reservation-list/reservation-list.component';
import { ReservationShellComponent } from './authenticated/reservations/reservation-shell/reservation-shell.component';
import { LayoutComponent } from './authenticated/shared/layout/layout/layout.component';
import { UsersShellComponent } from './authenticated/users/users-shell/users-shell.component';
import { UserComponent } from './authenticated/users/user/user.component';
import { authRouteGuard } from './guards/auth-guard';
import { canDeactivateGuard } from './guards/can-deactivate-guard';
import { unAuthRouteGuard } from './guards/un-auth-guard';
import { LoginComponent } from './public/login/login.component';
import { OwnerShellComponent } from './authenticated/owners/owner-shell/owner-shell.component';
import { PropertyListingPublicComponent } from './public/property-listing-public/property-listing-public.component';
import { PageNotFoundComponent } from './shared/page-not-found/page-not-found.component';

export { RouterToken, RouterUrl } from './app.routes.tokens';

export const authRoutes: Routes = [
  { path: '', redirectTo: RouterToken.Default, pathMatch: 'full' },
  { path: RouterToken.Dashboard, component: DashboardShellComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.DashboardStaff, component: DashboardStaffComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.DashboardOwner, component: DashboardOwnerComponent, canActivate: [authRouteGuard] },
  { path: 'rentals', redirectTo: RouterToken.ReservationList, pathMatch: 'full' },
  { path: RouterToken.ContactList, component: ContactsShellComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Contacts, component: ContactsShellComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Contact, component: ContactComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.MaintenanceList, component: MaintenanceShellComponent, canActivate: [authRouteGuard], canDeactivate: [canDeactivateGuard] },
  { path: RouterToken.TicketList, component: TicketShellComponent, canActivate: [authRouteGuard], canDeactivate: [canDeactivateGuard] },
  { path: RouterToken.Ticket, component: TicketShellComponent, canActivate: [authRouteGuard], canDeactivate: [canDeactivateGuard] },
  { path: RouterToken.MaintenanceWorkOrder, component: WorkOrderComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.WorkOrderCreate, component: WorkOrderCreateComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Maintenance, component: MaintenanceShellComponent, canActivate: [authRouteGuard], canDeactivate: [canDeactivateGuard] },
  { path: RouterToken.PropertyList, component: PropertyListComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Property, component: PropertyShellComponent, canActivate: [authRouteGuard], canDeactivate: [canDeactivateGuard] },
  { path: RouterToken.ManagementList, component: ManagementShellComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.DocumentList, component: DocumentsShellComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.DocumentView, component: DocumentViewComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Document, component: DocumentComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.EmailList, component: EmailsShellComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.AlertList, component: AlertListComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.EmailCreate, component: EmailCreateComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Email, component: EmailComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Alert, component: AlertComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.AccountingList, component: AccountingShellComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Accounting, component: AccountingShellComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.BillingList, component: BillingShellComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Billing, component: BillingComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.BillingCreate, component: BillingCreateComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.InvoiceCreate, component: InvoiceCreateComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.CostCodesList, component: CostCodesListComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.CostCodes, component: CostCodesComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.ReservationList, component: ReservationListComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Reservation, component: ReservationShellComponent, canActivate: [authRouteGuard], canDeactivate: [canDeactivateGuard] },
  { path: RouterToken.ReservationBoard, component: ReservationBoardComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.ReservationBoardSelection, component: PropertySelectionComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.QuoteCreate, component: QuoteCreateComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.AgentList, component: AgentListComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Agent, component: AgentComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.UserList, component: UsersShellComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.User, component: UserComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.OrganizationList, component: OrganizationListComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Organization, component: OrganizationComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.OrganizationConfiguration, component: ConfigurationComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.AreaList, component: AreaListComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Area, component: AreaComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.BuildingList, component: BuildingListComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Building, component: BuildingComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.OfficeList, component: OfficeListComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Office, component: OfficeComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.AccountingOfficeList, component: AccountingOfficeListComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.AccountingOffice, component: AccountingOfficeComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.RegionList, component: RegionListComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Region, component: RegionComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.ColorList, component: ColorListComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Color, component: ColorComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Leads, component: LeadsShellComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.OwnerShell, component: OwnerShellComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Logs, component: LogsShellComponent, canActivate: [authRouteGuard] },
  { path: `${RouterToken.OwnerShell}/:token`, component: OwnerShellComponent, canActivate: [authRouteGuard] },
]

export const routes: Routes = [
	{ path: '', redirectTo: RouterToken.Login, pathMatch: 'full' },
  { path: RouterToken.Login, component: LoginComponent, canActivate: [unAuthRouteGuard] },
  { path: 'listing/:token', component: PropertyListingPublicComponent },
  { path: 'owners/:token', component: OwnerShellComponent },
  { path: RouterToken.Auth, component: LayoutComponent, children: authRoutes, canActivate: [authRouteGuard] },
  { path: '**', component: PageNotFoundComponent },
];
