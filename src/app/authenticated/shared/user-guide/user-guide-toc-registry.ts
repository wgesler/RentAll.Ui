import { NavItemDefinition, isInspectorOnlyUser } from '../access/role-access';
import { OrganizationType } from '../../organizations/models/organization-enum';
import { UserGroups } from '../../users/models/user-enums';

export interface UserGuideTocAccessContext {
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isPartnerAdmin: boolean;
  isPartnerOrganization: boolean;
  hasAccountingFullAccess: boolean;
  canViewCommissions: boolean;
  isOwnerAdmin: boolean;
  showWorkOrdersTab: boolean;
}

export interface UserGuideTocNode {
  id: string;
  displayName: string;
  contentUrl: string;
  icon?: string;
  children?: UserGuideTocNode[];
}

interface UserGuideTocDefinition {
  id: string;
  displayName: string;
  visible?: (ctx: UserGuideTocAccessContext) => boolean;
  children?: UserGuideTocDefinition[];
}

function topic(
  id: string,
  displayName: string,
  visible?: (ctx: UserGuideTocAccessContext) => boolean,
  children?: UserGuideTocDefinition[]
): UserGuideTocDefinition {
  return { id, displayName, visible, children };
}

function menuGroup(
  parentId: string,
  label: string,
  items: { id: string; label: string }[],
  visible?: (ctx: UserGuideTocAccessContext) => boolean
): UserGuideTocDefinition {
  return topic(
    parentId,
    label,
    visible,
    items.map(item => topic(`${parentId}/${item.id}`, item.label))
  );
}

