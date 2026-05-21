import { environment } from '../../environments/environment';

/**
 * When false, Owners is hidden in the sidebar.
 * When true, Owners is visible based on role-access rules.
 */
export const ownersFeatureEnabled = environment.dev || environment.local;
