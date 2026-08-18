export interface HelpTopicContent {
  url: string;
  title: string;
  summary: string;
  paragraphs?: string[];
  steps: string[];
}

export const HELP_WELCOME_URL = 'welcome';

export const HELP_TOPIC_CONTENT: HelpTopicContent[] = [
  {
    url: HELP_WELCOME_URL,
    title: 'Welcome to The RentAll Exchange',
    summary: 'The RentAll Exchange is a full-service property management platform designed to bring every part of your property management operation together in one place.',
    paragraphs: [
      'The RentAll Exchange is a full-service property management platform designed to bring every part of your property management operation together in one place. From properties, owners, tenants and reservations to maintenance, communications, documents and accounting, RentAll provides the tools you need to manage the entire lifecycle of a property without relying on disconnected systems, spreadsheets, or duplicate data entry.',
      'RentAll is built around the way property management companies actually work. Information flows naturally between each area of the system, allowing your team to see the complete picture of a property, reservation, owner, tenant, or transaction while maintaining the financial detail and operational history behind it. Whether you are coordinating a new reservation, communicating with a tenant, assigning a work order, processing payments, reconciling accounts, or preparing an owner statement, the information you need remains connected and accessible.',
      'The goal of The RentAll Exchange is simple: one platform, one source of information, and one connected workflow for managing your business from beginning to end.'
    ],
    steps: [
      'Logo (upper left) opens the full guide.',
      'The house-H icon on a title bar jumps to that page’s topic.',
      'Topics match the menu items you can already see.'
    ]
  },
  {
    url: 'dashboard',
    title: 'Dashboard',
    summary: 'A snapshot of arrivals, departures, and what needs attention today.',
    steps: ['Use the office filter in the title bar to scope the numbers.', 'Open a tile or list to jump into the related work.']
  },
  {
    url: 'contacts',
    title: 'Contacts',
    summary: 'People and companies you work with: tenants, companies, owners, and vendors.',
    steps: [
      'Each tab is a contact type. The list and form swap in that tab.',
      'Filter by office in the title bar when you have more than one office.',
      'Add opens a blank contact. Click a row to edit.'
    ]
  },
  {
    url: 'maintenance',
    title: 'Maintenance',
    summary: 'Inspections, work orders, and receipts for a property.',
    steps: [
      'Pick office, property, and date range in the title bar.',
      'Inspection, work orders, and receipts each have their own tab.',
      'Save lives in the title bar for the active form.'
    ]
  }
];

export function getHelpTopicContent(url: string): HelpTopicContent {
  const match = HELP_TOPIC_CONTENT.find(topic => topic.url === url);
  if (match) {
    return match;
  }
  return {
    url,
    title: url,
    summary: 'Help for this page is coming soon.',
    steps: []
  };
}
