export const USER_GUIDE_WELCOME_URL = 'welcome';

export interface UserGuideResponse {
  userGuideId: string;
  sections: Record<string, string>;
}

export type UserGuideRequest = UserGuideResponse;

export function emptyUserGuide(): UserGuideResponse {
  return {
    userGuideId: '',
    sections: {}
  };
}

export function cloneUserGuide(userGuide: UserGuideResponse): UserGuideResponse {
  return {
    userGuideId: userGuide.userGuideId,
    sections: { ...userGuide.sections }
  };
}

export interface UserGuideImageUploadResponse {
  imagePath: string;
}

export interface UserGuideImageUploadRequest {
  fileDetails: {
    fileName: string;
    contentType: string;
    file: string;
    dataUrl: string;
  };
}

export function normalizeUserGuideResponse(userGuide: UserGuideResponse | null | undefined): UserGuideResponse {
  if (!userGuide) {
    return emptyUserGuide();
  }

  return {
    userGuideId: userGuide.userGuideId || '',
    sections: { ...(userGuide.sections || {}) }
  };
}
