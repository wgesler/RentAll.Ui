
export class JwtContainer {
    sub: string;
    exp: number;
    user: JwtUser;

    constructor(sub: string, exp: number, user: any) {
        this.sub = sub;
        this.exp = exp;
        // Parse userGroups from comma-delimited string to array
        const userGroupsRaw = user.userGroups;
        let userGroups: string[] = [];
        if (userGroupsRaw) {
            if (Array.isArray(userGroupsRaw)) {
                userGroups = userGroupsRaw.map(group => String(group));
            } else if (typeof userGroupsRaw === 'string') {
                userGroups = userGroupsRaw.split(',').map(group => group.trim()).filter(g => g);
            }
        }
        
        // Parse officeAccess from comma-delimited string to number array
        const officeAccessRaw = user.officeAccess;
        let officeAccess: number[] = [];
        if (officeAccessRaw) {
            if (Array.isArray(officeAccessRaw)) {
                officeAccess = officeAccessRaw.map(id => typeof id === 'string' ? parseInt(id, 10) : id).filter(id => !isNaN(id));
            } else if (typeof officeAccessRaw === 'string') {
                officeAccess = officeAccessRaw.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
            }
        }

        const propertiesRaw = user.properties;
        let properties: string[] = [];
        if (propertiesRaw) {
            if (Array.isArray(propertiesRaw)) {
                properties = propertiesRaw.map(propertyId => String(propertyId).trim()).filter(propertyId => propertyId);
            } else if (typeof propertiesRaw === 'string') {
                properties = propertiesRaw.split(',').map(propertyId => propertyId.trim()).filter(propertyId => propertyId);
            }
        }
        
        const startupPageRaw = user.startupPage ?? user.startupPageId;
        const startupPage = startupPageRaw !== undefined && startupPageRaw !== null
            ? (typeof startupPageRaw === 'number' ? startupPageRaw : parseInt(String(startupPageRaw), 10))
            : 0;
        const defaultOfficeIdRaw = user.defaultOfficeId ?? user.defaultOffice;
        const defaultOfficeId = defaultOfficeIdRaw !== undefined && defaultOfficeIdRaw !== null
            ? (typeof defaultOfficeIdRaw === 'number' ? defaultOfficeIdRaw : parseInt(String(defaultOfficeIdRaw), 10))
            : null;
        const agentId = user.agentId ?? null;
        const userGuid = user.userGuid || user.userId || '';
        
        this.user = new JwtUser(
            userGuid,
            user.organizationId || '',
            user.firstName || '',
            user.lastName || '',
            user.email || '',
            user.phone || '',
            userGroups,
            officeAccess,
            startupPage,
            defaultOfficeId,
            agentId,
            properties
        );
    }
}

export class JwtUser {
    userGuid: string;
    userId: string;
    organizationId: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    userGroups: string[];
    officeAccess: number[];
    startupPage: number;
    startupPageId: number;
    defaultOfficeId: number | null;
    agentId: string | null;
    properties: string[];
  


    constructor(
        userGuid: string,
        organizationId: string,
        firstName: string,
        lastName: string,
        email: string,
        phone: string,
        userGroups: string[],
        officeAccess: number[],
        startupPage: number,
        defaultOfficeId: number | null = null,
        agentId: string | null = null,
        properties: string[] = []
    ) {
        this.userGuid = userGuid;
        // Keep userId for backward compatibility in existing UI code paths.
        this.userId = userGuid;
        this.organizationId = organizationId;
        this.firstName = firstName;
        this.lastName = lastName;
        this.email = email;
        this.phone = phone;
        this.userGroups = userGroups;
        this.officeAccess = officeAccess;
        this.startupPage = startupPage;
        // Keep startupPageId for backward compatibility in existing UI code paths.
        this.startupPageId = startupPage;
        this.defaultOfficeId = defaultOfficeId;
        this.agentId = agentId;
        this.properties = properties;
    }
}