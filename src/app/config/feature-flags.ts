/**
 * When false, Leads is hidden in the sidebar for non-admins, and `/auth/leads` is denied except for Admin and SuperAdmin.
 * When true, Leads is available to everyone allowed by `leadsAdminAndAgent` in role-access (admins + agents).
 */
export const leadsFeatureEnabled = true;