const USER_GUIDE_SHELL_CHILDREN: Record<string, UserGuideTocDefinition[]> = {
  dashboard: [
    topic('dashboard/arrivals', 'Arrivals'),
    topic('dashboard/departures', 'Departures'),
    topic('dashboard/online', 'Online'),
    topic('dashboard/offline', 'Offline'),
    topic('dashboard/occupied', 'Occupied'),
    topic('dashboard/vacant', 'Vacant'),
    topic('dashboard/maid-service', 'Maid Service'),
    topic('dashboard/schedules', 'Schedules'),
    topic('dashboard/commissions', 'Commissions', ctx => ctx.canViewCommissions)
  ],
  contacts: [
    topic('contacts/tenants', 'Tenants', ctx => !ctx.isPartnerAdmin),
    topic('contacts/companies', 'Companies', ctx => !ctx.isPartnerAdmin),
    topic('contacts/owners', 'Owners', ctx => !ctx.isPartnerAdmin),
    topic('contacts/vendors', 'Vendors')
  ],
  maintenance: [
    topic('maintenance/inspection', 'Inspection'),
    topic('maintenance/maintenance', 'Maintenance'),
    topic('maintenance/receipts', 'Receipts'),
    topic('maintenance/work-orders', 'Work Orders', ctx => ctx.showWorkOrdersTab)
  ],
  tickets: [
    topic('tickets/my-tickets', 'My Tickets'),
    topic('tickets/others', 'Others'),
    topic('tickets/closed', 'Closed')
  ],
  properties: [
    topic('properties/property', 'Property'),
    topic('properties/information', 'Information'),
    topic('properties/welcome-letter', 'Welcome Letter', ctx => !ctx.isPartnerAdmin && !ctx.isPartnerOrganization),
    topic('properties/departure-letter', 'Departure Letter', ctx => !ctx.isPartnerAdmin && !ctx.isPartnerOrganization),
    topic('properties/listing', 'Listing'),
    topic('properties/history', 'History', ctx => !ctx.isPartnerAdmin && !ctx.isPartnerOrganization)
  ],
  reservations: [
    topic('reservations/reservation', 'Reservation'),
    topic('reservations/information', 'Information', ctx => ctx.isAdmin),
    topic('reservations/lease', 'Lease'),
    topic('reservations/invoices', 'Invoices')
  ],
  emails: [
    topic('emails/emails', 'Emails'),
    topic('emails/alerts', 'Alerts')
  ],
  accounting: [
    menuGroup('accounting/invoices', 'Invoices', [
      { id: 'invoices', label: 'Invoices' },
      { id: 'payments', label: 'Payments' },
      { id: 'missingInvoiceReport', label: 'Missing Invoice Report' },
      { id: 'preBillingReport', label: 'Pre-Billing Report' }
    ]),
    menuGroup('accounting/bills-receipts', 'Vendors', [
      { id: 'bills', label: 'Bills' },
      { id: 'receipts', label: 'Receipts' },
      { id: 'rentRoll', label: 'Rent Roll' }
    ]),
    menuGroup('accounting/bank', 'Bank', [
      { id: 'undepositedFunds', label: 'Undeposited Funds' },
      { id: 'deposits', label: 'Deposits' },
      { id: 'untransferredFunds', label: 'Untransferred Funds' },
      { id: 'transfers', label: 'Transfers' },
      { id: 'transferReport', label: 'Transfer Reports' },
      { id: 'printChecks', label: 'Print Checks' },
      { id: 'securityDeposits', label: 'Security Deposits' },
      { id: 'reconcile', label: 'Reconcile' }
    ], ctx => ctx.hasAccountingFullAccess),
    menuGroup('accounting/owners', 'Owners', [
      { id: 'workOrders', label: 'Work Orders' },
      { id: 'utilities', label: 'Utilities & Bills' },
      { id: 'statements', label: 'Accrual & Cash' },
      { id: 'apAging', label: 'AP Aging' },
      { id: 'escrow', label: 'Escrow (E2)' },
      { id: 'ownerStatements', label: 'Owner Statements' }
    ], ctx => ctx.hasAccountingFullAccess),
    menuGroup('accounting/reports', 'Reports', [
      { id: 'profitLoss', label: 'Profit & Loss' },
      { id: 'balanceSheet', label: 'Balance Sheet' },
      { id: 'arAging', label: 'AR Aging' },
      { id: 'apAging', label: 'AP Aging' },
      { id: 'reconcileAccountSummary', label: 'Reconcile' }
    ], ctx => ctx.hasAccountingFullAccess),
    menuGroup('accounting/general-ledger', 'General Ledger', [
      { id: 'ledger', label: 'General Ledger' },
      { id: 'recap', label: 'Journal Entry Recap' }
    ], ctx => ctx.hasAccountingFullAccess)
  ],
  users: [
    topic('users/employees', 'Employees'),
    topic('users/owners', 'Owners'),
    topic('users/cleaners', 'Cleaners'),
    topic('users/inspectors', 'Inspectors'),
    topic('users/vendors', 'Vendors'),
    topic('users/other', 'Other')
  ],
  leads: [
    topic('leads/rental', 'Rental'),
    topic('leads/owner', 'Owner', ctx => ctx.isOwnerAdmin),
    topic('leads/general', 'General'),
    topic('leads/reports', 'Reports')
  ],
  owner: [
    topic('owner/owners', 'Owners'),
    topic('owner/properties', 'Properties'),
    topic('owner/information', 'Information', ctx => ctx.isAdmin),
    topic('owner/agreement', 'Agreement'),
    topic('owner/deposit', 'Deposit')
  ],
  logs: [
    topic('logs/application-log', 'Application Log'),
    topic('logs/accounting-log', 'Accounting Log'),
    topic('logs/accounting-error', 'Accounting Error'),
    topic('logs/database-error', 'Database Error'),
    topic('logs/general-error', 'General Error')
  ]
};

function filterDefinitions(definitions: UserGuideTocDefinition[] | undefined, ctx: UserGuideTocAccessContext): UserGuideTocDefinition[] {
  if (!definitions?.length) {
    return [];
  }
  if (ctx.isSuperAdmin) {
    return definitions.map(definition => ({
      ...definition,
      children: filterDefinitions(definition.children, ctx)
    }));
  }
  return definitions
    .filter(definition => !definition.visible || definition.visible(ctx))
    .map(definition => ({
      ...definition,
      children: filterDefinitions(definition.children, ctx)
    }));
}

