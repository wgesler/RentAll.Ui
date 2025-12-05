import { SessionData } from '../../../models/session-data';

export class SessionDataResponse {
    sessionGuid: string = '';
    data: SessionData[] = [];
}