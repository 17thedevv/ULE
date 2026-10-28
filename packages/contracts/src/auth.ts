export interface UserDto {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  createdAt: string;
}

export interface SessionDto {
  id: string;
  userId: string;
  expiresAt: string;
}

export interface MeResponseDto {
  user: UserDto;
  session?: SessionDto;
}
