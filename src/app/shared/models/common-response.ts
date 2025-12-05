export interface CommonResponse {
    code: number,
    description: string,
    status: boolean
}

export interface CommonStatus {
    name: string,
    value: number
}

export interface AgencyTypeList {
    id: number,
    type: string
}