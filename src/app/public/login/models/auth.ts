export interface LoginDetails {
    userId: number
    userCoreGuid: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    companyName?: string;
    companyCoreGuid?: string;
}

export interface GetAuthData{
    refreshToken:string
}

export interface RefreshTokenResponse{
    content :{result :{access_token:string,refresh_token:string,expires_in:number }}
}


