export type Role = 'member' | 'admin';

export interface UserContext {
  readonly id: number;
  readonly role: Role;
}
