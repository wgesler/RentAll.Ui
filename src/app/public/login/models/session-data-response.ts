import { SessionData } from '../../../shared/models/session-data';

export class SessionDataResponse {
    sessionGuid: string = '';
    data: SessionData[] = [];
}