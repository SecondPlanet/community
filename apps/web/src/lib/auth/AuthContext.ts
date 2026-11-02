import { createContext, useContext } from 'react';
import type {
  AuthSession,
  AuthUser,
  Identity,
  ProviderInfo,
  SignInInput,
} from './types';

/**
 * Keep the context identity in a module that is not a React Fast Refresh
 * boundary. Hot-reloading AuthProvider must never create a second context
 * instance while route chunks still reference the previous one.
 */
export interface AuthContextValue {
  user: AuthUser | null;
  identities: Identity[];
  providers: ProviderInfo[];
  signIn: (input: SignInInput) => Promise<AuthSession>;
  signOut: () => Promise<void>;
  updateUser: (patch: Partial<AuthUser>) => void;
  bindProvider: (provider: string) => Promise<void>;
  unbindProvider: (identityId: string) => Promise<void>;
  isAuthenticating: boolean;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within <AuthProvider>');
  }
  return context;
}
