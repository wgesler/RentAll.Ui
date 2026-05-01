import { Routes } from '@angular/router';
import { AccountingComponent } from './authenticated/accounting/accounting/accounting.component';
import { CostCodesListComponent } from './authenticated/accounting/cost-codes-list/cost-codes-list.component';
import { CostCodesComponent } from './authenticated/accounting/cost-codes/cost-codes.component';
import { BillingCreateComponent } from './authenticated/accounting/billing-create/billing-create.component';
import { InvoiceCreateComponent } from './authenticated/accounting/invoice-create/invoice-create.component';
import { BillingComponent } from './authenticated/accounting/billing/billing.component';
import { ContactComponent } from './authenticated/contacts/contact/contact.component';
import { ContactsShellComponent } from './authenticated/contacts/contacts-shell/contacts-shell.component';
import { DashboardMainComponent } from './authenticated/dashboards/dashboard-main/dashboard-main.component';
import { DashboardOwnerComponent } from './authenticated/dashboards/dashboard-owner/dashboard-owner.component';
import { DashboardServiceComponent } from './authenticated/dashboards/dashboard-service/dashboard-service.component';
import { DocumentListComponent } from './authenticated/documents/document-list/document-list.component';
import { DocumentViewComponent } from './authenticated/documents/document-view/document-view.component';
import { DocumentComponent } from './authenticated/documents/document/document.component';
import { EmailCreateComponent } from './authenticated/email/email-create/email-create.component';
import { EmailComponent } from './authenticated/email/email/email.component';
import { EmailsShellComponent } from './authenticated/email/emails-shell/emails-shell.component';
import { AlertListComponent } from './authenticated/email/alert-list/alert-list.component';
import { AlertComponent } from './authenticated/email/alert/alert.component';
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
import { OfficeListComponent } from './authenticated/organizations/office-list/office-list.component';
import { OfficeComponent } from './authenticated/organizations/office/office.component';
import { OrganizationListComponent } from './authenticated/organizations/organization-list/organization-list.component';
import { OrganizationComponent } from './authenticated/organizations/organization/organization.component';
import { RegionListComponent } from './authenticated/organizations/region-list/region-list.component';
import { RegionComponent } from './authenticated/organizations/region/region.component';
import { MaintenanceListComponent } from './authenticated/maintenance/maintenance-list/maintenance-list.component';
import { MaintenanceShellComponent } from './authenticated/maintenance/maintenance-shell/maintenance-shell.component';
import { WorkOrderComponent } from './authenticated/maintenance/work-order/work-order.component';
import { WorkOrderCreateComponent } from './authenticated/maintenance/work-order-create/work-order-create.component';
import { ReceiptComponent } from './authenticated/maintenance/receipt/receipt.component';
import { TicketShellComponent } from './authenticated/tickets/ticket-shell/ticket-shell.component';
import { PropertyListComponent } from './authenticated/properties/property-list/property-list.component';
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
import { PropertyListingPublicComponent } from './public/property-listing-public/property-listing-public.component';
import { PageNotFoundComponent } from './shared/page-not-found/page-not-found.component';

export enum RouterToken {
  Login = 'login',
  Auth = 'auth',
  Dashboard = 'dashboard',
  DashboardService = 'dashboard-service',
  DashboardOwner = 'dashboard-owner',
  RentalList = 'rentals',
  ContactList = 'contacts',
  Contacts = 'contacts',
  Contact = RouterToken.ContactList + '/:id',
  MaintenanceList = 'maintenance',
  Maintenance = RouterToken.MaintenanceList + '/:id',
  TicketList = 'tickets',
  Ticket = RouterToken.TicketList + '/:id',
  MaintenanceWorkOrder = 'work-order/:id',
  WorkOrderCreate = 'work-order-create',
  MaintenanceReceipt = 'receipt/:id',
  PropertyList = 'properties',
  Property = RouterToken.PropertyList + '/:id',
  DocumentList = 'documents',
  Document = RouterToken.DocumentList + '/:id',
  DocumentView = RouterToken.DocumentList + '/:id/view',
  EmailList = 'emails',
  AlertList = 'alerts',
  EmailCreate = RouterToken.EmailList + '/create',
  Email = RouterToken.EmailList + '/:id',
  Alert = RouterToken.AlertList + '/:id',
  AccountingList = 'accounting',
  Accounting = RouterToken.AccountingList + '/:id',
  Billing = 'billing/:id',
  BillingCreate = 'billing-create',
  InvoiceCreate = 'invoice-create',
  CostCodesList = 'cost-codes',
  CostCodes = RouterToken.CostCodesList + '/:id',
  ReservationList = 'reservations',
  Reservation = RouterToken.ReservationList + '/:id',
  ReservationBoard = 'boards',
  ReservationBoardSelection = RouterToken.ReservationBoard + '/selection',
  AgentList = 'agents',
  Agent = RouterToken.AgentList + '/:id',
  UserList = 'users',
  User = RouterToken.UserList + '/:id',
  OrganizationList = 'organizations',
  Organization = RouterToken.OrganizationList + '/:id',
  OrganizationConfiguration = 'settings',
  AreaList = 'areas',
  Area = RouterToken.AreaList + '/:id',
  BuildingList = 'buildings',
  Building = RouterToken.BuildingList + '/:id',
  OfficeList = 'offices',
  Office = RouterToken.OfficeList + '/:id',
  AccountingOfficeList = 'accounting-offices',
  AccountingOffice = RouterToken.AccountingOfficeList + '/:id',
  RegionList = 'regions',
  Region = RouterToken.RegionList + '/:id',
  ColorList = 'colors',
  Color = RouterToken.ColorList + '/:id',
  Default = RouterToken.ReservationBoard
}

