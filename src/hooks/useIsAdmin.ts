import { useProfile } from "@/hooks/useProfile";

export function useIsAdmin(): { isAdmin: boolean; isLoading: boolean } {
  const { data: profile, isLoading } = useProfile();
  return { isAdmin: profile?.is_admin === true, isLoading };
}
