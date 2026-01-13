import { Routes } from '@angular/router';
import { LoginComponent } from './public/login/login.component';
import { PageNotFoundComponent } from './shared/page-not-found/page-not-found.component';
import { CompanyComponent } from './authenticated/company/company/company.component';
import { CompanyListComponent } from './authenticated/company/company-list/company-list.component';
import { VendorComponent } from './authenticated/vendor/vendor/vendor.component';
import { VendorListComponent } from './authenticated/vendor/vendor-list/vendor-list.component';
import { PropertyComponent } from './authenticated/property/property/property.component';
import { PropertyListComponent } from './authenticated/property/property-list/property-list.component';
import { DocumentListComponent } from './authenticated/documents/document-list/document-list.component';
import { DocumentComponent } from './authenticated/documents/document/document.component';
import { DocumentViewComponent } from './authenticated/documents/document-view/document-view.component';
import { ContactComponent } from './authenticated/contact/contact/contact.component';
import { ContactListComponent } from './authenticated/contact/contact-list/contact-list.component';
import { UserComponent } from './authenticated/user/user/user.component';
import { UserListComponent } from './authenticated/user/user-list/user-list.component';
import { ReservationComponent } from './authenticated/reservation/reservation/reservation.component';
import { ReservationListComponent } from './authenticated/reservation/reservation-list/reservation-list.component';
import { ReservationBoardComponent } from './authenticated/reservation/reservation-board/reservation-board.component';
import { ReservationBoardSelectionComponent } from './authenticated/reservation/reservation-board-selection/reservation-board-selection.component';
import { AgentComponent } from './authenticated/organization-configuration/agent/agent/agent.component';
import { AgentListComponent } from './authenticated/organization-configuration/agent/agent-list/agent-list.component';
import { OrganizationComponent } from './authenticated/organization/organization/organization.component';
import { OrganizationListComponent } from './authenticated/organization/organization-list/organization-list.component';
import { ConfigurationComponent } from './authenticated/organization-configuration/configuration/configuration.component';
import { AreaComponent } from './authenticated/organization-configuration/area/area/area.component';
import { AreaListComponent } from './authenticated/organization-configuration/area/area-list/area-list.component';
import { BuildingComponent } from './authenticated/organization-configuration/building/building/building.component';
import { BuildingListComponent } from './authenticated/organization-configuration/building/building-list/building-list.component';
import { OfficeComponent } from './authenticated/organization-configuration/office/office/office.component';
import { OfficeListComponent } from './authenticated/organization-configuration/office/office-list/office-list.component';
import { RegionComponent } from './authenticated/organization-configuration/region/region/region.component';
import { RegionListComponent } from './authenticated/organization-configuration/region/region-list/region-list.component';
import { ColorComponent } from './authenticated/organization-configuration/color/color/color.component';
import { ColorListComponent } from './authenticated/organization-configuration/color/color-list/color-list.component';
import { LayoutComponent } from './authenticated/shared/layout/layout/layout.component';
import { authRouteGuard } from './guards/auth-guard';
import { unAuthRouteGuard } from './guards/un-auth-guard';

export enum RouterToken {
  Login = 'login',
  Auth = 'auth',
  RentalList = 'rentals',
  CompanyList = 'companies',
  Company = RouterToken.CompanyList + '/:id',
  VendorList = 'vendors',
  Vendor = RouterToken.VendorList + '/:id',
  ContactList = 'contacts',
  Contact = RouterToken.ContactList + '/:id',
  TenantList = 'tenants',
  Property = RouterToken.TenantList + '/:id',
  DocumentList = 'documents',
  Document = RouterToken.DocumentList + '/:id',
  DocumentView = RouterToken.DocumentList + '/:id/view',
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
  OrganizationConfiguration = 'organization-configuration',
  AreaList = 'areas',
  Area = RouterToken.AreaList + '/:id',
  BuildingList = 'buildings',
  Building = RouterToken.BuildingList + '/:id',
  OfficeList = 'offices',
  Office = RouterToken.OfficeList + '/:id',
  RegionList = 'regions',
  Region = RouterToken.RegionList + '/:id',
  ColorList = 'colors',
  Color = RouterToken.ColorList + '/:id',
  Default = RouterToken.ReservationBoard
}

export enum RouterUrl {
  RentalList            = `${RouterToken.Auth}/${RouterToken.RentalList}`,
  CompanyList           = `${RouterToken.Auth}/${RouterToken.CompanyList}`,
  Company               = `${RouterToken.Auth}/${RouterToken.Company}`,
  VendorList            = `${RouterToken.Auth}/${RouterToken.VendorList}`,
  Vendor                = `${RouterToken.Auth}/${RouterToken.Vendor}`,
  ContactList           = `${RouterToken.Auth}/${RouterToken.ContactList}`,
  Contact               = `${RouterToken.Auth}/${RouterToken.Contact}`,
  TenantList            = `${RouterToken.Auth}/${RouterToken.TenantList}`,
  Property              = `${RouterToken.Auth}/${RouterToken.Property}`,
  DocumentList           = `${RouterToken.Auth}/${RouterToken.DocumentList}`,
  Document               = `${RouterToken.Auth}/${RouterToken.Document}`,
  DocumentView           = `${RouterToken.Auth}/${RouterToken.DocumentView}`,
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
  { path: RouterToken.RentalList, component: ReservationListComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.CompanyList, component: CompanyListComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Company, component: CompanyComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.VendorList, component: VendorListComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Vendor, component: VendorComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.ContactList, component: ContactListComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Contact, component: ContactComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.TenantList, component: PropertyListComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Property, component: PropertyComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.DocumentList, component: DocumentListComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.DocumentView, component: DocumentViewComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Document, component: DocumentComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.ReservationList, component: ReservationListComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Reservation, component: ReservationComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.ReservationBoard, component: ReservationBoardComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.ReservationBoardSelection, component: ReservationBoardSelectionComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.AgentList, component: AgentListComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Agent, component: AgentComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.UserList, component: UserListComponent, canActivate: [authRouteGuard] },
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
  { path: RouterToken.RegionList, component: RegionListComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Region, component: RegionComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.ColorList, component: ColorListComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Color, component: ColorComponent, canActivate: [authRouteGuard] },
]

export const routes: Routes = [
	{ path: '', redirectTo: RouterToken.Login, pathMatch: 'full' },
  { path: RouterToken.Login, component: LoginComponent, canActivate: [unAuthRouteGuard] },
  { path: RouterToken.Auth, component: LayoutComponent, children: authRoutes, canActivate: [authRouteGuard] },
  { path: '**', component: PageNotFoundComponent },
];