export enum RouterUrl {
  Dashboard             = `${RouterToken.Auth}/${RouterToken.Dashboard}`,
  DashboardService      = `${RouterToken.Auth}/${RouterToken.DashboardService}`,
  DashboardOwner        = `${RouterToken.Auth}/${RouterToken.DashboardOwner}`,
  RentalList            = `${RouterToken.Auth}/${RouterToken.RentalList}`,
  ContactList           = `${RouterToken.Auth}/${RouterToken.ContactList}`,
  Contacts              = `${RouterToken.Auth}/${RouterToken.Contacts}`,
  Contact               = `${RouterToken.Auth}/${RouterToken.Contact}`,
  MaintenanceList       = `${RouterToken.Auth}/${RouterToken.MaintenanceList}`,
  Maintenance           = `${RouterToken.Auth}/${RouterToken.Maintenance}`,
  TicketList            = `${RouterToken.Auth}/${RouterToken.TicketList}`,
  Ticket                = `${RouterToken.Auth}/${RouterToken.Ticket}`,
  MaintenanceWorkOrder  = `${RouterToken.Auth}/${RouterToken.MaintenanceWorkOrder}`,
  WorkOrderCreate       = `${RouterToken.Auth}/${RouterToken.WorkOrderCreate}`,
  MaintenanceReceipt     = `${RouterToken.Auth}/${RouterToken.MaintenanceReceipt}`,
  PropertyList          = `${RouterToken.Auth}/${RouterToken.PropertyList}`,
  Property              = `${RouterToken.Auth}/${RouterToken.Property}`,
  DocumentList           = `${RouterToken.Auth}/${RouterToken.DocumentList}`,
  Document               = `${RouterToken.Auth}/${RouterToken.Document}`,
  DocumentView           = `${RouterToken.Auth}/${RouterToken.DocumentView}`,
  EmailList              = `${RouterToken.Auth}/${RouterToken.EmailList}`,
  AlertList              = `${RouterToken.Auth}/${RouterToken.AlertList}`,
  EmailCreate            = `${RouterToken.Auth}/${RouterToken.EmailCreate}`,
  Email                  = `${RouterToken.Auth}/${RouterToken.Email}`,
  Alert                  = `${RouterToken.Auth}/${RouterToken.Alert}`,
  AccountingList         = `${RouterToken.Auth}/${RouterToken.AccountingList}`,
  Accounting             = `${RouterToken.Auth}/${RouterToken.Accounting}`,
  Billing                = `${RouterToken.Auth}/${RouterToken.Billing}`,
  BillingCreate          = `${RouterToken.Auth}/${RouterToken.BillingCreate}`,
  InvoiceCreate          = `${RouterToken.Auth}/${RouterToken.InvoiceCreate}`,
  CostCodesList    = `${RouterToken.Auth}/${RouterToken.CostCodesList}`,
  CostCodes        = `${RouterToken.Auth}/${RouterToken.CostCodes}`,
  ReservationList       = `${RouterToken.Auth}/${RouterToken.ReservationList}`,
  Reservation           = `${RouterToken.Auth}/${RouterToken.Reservation}`,
  ReservationBoard      = `${RouterToken.Auth}/${RouterToken.ReservationBoard}`,
  ReservationBoardSelection = `${RouterToken.Auth}/${RouterToken.ReservationBoardSelection}`,
  AgentList             = `${RouterToken.Auth}/${RouterToken.AgentList}`,
  Agent                 = `${RouterToken.Auth}/${RouterToken.Agent}`,
  UserList              = `${RouterToken.Auth}/${RouterToken.UserList}`,
  User                  = `${RouterToken.Auth}/${RouterToken.User}`,
  OrganizationList      = `${RouterToken.Auth}/${RouterToken.OrganizationList}`,
  Organization          = `${RouterToken.Auth}/${RouterToken.Organization}`,
  OrganizationConfiguration = `${RouterToken.Auth}/${RouterToken.OrganizationConfiguration}`,
  AreaList             = `${RouterToken.Auth}/${RouterToken.AreaList}`,
  Area                 = `${RouterToken.Auth}/${RouterToken.Area}`,
  BuildingList         = `${RouterToken.Auth}/${RouterToken.BuildingList}`,
  Building             = `${RouterToken.Auth}/${RouterToken.Building}`,
  OfficeList        = `${RouterToken.Auth}/${RouterToken.OfficeList}`,
  Office            = `${RouterToken.Auth}/${RouterToken.Office}`,
  AccountingOfficeList = `${RouterToken.Auth}/${RouterToken.AccountingOfficeList}`,
  AccountingOffice = `${RouterToken.Auth}/${RouterToken.AccountingOffice}`,
  RegionList           = `${RouterToken.Auth}/${RouterToken.RegionList}`,
  Region               = `${RouterToken.Auth}/${RouterToken.Region}`,
  ColorList            = `${RouterToken.Auth}/${RouterToken.ColorList}`,
  Color                = `${RouterToken.Auth}/${RouterToken.Color}`,
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace RouterUrl {
  export function replaceTokens(token: string, values: string[]): string {
    return values.reduce((path, value) => path.replace(/:[^/]+/, value), token as string);
  }
}

export const authRoutes: Routes = [
  { path: '', redirectTo: RouterToken.Default, pathMatch: 'full' },
  { path: RouterToken.Dashboard, component: DashboardMainComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.DashboardService, component: DashboardServiceComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.DashboardOwner, component: DashboardOwnerComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.RentalList, component: ReservationListComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.ContactList, component: ContactsShellComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Contacts, component: ContactsShellComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Contact, component: ContactComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.MaintenanceList, component: MaintenanceListComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.TicketList, component: TicketShellComponent, canActivate: [authRouteGuard], canDeactivate: [canDeactivateGuard] },
  { path: RouterToken.Ticket, component: TicketShellComponent, canActivate: [authRouteGuard], canDeactivate: [canDeactivateGuard] },
  { path: RouterToken.MaintenanceWorkOrder, component: WorkOrderComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.WorkOrderCreate, component: WorkOrderCreateComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.MaintenanceReceipt, component: ReceiptComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Maintenance, component: MaintenanceShellComponent, canActivate: [authRouteGuard], canDeactivate: [canDeactivateGuard] },
  { path: RouterToken.PropertyList, component: PropertyListComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Property, component: PropertyShellComponent, canActivate: [authRouteGuard], canDeactivate: [canDeactivateGuard] },
  { path: RouterToken.DocumentList, component: DocumentListComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.DocumentView, component: DocumentViewComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Document, component: DocumentComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.EmailList, component: EmailsShellComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.AlertList, component: AlertListComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.EmailCreate, component: EmailCreateComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Email, component: EmailComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Alert, component: AlertComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.AccountingList, component: AccountingComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Accounting, component: AccountingComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Billing, component: BillingComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.BillingCreate, component: BillingCreateComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.InvoiceCreate, component: InvoiceCreateComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.CostCodesList, component: CostCodesListComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.CostCodes, component: CostCodesComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.ReservationList, component: ReservationListComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Reservation, component: ReservationShellComponent, canActivate: [authRouteGuard], canDeactivate: [canDeactivateGuard] },
  { path: RouterToken.ReservationBoard, component: ReservationBoardComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.ReservationBoardSelection, component: PropertySelectionComponent, canActivate: [authRouteGuard] },
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
]

export const routes: Routes = [
	{ path: '', redirectTo: RouterToken.Login, pathMatch: 'full' },
  { path: RouterToken.Login, component: LoginComponent, canActivate: [unAuthRouteGuard] },
  { path: 'listing/:token', component: PropertyListingPublicComponent },
  { path: RouterToken.Auth, component: LayoutComponent, children: authRoutes, canActivate: [authRouteGuard] },
  { path: '**', component: PageNotFoundComponent },
];
