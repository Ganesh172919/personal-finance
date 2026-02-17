import { useQuery } from "@tanstack/react-query";

import { getMyConfig, type AppConfig } from "@/lib/apiClient";

export const useAppConfig = (options: { enabled?: boolean } = {}) => {
  return useQuery<AppConfig>({
    queryKey: ["/api/config/me"],
    queryFn: getMyConfig,
    staleTime: 30_000,
    enabled: options.enabled ?? true,
  });
};
