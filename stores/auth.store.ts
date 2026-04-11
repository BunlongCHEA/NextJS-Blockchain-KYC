import { create } from "zustand";
import { User, Role } from "@/types/auth";

interface AuthStore {
  user: User | null;
  role: Role | null;
  passwordChangeRequired: boolean;
  passwordExpiredAt: Date | null;
  setUser: (user: User) => void;
  clearUser: () => void;
  setPasswordChangeRequired: (required: boolean) => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  role: null,
  passwordChangeRequired: false,
  passwordExpiredAt: null,
  setUser: (user) =>
    set({
      user,
      role: user.role,
      passwordChangeRequired: user.password_change_required,
    }),
  clearUser: () =>
    set({
      user: null,
      role: null,
      passwordChangeRequired: false,
      passwordExpiredAt: null,
    }),
  setPasswordChangeRequired: (required) =>
    set({ passwordChangeRequired: required }),
}));
