export type Environment = Record<string, string | undefined>;
export function appOrigin(env: Environment = process.env) {
  const raw = env.SUPERADMIN_APP_URL;
  if (!raw) throw Error("SUPERADMIN_APP_URL is required");
  const u = new URL(raw);
  if (
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    u.pathname !== "/" ||
    !(
      u.protocol === "https:" ||
      (u.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(u.hostname) &&
        !env.VERCEL)
    )
  )
    throw Error("Invalid application origin");
  return u.origin;
}
export function devPasswordHash(env: Environment = process.env) {
  const value = env.SUPERADMIN_DEV_PASSWORD_HASH || "";
  let hash = value;
  try {
    if (value.startsWith("bcrypt:"))
      hash = Buffer.from(value.slice(7), "base64").toString("utf8");
  } catch {
    return "";
  }
  return /^\$2[aby]\$(?:10|11|12|13|14)\$[./A-Za-z0-9]{53}$/.test(hash)
    ? hash
    : "";
}
export function devLoginEnabled(env: Environment = process.env) {
  try {
    return (
      env.NODE_ENV === "development" &&
      !env.VERCEL &&
      !env.VERCEL_ENV &&
      env.SUPERADMIN_DEV_LOGIN_ENABLED === "1" &&
      ["localhost", "127.0.0.1"].includes(new URL(appOrigin(env)).hostname) &&
      !!env.SUPERADMIN_DEV_EMAIL &&
      !!devPasswordHash(env)
    );
  } catch {
    return false;
  }
}
export function googleConfigured(env: Environment = process.env) {
  return !!(
    env.SUPERADMIN_GOOGLE_CLIENT_ID &&
    env.SUPERADMIN_GOOGLE_CLIENT_SECRET &&
    env.SUPERADMIN_GOOGLE_OWNER_EMAIL
  );
}
export function authConfigured(env: Environment = process.env) {
  try {
    appOrigin(env);
    return (
      (env.SUPERADMIN_AUTH_SECRET?.length || 0) >= 32 &&
      (googleConfigured(env) || devLoginEnabled(env))
    );
  } catch {
    return false;
  }
}
export function databaseConfiguration(env: Environment = process.env) {
  const uri = env.SUPERADMIN_MONGODB_URL,
    dbName = env.SUPERADMIN_MONGODB_DB;
  if (
    !uri ||
    !/^mongodb(?:\+srv)?:\/\//.test(uri) ||
    !dbName ||
    !/^superadmin(?:_[a-z0-9_-]+)?$/.test(dbName)
  )
    throw Error(
      "Configure a dedicated SUPERADMIN_MONGODB_URL and SUPERADMIN_MONGODB_DB (superadmin or superadmin_<environment>)",
    );
  if (uri === env.REELOGRAM_MONGODB_URL)
    throw Error("Super Admin requires independent database credentials");
  return { uri, dbName };
}