function mapDefinitions(definitions: UserGuideTocDefinition[], contentUrl: string): UserGuideTocNode[] {
  return definitions.map(definition => ({
    id: definition.id,
    displayName: definition.displayName,
    contentUrl,
    children: definition.children?.length ? mapDefinitions(definition.children, contentUrl) : undefined
  }));
}

export function buildUserGuideTocAccessContext(authService: {
  isAdmin(): boolean;
  hasRole(role: unknown): boolean;
  isOwnerAdmin(): boolean;
  hasAccountingFullAccess(): boolean;
  canViewCommissions(): boolean;
  getUser(): { userGroups?: Array<string | number> } | null | undefined;
}, commonService: { getOrganizationTypeId(): number | string | null | undefined }): UserGuideTocAccessContext {
  const userGroups = authService.getUser()?.userGroups as Array<string | number> | undefined;
  return {
    isSuperAdmin: authService.hasRole(UserGroups.SuperAdmin),
    isAdmin: authService.isAdmin(),
    isPartnerAdmin: authService.hasRole(UserGroups.PartnerAdmin),
    isPartnerOrganization: Number(commonService.getOrganizationTypeId()) === OrganizationType.Partner,
    hasAccountingFullAccess: authService.hasAccountingFullAccess(),
    canViewCommissions: authService.canViewCommissions(),
    isOwnerAdmin: authService.isOwnerAdmin(),
    showWorkOrdersTab: !isInspectorOnlyUser(userGroups)
  };
}

export function buildUserGuideTocTree(navItems: NavItemDefinition[], ctx: UserGuideTocAccessContext, welcomeUrl: string): UserGuideTocNode[] {
  return [
    {
      id: welcomeUrl,
      displayName: 'Welcome',
      contentUrl: welcomeUrl,
      icon: 'menu_book'
    },
    ...navItems.map(navItem => {
      const shellChildren = filterDefinitions(USER_GUIDE_SHELL_CHILDREN[navItem.url], ctx);
      return {
        id: navItem.url,
        displayName: navItem.displayName,
        contentUrl: navItem.url,
        icon: navItem.icon,
        children: shellChildren.length ? mapDefinitions(shellChildren, navItem.url) : undefined
      };
    })
  ];
}

export function flattenVisibleUserGuideToc(nodes: UserGuideTocNode[], expandedIds: Set<string>, depth = 0): { node: UserGuideTocNode; depth: number }[] {
  return nodes.flatMap(node => {
    const rows: { node: UserGuideTocNode; depth: number }[] = [{ node, depth }];
    if (node.children?.length && expandedIds.has(node.id)) {
      rows.push(...flattenVisibleUserGuideToc(node.children, expandedIds, depth + 1));
    }
    return rows;
  });
}

export function findUserGuideTocNode(nodes: UserGuideTocNode[], contentUrl: string): UserGuideTocNode | undefined {
  for (const node of nodes) {
    if (node.contentUrl === contentUrl && !node.children?.length) {
      return node;
    }
    if (node.contentUrl === contentUrl && node.id === contentUrl) {
      return node;
    }
    if (node.id === contentUrl) {
      return node;
    }
    const childMatch = node.children ? findUserGuideTocNode(node.children, contentUrl) : undefined;
    if (childMatch) {
      return childMatch;
    }
  }
  return nodes.find(node => node.contentUrl === contentUrl || node.id === contentUrl);
}

export function expandUserGuideTocAncestors(nodes: UserGuideTocNode[], targetContentUrl: string, expandedIds: Set<string>): boolean {
  for (const node of nodes) {
    if (node.contentUrl === targetContentUrl || node.id === targetContentUrl) {
      return true;
    }
    if (node.children?.length && expandUserGuideTocAncestors(node.children, targetContentUrl, expandedIds)) {
      expandedIds.add(node.id);
      return true;
    }
  }
  return false;
}
