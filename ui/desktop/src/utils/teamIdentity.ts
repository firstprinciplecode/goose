export type TeamIdentity = {
  userId: string;
  email?: string;
  displayName?: string;
};

export const getTeamIdentity = (): TeamIdentity => {
  try {
    const cfg = window.electron?.getConfig?.() as Record<string, unknown> | undefined;
    const userId =
      (cfg?.GOOSE_USER_ID as string) ||
      (cfg?.GOOSE_USER_EMAIL as string) ||
      (cfg?.GOOSE_USER_NAME as string) ||
      'local-user';
    const email = (cfg?.GOOSE_USER_EMAIL as string) || undefined;
    const displayName = (cfg?.GOOSE_USER_NAME as string) || undefined;
    return { userId, email, displayName };
  } catch {
    return { userId: 'local-user' };
  }
};

