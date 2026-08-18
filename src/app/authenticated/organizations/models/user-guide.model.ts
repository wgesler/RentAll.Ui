export type UserGuidePageKey = 'welcome' | 'dashboard' | 'dashboardStaff' | 'dashboardOwner' | 'leads' | 'boards' | 'reservations' | 'properties' | 'tickets' | 'maintenance' | 'accounting' | 'owner' | 'emails' | 'documents' | 'contacts' | 'users' | 'settings' | 'logs' | 'organizations' | 'billing';

export interface UserGuideResponse {
  userGuideId: string;
  welcome: string;
  dashboard: string;
  dashboardStaff: string;
  dashboardOwner: string;
  leads: string;
  boards: string;
  reservations: string;
  properties: string;
  tickets: string;
  maintenance: string;
  accounting: string;
  owner: string;
  emails: string;
  documents: string;
  contacts: string;
  users: string;
  settings: string;
  logs: string;
  organizations: string;
  billing: string;
}

export type UserGuideRequest = UserGuideResponse;

export const USER_GUIDE_PAGE_KEYS: Record<string, UserGuidePageKey> = {
  welcome: 'welcome',
  dashboard: 'dashboard',
  'dashboard-staff': 'dashboard',
  'dashboard-owner': 'dashboard',
  leads: 'leads',
  boards: 'boards',
  reservations: 'reservations',
  properties: 'properties',
  tickets: 'tickets',
  maintenance: 'maintenance',
  accounting: 'accounting',
  owner: 'owner',
  emails: 'emails',
  documents: 'documents',
  contacts: 'contacts',
  users: 'users',
  settings: 'settings',
  logs: 'logs',
  organizations: 'organizations',
  billing: 'billing'
};

export function getUserGuidePageKey(url: string): UserGuidePageKey | null {
  return USER_GUIDE_PAGE_KEYS[url] ?? null;
}

export function emptyUserGuide(): UserGuideResponse {
  return {
    userGuideId: '',
    welcome: '',
    dashboard: '',
    dashboardStaff: '',
    dashboardOwner: '',
    leads: '',
    boards: '',
    reservations: '',
    properties: '',
    tickets: '',
    maintenance: '',
    accounting: '',
    owner: '',
    emails: '',
    documents: '',
    contacts: '',
    users: '',
    settings: '',
    logs: '',
    organizations: '',
    billing: ''
  };
}
