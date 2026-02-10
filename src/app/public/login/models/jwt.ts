import { JwtTempUser } from './jwt-temp';

export class JwtContainer {
    sub: string;
    exp: number;
    user: JwtUser;

    constructor(sub: string, exp: number, user: any) {
        this.sub = sub;
        this.exp = exp;
        // API returns PascalCase, so we need to access properties with PascalCase
        // Parse userGroups from comma-delimited string to array
        const userGroupsRaw = user.UserGroups || user.userGroups;
        let userGroups: string[] = [];
        if (userGroupsRaw) {
            if (Array.isArray(userGroupsRaw)) {
                userGroups = userGroupsRaw.map(group => String(group));
            } else if (typeof userGroupsRaw === 'string') {
                userGroups = userGroupsRaw.split(',').map(group => group.trim()).filter(g => g);
            }
        }
        
        // Parse officeAccess from comma-delimited string to number array
        const officeAccessRaw = user.OfficeAccess || user.officeAccess;
        let officeAccess: number[] = [];
        if (officeAccessRaw) {
            if (Array.isArray(officeAccessRaw)) {
                officeAccess = officeAccessRaw.map(id => typeof id === 'string' ? parseInt(id, 10) : id).filter(id => !isNaN(id));
            } else if (typeof officeAccessRaw === 'string') {
                officeAccess = officeAccessRaw.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
            }
        }
        
        // Parse startupPageId - should be a number
        const startupPageIdRaw = user.StartupPageId || user.startupPageId || user.StartupPage || user.startupPage;
        const startupPageId = startupPageIdRaw !== undefined && startupPageIdRaw !== null 
            ? (typeof startupPageIdRaw === 'number' ? startupPageIdRaw : parseInt(String(startupPageIdRaw), 10))
            : 0;
        
        this.user = new JwtUser(
            user.UserId || user.userId || '',
            user.OrganizationId || user.organizationId || '',
            user.FirstName || user.firstName || '',
            user.LastName || user.lastName || '',
            user.Email || user.email || '',
            userGroups,
            startupPageId
        );
    }
}

export class JwtUser {
    userId: string;
    organizationId: string;
    firstName: string;
    lastName: string;
    email: string;
    userGroups: string[];
    startupPageId: number;
  


    constructor(
        userId: string,
        organizationId: string,
        firstName: string,
        lastName: string,
        email: string,
        userGroups: string[],
        startupPageId: number
    ) {
        this.userId = userId;
        this.organizationId = organizationId;
        this.firstName = firstName;
        this.lastName = lastName;
        this.email = email;
        this.userGroups = userGroups;
        this.startupPageId = startupPageId;
    }
}